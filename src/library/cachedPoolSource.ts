import type { Channel, Pool, Video } from '../domain'
import type { LoadProgress, PoolSource } from './poolSource'
import type { PoolStore, StoredPool } from './poolStore'

/**
 * A cache over any other source. The pool changes about as often as your
 * subscriptions upload, so it is refetched once a day — at closedown, when
 * nothing is on air anyway — and served from storage in between.
 *
 * Storage is best-effort by design: a browser that cannot give us a database
 * (private window, storage blocked, a corrupt object store) gets television
 * anyway, just without the saving. Losing the cache is never a reason to lose
 * the channel.
 */

/** Closedown to closedown. */
export const DEFAULT_POOL_TTL_MS = 24 * 60 * 60 * 1000

export const DEFAULT_POOL_KEY = 'pool'

export interface CachedPoolSourceOptions {
  /** Lets two sources (fixture and live, say) cache side by side. */
  key?: string
  ttlMs?: number
  /** Injected clock, so a test can age the cache without waiting a day. */
  now?: () => number
}

export class CachedPoolSource implements PoolSource {
  readonly #inner: PoolSource
  readonly #store: PoolStore | undefined
  readonly #key: string
  readonly #ttlMs: number
  readonly #now: () => number
  /** One fetch, however many callers ask at once. */
  #inFlight: Promise<Pool> | undefined
  /** Everyone watching the fetch in flight. Emptied when it settles. */
  readonly #listeners = new Set<LoadProgress>()

  constructor(inner: PoolSource, store?: PoolStore, options: CachedPoolSourceOptions = {}) {
    this.#inner = inner
    this.#store = store
    this.#key = options.key ?? DEFAULT_POOL_KEY
    this.#ttlMs = options.ttlMs ?? DEFAULT_POOL_TTL_MS
    this.#now = options.now ?? Date.now
  }

  async load(onProgress?: LoadProgress): Promise<Pool> {
    const hit = await this.#readFresh()
    // A cache hit did no work, so there was no progress to watch. Say so
    // anyway: a caller that hid a button until the fraction reached 1 would
    // otherwise hide it for ever on the fastest path there is.
    if (hit) {
      onProgress?.(1)
      return hit
    }

    // One fetch however many callers ask at once, so a second caller watches
    // the first one's progress rather than starting a second load to watch.
    if (onProgress) this.#listeners.add(onProgress)
    this.#inFlight ??= this.#fetchAndStore().finally(() => {
      this.#inFlight = undefined
      this.#listeners.clear()
    })
    return this.#inFlight
  }

  async #readFresh(): Promise<Pool | undefined> {
    if (!this.#store) return undefined

    let stored: StoredPool | undefined
    try {
      stored = await this.#store.read(this.#key)
    } catch {
      // An unreadable store is a cache miss, not a fault.
      return undefined
    }

    if (!stored || !this.#isFresh(stored.savedAt)) return undefined
    return toPool(stored)
  }

  /** A stamp from the future means a moved clock or a corrupt record: distrust it. */
  #isFresh(savedAt: number): boolean {
    const age = this.#now() - savedAt
    return age >= 0 && age < this.#ttlMs
  }

  /** Bound, because it is handed to the inner source as a callback. */
  readonly #report = (fraction: number): void => {
    for (const listener of this.#listeners) listener(fraction)
  }

  async #fetchAndStore(): Promise<Pool> {
    const pool = await this.#inner.load(this.#report)

    if (this.#store) {
      try {
        await this.#store.write(this.#key, toStored(pool, this.#now()))
      } catch {
        // Failing to save is not failing to load.
      }
    }

    return pool
  }
}

function toStored(pool: Pool, savedAt: number): StoredPool {
  return { savedAt, videos: [...pool.videos], channels: [...pool.channels.values()] }
}

function toPool(stored: StoredPool): Pool {
  const videos: readonly Video[] = stored.videos ?? []
  const channels: readonly Channel[] = stored.channels ?? []
  return { videos, channels: new Map(channels.map((channel) => [channel.id, channel])) }
}
