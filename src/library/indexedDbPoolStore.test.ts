import { describe, expect, it } from 'vitest'
import { IndexedDbPoolStore, openPoolStore } from './indexedDbPoolStore'
import type { StoredPool } from './poolStore'

/**
 * jsdom has no IndexedDB at all, so the transport is faked here — just enough
 * of the real shape (upgrade, transactions, request callbacks fired later) to
 * exercise our own wrapper. The store under test is never stubbed.
 */
type Listener = ((event: unknown) => void) | null

class FakeRequest<T> {
  onsuccess: Listener = null
  onerror: Listener = null
  result: T | undefined
  error: Error | undefined

  succeed(result?: T): void {
    setTimeout(() => {
      this.result = result
      this.onsuccess?.({ target: this })
    }, 0)
  }

  fail(error: Error): void {
    setTimeout(() => {
      this.error = error
      this.onerror?.({ target: this })
    }, 0)
  }
}

class FakeObjectStore {
  readonly records: Map<string, unknown>
  readonly #failing: boolean
  constructor(records: Map<string, unknown>, failing = false) {
    this.records = records
    this.#failing = failing
  }

  get(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>()
    if (this.#failing) request.fail(new Error('the object store is unreadable'))
    else request.succeed(this.records.get(key))
    return request
  }

  put(value: unknown, key: string): FakeRequest<void> {
    const request = new FakeRequest<void>()
    if (this.#failing) {
      request.fail(new Error('the object store is unwritable'))
    } else {
      this.records.set(key, value)
      request.succeed()
    }
    return request
  }

  delete(key: string): FakeRequest<void> {
    const request = new FakeRequest<void>()
    if (this.#failing) {
      request.fail(new Error('the record could not be removed'))
    } else {
      this.records.delete(key)
      request.succeed()
    }
    return request
  }
}

class FakeTransaction {
  oncomplete: Listener = null
  onerror: Listener = null
  onabort: Listener = null
  readonly error: Error | undefined
  readonly #store: FakeObjectStore

  constructor(store: FakeObjectStore, failing = false) {
    this.#store = store
    if (failing) this.error = new Error('the transaction was rolled back')
    setTimeout(() => (failing ? this.onerror?.({ target: this }) : this.oncomplete?.({ target: this })), 0)
  }

  objectStore(_name: string): FakeObjectStore {
    return this.#store
  }
}

class FakeDatabase {
  readonly objectStoreNames = {
    names: new Set<string>(),
    contains(name: string) {
      return this.names.has(name)
    },
  }
  readonly records = new Map<string, unknown>()
  failing = false
  transactions = 0

  createObjectStore(name: string): FakeObjectStore {
    this.objectStoreNames.names.add(name)
    return new FakeObjectStore(this.records)
  }

  transaction(_names: string, _mode: string): FakeTransaction {
    this.transactions += 1
    return new FakeTransaction(new FakeObjectStore(this.records, this.failing), this.failing)
  }

  close(): void {}
}

interface OpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: Listener
  onblocked: Listener
}

function fakeIndexedDb(options: { failToOpen?: boolean; blockOpen?: boolean; failing?: boolean } = {}): {
  factory: IDBFactory
  database: FakeDatabase
  opens: number
} {
  const database = new FakeDatabase()
  database.failing = options.failing ?? false
  const state = { opens: 0 }

  const factory = {
    open(_name: string, _version?: number) {
      state.opens += 1
      const request = new FakeRequest<FakeDatabase>() as OpenRequest
      request.onupgradeneeded = null
      request.onblocked = null

      if (options.failToOpen) {
        request.fail(new Error('storage is not available in this context'))
        return request
      }

      if (options.blockOpen) {
        setTimeout(() => request.onblocked?.({ target: request }), 0)
        return request
      }

      setTimeout(() => {
        request.result = database
        request.onupgradeneeded?.({ target: request })
        request.onsuccess?.({ target: request })
      }, 0)
      return request
    },
  }

  return {
    factory: factory as unknown as IDBFactory,
    database,
    get opens() {
      return state.opens
    },
  }
}

