import type { Clock } from '../clock/clock'

/** A clock a test drives by hand. No timers, no waiting. */
export class FakeClock implements Clock {
  #now: Date
  readonly #listeners = new Set<(now: Date) => void>()

  constructor(now: Date) {
    this.#now = now
  }

  now(): Date {
    return this.#now
  }

  subscribe(listener: (now: Date) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Moves the clock on and ticks every subscriber. */
  set(now: Date): void {
    this.#now = now
    for (const listener of [...this.#listeners]) listener(now)
  }

  get subscriberCount(): number {
    return this.#listeners.size
  }
}
