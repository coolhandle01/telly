/**
 * Google Identity Services' `initTokenClient` hands the browser a short-lived
 * access token, and whatever implements this holds it for its lifetime.
 * Nothing downstream knows or cares where the token came from, and nothing
 * downstream may store, log or print it.
 */
export interface AccessTokenProvider {
  /** A currently-valid access token, or a rejection when there is none. */
  getAccessToken(): Promise<string>
  /**
   * The API answered 401 to this token. The provider drops it if it is still
   * the one held, so the next call ends the session rather than sending it
   * again.
   */
  reject?(token: string): void
  subscribe?(listener: (signedIn: boolean) => void): () => void
}

/** A provider that refuses rather than pretending. */
export class UnauthenticatedTokenProvider implements AccessTokenProvider {
  getAccessToken(): Promise<string> {
    return Promise.reject(new Error('not signed in: no YouTube access token is available'))
  }
}
