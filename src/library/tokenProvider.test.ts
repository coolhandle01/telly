import { describe, expect, it } from 'vitest'
import { isQuotaExceeded, QuotaExceededError, YouTubeApiError } from './errors'
import { UnauthenticatedTokenProvider } from './tokenProvider'

describe('UnauthenticatedTokenProvider', () => {
  it('refuses rather than handing out an empty token', async () => {
    await expect(new UnauthenticatedTokenProvider().getAccessToken()).rejects.toThrow(/not signed in/)
  })
})

describe('isQuotaExceeded', () => {
  it('recognises the quota error the screen above reacts to', () => {
    expect(isQuotaExceeded(new QuotaExceededError(403, 'quotaExceeded', 'spent'))).toBe(true)
  })

  it('does not mistake any other failure for a spent quota', () => {
    expect(isQuotaExceeded(new YouTubeApiError(403, 'forbidden', 'nope'))).toBe(false)
    expect(isQuotaExceeded(new Error('offline'))).toBe(false)
    expect(isQuotaExceeded(undefined)).toBe(false)
  })

  it('keeps the status and reason for whoever has to explain the failure', () => {
    const error = new QuotaExceededError(403, 'quotaExceeded', 'youtube subscriptions failed: 403')

    expect(error.name).toBe('QuotaExceededError')
    expect(error.status).toBe(403)
    expect(error.reason).toBe('quotaExceeded')
    expect(error).toBeInstanceOf(YouTubeApiError)
  })
})
