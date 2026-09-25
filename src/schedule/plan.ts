import {
  DEFAULT_DAYPARTS,
  SECONDS_PER_DAY,
  broadcastDayLength,
  broadcastDayStart,
  type Content,
  type Daypart,
  type DaypartId,
  type Pool,
  type Schedule,
  type ScheduleItem,
  type Video,
} from '../domain'
import { HeuristicClassifier, isEligible, type Affinities, type Classifier } from './classify'

export interface PlanOptions {
  /** Any instant within the broadcast day to plan; it is snapped to that day's 06.00. */
  dayStart: Date
  /** The shape of the day. Defaults to `DEFAULT_DAYPARTS`. */
  dayparts?: readonly Daypart[]
  /** Defaults to a `HeuristicClassifier` observing this very pool. */
  classifier?: Classifier
  /** Chooses between equally good programmes. Same seed, same day, forever. */
  seed?: number
  /** Affinity below which a video is not a candidate for a daypart at all. */
  minAffinity?: number
  /** How far a programme may run past the end of its daypart. */
  maxOverrunSec?: number
}

const DEFAULT_SEED = 1967
const DEFAULT_MIN_AFFINITY = 0.15
/**
 * Real schedules run over; they do not run over by half an hour. A candidate
 * that would exceed this is simply not offered for the slot.
 */
const DEFAULT_MAX_OVERRUN_SEC = 600

/**
 * The shortest slot the packer will try to fill with a programme at all.
 * Below this there is no programme worth starting, so whatever is left goes
 * to `fillTo` to be padded out.
 */
const INTERLUDE_MIN_SEC = 90

/**
 * How far the packer will reach for a junction mark.
 *
 * A programme that ends at 20.57 leaves three minutes, and what a station does
 * with three minutes is put its own symbol up and bring the next programme on
 * at nine. More than this and the gap is a real interlude, which is the card's
 * job.
 */
const IDENT_MAX_SEC = 180

/** Uploads older than this weigh about half as much as today's. */
const RECENCY_HALF_LIFE_DAYS = 7
/** Recency for an upload whose date will not parse: old, but not disqualified. */
const UNDATED_AGE_DAYS = 365

/** Seconds past the hour that feel like television: :00, :15, :30 (and the next :00). */
const JUNCTION_MARKS_SEC: readonly number[] = [0, 900, 1800, 3600]
/** How near a mark an ending has to be before it counts as tidy at all. */
const JUNCTION_WINDOW_SEC = 300
/** What a perfectly placed ending is worth against a badly placed one. */
const JUNCTION_WEIGHT = 0.35

/** How fast the appeal of a candidate falls away as its overrun grows. */
const OVERRUN_SCALE_SEC = 900

/** How far the seed may move a candidate up or down the ranking. */
const JITTER_SPREAD = 0.5

/**
 * Repeats.
 *
 * A station with seven suppliers and nineteen hours to fill runs out, and what
 * it did about that was show things again — an afternoon repeat of last
 * night's documentary was not a failure of the schedule, it was the schedule.
 * So a programme may go out twice in a day, a long way apart, and only once
 * nothing new will fit.
 */
const MAX_SHOWINGS = 2
/** How long before a repeat: far enough that nobody is watching both. */
const MIN_REPEAT_GAP_SEC = 4 * 3600
/** What a second showing is worth against a first. Always the last resort. */
const REPEAT_PENALTY = 0.2

const MS_PER_DAY = 86_400_000

interface Candidate {
  readonly video: Video
  readonly affinities: Affinities
  readonly recency: number
  readonly jitter: number
}

/**
 * The packer: a pool and the shape of a day in, one broadcast day out.
 *
 * Pure and deterministic — no clock, no `Math.random`, no I/O. The same pool
 * and the same options give the same schedule every time, which is what lets
 * the tuner treat the day as a fact rather than a decision.
 */
