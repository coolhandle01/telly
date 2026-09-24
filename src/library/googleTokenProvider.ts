import type { AccessTokenProvider } from './tokenProvider'

/**
 * Sign-in, via Google Identity Services.
 *
 * GIS hands a browser a short-lived access token and no refresh token, which
 * is the right shape for a page with no backend: the token is good for an hour
 * and a new one is asked for when that hour is up. It is never logged and
 * never put in a URL. It is held in `sessionStorage` for the life of the tab,
 * which is what carries a session across a reload.
 *
 * A token is obtained one way: `requestAccessToken`, which opens a popup
 * window. A popup wants a user gesture behind it, and a page load has none, so
 * every token this app holds comes from a click. `signIn` is that click.
 * `resume` asks Google for nothing; it reads back the token this tab already
 * has. The library refreshes nothing on its own, so expiry is this class's to
 * notice and act on.
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
 * Where the token and the moment it dies are kept, so a reload keeps them.
 *
 * GIS holds a token in the page and nowhere else, and the only way to ask for
 * another is a popup window, which the browser refuses without a gesture
 * behind it. A reload that keeps nothing therefore lands on the sign-in button
 * with an hour of grant still unspent. Writing the token here is what makes a
 * refresh keep the session.
 *
 * `sessionStorage`, so the record goes when the tab does, and what it holds
 * is a bearer token Google already limits to an hour.
 */
export const TOKEN_KEY = 'telly.google.token'

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

/** What a session whose hour has run out is reported as. */
export const EXPIRED = 'expired'

/**
 * What GIS reports when a silent request arrived without a `login_hint`.
 *
 * It is a complaint about the request rather than a verdict on the grant,
 * which is why it does not make the stored account go.
 */
export const NO_LOGIN_HINT = 'no_login_hint'

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
 * What a developer is told about a page load that did not restore a session.
 *
 * The viewer is told nothing: the screen says what it always says, which is
 * that they are signed out, and none of this reaches it. These are the facts
 * somebody debugging needs and cannot otherwise get, because the failure
 * paths here all end in `false` and a sign-in button.
 *
 * No value from Google is included beyond the reason it gave, and the token
 * is not one of them.
 */
export type Diagnostic =
  | 'resume: this tab held no token, so it starts at the button'
  | 'resume: the held token was past its hour'
  | 'resume: took up the token this tab held'
  | 'identify: this build of the library offers no id namespace'
  | 'identify: nothing came back before the timeout'
  | 'identify: the credential carried no usable account'
  | 'identify: account learned'

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

