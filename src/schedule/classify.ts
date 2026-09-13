import type { Channel, DaypartId, Pool, Video } from '../domain'

/**
 * How well a video suits each daypart, 0..1. Absent means "not here" — the map
 * is deliberately partial so a caller cannot mistake a missing judgement for a
 * confident zero.
 */
export type Affinities = Partial<Record<DaypartId, number>>

/**
 * The seam. `HeuristicClassifier` ships; an LLM-backed one implements the same
 * interface later, and `OverridingClassifier` decorates either.
 */
export interface Classifier {
  classify(video: Video, channel?: Channel): Affinities
}

/** YouTube's News & Politics category. The hard gate into the news dayparts. */
export const NEWS_CATEGORY_ID = '25'

export const NEWS_DAYPARTS: readonly DaypartId[] = ['lunchtime-news', 'early-evening-news']

/**
 * Filtered at plan time, not discovered on air: a live stream has no duration
 * to schedule against, an unembeddable video can only ever disappoint someone,
 * and a video reporting no duration at all is usually a stream that has just
 * ended. None of them gets an affinity anywhere.
 */
export function isEligible(video: Video): boolean {
  // A duration of zero is not a short, it is a video that has no duration to
  // schedule against — most often a live stream that has finished and whose
  // recording YouTube has not published yet. Play one of those and the viewer
  // gets YouTube's own "this live event has ended" card, inside the iframe,
  // with no error event to tell us about it.
  return !video.isLive && video.embeddable && video.durationSec > 0
}

interface Band {
  readonly lo: number
  readonly hi: number
}

/**
 * The cheapest signal, and the strongest: what a duration is *for*. Closedown
 * is off air, so it has no band and never takes a programme.
 */
const DURATION_BANDS: Readonly<Record<DaypartId, Band | undefined>> = {
  breakfast: { lo: 60, hi: 300 },
  'mid-morning': { lo: 480, hi: 1500 },
  'lunchtime-news': { lo: 300, hi: 1800 },
  afternoon: { lo: 3600, hi: 9000 },
  childrens: { lo: 300, hi: 1500 },
  'early-evening-news': { lo: 300, hi: 2400 },
  evening: { lo: 1500, hi: 3600 },
  prime: { lo: 1500, hi: 4200 },
  'late-night': { lo: 3600, hi: 14400 },
  overnight: { lo: 1800, hi: 14400 },
  'clip-show': { lo: 10, hi: 65 },
  closedown: undefined,
}

/** How far outside its band a duration may stray before the fit reaches zero. */
const BAND_MARGIN_SEC = 600

/** What a news video keeps of its affinity for the dayparts that are not news. */
const NEWS_DAMPING = 0.25

/** Uploads a channel must have before its habits count as a pattern. */
const MIN_CHANNEL_SAMPLES = 3

/** What a channel's observed habit is worth on top of the video's own duration. */
const CHANNEL_HABIT_BONUS = 0.25

interface Keyword {
  readonly pattern: RegExp
  readonly lifts: Partial<Record<DaypartId, number>>
}

/**
 * Word-bounded on purpose: "mixture" is not a mix, and "Newsdesk" is not news.
 */
const KEYWORDS: readonly Keyword[] = [
  { pattern: /\bnews\b/, lifts: { 'lunchtime-news': 0.3, 'early-evening-news': 0.3 } },
  { pattern: /\blive\b/, lifts: { 'late-night': 0.2 } },
  { pattern: /\bpodcasts?\b/, lifts: { 'late-night': 0.25, evening: 0.15 } },
  { pattern: /\breviews?\b/, lifts: { 'mid-morning': 0.2 } },
  { pattern: /\bessays?\b/, lifts: { evening: 0.3 } },
  { pattern: /\bmix(es)?\b/, lifts: { 'late-night': 0.3 } },
  { pattern: /\bdocumentar(y|ies)\b/, lifts: { evening: 0.25, afternoon: 0.2 } },
  { pattern: /\bpart\s*1\b/, lifts: { afternoon: 0.2 } },
]

