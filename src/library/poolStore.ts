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
}
