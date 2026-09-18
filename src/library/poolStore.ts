import type { Channel, Video } from '../domain'

/** A pool as it survives a page reload: plain data, no Map, no class instances. */
export interface StoredPool {
  /** Epoch millis the pool was fetched. The TTL is measured from here. */
  savedAt: number
  videos: Video[]
  channels: Channel[]
}

/**
 * Somewhere to keep a pool between sessions. The interface exists so the cache
 * can be tested without a browser database, and so a browser that has no usable
 * IndexedDB (private windows, storage blocked) can be handed nothing at all.
 */
export interface PoolStore {
  read(key: string): Promise<StoredPool | undefined>
  write(key: string, entry: StoredPool): Promise<void>
  /**
   * Removes one record.
   *
   * This is what signing out does to the copy of your subscriptions held on
   * this machine. One key, because the record belongs to the account that
   * signed out and the others belong to accounts that did not: a set in a
   * hall or a library has had more than one person signed into it, and the
   * one leaving does not get to throw away everybody else's evening.
   */
  remove(key: string): Promise<void>
}
