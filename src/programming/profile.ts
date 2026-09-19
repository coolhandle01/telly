import type { Channel, Pool, Video } from '../domain'
import { isEligible } from '../schedule/classify'
import { genreOf, type Genre } from './genre'

/**
 * What a controller knows about a supplier before deciding what to do with it.
 *
 * Genre says which station it belongs to. Cadence and length say which slot:
 * an hour once a week is a strand with a night of its own, twenty minutes
 * every day is a strip across the afternoon, and forty seconds is not a
 * programme at all. Standing says whether it has earned peak time.
 *
 * All of it is observed from the uploads, so it needs no configuring and it
 * follows a channel that changes what it does.
 */
export interface Subscription {
  channelId: string
  title: string
  genre: Genre
  /** Median days between uploads. */
  cadenceDays: number
  cadence: Cadence
  /** Median length of its schedulable uploads. */
  typicalDurationSec: number
  format: Format
  /** 0..1 against the rest of the pool: how well watched this one is. */
  standing: number
  /** Everything it posts is 18+. Nothing it makes goes out before nine. */
  restricted: boolean
  /** Declared children's television. Daytime, and not after tea. */
  forChildren: boolean
  /** Schedulable uploads seen. Below a handful, none of the above is a pattern. */
  uploads: number
}

/**
 * How often it turns up.
 *
 * `daily` is a strip: the same thing at the same time every weekday, which is
 * what a schedule does with a supply it can rely on. `weekly` is a strand: one
 * night, one slot, and it is an event. `occasional` fills in.
 */
export type Cadence = 'daily' | 'weekly' | 'occasional'

/**
 * How long it runs, in the lengths a schedule is actually built out of. These
 * are slots, not durations: the point of the name is that two channels with
 * the same `format` are interchangeable in a way two channels thirty seconds
 * apart are not.
 */
export type Format = 'short' | 'segment' | 'half-hour' | 'hour' | 'feature'

const MINUTE = 60
const MS_PER_DAY = 86_400_000

/**
 * Nothing under this is a programme. A minute is where YouTube itself draws
 * the line for a short, and a schedule agrees: what you do with forty seconds
 * is put fifty of them together and call it a clip show.
 */
export const SHORT_MAX_SEC = 65

/**
 * Where one slot stops and the next begins.
 *
 * These are the slots and not the running times: a half-hour slot has never
 * held thirty minutes of programme, and an hour holds about fifty. So the
 * boundaries sit where a scheduler would put them: a thirty-four minute
 * programme is a half-hour, and a seventy-minute one has stopped being an hour
 * and become a feature.
 */
const FORMAT_BOUNDS: readonly (readonly [Format, number])[] = [
  ['short', SHORT_MAX_SEC],
  ['segment', 10 * MINUTE],
  ['half-hour', 35 * MINUTE],
  ['hour', 70 * MINUTE],
]

/** Above this many days between uploads it is not a strip. */
const DAILY_MAX_DAYS = 2.5
/** Above this it is not a weekly strand either: it turns up when it turns up. */
const WEEKLY_MAX_DAYS = 10

/** Uploads a channel needs before its habits are a pattern rather than a coincidence. */
export const MIN_SAMPLES = 3

/** Where a channel with nothing to rank on sits: neither promoted nor buried. */
const UNRANKED_STANDING = 0.5

/**
 * Read the whole pool once. Pure: the same pool gives the same profiles, which
 * is what lets a schedule be a fact rather than a decision.
 */
export function profile(pool: Pool): ReadonlyMap<string, Subscription> {
  const byChannel = new Map<string, Video[]>()
  for (const video of pool.videos) {
    if (!isEligible(video)) continue
    const seen = byChannel.get(video.channelId)
    if (seen) seen.push(video)
    else byChannel.set(video.channelId, [video])
  }

  // Ranked before anything else is decided, because standing is a comparison:
  // a hundred thousand views is a lot or nothing at all depending on who else
  // is in the room.
  const standings = rank(byChannel, pool.channels)

  const profiles = new Map<string, Subscription>()
  for (const [channelId, videos] of byChannel) {
    const channel = pool.channels.get(channelId)
    const durations = videos.map((video) => video.durationSec)
    const typicalDurationSec = median(durations)
    const cadenceDays = observedCadence(videos)

    profiles.set(channelId, {
      channelId,
      title: channel?.title ?? channelId,
      genre: genreOf(channel, videos),
      cadenceDays,
      cadence: cadenceOf(cadenceDays, videos.length),
      typicalDurationSec,
      format: formatOf(typicalDurationSec),
      standing: standings.get(channelId) ?? UNRANKED_STANDING,
      // Judged on the whole channel, not the one video: a channel that has
      // ever been rated is a channel to keep after the watershed.
      restricted: videos.some((video) => video.ageRestricted),
      forChildren: videos.every((video) => video.madeForKids),
      uploads: videos.length,
    })
  }

  return profiles
}

export function formatOf(durationSec: number): Format {
  for (const [format, ceiling] of FORMAT_BOUNDS) if (durationSec < ceiling) return format
  return 'feature'
}

function cadenceOf(days: number, uploads: number): Cadence {
  // One upload is not a rhythm. Treat it as occasional rather than inventing
  // a gap from a single date.
  if (uploads < 2) return 'occasional'
  if (days <= DAILY_MAX_DAYS) return 'daily'
  return days <= WEEKLY_MAX_DAYS ? 'weekly' : 'occasional'
}

/**
 * The median gap between uploads, in days. Median rather than mean because one
 * holiday, or one day a channel posted four times, should not change what the
 * channel is.
 */
function observedCadence(videos: readonly Video[]): number {
  const times = videos
    .map((video) => Date.parse(video.publishedAt))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b)
  if (times.length < 2) return Infinity

  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / MS_PER_DAY)
  return median(gaps)
}

/**
 * Standing, as a place in the queue rather than a number of views.
 *
 * Views are absent whenever an uploader hides them and vary by three orders of
 * magnitude when they are not, so the figure itself is useless for comparing
 * one channel with another. Its rank is not: it says only that this channel is
 * better watched than that one, which is the only thing a controller needs to
 * know to decide who gets the nine o'clock slot.
 */
function rank(
  byChannel: ReadonlyMap<string, readonly Video[]>,
  channels: ReadonlyMap<string, Channel>,
): ReadonlyMap<string, number> {
  const scored: { channelId: string; score: number }[] = []
  for (const [channelId, videos] of byChannel) {
    const views = videos
      .map((video) => video.viewCount)
      .filter((count): count is number => count !== undefined)
    const score = views.length > 0 ? median(views) : channels.get(channelId)?.subscriberCount
    if (score !== undefined) scored.push({ channelId, score })
  }

  // Sorted by the figure, then by id, so two channels on the same number come
  // out in the same order on every machine.
  scored.sort((a, b) => a.score - b.score || a.channelId.localeCompare(b.channelId))

  const standings = new Map<string, number>()
  for (const [index, entry] of scored.entries()) {
    standings.set(entry.channelId, scored.length < 2 ? UNRANKED_STANDING : index / (scored.length - 1))
  }
  return standings
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
