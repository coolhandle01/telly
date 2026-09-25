/**
 * The library layer: your subscriptions turned into a `Pool` the scheduler can
 * plan a day from.
 *
 * Everything is behind `PoolSource`, so the app above is handed one object and
 * never learns whether it is talking to the YouTube API or a cache over it.
 * `createPoolSource` decides, and makes none when there is no client ID.
 */
export { CachedPoolSource, DEFAULT_POOL_KEY, DEFAULT_POOL_TTL_MS } from './cachedPoolSource'
export type { CachedPoolSourceOptions } from './cachedPoolSource'
export { createPoolSource, isYouTubeConfigured } from './createPoolSource'
export type { PoolSourceConfig } from './createPoolSource'
export { parseIso8601Duration } from './duration'
export { isQuotaExceeded, QuotaExceededError, YouTubeApiError } from './errors'
export type { FetchLike, HttpRequestInit, HttpResponseLike } from './http'
export { IndexedDbPoolStore, openPoolStore } from './indexedDbPoolStore'
export { mapLimit } from './mapLimit'
export type { LoadProgress, PoolSource } from './poolSource'
export type { PoolStore, StoredPool } from './poolStore'
export { googleSession, SignOutError } from './session'
export type { Session } from './session'
export type { AccessTokenProvider } from './tokenProvider'
export { UnauthenticatedTokenProvider } from './tokenProvider'
export { batchIds, YouTubePoolSource } from './youTubePoolSource'
export type { YouTubePoolSourceOptions } from './youTubePoolSource'
export * from './googleTokenProvider'
