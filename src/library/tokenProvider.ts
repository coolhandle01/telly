/**
 * The hole the OAuth flow will fill.
 *
 * Google Identity Services' `initTokenClient` hands the browser a short-lived
 * access token; whatever implements this holds it **in memory only** for its
 * one-hour life and refreshes it on demand. Nothing downstream knows or cares
 * where the token came from, and nothing downstream may store, log or print it.
 *
 * Deliberately not implemented here: the sign-in flow itself is app-level.
 */
export interface AccessTokenProvider {
  /** A currently-valid access token. Implementations refresh as needed. */
  getAccessToken(): Promise<string>
}

/**
 * A provider that refuses rather than pretending. The app installs this until a
 * client ID is configured, so an accidental call to the real API fails loudly
 * instead of firing an unauthenticated request.
 */
export class UnauthenticatedTokenProvider implements AccessTokenProvider {
  getAccessToken(): Promise<string> {
    return Promise.reject(new Error('not signed in: no YouTube access token is available'))
  }
}