const DAYPART_IDS = Object.keys(DURATION_BANDS) as readonly DaypartId[]

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** 1 inside the band, falling linearly to 0 across the margin either side. */
function bandFit(durationSec: number, band: Band): number {
  const distance =
    durationSec < band.lo ? band.lo - durationSec : durationSec > band.hi ? durationSec - band.hi : 0
  return distance === 0 ? 1 : clamp01(1 - distance / BAND_MARGIN_SEC)
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Heuristics only, cheapest signal first: duration, then category, then title
 * keywords, then what the channel habitually does. Pure — the pool is read once
 * at construction and never again.
 */
export class HeuristicClassifier implements Classifier {
  /** Channel id -> median duration of that channel's schedulable uploads. */
  private readonly habits: ReadonlyMap<string, number>

  constructor(pool?: Pool) {
    this.habits = pool ? observeHabits(pool) : new Map()
  }

  classify(video: Video, _channel?: Channel): Affinities {
    if (!isEligible(video)) return {}

    const isNews = video.categoryId === NEWS_CATEGORY_ID
    const title = video.title.toLowerCase()
    const habit = this.habits.get(video.channelId)

    const affinities: Affinities = {}
    for (const id of DAYPART_IDS) {
      const band = DURATION_BANDS[id]
      if (band === undefined) continue

      const news = NEWS_DAYPARTS.includes(id)
      // The gate: no category 25, no news daypart, whatever the title says.
      if (news && !isNews) continue

      // Duration is the hard signal. A keyword or a channel habit can lift a
      // programme up the running order; neither can put a thirty-second short
      // in the two-hour late-night slot because the word "live" is in its
      // title — which is exactly what used to happen, and what a short doing
      // an impression of a film looks like from the sofa.
      const fit = bandFit(video.durationSec, band)
      if (fit === 0) continue

      let score = fit
      if (!news && isNews) score *= NEWS_DAMPING

      for (const keyword of KEYWORDS) {
        const lift = keyword.lifts[id]
        if (lift !== undefined && keyword.pattern.test(title)) score += lift
      }

      // A channel that always posts forty-minute pieces is an evening channel,
      // without anyone having said so.
      if (habit !== undefined && bandFit(habit, band) === 1) score += CHANNEL_HABIT_BONUS

      const final = clamp01(score)
      if (final > 0) affinities[id] = final
    }

    return affinities
  }
}

function observeHabits(pool: Pool): ReadonlyMap<string, number> {
  const durations = new Map<string, number[]>()
  for (const video of pool.videos) {
    if (!isEligible(video) || video.durationSec <= 0) continue
    const seen = durations.get(video.channelId)
    if (seen) seen.push(video.durationSec)
    else durations.set(video.channelId, [video.durationSec])
  }

  const habits = new Map<string, number>()
  for (const [channelId, values] of durations) {
    if (values.length >= MIN_CHANNEL_SAMPLES) habits.set(channelId, median(values))
  }
  return habits
}

/**
 * The escape hatch that makes heuristics liveable. A pinned channel goes where
 * it is pinned and nowhere else — total, by construction, so misfiling is
 * always one line of config away from being fixed for good.
 *
 * Eligibility still wins: pinning cannot schedule a live or unembeddable video,
 * because nothing can.
 */
export class OverridingClassifier implements Classifier {
  private readonly inner: Classifier
  private readonly overrides: Readonly<Record<string, readonly DaypartId[]>>

  constructor(inner: Classifier, overrides: Readonly<Record<string, readonly DaypartId[]>>) {
    this.inner = inner
    this.overrides = overrides
  }

  classify(video: Video, channel?: Channel): Affinities {
    if (!isEligible(video)) return {}

    const pinned = this.overrides[video.channelId]
    if (pinned === undefined) return this.inner.classify(video, channel)

    const affinities: Affinities = {}
    for (const id of pinned) affinities[id] = 1
    return affinities
  }
}
