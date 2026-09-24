import type { GoogleTokenProvider } from './googleTokenProvider'
import type { PoolSource } from './poolSource'

/**
 * The viewer's Google session, as the screen needs it.
 *
 * One object rather than a handful of callbacks, because the screen has to
 * show a session rather than the outcome of the last click: a token expires an
 * hour in whether or not anyone touched the set, and `subscribe` is how the
 * button that says Sign out learns to say Sign in again.
 */
/**
 * A sign-out where one half did not happen, carrying which half.
 *
 * The two failures need different things of the viewer: a grant still standing
 * at Google is withdrawn from their account permissions, and a list still on
 * the machine goes with the site's data. Telling them the wrong one is worse
 * than telling them nothing.
 */
export class SignOutError extends Error {
  /** The grant went back to Google. */
  readonly revoked: boolean
  /** The machine gave up its copy of the subscriptions. */
  readonly cleared: boolean

  constructor(options: { revoked: boolean; cleared: boolean; cause: unknown }) {
    super('signing out did not complete')
    this.name = 'SignOutError'
    this.revoked = options.revoked
    this.cleared = options.cleared
    this.cause = options.cause
  }
}

export interface Session {
  /**
   * Called straight from a click. Nothing may be awaited before it: a consent
   * popup that cannot be traced to a gesture is blocked by the browser.
   */
  signIn(): Promise<void>
  /** Hands the grant back to Google and drops what this machine kept. */
  signOut(): Promise<void>
  /** Takes up a grant already made here. True when there was one to take up. */
  resume(): Promise<boolean>
  /** Sign-in, the hour running out, and sign-out. */
  subscribe(listener: (signedIn: boolean) => void): () => void
}

/**
 * The session a signed-in viewer gets: Google's grant and the pool kept on
 * this machine, signed out together.
 *
 * Both halves matter. Revoking alone leaves a day-old copy of the
 * subscriptions in the browser's database for whoever sits down next;
 * clearing alone leaves the grant standing at Google.
 */
export function googleSession(tokens: GoogleTokenProvider, source: PoolSource): Session {
  return {
    signIn: () => tokens.signIn().then(() => undefined),
    signOut: async () => {
      // Both halves are attempted whatever the other does. A grant that cannot
      // be handed back is a reason to report a failed sign-out, not a reason to
      // leave somebody's subscriptions on the machine as well.
      const [grant, machine] = await Promise.allSettled([tokens.signOut(), source.forget?.()])

      const refused =
        grant.status === 'rejected' ? grant : machine.status === 'rejected' ? machine : undefined

      if (refused) {
        throw new SignOutError({
          revoked: grant.status === 'fulfilled',
          cleared: machine.status === 'fulfilled',
          cause: refused.reason,
        })
      }
    },
    resume: () => tokens.resume(),
    subscribe: (listener) => tokens.subscribe(listener),
  }
}
