import { describe, expect, it } from 'vitest'
import { IndexedDbPoolStore, openPoolStore } from '@/library/indexedDbPoolStore'
import type { StoredPool } from '@/library/poolStore'

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
  readonly #readonly: boolean
  constructor(records: Map<string, unknown>, failing = false, readonly = false) {
    this.records = records
    this.#failing = failing
    this.#readonly = readonly
  }

  // A read-only transaction refuses writes on the spot, as the real one does.
  #refuseInReadonly(): void {
    if (this.#readonly) throw new DOMException('the transaction is read-only', 'ReadOnlyError')
  }

  get(key: string): FakeRequest<unknown> {
    const request = new FakeRequest<unknown>()
    if (this.#failing) request.fail(new Error('the object store is unreadable'))
    else request.succeed(this.records.get(key))
    return request
  }

  put(value: unknown, key: string): FakeRequest<void> {
    this.#refuseInReadonly()
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
    this.#refuseInReadonly()
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

type Ending = 'complete' | 'error' | 'abort'

class FakeTransaction {
  oncomplete: Listener = null
  onerror: Listener = null
  onabort: Listener = null
  // An abort the page asked for carries no error, as in a browser.
  readonly error: Error | null = null
  readonly #scope: string
  readonly #store: FakeObjectStore

  constructor(scope: string, store: FakeObjectStore, ending: Ending) {
    this.#scope = scope
    this.#store = store
    if (ending === 'error') this.error = new Error('the transaction was rolled back')
    setTimeout(() => {
      if (ending === 'complete') this.oncomplete?.({ target: this })
      else if (ending === 'error') this.onerror?.({ target: this })
      else this.onabort?.({ target: this })
    }, 0)
  }

  objectStore(name: string): FakeObjectStore {
    if (name !== this.#scope) throw new DOMException(`${name} is not in this transaction`, 'NotFoundError')
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
  aborting = false
  transactions = 0
  closed = false
  onversionchange: Listener = null
  onclose: Listener = null

  createObjectStore(name: string): FakeObjectStore {
    this.objectStoreNames.names.add(name)
    return new FakeObjectStore(this.records)
  }

  // A closed connection refuses every transaction, as the real one does, so a
  // store that keeps using one fails here too. So does a transaction over a
  // store the database does not have.
  transaction(name: string, mode: IDBTransactionMode): FakeTransaction {
    if (this.closed) throw new Error('InvalidStateError: the database connection is closing')
    if (!this.objectStoreNames.contains(name)) {
      throw new DOMException(`there is no object store called ${name}`, 'NotFoundError')
    }
    if (mode !== 'readonly' && mode !== 'readwrite') throw new TypeError(`${mode} is not a transaction mode`)
    this.transactions += 1
    const store = new FakeObjectStore(this.records, this.failing, mode === 'readonly')
    const ending = this.failing ? 'error' : this.aborting ? 'abort' : 'complete'
    return new FakeTransaction(name, store, ending)
  }

  close(): void {
    this.closed = true
  }
}

interface OpenRequest extends FakeRequest<FakeDatabase> {
  onupgradeneeded: Listener
  onblocked: Listener
}

function fakeIndexedDb(
  options: { failToOpen?: boolean; blockOpen?: boolean; failing?: boolean; aborting?: boolean } = {},
): {
  factory: IDBFactory
  database: FakeDatabase
  opens: number
  openedAs: { name: string; version?: number }[]
} {
  const database = new FakeDatabase()
  database.failing = options.failing ?? false
  database.aborting = options.aborting ?? false
  const state = { opens: 0 }
  const openedAs: { name: string; version?: number }[] = []

  const factory = {
    open(name: string, version?: number) {
      state.opens += 1
      openedAs.push({ name, version })
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
        // Each open is a new connection over the same records.
        database.closed = false
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
    openedAs,
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

  // Browsers that have run the app already hold their cache under these
  // names, so a change to either strands it and costs a day's quota.
  it('keeps the pool in the database and store existing browsers already hold', async () => {
    const { factory, database, openedAs } = fakeIndexedDb()

    await new IndexedDbPoolStore(factory).write('pool', entry(1))

    expect(openedAs).toEqual([{ name: 'testcard', version: 1 }])
    expect([...database.objectStoreNames.names]).toEqual(['pools'])
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

  // A sign-out waits on the removal, so a transaction that aborts and never
  // settles is a sign-out that never reports.
  it.each([
    ['write', (store: IndexedDbPoolStore) => store.write('pool', entry(1))],
    ['remove', (store: IndexedDbPoolStore) => store.remove('pool')],
  ])('rejects when a %s transaction aborts', async (_name, act) => {
    const { factory } = fakeIndexedDb({ aborting: true })

    await expect(act(new IndexedDbPoolStore(factory))).rejects.toThrow(/aborted/)
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

  // Another tab upgrading or deleting the database waits until every open
  // connection closes, and this store holds one for the life of the page.
  it('closes its connection when another tab needs the database, and opens again next time', async () => {
    const fake = fakeIndexedDb()
    const store = new IndexedDbPoolStore(fake.factory)
    await store.write('pool', entry(1))

    fake.database.onversionchange?.({ target: fake.database })

    expect(fake.database.closed).toBe(true)
    await expect(store.read('pool')).resolves.toEqual(entry(1))
    expect(fake.opens).toBe(2)
  })

  // Clearing site data closes the connection from the browser's side.
  it('opens again after the browser closes the connection under it', async () => {
    const fake = fakeIndexedDb()
    const store = new IndexedDbPoolStore(fake.factory)
    await store.write('pool', entry(1))

    fake.database.closed = true
    fake.database.onclose?.({ target: fake.database })

    await expect(store.read('pool')).resolves.toEqual(entry(1))
    expect(fake.opens).toBe(2)
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
