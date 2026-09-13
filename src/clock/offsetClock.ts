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
 * Returns 0 for anything absent or unparseable, so a typo shows you the real
 * time rather than an error.
 */
export function offsetFromQuery(search: string, now: Date): number {
  const at = new URLSearchParams(search).get('at')
  if (!at) return 0

  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(at.trim())
  if (hhmm) {
    const [hours, minutes] = [Number(hhmm[1]), Number(hhmm[2])]
    if (hours > 23 || minutes > 59) return 0
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    if (target.getTime() < now.getTime()) target.setDate(target.getDate() + 1)
    return target.getTime() - now.getTime()
  }

  const parsed = new Date(at)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime() - now.getTime()
}
