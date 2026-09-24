import { describe, expect, it } from 'vitest'
import { EXPIRED, QuotaExceededError, SignInError, SignOutError, UNAVAILABLE, YouTubeApiError } from '@/library'
import { faultMessage, signInMessage, signOutMessage } from '@/ui/faultMessage'

/*
  Every branch, and every sentence, asserted on its own.

  Mutation testing emptied four of these strings and inverted three of the
  conditions without a single test noticing, because the only coverage was one
  Channel test that happened to route through the 403 arm.
*/
describe('faultMessage', () => {
  it('names the minute-long wait for a 429, which clears on its own', () => {
    const message = faultMessage(new YouTubeApiError(429, 'rateLimitExceeded', 'youtube videos failed'))

    expect(message).toMatch(/fewer requests/i)
    expect(message).toMatch(/minute/i)
  })

  // 429 arrives as a QuotaExceededError when it carries one of the rate-limit
  // reasons, and the wait is still the short one.
  it('names the same short wait when a 429 arrives as a quota error', () => {
    const message = faultMessage(
      new QuotaExceededError(429, 'userRateLimitExceeded', 'youtube videos failed'),
    )

    expect(message).toMatch(/fewer requests/i)
  })

  it('names the day-long wait for a spent daily quota', () => {
    for (const reason of ['quotaExceeded', 'dailyLimitExceeded']) {
      const message = faultMessage(new QuotaExceededError(403, reason, 'youtube videos failed'))

      expect(message, reason).toMatch(/allowance/i)
      expect(message, reason).toMatch(/tomorrow/i)
    }
  })

  it('tells a viewer whose sign-in has run out to sign in again', () => {
    const message = faultMessage(new YouTubeApiError(401, 'authError', 'youtube videos failed'))

    expect(message).toMatch(/sign in again/i)
  })

  // A 403 that is not about the quota is Google refusing this account, which
  // is a different thing from the day's budget and a different wait.
  it('separates a refused account from a spent allowance', () => {
    const refused = faultMessage(new YouTubeApiError(403, 'accessNotConfigured', 'youtube videos failed'))

    expect(refused).toMatch(/would not answer/i)
    expect(refused).not.toMatch(/allowance|tomorrow/i)
  })

  it('says the service could not be reached for anything else', () => {
    for (const error of [
      new YouTubeApiError(500, undefined, 'youtube videos failed'),
      new YouTubeApiError(404, 'notFound', 'youtube videos failed'),
      new TypeError('Failed to fetch'),
      'not an error at all',
      undefined,
    ]) {
      expect(faultMessage(error)).toMatch(/could not be reached/i)
    }
  })

  // The endpoint, the status and Google's own wording belong to whoever is
  // holding the Error. None of it is copy for a screen.
  it('repeats nothing of the error it was given', () => {
    const error = new YouTubeApiError(
      403,
      'quotaExceeded',
      'youtube playlistItems failed: 403 (quotaExceeded): The request cannot be completed because you have exceeded your quota.',
    )

    const message = faultMessage(error)

    expect(message).not.toMatch(/403|quotaExceeded|playlistItems|exceeded your quota/)
  })

  it('says something in every case, so no failure is a blank screen', () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      expect(faultMessage(new YouTubeApiError(status, undefined, 'x')).trim()).not.toBe('')
    }
  })
})

/*
  Signing out is two operations and each can fail on its own. Telling a viewer
  their list is still here when it is gone, or that their access is withdrawn
  when it is not, sends them to fix the wrong thing.
*/
describe('signOutMessage', () => {
  const failure = (revoked: boolean, cleared: boolean) =>
    signOutMessage(new SignOutError({ revoked, cleared, cause: new Error('why') }))

  it('sends the viewer to Google when the grant is the half that survived', () => {
    const message = failure(false, true)

    expect(message).toMatch(/still granted at Google/i)
    expect(message).toMatch(/account permissions/i)
    // The list is gone, so it must not be named as something still to deal with.
    expect(message).not.toMatch(/still holds|would not clear/i)
  })

  it('sends the viewer to their site data when the list is the half that survived', () => {
    const message = failure(true, false)

    expect(message).toMatch(/withdrawn at Google/i)
    expect(message).toMatch(/site data/i)
    expect(message).not.toMatch(/still granted/i)
  })

  it('names both when neither happened', () => {
    const message = failure(false, false)

    expect(message).toMatch(/still granted at Google/i)
    expect(message).toMatch(/still holds/i)
  })

  // An error from somewhere else says nothing about which half ran, so the
  // viewer is pointed at both rather than told a half-truth.
  it('assumes nothing from an error it does not recognise', () => {
    const message = signOutMessage(new Error('something else entirely'))

    expect(message).toMatch(/still granted at Google/i)
    expect(message).toMatch(/still holds/i)
  })
})

/*
  Each reason asks something different of the viewer, and one asks nothing:
  somebody who closed the window meant to close it.
*/
describe('signInMessage', () => {
  it('does not scold a viewer who closed the window', () => {
    for (const reason of ['popup_closed', 'popup_closed_by_user', 'dismissed']) {
      const message = signInMessage(new SignInError(reason))

      expect(message, reason).toMatch(/closed before it finished/i)
      expect(message, reason).not.toMatch(/pop-ups|blocking/i)
    }
  })

  it('tells a viewer whose browser blocked the window what to change', () => {
    const message = signInMessage(new SignInError('popup_failed_to_open'))

    expect(message).toMatch(/allow pop-ups/i)
  })

  // An hour is up rather than anything going wrong, so the sentence asks for
  // the one thing that fixes it and blames neither Google nor the browser.
  it('tells a viewer whose hour ran out to sign in again', () => {
    const message = signInMessage(new SignInError(EXPIRED))

    expect(message).toMatch(/sign in again/i)
    expect(message).not.toMatch(/pop-ups|could not be loaded/i)
  })

  it('separates a refused scope from a blocked window', () => {
    const message = signInMessage(new SignInError('access_denied'))

    expect(message).toMatch(/did not grant access/i)
    expect(message).not.toMatch(/pop-ups/i)
  })

  it('names the blocker when Google\'s script never arrived', () => {
    for (const error of [new SignInError(UNAVAILABLE), new Error('something else')]) {
      expect(signInMessage(error)).toMatch(/could not be loaded/i)
    }
  })

  // Google is free to add reasons. An unknown one must not reach the screen.
  it('repeats nothing of a reason it has no sentence for', () => {
    const message = signInMessage(new SignInError('some_new_reason_from_google'))

    expect(message).toMatch(/did not finish/i)
    expect(message).not.toMatch(/some_new_reason_from_google/)
  })
})
