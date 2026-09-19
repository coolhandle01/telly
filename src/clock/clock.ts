/**
 * The only source of "now". Everything downstream takes a `Clock` rather than
 * calling `Date.now()`, so a test can run a whole broadcast day in a
 * millisecond and the card never depends on when the suite happened to run.
 */
export interface Clock {
  now(): Date
  /** Ticks the listener as the clock advances. Returns an unsubscribe. */
  subscribe(listener: (now: Date) => void): () => void
}

/** How often the wall clock is sampled: the card's clock shows seconds. */
const TICK_MS = 1000

export class SystemClock implements Clock {
  readonly #listeners = new Set<(now: Date) => void>()
  #timer: ReturnType<typeof setInterval> | undefined

  now(): Date {
    return new Date()
  }

  subscribe(listener: (now: Date) => void): () => void {
    this.#listeners.add(listener)
    this.#timer ??= setInterval(() => {
      const now = this.now()
      for (const each of this.#listeners) each(now)
    }, TICK_MS)

    return () => {
      this.#listeners.delete(listener)
      if (this.#listeners.size === 0 && this.#timer !== undefined) {
        clearInterval(this.#timer)
        this.#timer = undefined
      }
    }
  }
}
