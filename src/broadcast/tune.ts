/**
 * The tuner. Wall-clock time in, what-is-on-air out — and nothing else: no
 * `Date.now()`, no clock, no I/O. The whole app hangs off this one function,
 * because it is what makes the channel a channel: you never *start* a
 * programme, you join one already in progress.
 */
import {
  secondsIntoDay,
  type NowAndNext,
  type OnAir,
  type Schedule,
  type ScheduleItem,
} from '../domain'

/**
 * Index of the item covering `sec`, or -1 if the day does not reach that far.
 * Items are contiguous, gapless and sorted, so bisection is enough; each item
 * is half-open `[startSec, endSec)`, which is what puts a boundary instant on
 * the *incoming* item rather than the outgoing one.
 */
function indexAt(items: readonly ScheduleItem[], sec: number): number {
  let low = 0
  let high = items.length - 1

  while (low <= high) {
    const middle = (low + high) >> 1
    const item = items[middle]
    if (sec < item.startSec) high = middle - 1
    else if (sec >= item.endSec) low = middle + 1
    else return middle
  }

  return -1
}

/** The instant `sec` seconds into the broadcast day the schedule describes. */
const instantOf = (schedule: Schedule, sec: number): Date =>
  new Date(schedule.startsAt.getTime() + sec * 1000)

function onAirFor(schedule: Schedule, item: ScheduleItem, sec: number): OnAir {
  const { content } = item
  const ends = instantOf(schedule, item.endSec)

  switch (content.kind) {
    case 'programme':
      return {
        kind: 'programme',
        videoId: content.videoId,
        title: content.title,
        // The join: where the item begins in the video, plus how long the
        // item has been running. This is the arithmetic nothing else may do.
        offsetSec: content.videoStartSec + (sec - item.startSec),
        endsAt: ends,
        daypart: item.daypart,
      }
    case 'filler':
      return { kind: 'filler', variant: content.variant, until: ends, daypart: item.daypart }
  }
}

/** What is on air at `now`, or `undefined` if `now` falls outside this day. */
export function tune(schedule: Schedule, now: Date): OnAir | undefined {
  const sec = secondsIntoDay(now, schedule.startsAt)
  const index = indexAt(schedule.items, sec)
  return index === -1 ? undefined : onAirFor(schedule, schedule.items[index], sec)
}

/** As `tune`, plus the item that follows — absent at the end of the day. */
export function nowAndNext(schedule: Schedule, now: Date): NowAndNext | undefined {
  const sec = secondsIntoDay(now, schedule.startsAt)
  const index = indexAt(schedule.items, sec)
  if (index === -1) return undefined

  return {
    now: onAirFor(schedule, schedule.items[index], sec),
    next: schedule.items[index + 1],
  }
}