export function plan(pool: Pool, options: PlanOptions): Schedule {
  const startsAt = broadcastDayStart(options.dayStart)
  // Twice a year this is not 86,400. See `broadcastDayLength`.
  const daySeconds = broadcastDayLength(startsAt)
  const dayparts =
    options.dayparts && options.dayparts.length > 0
      ? [...options.dayparts].sort((a, b) => a.startMin - b.startMin)
      : DEFAULT_DAYPARTS
  const classifier = options.classifier ?? new HeuristicClassifier(pool)
  const seed = options.seed ?? DEFAULT_SEED
  const minAffinity = options.minAffinity ?? DEFAULT_MIN_AFFINITY
  const maxOverrunSec = options.maxOverrunSec ?? DEFAULT_MAX_OVERRUN_SEC

  const candidates: Candidate[] = pool.videos
    .filter((video) => isEligible(video) && video.durationSec > 0)
    .map((video) => ({
      video,
      affinities: classifier.classify(video, pool.channels.get(video.channelId)),
      recency: recencyOf(video, startsAt),
      jitter: jitterFor(seed, video.id),
    }))

  const items: ScheduleItem[] = []
  /** Video id -> when it last finished, and how many times it has gone out. */
  const aired = new Map<string, { endSec: number; showings: number }>()
  /**
   * The same, keyed by channel and title: two uploads of one thing are one
   * thing, however many ids they have. Scoped to the channel because two
   * channels landing on the same name is a coincidence, not a repeat.
   */
  const airedTitles = new Map<string, number>()
  const channelUses = new Map<string, number>()
  let cursor = 0

  const push = (endSec: number, daypart: DaypartId, content: Content): void => {
    if (endSec <= cursor) return
    items.push({ startSec: cursor, endSec, daypart, content })
    cursor = endSec
  }

  /**
   * Close the distance to `target` the way television did.
   *
   * `target` here is always a junction (the top of a daypart, or the end of
   * the day), so the gap is the station padding to a time it has to hit. A
   * couple of minutes of that is what the ident was *for*: the symbol goes up
   * and the next programme starts on the mark. Only once the gap is longer
   * than a station would hold its own mark does it become an interlude, which
   * is the card's job.
   */
  const fillTo = (target: number, daypart: DaypartId): void => {
    const gap = target - cursor
    if (gap <= 0) return
    push(target, daypart, {
      kind: 'filler',
      variant: gap <= IDENT_MAX_SEC ? 'ident' : 'interlude',
    })
  }

  /** "We're going over to the news now." Cut back to `limit`, whatever is running. */
  const truncateTo = (limit: number): void => {
    while (items.length > 0 && items[items.length - 1].startSec >= limit) items.pop()
    const last = items[items.length - 1]
    if (last !== undefined && last.endSec > limit) {
      // The front of the programme played as planned, so videoStartSec stands;
      // only the end of it is lost.
      items[items.length - 1] = { ...last, endSec: limit }
    }
    cursor = items.length > 0 ? items[items.length - 1].endSec : 0
  }

  const bestFor = (daypart: Daypart, remaining: number): Candidate | undefined => {
    let best: Candidate | undefined
    let bestScore = 0

    for (const candidate of candidates) {
      const shown = aired.get(candidate.video.id)
      if (shown !== undefined) {
        if (shown.showings >= MAX_SHOWINGS) continue
        if (cursor - shown.endSec < MIN_REPEAT_GAP_SEC) continue
      }
      // Two uploads of a channel with the same name are the same programme as
      // far as an evening is concerned, whatever their ids say.
      const lastTitle = airedTitles.get(titleKey(candidate.video))
      if (lastTitle !== undefined && cursor - lastTitle < MIN_REPEAT_GAP_SEC) continue

      const affinity = candidate.affinities[daypart.id] ?? 0
      if (affinity < minAffinity) continue

      const overrun = Math.max(0, candidate.video.durationSec - remaining)
      if (overrun > maxOverrunSec) continue

      const novelty = 1 / (1 + (channelUses.get(candidate.video.channelId) ?? 0))
      const fitness = 1 / (1 + overrun / OVERRUN_SCALE_SEC)
      const tidiness = 1 + JUNCTION_WEIGHT * junctionCloseness(cursor + candidate.video.durationSec)
      const freshness = shown === undefined ? 1 : REPEAT_PENALTY
      const score =
        affinity * candidate.recency * novelty * fitness * tidiness * candidate.jitter * freshness
      if (score <= 0) continue

      if (best === undefined || score > bestScore) {
        best = candidate
        bestScore = score
      }
    }

    return best
  }

  const fillDaypart = (daypart: Daypart, endSec: number): void => {
    for (;;) {
      const remaining = endSec - cursor
      if (remaining < INTERLUDE_MIN_SEC) return

      // Close to the hour or the quarter: hold the station's own symbol up and
      // start the next programme on the mark. This is the one place the
      // schedule reaches for a tidy time rather than merely preferring one.
      const toMark = secondsToNextMark(cursor)
      if (toMark > 0 && toMark <= IDENT_MAX_SEC && remaining > toMark) {
        push(cursor + toMark, daypart.id, { kind: 'filler', variant: 'ident' })
        continue
      }

      const chosen = bestFor(daypart, remaining)
      if (chosen === undefined) return

      const showings = (aired.get(chosen.video.id)?.showings ?? 0) + 1
      const finishesAt = cursor + chosen.video.durationSec
      aired.set(chosen.video.id, { endSec: finishesAt, showings })
      airedTitles.set(titleKey(chosen.video), finishesAt)
      channelUses.set(
        chosen.video.channelId,
        (channelUses.get(chosen.video.channelId) ?? 0) + 1,
      )
      push(finishesAt, daypart.id, {
        kind: 'programme',
        videoId: chosen.video.id,
        title: chosen.video.title,
        channelId: chosen.video.channelId,
        videoStartSec: 0,
        ...(showings > 1 ? { repeat: true } : {}),
      })
    }
  }

  const last = dayparts[dayparts.length - 1]

  for (let i = 0; i < dayparts.length; i++) {
    const daypart = dayparts[i]
    const startSec = Math.min(daypart.startMin * 60, daySeconds)
    const endSec = Math.min(daypart.endMin * 60, daySeconds)
    // The junction rule. Everything else floats; this does not.
    if (daypart.junction && cursor > startSec) truncateTo(startSec)
    fillTo(startSec, daypart.id)

    if (daypart.offAir) {
      push(endSec, daypart.id, { kind: 'filler', variant: 'closedown' })
      continue
    }

    fillDaypart(daypart, endSec)
    fillTo(endSec, daypart.id)
  }

  // The end of the day is the hardest junction there is — and on the two days
  // a year the clocks move, it is not where the arithmetic says it is.
  if (cursor > daySeconds) truncateTo(daySeconds)
  fillTo(daySeconds, last.id)

  assertCoversDay(items, daySeconds)
  return { startsAt, items }
}

