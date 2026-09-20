import type { AccessTokenProvider } from './tokenProvider'

/**
 * Sign-in, via Google Identity Services.
 *
 * GIS hands a browser a short-lived access token and no refresh token, which
 * is the right shape for a page with no backend: the token lives in memory for
 * its hour and is asked for again when it expires. It is never written to
 * storage, never logged, and never put in a URL.
 *
 * Google's token model documents two moments a token is obtained: at page load
 * time, and from a user gesture such as a button press. Both are here
 * (`resume` is the first, `signIn` the second) and the library refreshes
 * nothing on its own, so expiry is this class's to notice and act on.
 *
 * https://developers.google.com/identity/oauth2/web/guides/use-token-model
 */

export const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
export const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

/**
 * Where this browser records which account granted, as Google's own `sub` for
 * it under this client id.
 *
 * Not a credential and not a token: it is the value `login_hint` takes, and a
 * silent request cannot resolve an account without one. It also says a grant
 * was made from this browser, which is what makes the request worth sending
 * at all. The token itself stays in memory.
 */
export const ACCOUNT_KEY = 'telly.google.account'

/** The boolean an earlier version wrote here. Removed, never read. */
export const GRANT_KEY = 'telly.google.granted'

/**
 * A sign-in that produced no token, carrying the reason as its own field.
 *
 * The reason decides what the viewer is asked to do next: a closed popup is
 * "try again", a blocked one is "allow popups", a refused scope is neither.
 * It is a field rather than a sentence because the wording belongs to the
 * screen, and the message here is for whoever is holding the Error.
 */
export class SignInError extends Error {
  /** GIS's `error_callback` type, or the token response's `error`. */
  readonly reason: string
  /**
   * True when Google answered and the answer was no.
   *
   * A token response carrying an `error` is Google speaking about the grant.
   * An `error_callback` is the browser or the network speaking about the
   * attempt: a popup it would not open, a request that never arrived. Both
   * reach the same `catch` and mean opposite things, so the one place that
   * acts on a refusal is told which it is holding.
   */
  readonly answered: boolean

  constructor(reason: string, answered = false) {
    super(`YouTube sign-in failed: ${reason}`)
    this.name = 'SignInError'
    this.reason = reason
    this.answered = answered
  }
}

/** What a failure that never reached Google is reported as. */
export const UNAVAILABLE = 'unavailable'

/** Only the slice of GIS we actually use. */
export interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
}

export interface RevocationResponse {
  successful?: boolean
  error?: string
}

/**
 * What a token request may ask of the viewer, as GIS defines it.
 *
 * The values are not interchangeable and the difference is the whole of the
 * page-load behaviour. `'none'` shows nothing at all. The empty string asks
 * only on the first request this app makes, so it is the value for a sign-in
 * button and not for a page load. `'consent'` and `'select_account'` always
 * show a screen, and `'select_account'` is what GIS uses when nothing is
 * passed.
 *
 * Narrowed to the four rather than left as `string`, because passing a value
 * GIS does not define is how this app spent a week signing people out on
 * every refresh.
 */
export type TokenPrompt = '' | 'none' | 'consent' | 'select_account'

export interface TokenClient {
  /**
   * `login_hint` is an email address or an ID token's `sub`. GIS documents
   * that a successful one skips account selection, which is what a request
   * that may show nothing needs in order to resolve an account at all.
   */
  requestAccessToken(overrides?: { prompt?: TokenPrompt; login_hint?: string }): void
}

/** The ID token GIS hands back, as a base64 JWT. */
export interface CredentialResponse {
  credential?: string
}

export interface GoogleIdentityServices {
  accounts: {
    /**
     * Sign In With Google, which is where an account identifier comes from.
     *
     * The token client returns an access token and says nothing about whose
     * it is. This half returns an ID token, and the `sub` claim inside it is
     * one of the two values `login_hint` accepts.
     */
    id?: {
      initialize(config: {
        client_id: string
        callback: (response: CredentialResponse) => void
        auto_select?: boolean
        itp_support?: boolean
      }): void
      /** Shows One Tap, or the browser's own credential manager. */
      prompt(): void
      /**
       * Recorded by GIS when the viewer signs out, so the next visit does not
       * sign them straight back in.
       */
      disableAutoSelect(): void
    }
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type?: string }) => void
      }): TokenClient
      /**
       * Hands the token back to Google, dropping every scope granted to this
       * app. Takes a live token: a revoked or expired one is refused.
       */
      revoke(accessToken: string, done?: (response: RevocationResponse) => void): void
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
 * What each GIS `<script>` in the document is already doing.
 *
 * Keyed by the element, so the entry lives exactly as long as the tag. The
 * error path removes the tag and a retry starts fresh; a tag that stays hands
 * its rejection to every later caller.
 */
