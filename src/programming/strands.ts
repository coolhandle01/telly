import type { Daypart, DaypartId } from '../domain'
import type { Subscription } from './profile'
import { lengthFit, SLOTS, wantOf } from './slots'
import type { Station } from './stations'

/**
 * A strand: one supplier, one night, one slot, every week.
 *
 * A channel that puts out an hour once a week is not a source of filler, it is
 * a series, and a series belongs on the same night at the same time, because
 * that is the only way anyone finds it twice. Give it a night and the schedule
 * stops being a shuffle and starts being a week.
 *
 * Daily suppliers are not strands. They are a strip, and a strip goes out
 * across the week rather than on one night of it, so they are left to find
 * their own slot every day.
 */
export interface Strand {
  channelId: string
  /** 0 is Sunday, as `Date.getDay` gives it. */
  weekday: number
  daypart: DaypartId
}

/** Monday first, because a week of television does. Sunday is the event night. */
const WEEK: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

/** Lengths that are worth a night of their own. Nothing shorter is a series. */
const STRAND_FORMATS = new Set(['hour', 'feature'])

export const isStrandLength = (subscription: Subscription): boolean =>
  subscription.cadence === 'weekly' && STRAND_FORMATS.has(subscription.format)

/**
 * Give each of a station's weekly suppliers a night.
 *
 * Dealt round the week in turn rather than hashed to it, so a station with
 * four strands gets four different nights instead of two of them on Tuesday
 * and none on Thursday. Sorted by channel id first, so the same subscriptions
 * always produce the same week.
 */
export function strandsFor(
  station: Station,
  subscriptions: readonly Subscription[],
): ReadonlyMap<string, Strand> {
  const weekly = subscriptions
    .filter(isStrandLength)
    .sort((a, b) => a.channelId.localeCompare(b.channelId))

  const strands = new Map<string, Strand>()
  for (const [index, subscription] of weekly.entries()) {
    const daypart = bestDaypart(station, subscription)
    if (daypart === undefined) continue
    strands.set(subscription.channelId, {
      channelId: subscription.channelId,
      weekday: WEEK[index % WEEK.length],
      daypart,
    })
  }
  return strands
}

/** Where on this station this supplier would sit best, on any night at all. */
function bestDaypart(station: Station, subscription: Subscription): DaypartId | undefined {
  let best: Daypart | undefined
  let bestScore = 0

  for (const daypart of station.dayparts) {
    if (daypart.offAir) continue
    const slot = SLOTS[daypart.id]
    const score =
      wantOf(slot, subscription.genre) *
      lengthFit(slot, subscription.format) *
      (1 + slot.standingWeight * subscription.standing)
    // A restricted supplier can only ever be scheduled after nine, so its
    // night has to be one it could actually go out on.
    if (subscription.restricted && !daypart.afterWatershed) continue
    if (score > bestScore) {
      best = daypart
      bestScore = score
    }
  }

  return best?.id
}
