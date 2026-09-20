import { EXPIRED, SignInError, SignOutError, UNAVAILABLE, YouTubeApiError } from '../library'

/**
 * What the screen says when the programmes cannot be fetched.
 *
 * A station tells you it is off the air and roughly why; it does not read out
 * the fault log. The errors underneath carry an endpoint, a status and
 * Google's own wording, which is the right thing for a developer holding the
 * Error and the wrong thing on a screen someone is sitting in front of, so
 * this is the whole of what a viewer is shown.
 */

const SIGN_IN_AGAIN = 'Your YouTube sign-in has run out. Sign in again to see your subscriptions.'
const DAILY_LIMIT = "Today's allowance of YouTube requests is spent. Programmes return tomorrow."
const TOO_FAST = 'YouTube is asking for fewer requests. Programmes return in a minute or two.'
const REFUSED = 'YouTube would not answer for this account.'
const UNREACHABLE = 'YouTube could not be reached.'

export function faultMessage(error: unknown): string {
  if (!(error instanceof YouTubeApiError)) return UNREACHABLE

  // 429 is the per-minute limit and clears in seconds; 403 with a quota reason
  // is the day's budget and clears at midnight Pacific. They are different
  // waits, so they are different sentences.
  if (error.status === 429) return TOO_FAST
  if (error.status === 401) return SIGN_IN_AGAIN
  if (error.status === 403) return isQuota(error) ? DAILY_LIMIT : REFUSED
  return UNREACHABLE
}

function isQuota(error: YouTubeApiError): boolean {
  return error.reason === 'quotaExceeded' || error.reason === 'dailyLimitExceeded'
}

/**
 * What the screen says when signing out did not finish.
 *
 * Signing out is two things, and which one failed decides what the viewer has
 * left to do: a grant still standing at Google is withdrawn from their account
 * permissions, and a list still on the machine goes with the site's data.
 */
const BOTH_FAILED =
  'Signing out did not finish. Your access is still granted at Google, and this browser still holds its saved programme list.'
const GRANT_STANDS =
  'Signed out here, and the saved programme list is gone. Your access is still granted at Google: withdraw it in your Google account permissions.'
const LIST_REMAINS =
  'Signed out, and your access is withdrawn at Google. This browser would not clear its saved programme list: clearing this site data removes it.'

export function signOutMessage(error: unknown): string {
  if (!(error instanceof SignOutError)) return BOTH_FAILED
  if (!error.revoked && !error.cleared) return BOTH_FAILED
  return error.revoked ? LIST_REMAINS : GRANT_STANDS
}

/**
 * What the screen says when signing in did not produce a token.
 *
 * Each reason asks something different of the viewer, and one of them asks
 * nothing at all: a viewer who closed the window meant to.
 */
const POPUP_CLOSED = 'Sign-in was closed before it finished.'
const POPUP_BLOCKED =
  "This browser would not open Google's sign-in window. Allow pop-ups for this site, then try again."
const REFUSED_SCOPE =
  'Google did not grant access to your subscriptions. Signing in again asks for it once more.'
const NO_SIGN_IN =
  "Google's sign-in could not be loaded. An extension or a network filter may be blocking accounts.google.com."
const SESSION_OVER = 'This sign-in has run its hour. Sign in again to carry on watching.'

export function signInMessage(error: unknown): string {
  if (!(error instanceof SignInError)) return NO_SIGN_IN

  switch (error.reason) {
    case 'popup_closed':
    case 'popup_closed_by_user':
    case 'dismissed':
      return POPUP_CLOSED
    case 'popup_failed_to_open':
      return POPUP_BLOCKED
    case 'access_denied':
      return REFUSED_SCOPE
    case EXPIRED:
      return SESSION_OVER
    case UNAVAILABLE:
      return NO_SIGN_IN
    default:
      // Google sent a reason this app has no sentence for. The viewer is told
      // the attempt did not finish rather than shown Google's own wording.
      return 'Sign-in did not finish. Try again.'
  }
}
