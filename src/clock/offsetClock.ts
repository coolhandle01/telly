import { broadcastDayLength, broadcastDayStart } from '../domain'
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
 * The instant `?at=` names, or `undefined` if it names none.
 *
 * A bare wall-clock time is placed inside the broadcast day `dayStart` opens,
 * so `?at=03:14`, being before 06.00, lands on the day's second calendar date.
 */
function targetInstant(at: string, dayStart: Date): number | undefined {
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(at.trim())
  if (hhmm) {
    const [hours, minutes] = [Number(hhmm[1]), Number(hhmm[2])]
    if (hours > 23 || minutes > 59) return undefined
    const target = new Date(dayStart)
    target.setHours(hours, minutes, 0, 0)
    if (target.getTime() < dayStart.getTime()) target.setDate(target.getDate() + 1)
    return target.getTime()
  }

  const parsed = new Date(at).getTime()
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Reads `?at=` and returns the offset it implies, in milliseconds.
 *
 * Accepts a wall-clock time — `?at=03:14` — or a full instant,
 * `?at=2026-09-12T03:14`. Either way it must land inside the broadcast day you
 * are already in: the 06.00 behind you, up to but not including the 06.00
 * ahead. That is the day the schedule was planned for, and it is a window, so
 * this morning is as reachable as tonight's closedown.
 *
 * Returns 0 for anything absent, unparseable, or outside that day, so a typo
 * shows you the real time. `new Date('275760-09-13')` parses to the largest
 * `Date` there is, and an offset that size makes `OffsetClock.now()` overflow
 * to an invalid `Date` on the next tick, taking the schedule and the guide
 * with it.
 */
export function offsetFromQuery(search: string, now: Date): number {
  const at = new URLSearchParams(search).get('at')
  if (!at) return 0

  const dayStart = broadcastDayStart(now)
  // Twice a year this is not 24 hours. See `broadcastDayLength`.
  const dayEnd = dayStart.getTime() + broadcastDayLength(dayStart) * 1000

  const target = targetInstant(at, dayStart)
  if (target === undefined) return 0
  if (target < dayStart.getTime() || target >= dayEnd) return 0

  return target - now.getTime()
}
