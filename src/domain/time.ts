/**
 * The broadcast day runs 06.00 -> 06.00, not midnight to midnight. That is how
 * real schedules are built, and it keeps "late night" contiguous instead of
 * splitting it across two calendar dates.
 *
 * Positions within the day are held as offsets from that 06.00 anchor, so all
 * scheduling arithmetic is plain integers with no wrapping, no timezone and no
 * Date. Only `tune` converts back to an instant.
 */

/** Local hour at which one broadcast day gives way to the next. */
export const DAY_START_HOUR = 6

export const MINUTES_PER_DAY = 24 * 60
export const SECONDS_PER_DAY = MINUTES_PER_DAY * 60

export const minutes = (m: number): number => m * 60

/** Minutes from the 06.00 anchor, for a wall-clock time written as HH:MM. */
export function atClock(hour: number, minute = 0): number {
  const fromMidnight = hour * 60 + minute
  const fromAnchor = fromMidnight - DAY_START_HOUR * 60
  return fromAnchor < 0 ? fromAnchor + MINUTES_PER_DAY : fromAnchor
}

/**
 * The instant the broadcast day containing `now` began: today's 06.00, or
 * yesterday's if `now` falls in the small hours before it.
 */
export function broadcastDayStart(now: Date): Date {
  const start = new Date(now)
  start.setHours(DAY_START_HOUR, 0, 0, 0)
  if (start.getTime() > now.getTime()) start.setDate(start.getDate() - 1)
  return start
}

/**
 * How long this broadcast day actually is, in seconds.
 *
 * Usually `SECONDS_PER_DAY`, and twice a year not. The UK clocks go forward at
 * 01.00 on a Sunday in March and back at 02.00 on a Sunday in October, and
 * both of those fall *inside* a broadcast day that began at 06.00 the previous
 * morning, so that day is 23 hours long in spring and 25 in autumn.
 *
 * Assuming 86,400 either way is the classic version of this bug: in March the
 * schedule's last hour never plays, and in October the set runs an hour past
 * the end of its own schedule with nothing to show.
 */
export function broadcastDayLength(dayStart: Date): number {
  const next = new Date(dayStart)
  next.setDate(next.getDate() + 1)
  next.setHours(DAY_START_HOUR, 0, 0, 0)
  return Math.round((next.getTime() - dayStart.getTime()) / 1000)
}

/** Whole seconds elapsed since the broadcast day began. */
export function secondsIntoDay(now: Date, dayStart: Date): number {
  return Math.floor((now.getTime() - dayStart.getTime()) / 1000)
}
