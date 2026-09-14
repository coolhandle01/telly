import { beforeEach, describe, expect, it } from 'vitest'
import type { Channel, Pool, Video } from '../domain'
import { CachedPoolSource, DEFAULT_POOL_TTL_MS } from './cachedPoolSource'
import type { PoolSource } from './poolSource'
import type { PoolStore, StoredPool } from './poolStore'

function video(id: string): Video {
  return {
    id,
    channelId: 'UC1',
    title: `Video ${id}`,
    durationSec: 600,
    publishedAt: '2026-09-01T00:00:00Z',
    ageRestricted: false,
    madeForKids: false,
    embeddable: true,
    isLive: false,
  }
}

function poolOf(...videoIds: string[]): Pool {
  const channel: Channel = { id: 'UC1', title: 'Channel One' }
  return { videos: videoIds.map(video), channels: new Map([[channel.id, channel]]) }
}

/** A source that counts, so a cache hit can be proved by absence of a call. */
function countingSource(pool: Pool): PoolSource & { loads: number } {
  return {
    loads: 0,
    async load() {
      this.loads += 1
      return pool
    },
  }
}

function inMemoryStore(): PoolStore & { entries: Map<string, StoredPool>; writes: number } {
  return {
    entries: new Map(),
    writes: 0,
    async read(key) {
      return this.entries.get(key)
    },
    async write(key, entry) {
      this.writes += 1
      this.entries.set(key, entry)
    },
  }
}

const HOUR = 60 * 60 * 1000

