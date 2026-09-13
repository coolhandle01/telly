/** A YouTube Data API call that came back as a failure. Carries no credentials. */
export class YouTubeApiError extends Error {
  readonly status: number
  /** The API's own `error.errors[].reason`, when it gave one. */
  readonly reason: string | undefined

  constructor(status: number, reason: string | undefined, message: string) {
    super(message)
    this.name = 'YouTubeApiError'
    this.status = status
    this.reason = reason
  }
}

/**
 * The daily 10,000-unit quota is spent (or the per-minute rate limit is).
 * Distinguishable on purpose: the screen above shows the test card for the rest
 * of the day rather than spinning or retrying into the same wall.
 */
export class QuotaExceededError extends YouTubeApiError {
  constructor(status: number, reason: string | undefined, message: string) {
    super(status, reason, message)
    this.name = 'QuotaExceededError'
  }
}

export function isQuotaExceeded(error: unknown): error is QuotaExceededError {
  return error instanceof QuotaExceededError
}
