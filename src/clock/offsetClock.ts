import { broadcastDayLength, broadcastDayStart } from '../domain/time'
import type { Clock } from './clock'

/**
 * A clock running a fixed distance from another one. Still ticks, so the
 * channel behaves exactly as it would at that hour — programmes end, junctions
 * arrive, the card's clock counts on. It is not a frozen instant.
 *
 * This is how you look at closedown without sitting up until half one.
 */
export class OffsetClock implements Clock {
  readonly #inner: Clock
  readonly #offsetMs: number

  constructor(inner: Clock, offsetMs: number) {
    this.#inner = inner
    this.#offsetMs = offsetMs
  }

  now(): Date {
    return new Date(this.#inner.now().getTime() + this.#offsetMs)
  }

  subscribe(listener: (now: Date) => void): () => void {
    return this.#inner.subscribe(() => listener(this.now()))
  }
}

/**
 * Reads `?at=` and returns the offset it implies, in milliseconds.
 *
 * Accepts a wall-clock time — `?at=03:14` — meaning the next occurrence of it,
 * counting the small hours as belonging to the night ahead rather than sending
 * you back 22 hours. A full ISO instant works too: `?at=2026-09-12T03:14`.
 *
 * Bounded to the broadcast day `now` falls in — 06.00 to 06.00. The set holds
 * one day's schedule and that is the one it can show you: an instant outside
 * it would be answered with a day planned from today's pool and presented as
 * that day's, which is not a schedule anybody ever broadcast.
 *
 * Returns 0 for anything absent, unparseable, or outside that day, so a typo
 * shows you the real time rather than an error.
 */
export function offsetFromQuery(search: string, now: Date): number {
  const at = new URLSearchParams(search).get('at')
  if (!at) return 0

  const target = targetOf(at.trim(), now)
  if (target === undefined || !withinBroadcastDay(target, now)) return 0
  return target.getTime() - now.getTime()
}

/** The instant `?at=` names, in either form it accepts. */
function targetOf(at: string, now: Date): Date | undefined {
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(at)
  if (hhmm) {
    const [hours, minutes] = [Number(hhmm[1]), Number(hhmm[2])]
    if (hours > 23 || minutes > 59) return undefined
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    // The next occurrence, so a time already past today means tomorrow.
    if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1)
    return target
  }

  const parsed = new Date(at)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/**
 * Whether an instant falls in the broadcast day `now` does.
 *
 * Half-open, as every other span in the schedule is: 06.00 belongs to the day
 * it opens, and the following 06.00 belongs to the next one. The length is
 * asked for rather than assumed, because twice a year it is 23 hours or 25.
 */
function withinBroadcastDay(target: Date, now: Date): boolean {
  const start = broadcastDayStart(now).getTime()
  const end = start + broadcastDayLength(new Date(start)) * 1000
  return target.getTime() >= start && target.getTime() < end
}
