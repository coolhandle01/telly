import type { PoolStore, StoredPool } from './poolStore'

/**
 * A very small promise wrapper over raw IndexedDB — one object store, one
 * record per key. Deliberately not a library: the API surface we need is a get
 * and a put, and a dependency here would be more code than this file.
 *
 * Everything it can throw is caught by `CachedPoolSource`, which treats a
 * failure as a cache miss. Nothing here may take the channel off the air.
 */

const DB_NAME = 'testcard'
const STORE_NAME = 'pools'
const DB_VERSION = 1

/** Resolves what a request produced, or rejects with why it could not. */
function fromRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb request failed'))
  })
}

function fromTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('indexeddb transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('indexeddb transaction aborted'))
  })
}

export class IndexedDbPoolStore implements PoolStore {
  readonly #factory: IDBFactory
  /** Opened once and shared; a rejected open is not cached as a success. */
  #database: Promise<IDBDatabase> | undefined

  constructor(factory: IDBFactory) {
    this.#factory = factory
  }

  async read(key: string): Promise<StoredPool | undefined> {
    const database = await this.#open()
    const store = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    return (await fromRequest(store.get(key))) as StoredPool | undefined
  }

  async write(key: string, entry: StoredPool): Promise<void> {
    const database = await this.#open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(entry, key)
    await fromTransaction(transaction)
  }

  async remove(key: string): Promise<void> {
    const database = await this.#open()
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(key)
    await fromTransaction(transaction)
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.#factory.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexeddb could not be opened'))
      // A blocked open means another tab holds an older version. Don't wait
      // for it: an unopened database is a cache miss, and the channel goes on.
      request.onblocked = () => reject(new Error('indexeddb open is blocked by another tab'))
    }).catch((error: unknown) => {
      this.#database = undefined
      throw error
    })

    return this.#database
  }
}

/**
 * The store, when the browser will give us one. A private window, blocked
 * storage or an ancient browser simply has no `indexedDB`, and the caller is
 * expected to carry on without a cache rather than fail.
 */
export function openPoolStore(factory: IDBFactory | undefined = globalThis.indexedDB): PoolStore | undefined {
  if (!factory) return undefined
  try {
    return new IndexedDbPoolStore(factory)
  } catch {
    return undefined
  }
}