function browserSession(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

/** A token and the moment it stops being one. */
export interface HeldToken {
  token: string
  expiresAtMs: number
}

/**
 * Reads and writes the held token.
 *
 * Wrapped for the same reason the account is: a browser with site data
 * blocked throws on the property access itself, before any key is named.
 */
function rememberToken(session: Storage | undefined, held: HeldToken | undefined): void {
  try {
    if (held !== undefined) session?.setItem(TOKEN_KEY, JSON.stringify(held))
    else session?.removeItem(TOKEN_KEY)
  } catch {
    // Crossing a reload is the only thing this buys, and the button is still
    // there.
  }
}

/**
 * The held token, or nothing at all.
 *
 * Anything that is not the pair this app wrote is treated as nothing: a
 * half-written record, another version's shape, or a value some other script
 * put under the key. The cost of refusing one is a sign-in button.
 */
function storedToken(session: Storage | undefined): HeldToken | undefined {
  let raw: string | null | undefined
  try {
    raw = session?.getItem(TOKEN_KEY)
  } catch {
    return undefined
  }
  if (raw === null || raw === undefined || raw === '') return undefined

  try {
    const held: unknown = JSON.parse(raw)
    const token = (held as { token?: unknown }).token
    const expiresAtMs = (held as { expiresAtMs?: unknown }).expiresAtMs
    if (typeof token !== 'string' || token.length === 0) return undefined
    if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return undefined
    return { token, expiresAtMs }
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
  /**
   * Where the reason a page load stayed signed out is reported.
   *
   * Every failure path in `resume` and `identify` ends in the same thing on
   * screen, a sign-in button, so without this the reason is lost at the
   * moment it is known. Injected rather than logged from here, so a test
   * reads it and production is given nothing.
   */
  diagnose?: (event: Diagnostic, detail?: string) => void
  /** Injected so a test can drive the held token without a browser. */
  session?: Storage
}

export class GoogleTokenProvider implements AccessTokenProvider {
  readonly #clientId: string
  readonly #scope: string
  readonly #loadGis: GisLoader
  readonly #now: () => number
  readonly #storage: Storage | undefined
  readonly #diagnose: (event: Diagnostic, detail?: string) => void
  readonly #session: Storage | undefined

  #client: TokenClient | undefined
  #token: string | undefined
  #expiresAtMs = 0
  #pending: Promise<string> | undefined
  #ready: Promise<void> | undefined
  // The token client is built once but every flight has its own settlers, so
  // the callback has to reach the *current* one rather than close over the
  // first — otherwise a second sign-in never settles at all.
  #settle: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined
  readonly #listeners = new Set<(signedIn: boolean) => void>()

  constructor(clientId: string, options: GoogleTokenProviderOptions = {}) {
    this.#clientId = clientId
    this.#scope = options.scope ?? YOUTUBE_READONLY_SCOPE
    this.#loadGis = options.loadGis ?? loadGoogleIdentityServices
    this.#now = options.now ?? (() => Date.now())
    this.#storage = options.storage ?? browserStorage()
    this.#diagnose = options.diagnose ?? (() => undefined)
    this.#session = options.session ?? browserSession()
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
   * Take up the session this tab is already in.
   *
   * Nothing is asked of Google here. The one way to obtain a token is
   * `requestAccessToken`, which opens a popup window, and a page load carries
   * no user gesture for a popup to be traced to, so the browser refuses it.
   * What crosses the reload is the token itself, read back from the tab's own
   * storage.
   *
   * A record whose hour is up is dropped rather than adopted, so the screen
   * shows the sign-in button and the next token comes from a click.
   */
  resume(): Promise<boolean> {
    if (this.isSignedIn) return Promise.resolve(true)

    const held = storedToken(this.#session)
    if (held === undefined) {
      this.#diagnose('resume: this tab held no token, so it starts at the button')
      return Promise.resolve(false)
    }

    if (this.#now() >= held.expiresAtMs - EXPIRY_MARGIN_MS) {
      rememberToken(this.#session, undefined)
      this.#diagnose('resume: the held token was past its hour')
      return Promise.resolve(false)
    }

    this.#token = held.token
    this.#expiresAtMs = held.expiresAtMs
    this.#announce(true)
    this.#diagnose('resume: took up the token this tab held')
    return Promise.resolve(true)
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
    if (!id) {
      this.#diagnose('identify: this build of the library offers no id namespace')
      return
    }

    let answered = false
    const account = await new Promise<string | undefined>((resolve) => {
      const done = setTimeout(() => resolve(undefined), IDENTIFY_TIMEOUT_MS)
      id.initialize({
        client_id: this.#clientId,
        auto_select: true,
        itp_support: true,
        callback: (response) => {
          clearTimeout(done)
          answered = true
          resolve(accountFromCredential(response.credential))
        },
      })
      id.prompt()
    })

    if (account !== undefined) {
      rememberAccount(this.#storage, account)
      this.#diagnose('identify: account learned')
      return
    }

    // Two different failures, and the screen cannot tell them apart. Nothing
    // came back at all, or something came back that carried no account.
    this.#diagnose(
      answered
        ? 'identify: the credential carried no usable account'
        : 'identify: nothing came back before the timeout',
    )
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
    rememberToken(this.#session, undefined)
    if (was) this.#announce(false)
  }

  #announce(signedIn: boolean): void {
    for (const listener of [...this.#listeners]) listener(signedIn)
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

    // The hint names the account that granted before, so a viewer signing in
    // again is not asked to pick it out of the list a second time.
    const hint = storedAccount(this.#storage)

    if (this.#client) return this.#requestSynchronously('consent', hint).catch(asSignInError)

    // Not ready: ask anyway, and the popup may well be blocked. Better to
    // report that than to silently do nothing.
    return this.prepare()
      .then(() => this.#requestToken('consent', hint))
      .catch(asSignInError)
  }

  /**
   * A currently-valid token, or the end of the session.
   *
   * GIS refreshes nothing by itself, so noticing the expiry is this class's
   * job. Renewing needs `requestAccessToken`, which needs a popup, which needs
   * a click, and there is no click behind a request for programmes. So the
   * hour running out ends the session here: the token goes, everyone watching
   * is told, and the screen puts the button back that starts the next one.
   */
  getAccessToken(): Promise<string> {
    if (this.#token !== undefined && this.isSignedIn) return Promise.resolve(this.#token)

    this.#discard()
    return Promise.reject(new SignInError(EXPIRED))
  }

  /**
   * The API refused this token, as it does once the grant is revoked from the
   * Google account itself. Only the token that was refused is dropped: a load
   * sent before a fresh sign-in reports on the token it carried, not on the
   * one held now.
   */
  reject(token: string): void {
    if (token === this.#token) this.#discard()
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
      // A response usually carries Google's verdict on the grant. One of them
      // does not: the silent path reports `no_login_hint` when the request
      // arrived without one, which is this app failing to say which account
      // it meant. Treating that as a verdict would throw away the very value
      // whose absence caused it, and the next load would have nothing to send.
      this.#fail(response.error ?? 'no token returned', response.error !== NO_LOGIN_HINT)
      return
    }

    // A response that says nothing about its life is treated as the hour GIS
    // issues, and a garbled one as already over, so `isSignedIn` stays false
    // and the next call renews.
    const lifetimeSec = Number(response.expires_in ?? 3600)
    this.#token = response.access_token
    this.#expiresAtMs = this.#now() + (Number.isFinite(lifetimeSec) ? lifetimeSec : 0) * 1000

    // Written here rather than at sign-in, so what the tab holds is always a
    // token this app is actually using and the moment it stops being one.
    rememberToken(this.#session, { token: this.#token, expiresAtMs: this.#expiresAtMs })

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
