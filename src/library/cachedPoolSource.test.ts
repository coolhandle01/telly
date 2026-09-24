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
    async remove(key) {
      this.entries.delete(key)
    },
  }
}


/** The cache reads its store before it asks the source, so the inner `load` is
    not reached in the same turn as the call. */
const until = async (ready: () => boolean) => {
  for (let turn = 0; turn < 50 && !ready(); turn += 1) await Promise.resolve()
  if (!ready()) throw new Error('the inner source was never asked')
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

    // Widened: the original modelled corruption as *absence*, which is exactly
    // what `stored.videos ?? []` at cachedPoolSource.ts:97-98 was written for:
    // it exercised the guard instead of probing past it. A record written by
    // anything other than this app has fields that are present and the wrong
    // type, and `??` cannot see those at all.
    it.each([
      ['has lost its arrays', () => ({ savedAt: clock })],
      ['has a videos field that is not an array', () => ({ savedAt: clock, videos: 7, channels: [] })],
      ['has a channels field that is not an array', () => ({ savedAt: clock, videos: [], channels: {} })],
    ])('survives a stored record that %s', async (_case, record) => {
      const store = inMemoryStore()
      store.entries.set('pool', record() as unknown as StoredPool)

      const loading = new CachedPoolSource(countingSource(poolOf('a')), store, { now, key: 'pool' }).load()

      // Nothing here may take the channel off the air (indexedDbPoolStore.ts:9).
      await expect(loading).resolves.toBeDefined()
      const pool = await loading
      // The old assertions only checked the two `?? []` defaults. They never
      // asked whether what came back was a usable Pool at all, which is the
      // property the render downstream depends on.
      expect(Array.isArray(pool.videos)).toBe(true)
      expect(pool.channels).toBeInstanceOf(Map)
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

    // Widened: the original's "corrupt record" was still a *number*, just a
    // wrong one, so the subtraction at cachedPoolSource.ts:73 always succeeded
    // and only the comparison was ever exercised. That arithmetic runs outside
    // the file's only try/catch (:60-65), so a stamp of the wrong type is not a
    // cache miss: it is a rejected load, on every visit, until site data goes.
    it.each([
      ['stamped in the future', () => clock + 10 * 24 * HOUR],
      ['stamped with something that is not a number', () => 'the day before yesterday'],
      // IndexedDB stores a BigInt quite happily; `number - bigint` is a TypeError.
      ['stamped with a BigInt', () => 0n],
    ])('ignores an entry %s rather than trusting it forever', async (_case, stamp) => {
      const store = inMemoryStore()
      store.entries.set('pool', {
        savedAt: stamp(),
        videos: [video('bogus')],
        channels: [],
      } as unknown as StoredPool)
      const inner = countingSource(poolOf('fresh'))

      const loading = new CachedPoolSource(inner, store, { now, key: 'pool' }).load()

      // The assertion the narrow version never made: it asserted a refetch
      // *happened*, so it could only fail on a value that survived the
      // arithmetic. A distrusted stamp must be a miss, not a fault.
      await expect(loading).resolves.toBeDefined()
      expect(inner.loads).toBe(1)
      expect((await loading).videos.map((each) => each.id)).toEqual(['fresh'])
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
        remove: async () => {},
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
        remove: async () => {},
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

  describe('two accounts on one browser', () => {
    const alice = async () => 'UC-alice'
    const bob = async () => 'UC-bob'

    it('does not serve one account the record the other one wrote', async () => {
      const store = inMemoryStore()
      const alicesSource = countingSource(poolOf('alice-1'))
      const bobsSource = countingSource(poolOf('bob-1'))
      await new CachedPoolSource(alicesSource, store, { now, key: 'pool', scope: alice }).load()

      const pool = await new CachedPoolSource(bobsSource, store, { now, key: 'pool', scope: bob }).load()

      expect(bobsSource.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['bob-1'])
      // Alice's television is still Alice's, under the key it was filed with.
      expect(store.entries.get('pool:UC-alice')?.videos.map((each) => each.id)).toEqual(['alice-1'])
      expect(store.entries.get('pool:UC-bob')?.videos.map((each) => each.id)).toEqual(['bob-1'])
    })

    it('reads an account its own record back without asking the source again', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))
      await new CachedPoolSource(inner, store, { now, key: 'pool', scope: alice }).load()

      const second = await new CachedPoolSource(inner, store, { now, key: 'pool', scope: alice }).load()

      expect(inner.loads).toBe(1)
      expect(second.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('touches the store neither way while the account is unknown', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))
      const cached = new CachedPoolSource(inner, store, {
        now,
        key: 'pool',
        scope: async () => {
          throw new Error('the token was rejected')
        },
      })

      const pool = await cached.load()

      // Television carries on: a scope that cannot be established is a cache
      // miss, and the record under the bare key belongs to whoever wrote it.
      expect(inner.loads).toBe(1)
      expect(pool.videos.map((each) => each.id)).toEqual(['a'])
      expect(store.writes).toBe(0)
      expect(store.entries.size).toBe(0)
    })

    it('files a source with no scope under the bare key, as it always did', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))

      await new CachedPoolSource(inner, store, { now, key: 'pool' }).load()
      const second = await new CachedPoolSource(inner, store, { now, key: 'pool' }).load()

      expect(store.entries.get('pool')?.videos.map((each) => each.id)).toEqual(['a'])
      expect(inner.loads).toBe(1)
      expect(second.videos.map((each) => each.id)).toEqual(['a'])
    })
  })

  describe('forgetting, which is what signing out does', () => {
    it('empties the store, so the next load goes back to the source', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))
      const cached = new CachedPoolSource(inner, store, { now, key: 'pool' })
      await cached.load()

      await cached.forget()

      expect(store.entries.size).toBe(0)
      await cached.load()
      expect(inner.loads).toBe(2)
    })

    it('passes the forgetting on to a source that keeps something of its own', async () => {
      let forgotten = 0
      const inner: PoolSource = {
        load: async () => poolOf('a'),
        forget: async () => {
          forgotten += 1
        },
      }

      await new CachedPoolSource(inner, inMemoryStore(), { now }).forget()

      expect(forgotten).toBe(1)
    })

    it('finishes quietly over a source that keeps nothing', async () => {
      const inner = countingSource(poolOf('a'))

      await expect(new CachedPoolSource(inner, inMemoryStore(), { now }).forget()).resolves.toBeUndefined()
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

  /*
    Every one of these was a mutation-testing survivor: the behaviour was
    reasoned about when it was written and never observed.
  */
  describe('signing out while the set is still fetching', () => {
    it('does not let the load put the pool back after the clear', async () => {
      const store = inMemoryStore()
      let release: ((pool: Pool) => void) | undefined
      const slow: PoolSource = {
        load: () => new Promise<Pool>((resolve) => { release = resolve }),
      }
      const cached = new CachedPoolSource(slow, store, { now })

      const loading = cached.load()
      await until(() => release !== undefined)
      const forgetting = cached.forget()
      // The fetch lands after the sign-out has already emptied the store.
      release!(poolOf('a'))
      await loading
      await forgetting

      expect(store.entries.size).toBe(0)
    })

    it('waits for that load rather than returning before it lands', async () => {
      const store = inMemoryStore()
      let release: ((pool: Pool) => void) | undefined
      const slow: PoolSource = {
        load: () => new Promise<Pool>((resolve) => { release = resolve }),
      }
      const cached = new CachedPoolSource(slow, store, { now })

      const loading = cached.load()
      await until(() => release !== undefined)
      let done = false
      const forgetting = cached.forget().then(() => { done = true })

      await Promise.resolve()
      expect(done).toBe(false)

      release!(poolOf('a'))
      await loading
      await forgetting
      expect(done).toBe(true)
    })

    it('finishes without a store at all, which is a browser that gave us none', async () => {
      const cached = new CachedPoolSource(countingSource(poolOf('a')), undefined, { now })
      await cached.load()

      await expect(cached.forget()).resolves.toBeUndefined()
    })
  })

  describe('the age of a record', () => {
    it('serves one saved this very instant', async () => {
      const store = inMemoryStore()
      const inner = countingSource(poolOf('a'))
      const cached = new CachedPoolSource(inner, store, { now })
      await cached.load()

      // No time passes at all: age is exactly zero, which is fresh.
      await cached.load()

      expect(inner.loads).toBe(1)
    })
  })

  describe('a store that refuses', () => {
    // Survived mutation: the rethrow could be deleted and nothing noticed. A
    // sign-out that silently failed to clear is the whole reason this throws.
    it('reports a clear that did not happen, rather than reporting success', async () => {
      const refusing: PoolStore = {
        read: async () => undefined,
        write: async () => {},
        remove: async () => {
          throw new DOMException('the database is not open', 'InvalidStateError')
        },
      }

      await expect(
        new CachedPoolSource(countingSource(poolOf('a')), refusing, { now }).forget(),
      ).rejects.toThrow(/database is not open/)
    })
  })

  describe('the freshness window, at its edges', () => {
    const savedAtZero = () => {
      const store = inMemoryStore()
      store.entries.set('pool', { savedAt: 0, videos: [...poolOf('a').videos], channels: [] })
      return store
    }

    it('serves a record saved exactly now', async () => {
      clock = 0
      const inner = countingSource(poolOf('b'))

      const pool = await new CachedPoolSource(inner, savedAtZero(), { now }).load()

      expect(inner.loads).toBe(0)
      expect(pool.videos.map((each) => each.id)).toEqual(['a'])
    })

    it('serves a record one millisecond inside the day', async () => {
      clock = 24 * HOUR - 1
      const inner = countingSource(poolOf('b'))

      await new CachedPoolSource(inner, savedAtZero(), { now }).load()

      expect(inner.loads).toBe(0)
    })

    // The TTL is closedown to closedown, so the instant it is reached the
    // record is old: a day is a day, not a day and a moment.
    it('refetches the moment the day is up', async () => {
      clock = 24 * HOUR
      const inner = countingSource(poolOf('b'))

      await new CachedPoolSource(inner, savedAtZero(), { now }).load()

      expect(inner.loads).toBe(1)
    })

    it('refetches for a stamp one millisecond in the future', async () => {
      clock = -1
      const inner = countingSource(poolOf('b'))

      await new CachedPoolSource(inner, savedAtZero(), { now }).load()

      expect(inner.loads).toBe(1)
    })
  })

  describe('signing out, with somebody else on the same machine', () => {
    /*
      The record belongs to the account that signed in for it. Someone signing
      out has asked to be forgotten; they have not asked for everybody else at
      this machine to be forgotten, and a record thrown away costs its owner a
      whole day's quota to fetch again.
    */
    it("takes this account's record and leaves the other account's", async () => {
      const store = inMemoryStore()
      store.entries.set('pool:UC-bob', { savedAt: 0, videos: [], channels: [] })
      const cached = new CachedPoolSource(countingSource(poolOf('a')), store, {
        now,
        scope: async () => 'UC-alice',
      })
      await cached.load()
      expect([...store.entries.keys()].sort()).toEqual(['pool:UC-alice', 'pool:UC-bob'])

      await cached.forget()

      expect([...store.entries.keys()]).toEqual(['pool:UC-bob'])
    })

    // Signing out must not need the network: the token is being revoked in the
    // same breath, and the account was already established when the pool was
    // read or written.
    it('removes the record without asking who the account is again', async () => {
      const store = inMemoryStore()
      let scopeCalls = 0
      const cached = new CachedPoolSource(countingSource(poolOf('a')), store, {
        now,
        scope: async () => {
          scopeCalls += 1
          return 'UC-alice'
        },
      })
      await cached.load()
      const asked = scopeCalls

      await cached.forget()

      expect(scopeCalls).toBe(asked)
      expect(store.entries.size).toBe(0)
    })

    // A key that cannot be established means nothing is known to remove, and
    // reporting a sign-out that removed nothing would be the lie this throws
    // to avoid.
    it('reports a sign-out that could not establish the account', async () => {
      const cached = new CachedPoolSource(countingSource(poolOf('a')), inMemoryStore(), {
        now,
        scope: async () => {
          throw new Error('no token')
        },
      })

      await expect(cached.forget()).rejects.toThrow(/could not be established/)
    })
  })
})

