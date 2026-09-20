import { CachedPoolSource, type CachedPoolSourceOptions } from './cachedPoolSource'
import { FixturePoolSource } from './fixturePoolSource'
import type { FetchLike } from './http'
import { openPoolStore } from './indexedDbPoolStore'
import type { PoolSource } from './poolSource'
import type { PoolStore } from './poolStore'
import type { AccessTokenProvider } from './tokenProvider'
import { YouTubePoolSource } from './youTubePoolSource'

/**
 * Which pool the app runs on.
 *
 * The fixture is the default and stays the default until an OAuth client ID is
 * configured *and* something can actually produce a token. Anything less and
 * the channel runs on fixture programmes rather than showing a sign-in wall.
 *
 * `import.meta.env.VITE_*` is inlined into the bundle at build time and is
 * therefore **public** — readable by anyone who views source. Only the OAuth
 * *client ID* may live here, which is fine: it is a public identifier by
 * design. A client secret or API key must never be given a `VITE_` name; an
 * access token is never configured at all, it is fetched at runtime and kept in
 * memory (see `AccessTokenProvider`).
 */

export interface PoolSourceConfig {
  /** Public OAuth client ID. Defaults to the build-time `VITE_YOUTUBE_CLIENT_ID`. */
  clientId?: string
  /** Whatever the sign-in flow provides. Without it, the fixture stays on. */
  tokens?: AccessTokenProvider
  /** Injected transport; defaults to the platform `fetch`. */
  fetch?: FetchLike
  /** Injected storage; defaults to IndexedDB when the browser has it. */
  store?: PoolStore
  videosPerChannel?: number
  cache?: CachedPoolSourceOptions
}

function configuredClientId(): string | undefined {
  return import.meta.env.VITE_YOUTUBE_CLIENT_ID as string | undefined
}

export function isYouTubeConfigured(clientId: string | undefined = configuredClientId()): boolean {
  return (clientId ?? '').trim().length > 0
}

export function createPoolSource(config: PoolSourceConfig = {}): PoolSource {
  const clientId = config.clientId ?? configuredClientId()
  const fetch = config.fetch ?? ((url, init) => globalThis.fetch(url, init))

  if (!isYouTubeConfigured(clientId) || !config.tokens) return new FixturePoolSource()

  const live = new YouTubePoolSource({
    fetch,
    tokens: config.tokens,
    videosPerChannel: config.videosPerChannel,
  })

  return new CachedPoolSource(live, config.store ?? openPoolStore(), {
    // What is kept on this machine is filed under whose it is: the signed-in
    // account's own channel id. Overridable, like the rest of this, so a test
    // can pin the key.
    scope: () => live.ownerId(),
    ...config.cache,
  })
}