const loads = new WeakMap<HTMLScriptElement, Promise<GoogleIdentityServices>>()

/**
 * Fetches the GIS script once. Rejects on a script error rather than hanging:
 * a blocked script that never settles is a screen that never explains itself.
 */
export function loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`)
  // A tag fires `load` once, so a call arriving after that takes its result
  // from here rather than from a listener.
  const already = existing && loads.get(existing)
  if (already) return already

  const script = existing ?? document.createElement('script')
  const load = new Promise<GoogleIdentityServices>((resolve, reject) => {
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

  loads.set(script, load)
  return load
}

/** Ask again slightly early, so a request never goes out with a dead token. */
const EXPIRY_MARGIN_MS = 60_000

/**
 * How long to wait for Sign In With Google to say who this is.
 *
 * It answers only when the browser has a session it can offer without asking,
 * so a viewer it cannot place leaves the callback unfired. Waiting for ever
 * would hold the sign-in behind a question nobody is going to answer.
 */
const IDENTIFY_TIMEOUT_MS = 5_000

/**
 * Reads and writes the grant flag.
 *
 * Both are wrapped because a browser with site data blocked throws on the
 * property access itself, before any key is named: a private window in Safari
 * and Firefox's strict mode both do it.
 */
function rememberAccount(storage: Storage | undefined, account: string | undefined): void {
  try {
    if (account !== undefined) storage?.setItem(ACCOUNT_KEY, account)
    else storage?.removeItem(ACCOUNT_KEY)
    // Written by an earlier version of this app under a key it no longer
    // reads. Taken out here so it does not outlive the thing that put it
    // there.
    storage?.removeItem(GRANT_KEY)
  } catch {
    // Resuming is the only thing this buys, and the button is still there.
  }
}

function storedAccount(storage: Storage | undefined): string | undefined {
  try {
    return storage?.getItem(ACCOUNT_KEY) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * The `sub` claim out of an ID token, without trusting the token.
 *
 * The value is used as a `login_hint` and for nothing else, so a wrong one
 * costs a failed silent request and a sign-in button, which is where the
 * viewer would be anyway. Verifying the signature would need a key fetch and
 * would protect nothing this app decides.
 */
export function accountFromCredential(credential: string | undefined): string | undefined {
  const payload = credential?.split('.')[1]
  if (!payload) return undefined
  try {
    const claims: unknown = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    const sub = (claims as { sub?: unknown }).sub
    return typeof sub === 'string' && sub.length > 0 ? sub : undefined
  } catch {
    return undefined
  }
}

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export interface GoogleTokenProviderOptions {
  scope?: string
  /** Injected so tests never fetch Google. */
  loadGis?: GisLoader
  /** Injected so token lifetime is testable. */
  now?: () => number
  /** Injected so a test can drive the grant flag without a browser. */
  storage?: Storage
}

export class GoogleTokenProvider implements AccessTokenProvider {
  readonly #clientId: string
  readonly #scope: string
  readonly #loadGis: GisLoader
  readonly #now: () => number
  readonly #storage: Storage | undefined

  #client: TokenClient | undefined
  #token: string | undefined
  #expiresAtMs = 0
  #pending: Promise<string> | undefined
  #ready: Promise<void> | undefined
  // The token client is built once but every flight has its own settlers, so
  // the callback has to reach the *current* one rather than close over the
  // first, otherwise a second sign-in never settles at all.
  #settle: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined
  readonly #listeners = new Set<(signedIn: boolean) => void>()

  constructor(clientId: string, options: GoogleTokenProviderOptions = {}) {
    this.#clientId = clientId
    this.#scope = options.scope ?? YOUTUBE_READONLY_SCOPE
    this.#loadGis = options.loadGis ?? loadGoogleIdentityServices
    this.#now = options.now ?? (() => Date.now())
    this.#storage = options.storage ?? browserStorage()
  }

  /** True while a token is in hand and still good. */
  get isSignedIn(): boolean {
    return this.#token !== undefined && this.#now() < this.#expiresAtMs - EXPIRY_MARGIN_MS
  }

  /**
   * Follows this along its whole life (the sign-in, the hour expiring, the
   * sign-out) so the screen shows the session that exists rather than the
   * outcome of the last click.
   */
  subscribe(listener: (signedIn: boolean) => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Take up a grant this browser has already made, without a consent screen.
   *
   * Google's token model obtains a token at page load as well as from a
   * gesture, and `prompt: 'none'` is the form that displays no authentication
   * or consent screen at all. The stored flag gates it, so a first visit sends
   * no request.
   *
   * The flag records something only Google can tell us, so only Google's
   * answer clears it. The script is fetched first and separately: an extension
   * or a firewall that stops it arriving means nothing was asked and nothing
   * was learned, and a viewer whose grant is intact keeps it.
   */
  async resume(): Promise<boolean> {
    if (this.isSignedIn) return true

    const account = storedAccount(this.#storage)
    if (account === undefined) return false

    try {
      await this.#loadGis()
    } catch {
      return false
    }

    try {
      await this.#requestToken('none', account)
      return true
    } catch (error) {
      // Only Google's own answer forgets the account. A popup the browser
      // would not open at page load, and a request that never arrived, say
      // nothing about whether the grant still stands, and forgetting on those
      // means one bad load stops every later load from even asking.
      if (error instanceof SignInError && error.answered) {
        rememberAccount(this.#storage, undefined)
      }
      this.#discard()
      return false
    }
  }

  /**
   * Learn which account this is, as Google's `sub` for it.
   *
   * `login_hint` takes an email address or that `sub`, and a request that
   * shows nothing has no way to ask which account it is for, so without one
   * a silent page-load request has nothing to resolve. The token client never
   * says whose token it returned. Sign In With Google does, in the ID token,
   * so it is asked once and the answer kept for later loads.
   *
   * Every failure here is quiet. It costs the next load its silent start,
   * which is the sign-in button, and that is where the viewer already is.
   */
  async #identify(): Promise<void> {
    if (storedAccount(this.#storage) !== undefined) return

    let gis: GoogleIdentityServices
    try {
      gis = await this.#loadGis()
    } catch {
      return
    }

    const id = gis.accounts.id
    if (!id) return

    const account = await new Promise<string | undefined>((resolve) => {
      const done = setTimeout(() => resolve(undefined), IDENTIFY_TIMEOUT_MS)
      id.initialize({
        client_id: this.#clientId,
        auto_select: true,
        itp_support: true,
        callback: (response) => {
          clearTimeout(done)
          resolve(accountFromCredential(response.credential))
        },
      })
      id.prompt()
    })

    if (account !== undefined) rememberAccount(this.#storage, account)
  }

  /**
   * Hand the token back to Google and forget it here.
   *
   * `revoke` drops every scope the viewer granted this app, which is what the
   * control on the screen says it does. It needs a live token, so it goes
   * first and the local state is cleared whatever it answers: a viewer who
   * asked to be signed out is signed out of this page either way.
   */
  async signOut(): Promise<void> {
    const token = this.#token
    rememberAccount(this.#storage, undefined)

    try {
      // GIS records the sign-out on its own side, which is what stops the
      // next visit signing the viewer straight back in.
      const gis = await this.#loadGis()
      gis.accounts.id?.disableAutoSelect()
    } catch {
      // An unreachable script cannot be told, and the viewer is still signed
      // out of this page: the account is already forgotten above.
    }

    try {
      if (token !== undefined) await this.#revoke(token)
    } finally {
      this.#discard()
    }
  }

  #revoke(token: string): Promise<void> {
    return this.#loadGis().then(
      (gis) =>
        new Promise<void>((resolve) => {
          gis.accounts.oauth2.revoke(token, () => resolve())
        }),
    )
  }

  /** Drops the token and tells anyone watching. */
  #discard(): void {
    const was = this.#token !== undefined
    this.#token = undefined
    this.#expiresAtMs = 0
    if (was) this.#announce(false)
  }

  #announce(signedIn: boolean): void {
    for (const listener of [...this.#listeners]) listener(signedIn)
  }

  /**
   * Fetch the Google script and build the token client, ahead of any click.
   *
   * This is the whole reason sign-in works at all. A popup must be traceable
   * to a user gesture, and that gesture does not survive a network round-trip,
   * so if the script is fetched *inside* the click handler, the browser has
   * already ended the activating task by the time the popup is asked for and
   * refuses it with `popup_failed_to_open`. Call this on mount; by the time
   * anyone clicks, `signIn` has nothing left to wait for.
   */
  prepare(): Promise<void> {
    this.#ready ??= this.#loadGis()
      .then((gis) => {
        this.#client ??= gis.accounts.oauth2.initTokenClient({
          client_id: this.#clientId,
          scope: this.#scope,
          callback: (response) => this.#onResponse(response),
          error_callback: (error) => this.#fail(error.type ?? 'dismissed'),
        })
      })
      .catch((error: unknown) => {
        // Sign-in stays available after a failed load: an extension, a
        // firewall or a flaky network can clear by the next click, and this
        // lets that click ask Google again.
        this.#ready = undefined
        throw error
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
    // Everything out of here is a `SignInError`, so the screen chooses its
    // words from `reason` and never from a message meant for a developer. A
    // script that did not arrive never reached Google, so it has no reason of
    // Google's to carry.
    const asSignInError = (error: unknown): never => {
      throw error instanceof SignInError ? error : new SignInError(UNAVAILABLE)
    }

    if (this.#client) return this.#requestSynchronously('consent').catch(asSignInError)

    // Not ready: ask anyway, and the popup may well be blocked. Better to
    // report that than to silently do nothing.
    return this.prepare()
      .then(() => this.#requestToken('consent'))
      .catch(asSignInError)
  }

  /**
   * A currently-valid token, renewing the held one once its hour is up.
   *
   * GIS refreshes nothing by itself, so noticing the expiry is this class's
   * job: the stale token goes before the request, and a renewal that Google
   * refuses puts the screen back to signed out rather than leaving a button
   * that is not there and a session that is not either.
   */
  async getAccessToken(): Promise<string> {
    if (this.#token !== undefined && this.isSignedIn) return this.#token

    this.#token = undefined
    this.#expiresAtMs = 0

    try {
      // Silent: no screen for a viewer whose grant stands, so no gesture. The
      // hint is what a request showing nothing resolves the account by.
      return await this.#requestToken('none', storedAccount(this.#storage))
    } catch (error) {
      // The stored account stays. A refusal here and a blocked script look the
      // same from inside this method, and that value is what a returning
      // viewer's silent page-load request is gated on: `resume` is where a
      // refusal is the answer to the question it asks, and where it is dropped.
      this.#announce(false)
      throw error
    }
  }

  /** Opens the popup in the caller's own task: no await before the request. */
  #requestSynchronously(prompt: TokenPrompt, login_hint?: string): Promise<string> {
    const client = this.#client
    if (!client) return Promise.reject(new Error('YouTube sign-in is not ready yet'))

    this.#pending ??= new Promise<string>((resolve, reject) => {
      this.#settle = { resolve, reject }
      client.requestAccessToken({ prompt, login_hint })
    }).finally(() => {
      this.#pending = undefined
    })
    return this.#pending
  }

  #requestToken(prompt: TokenPrompt, login_hint?: string): Promise<string> {
    // One flight at a time: two callers must not open two popups.
    this.#pending ??= this.#openFlight(prompt, login_hint).finally(() => {
      this.#pending = undefined
    })
    return this.#pending
  }

  async #openFlight(prompt: TokenPrompt, login_hint?: string): Promise<string> {
    const gis = await this.#loadGis()

    return new Promise<string>((resolve, reject) => {
      this.#settle = { resolve, reject }

      this.#client ??= gis.accounts.oauth2.initTokenClient({
        client_id: this.#clientId,
        scope: this.#scope,
        callback: (response) => this.#onResponse(response),
        error_callback: (error) => this.#fail(error.type ?? 'dismissed'),
      })

      this.#client.requestAccessToken({ prompt, login_hint })
    })
  }

  #onResponse(response: TokenResponse): void {
    if (response.error !== undefined || response.access_token === undefined) {
      this.#fail(response.error ?? 'no token returned', true)
      return
    }

    // A response that says nothing about its life is treated as the hour GIS
    // issues, and a garbled one as already over, so `isSignedIn` stays false
    // and the next call renews.
    const lifetimeSec = Number(response.expires_in ?? 3600)
    this.#token = response.access_token
    this.#expiresAtMs = this.#now() + (Number.isFinite(lifetimeSec) ? lifetimeSec : 0) * 1000

    const settle = this.#settle
    this.#settle = undefined
    settle?.resolve(response.access_token)
    this.#announce(true)

    // A token says nothing about whose it is, so which account granted is
    // asked separately and kept for the next page load. It runs after the
    // viewer has their television, because nothing on the screen waits on it.
    void this.#identify()
  }

  /** `answered` is true only when the reason came back from Google. */
  #fail(reason: string, answered = false): void {
    const settle = this.#settle
    this.#settle = undefined
    settle?.reject(new SignInError(reason, answered))
  }
}