describe('CachedPoolSource, progress', () => {
  const now = () => 1_000_000

  it('passes the inner source reports straight through', async () => {
    const inner: PoolSource = {
      async load(onProgress) {
        onProgress?.(0.5)
        onProgress?.(1)
        return poolOf('a')
      },
    }
    const seen: number[] = []

    await new CachedPoolSource(inner, inMemoryStore(), { now }).load((fraction) =>
      seen.push(fraction),
    )

    expect(seen).toEqual([0.5, 1])
  })

  it('says a cache hit is finished, because it is', async () => {
    // A caller that keeps a button disabled until the fraction reaches 1 would
    // otherwise keep it disabled for ever on the fastest path there is.
    const store = inMemoryStore()
    const cached = new CachedPoolSource(countingSource(poolOf('a')), store, { now })
    await cached.load()

    const seen: number[] = []
    await cached.load((fraction) => seen.push(fraction))

    expect(seen).toEqual([1])
  })

  it('lets a second caller watch the fetch the first one started', async () => {
    // The two callers here are the set being switched on and the listings
    // being opened. One fetch, and both of them get to see it happen.
    let report: ((fraction: number) => void) | undefined
    let release: (() => void) | undefined
    const inner: PoolSource = {
      async load(onProgress) {
        report = onProgress
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return poolOf('a')
      },
    }
    const cached = new CachedPoolSource(inner, inMemoryStore(), { now })
    const first: number[] = []
    const second: number[] = []

    const a = cached.load((fraction) => first.push(fraction))
    for (let tick = 0; tick < 20 && !report; tick += 1) await new Promise((r) => setTimeout(r, 0))
    const b = cached.load((fraction) => second.push(fraction))
    // The second caller reads the store before it joins, so give it the turn
    // of the loop that takes.
    await new Promise((r) => setTimeout(r, 0))
    report?.(0.5)
    release?.()
    await Promise.all([a, b])

    expect(first).toEqual([0.5])
    expect(second).toEqual([0.5])
  })
})