describe('CachedPoolSource', () => {
  let clock: number
  const now = () => clock

  beforeEach(() => {
    clock = new Date('2026-09-09T01:30:00Z').getTime()
  })

  it('refreshes about once a day by default, which is closedown to closedown', () => {
    expect(DEFAULT_POOL_TTL_MS).toBe(24 * HOUR)
  })

  describe('a cold cache', () => {
    it('loads from the inner source and hands the pool straight back', async () => {
      const inner = countingSource(poolOf('a', 'b'))
      const cached = new CachedPoolSource(inner, inMemoryStore(), { now })

      const pool = await cached.load()

      expect(inner.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['a', 'b'])
    })

    it('persists what it fetched, stamped with the time it was fetched', async () => {
      const store = inMemoryStore()
      const cached = new CachedPoolSource(countingSource(poolOf('a')), store, { now, key: 'pool' })

      await cached.load()

      const stored = store.entries.get('pool')
      expect(stored?.savedAt).toBe(clock)
      expect(stored?.videos.map((each) => each.id)).toEqual(['a'])
      expect(stored?.channels).toEqual([{ id: 'UC1', title: 'Channel One' }])
    })
  })

  describe('a warm cache', () => {
    it('does not call the inner source at all inside the TTL', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))
      const cached = new CachedPoolSource(inner, store, { now, ttlMs: 24 * HOUR })

      await cached.load()
      clock += 23 * HOUR
      const second = await cached.load()

      expect(inner.loads).toBe(1)
      expect(second.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('serves a hit even from a store written by an earlier session', async () => {
      const store = inMemoryStore()
      store.entries.set('pool', {
        savedAt: clock - HOUR,
        videos: [video('yesterday')],
        channels: [{ id: 'UC1', title: 'Channel One' }],
      })
      const inner = countingSource(poolOf('fresh'))

      const pool = await new CachedPoolSource(inner, store, { now, key: 'pool' }).load()

      expect(inner.loads).toBe(0)
      expect(pool.videos.map((each) => each.id)).toEqual(['yesterday'])
      expect(pool.channels.get('UC1')).toEqual({ id: 'UC1', title: 'Channel One' })
    })

    it('restores the channel map, not the array it was stored as', async () => {
      const store = inMemoryStore()
      store.entries.set('pool', {
        savedAt: clock,
        videos: [],
        channels: [{ id: 'UC1', title: 'Channel One' }],
      })

      const pool = await new CachedPoolSource(countingSource(poolOf()), store, { now, key: 'pool' }).load()

      expect(pool.channels).toBeInstanceOf(Map)
      expect(pool.channels.size).toBe(1)
    })

    /*
      Two ways to lose an array, and the record is no use either way. Absent,
      it is `?? []`. Present but not an array, it reaches `channels.map`. The
      claim this file's header makes is that neither costs you the channel.
    */
    it('survives a stored record whose arrays are missing entirely', async () => {
      const store = inMemoryStore()
      store.entries.set('pool', { savedAt: clock } as unknown as StoredPool)

      const pool = await new CachedPoolSource(countingSource(poolOf('a')), store, { now, key: 'pool' }).load()

      expect(pool.videos).toEqual([])
      expect(pool.channels.size).toBe(0)
    })

    it('survives a stored record whose arrays are the wrong type', async () => {
      const store = inMemoryStore()
      store.entries.set('pool', { savedAt: clock, videos: [], channels: {} } as unknown as StoredPool)
      const inner = countingSource(poolOf('a'))

      const pool = await new CachedPoolSource(inner, store, { now, key: 'pool' }).load()

      // A record that does not read as a pool is a cache miss like any other,
      // and the live source answers instead.
      expect(inner.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('refetches once the TTL has passed, and re-stamps the store', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))
      const cached = new CachedPoolSource(inner, store, { now, ttlMs: 24 * HOUR, key: 'pool' })

      await cached.load()
      clock += 25 * HOUR
      await cached.load()

      expect(inner.loads).toBe(2)
      expect(store.entries.get('pool')?.savedAt).toBe(clock)
    })

    it('ignores an entry stamped in the future rather than trusting it forever', async () => {
      const store = inMemoryStore()
      store.entries.set('pool', { savedAt: clock + 10 * 24 * HOUR, videos: [video('bogus')], channels: [] })
      const inner = countingSource(poolOf('fresh'))

      const pool = await new CachedPoolSource(inner, store, { now, key: 'pool' }).load()

      expect(inner.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['fresh'])
    })
  })

  describe('when storage lets us down', () => {
    it('calls through when there is no store at all, so a private window still gets television', async () => {
      const inner = countingSource(poolOf('a'))

      const pool = await new CachedPoolSource(inner, undefined, { now }).load()

      expect(inner.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('calls through when the store cannot be read', async () => {
      const failing: PoolStore = {
        read: async () => {
          throw new DOMException('the database is not open', 'InvalidStateError')
        },
        write: async () => {},
      }
      const inner = countingSource(poolOf('a'))

      const pool = await new CachedPoolSource(inner, failing, { now }).load()

      expect(inner.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('still returns the pool when the store cannot be written', async () => {
      const failing: PoolStore = {
        read: async () => undefined,
        write: async () => {
          throw new DOMException('quota exceeded', 'QuotaExceededError')
        },
      }

      const pool = await new CachedPoolSource(countingSource(poolOf('a')), failing, { now }).load()

      expect(pool.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('lets a failure from the inner source through, because that one is real', async () => {
      const broken: PoolSource = {
        load: async () => {
          throw new Error('quota spent')
        },
      }

      await expect(new CachedPoolSource(broken, inMemoryStore(), { now }).load()).rejects.toThrow('quota spent')
    })
  })

  describe('two callers at once', () => {
    it('fetches once when both arrive before the first fetch has finished', async () => {
      let loads = 0
      let release: (() => void) | undefined
      const slow: PoolSource = {
        load: async () => {
          loads += 1
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return poolOf('a')
        },
      }
      const cached = new CachedPoolSource(slow, inMemoryStore(), { now })

      const first = cached.load()
      const second = cached.load()
      // Let both calls get as far as the inner source before releasing it.
      for (let tick = 0; tick < 20 && !release; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0))
      release?.()

      expect((await first).videos.map((each) => each.id)).toEqual(['a'])
      expect((await second).videos.map((each) => each.id)).toEqual(['a'])
      expect(loads).toBe(1)
    })
  })
})