/**
 * The invariant every consumer leans on: items are contiguous, non-empty and
 * cover exactly one day from second zero. A violation is a bug in the packer,
 * so it fails loudly here rather than as a blank screen at 14.32.
 */
export function assertCoversDay(
  items: readonly ScheduleItem[],
  daySeconds: number = SECONDS_PER_DAY,
): void {
  let expected = 0
  for (const item of items) {
    if (item.startSec !== expected) {
      throw new Error(`schedule is not contiguous at ${item.startSec}s (expected ${expected}s)`)
    }
    if (item.endSec <= item.startSec) {
      throw new Error(`schedule item at ${item.startSec}s has no duration`)
    }
    expected = item.endSec
  }
  if (expected !== daySeconds) {
    throw new Error(`schedule covers ${expected}s, not the ${daySeconds}s of this day`)
  }
}

/** Two uploads of one channel named the same thing are the same programme. */
const titleKey = (video: Video): string => `${video.channelId}\n${video.title.trim().toLowerCase()}`

/** Today's uploads outrank last week's, smoothly and without a cliff. */
function recencyOf(video: Video, dayStart: Date): number {
  const published = Date.parse(video.publishedAt)
  const ageDays = Number.isFinite(published)
    ? Math.max(0, (dayStart.getTime() - published) / MS_PER_DAY)
    : UNDATED_AGE_DAYS
  return 1 / (1 + ageDays / RECENCY_HALF_LIFE_DAYS)
}

/** How long until the next junction mark, strictly after `sec`. */
function secondsToNextMark(sec: number): number {
  const pastTheHour = ((sec % 3600) + 3600) % 3600
  let soonest = 3600 - pastTheHour
  for (const mark of JUNCTION_MARKS_SEC) {
    if (mark > pastTheHour) soonest = Math.min(soonest, mark - pastTheHour)
  }
  return soonest
}

/**
 * 1 for an ending exactly on a junction, 0 for one nowhere near. Programmes
 * that end at 20:58 feel like television; ones that end at 20:53:41 do not.
 */
function junctionCloseness(endSec: number): number {
  const pastTheHour = ((endSec % 3600) + 3600) % 3600
  let nearest = Infinity
  for (const mark of JUNCTION_MARKS_SEC) nearest = Math.min(nearest, Math.abs(pastTheHour - mark))
  return nearest >= JUNCTION_WINDOW_SEC ? 0 : 1 - nearest / JUNCTION_WINDOW_SEC
}

/**
 * A deterministic 0..1 draw per (seed, video) — mulberry32 over an FNV-1a hash
 * of the id, so a candidate's jitter never depends on how many draws happened
 * before it. Changing the seed reshuffles the whole day; changing nothing
 * changes nothing.
 */
function jitterFor(seed: number, id: string): number {
  let hash = seed >>> 0
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193) >>> 0
  }
  const a = (hash + 0x6d2b79f5) >>> 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const draw = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return 1 + JITTER_SPREAD * (draw - 0.5)
}
