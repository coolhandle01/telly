import type { AccessTokenProvider } from './tokenProvider'

/**
 * Sign-in, via Google Identity Services.
 *
 * GIS hands a browser a short-lived access token and no refresh token, which
 * is the right shape for a page with no backend: the token lives in memory for
 * its hour and is asked for again when it expires. It is never written to
 * storage, never logged, and never put in a URL.
 */

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

/** Only the slice of GIS we actually use. */
export interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
}

export interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void
}

export interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string }) => void
      }): TokenClient
    }
  }
}

export type GisLoader = () => Promise<GoogleIdentityServices>

declare global {
  interface Window {
    google?: GoogleIdentityServices
  }
}

/**
 * Fetches the GIS script once. Rejects on a script error rather than hanging —
 * a blocked script that never settles is a screen that never explains itself.
 */
export function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`)
    const script = existing ?? document.createElement('script')

    script.addEventListener('load', () => {
      if (window.google?.accounts?.oauth2) resolve(window.google)
      else reject(new Error('Google Identity Services loaded but exposed no oauth2 client'))
    })
    script.addEventListener('error', () => {
      script.remove()
      reject(new Error('Google Identity Services could not be loaded'))
    })

    if (!existing) {
      script.src = GIS_SCRIPT_URL
      script.async = true
      document.head.append(script)
    }
  })
}

/** Ask again slightly early, so a request never goes out with a dead token. */
const EXPIRY_MARGIN_MS = 60_000

export interface GoogleTokenProviderOptions {
  scope?: string
  /** Injected so tests never fetch Google. */
  loadGis?: GisLoader
  /** Injected so token lifetime is testable. */
  now?: () => number
}

export class GoogleTokenProvider implements AccessTokenProvider {
  readonly #clientId: string
  readonly #scope: string
  readonly #loadGis: GisLoader
  readonly #now: () => number

  #client: TokenClient | undefined
  #token: string | undefined
  #expiresAtMs = 0
  #pending: Promise<string> | undefined
  #ready: Promise<void> | undefined
  // The token client is built once but every flight has its own settlers, so
  // the callback has to reach the *current* one rather than close over the
  // first — otherwise a second sign-in never settles at all.
  #settle: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined

  constructor(clientId: string, options: GoogleTokenProviderOptions = {}) {
    this.#clientId = clientId
    this.#scope = options.scope ?? YOUTUBE_READONLY_SCOPE
    this.#loadGis = options.loadGis ?? loadGoogleIdentityServices
    this.#now = options.now ?? (() => Date.now())
  }

  /** True while a token is in hand and still good. */
  get isSignedIn(): boolean {
    return this.#token !== undefined && this.#now() < this.#expiresAtMs - EXPIRY_MARGIN_MS
  }

  /**
   * Fetch the Google script and build the token client, ahead of any click.
   *
   * This is the whole reason sign-in works at all. A popup must be traceable
   * to a user gesture, and that gesture does not survive a network round-trip
   * — so if the script is fetched *inside* the click handler, the browser has
   * already ended the activating task by the time the popup is asked for and
   * refuses it with `popup_failed_to_open`. Call this on mount; by the time
   * anyone clicks, `signIn` has nothing left to wait for.
   */
  prepare(): Promise<void> {
    this.#ready ??= this.#loadGis().then((gis) => {
      this.#client ??= gis.accounts.oauth2.initTokenClient({
        client_id: this.#clientId,
        scope: this.#scope,
        callback: (response) => this.#onResponse(response),
        error_callback: (error) => this.#fail(error.type ?? 'dismissed'),
      })
    })
    return this.#ready
  }

  /**
   * Sign in, showing Google's consent popup. **Call this straight from a
   * click**, and call `prepare()` well before that.
   *
   * When the client is ready the popup is opened synchronously, inside the
   * click's own task, which is the only way a browser will allow it.
   */
  signIn(): Promise<string> {
    if (this.#client) return this.#requestSynchronously('consent')

    // Not ready: ask anyway, and the popup may well be blocked. Better to
    // report that than to silently do nothing.
    return this.prepare().then(() => this.#requestToken('consent'))
  }

  /**
   * A currently-valid token. Returns the held one while it lasts, and tries a
   * silent renewal after that — which succeeds when consent is still granted
   * and fails, rather than popping up, when it is not.
   */
  async getAccessToken(): Promise<string> {
    if (this.#token !== undefined && this.isSignedIn) return this.#token
    // A silent renewal opens no popup, so it needs no gesture and may await.
    return this.#requestToken('')
  }

  /** Opens the popup in the caller's own task — no await before the request. */
  #requestSynchronously(prompt: string): Promise<string> {
    const client = this.#client
    if (!client) return Promise.reject(new Error('YouTube sign-in is not ready yet'))

    this.#pending ??= new Promise<string>((resolve, reject) => {
      this.#settle = { resolve, reject }
      client.requestAccessToken({ prompt })
    }).finally(() => {
      this.#pending = undefined
    })
    return this.#pending
  }

  #requestToken(prompt: string): Promise<string> {
    // One flight at a time: two callers must not open two popups.
    this.#pending ??= this.#openFlight(prompt).finally(() => {
      this.#pending = undefined
    })
    return this.#pending
  }

  async #openFlight(prompt: string): Promise<string> {
    const gis = await this.#loadGis()

    return new Promise<string>((resolve, reject) => {
      this.#settle = { resolve, reject }

      this.#client ??= gis.accounts.oauth2.initTokenClient({
        client_id: this.#clientId,
        scope: this.#scope,
        callback: (response) => this.#onResponse(response),
        error_callback: (error) => this.#fail(error.type ?? 'dismissed'),
      })

      this.#client.requestAccessToken({ prompt })
    })
  }

  #onResponse(response: TokenResponse): void {
    if (response.error !== undefined || response.access_token === undefined) {
      this.#fail(response.error ?? 'no token returned')
      return
    }

    const lifetimeSec = Number(response.expires_in ?? 3600)
    this.#token = response.access_token
    this.#expiresAtMs = this.#now() + lifetimeSec * 1000

    const settle = this.#settle
    this.#settle = undefined
    settle?.resolve(response.access_token)
  }

  #fail(reason: string): void {
    const settle = this.#settle
    this.#settle = undefined
    settle?.reject(new Error(`YouTube sign-in failed: ${reason}`))
  }
}
