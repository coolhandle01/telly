import type { Channel, Pool, Video } from '../domain'
import type { PoolSource } from './poolSource'
import type { PoolStore, StoredPool } from './poolStore'

/**
 * A cache over any other source. The pool changes about as often as your
 * subscriptions upload, so it is refetched once a day (at closedown, when
 * nothing is on air anyway) and served from storage in between.
 *
 * Storage is best-effort by design: a browser that cannot give us a database
 * (private window, storage blocked, a corrupt object store) gets television
 * anyway, just without the saving. Losing the cache is never a reason to lose
 * the channel.
 *
 * What is stored is one person's subscription list, so `scope` puts each
 * account's under its own key: two people who use the same browser each get
 * their own television, and neither is shown the other's.
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
  /**
   * Who the pool belongs to, as a stable id: the signed-in account's own
   * channel id, for the YouTube source. It joins the key, so a record written
   * for one account is not a record any other account can read.
   *
   * Without one the key is shared, which suits a source that holds nobody's
   * data: the fixture is the same pool for everyone.
   */
  scope?: () => Promise<string>
}

export class CachedPoolSource implements PoolSource {
  readonly #inner: PoolSource
  readonly #store: PoolStore | undefined
  readonly #key: string
  readonly #ttlMs: number
  readonly #now: () => number
  readonly #scope: (() => Promise<string>) | undefined
  /** One fetch, however many callers ask at once. */
  #inFlight: Promise<Pool> | undefined

  constructor(inner: PoolSource, store?: PoolStore, options: CachedPoolSourceOptions = {}) {
    this.#inner = inner
    this.#store = store
    this.#key = options.key ?? DEFAULT_POOL_KEY
    this.#ttlMs = options.ttlMs ?? DEFAULT_POOL_TTL_MS
    this.#now = options.now ?? Date.now
    this.#scope = options.scope
  }

  async load(): Promise<Pool> {
    const hit = await this.#readFresh()
    if (hit) return hit

    this.#inFlight ??= this.#fetchAndStore().finally(() => {
      this.#inFlight = undefined
    })
    return this.#inFlight
  }

  /**
   * Every account's record, not just the signed-in one's. See `PoolStore`.
   *
   * A fetch that was already running writes its pool when it lands, so the
   * clear is repeated once that write has had its chance. Signing out in the
   * second a load returns is how the subscriptions get put back afterwards.
   */
  async forget(): Promise<void> {
    const landing = this.#inFlight
    this.#inFlight = undefined

    // Both halves are attempted whatever the other does. A database that will
    // not open would otherwise leave the source still keyed to the account
    // that has just signed out.
    const outcomes = await Promise.allSettled([this.#store?.clear(), this.#inner.forget?.()])

    if (landing) {
      await landing.catch(() => undefined)
      outcomes.push(...(await Promise.allSettled([this.#store?.clear()])))
    }

    // Reported, not swallowed. A load that cannot read its cache still has
    // television to fall back on; a sign-out that cannot clear it has left
    // somebody's subscriptions on the machine, and they were told otherwise.
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') throw outcome.reason
    }
  }

  /**
   * The key this account's pool is filed under.
   *
   * A scope that cannot be established is not a key: reading under the bare
   * key would serve whoever was here last, so there is no read and no write
   * until the account is known.
   */
  async #keyFor(): Promise<string | undefined> {
    if (!this.#scope) return this.#key
    try {
      return `${this.#key}:${await this.#scope()}`
    } catch {
      return undefined
    }
  }

  async #readFresh(): Promise<Pool | undefined> {
    if (!this.#store) return undefined

    const key = await this.#keyFor()
    if (key === undefined) return undefined

    let stored: StoredPool | undefined
    try {
      stored = await this.#store.read(key)
    } catch {
      // An unreadable store is a cache miss, not a fault.
      return undefined
    }

    if (!stored || !this.#isFresh(stored.savedAt)) return undefined
    return toPool(stored)
  }

  /**
   * A stamp from the future means a moved clock or a corrupt record: distrust
   * it. The type check comes first because this runs outside the try/catch at
   * :60, and IndexedDB stores a BigInt happily: `number - bigint` throws.
   */
  #isFresh(savedAt: unknown): boolean {
    if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return false
    const age = this.#now() - savedAt
    return age >= 0 && age < this.#ttlMs
  }

  async #fetchAndStore(): Promise<Pool> {
    const pool = await this.#inner.load()

    if (this.#store) {
      try {
        const key = await this.#keyFor()
        if (key !== undefined) await this.#store.write(key, toStored(pool, this.#now()))
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

/**
 * The stored record as a `Pool`, or nothing if it is not the record `toStored`
 * writes. Nothing is a cache miss: the pool is refetched and the record
 * overwritten.
 *
 * Anything can end up under this key (an older version of the app, a
 * half-finished write, a hand-edited entry in devtools) and a `channels` that
 * is not an array reaches `profile.ts` as `channels.get is not a function`.
 */
function toPool(stored: StoredPool): Pool | undefined {
  if (!Array.isArray(stored.videos) || !Array.isArray(stored.channels)) return undefined

  const videos: readonly Video[] = stored.videos
  const channels: readonly Channel[] = stored.channels
  return { videos, channels: new Map(channels.map((channel) => [channel.id, channel])) }
}