const entry = (savedAt: number): StoredPool => ({
  savedAt,
  videos: [
    {
      id: 'v1',
      channelId: 'UC1',
      title: 'Video v1',
      durationSec: 600,
      publishedAt: '2026-09-01T00:00:00Z',
      ageRestricted: false,
      madeForKids: false,
      embeddable: true,
      isLive: false,
    },
  ],
  channels: [{ id: 'UC1', title: 'Channel One' }],
})

describe('IndexedDbPoolStore', () => {
  it('round-trips a stored pool', async () => {
    const { factory } = fakeIndexedDb()
    const store = new IndexedDbPoolStore(factory)

    await store.write('pool', entry(1000))

    expect(await store.read('pool')).toEqual(entry(1000))
  })

  it('reads undefined for a key it has never written', async () => {
    const { factory } = fakeIndexedDb()

    expect(await new IndexedDbPoolStore(factory).read('pool')).toBeUndefined()
  })

  // Signing out is one account leaving, not the machine being wiped. Somebody
  // else's record is theirs, and throwing it away costs them a day's quota.
  it('removes one account and leaves the other alone', async () => {
    const { factory } = fakeIndexedDb()
    const store = new IndexedDbPoolStore(factory)
    await store.write('pool:UC-alice', entry(1000))
    await store.write('pool:UC-bob', entry(2000))

    await store.remove('pool:UC-alice')

    expect(await store.read('pool:UC-alice')).toBeUndefined()
    expect(await store.read('pool:UC-bob')).toBeDefined()
  })

  it('creates the object store on first open', async () => {
    const { factory, database } = fakeIndexedDb()

    await new IndexedDbPoolStore(factory).read('pool')

    expect([...database.objectStoreNames.names]).not.toHaveLength(0)
  })

  it('opens the database once however many times it is used', async () => {
    const fake = fakeIndexedDb()
    const store = new IndexedDbPoolStore(fake.factory)

    await store.write('pool', entry(1))
    await store.read('pool')
    await store.read('pool')

    expect(fake.opens).toBe(1)
  })

  it('rejects when a read transaction fails, so the cache can treat it as a miss', async () => {
    const { factory } = fakeIndexedDb({ failing: true })

    await expect(new IndexedDbPoolStore(factory).read('pool')).rejects.toThrow(/unreadable/)
  })

  it('rejects when a write is rolled back', async () => {
    const { factory } = fakeIndexedDb({ failing: true })

    await expect(new IndexedDbPoolStore(factory).write('pool', entry(1))).rejects.toThrow(/rolled back/)
  })

  it('rejects instead of waiting when another tab is blocking the upgrade', async () => {
    const { factory } = fakeIndexedDb({ blockOpen: true })

    await expect(new IndexedDbPoolStore(factory).read('pool')).rejects.toThrow(/blocked/)
  })

  it('retries the open next time rather than remembering the failure forever', async () => {
    let failing = true
    const working = fakeIndexedDb()
    const broken = fakeIndexedDb({ failToOpen: true })
    const flaky = {
      open: (name: string, version?: number) =>
        failing ? broken.factory.open(name, version) : working.factory.open(name, version),
    } as unknown as IDBFactory
    const store = new IndexedDbPoolStore(flaky)

    await expect(store.read('pool')).rejects.toThrow()
    failing = false

    await expect(store.read('pool')).resolves.toBeUndefined()
  })

  it('rejects rather than hanging when the database will not open', async () => {
    const { factory } = fakeIndexedDb({ failToOpen: true })

    await expect(new IndexedDbPoolStore(factory).read('pool')).rejects.toThrow(/storage is not available/)
  })
})

describe('openPoolStore', () => {
  it('gives back nothing when the browser has no IndexedDB, so the cache stands down', () => {
    // jsdom genuinely has none, which is the same shape as a locked-down browser.
    expect(globalThis.indexedDB).toBeUndefined()
    expect(openPoolStore()).toBeUndefined()
  })

  it('gives back a store when there is a factory to use', () => {
    const { factory } = fakeIndexedDb()

    expect(openPoolStore(factory)).toBeInstanceOf(IndexedDbPoolStore)
  })
})
