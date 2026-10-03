import './GoogleSignInButton.css'

/**
 * Google's own sign-in button, drawn by hand.
 *
 * This is the one control in the app that is deliberately *not* of the set. A
 * 1975 television had no button for authorising a read scope, so rather than
 * invent a period-correct one we use the button people already recognise, and
 * keep it off the cabinet where the anachronism does no harm.
 *
 * The wording is not a free choice. Google's sign-in branding guidelines
 * permit a closed set of labels — "Sign in with Google", "Sign up with
 * Google", "Continue with Google", "Sign in" on the icon-only variant, plus
 * the personalised "… as <name>" forms — with localisation the only permitted
 * deviation. The button this replaced said "Use my subscriptions", which is
 * honest about what happens and is not on that list. Brand review looks at the
 * UI that triggers consent, so if this app is ever submitted for verification
 * the wording is what gets read.
 *
 * The light theme is used because the page behind it is black: a white button
 * reads as the standard article at a glance, and on a white ground the G sits
 * directly on the surface, so the 36px white tile the filled themes require
 * does not arise.
 */

export interface GoogleSignInButtonProps {
  /**
   * Called straight from the click. Do not `await` anything before opening
   * the consent popup — the user gesture does not survive a round trip.
   */
  onClick: () => void
}

export function GoogleSignInButton({ onClick }: GoogleSignInButtonProps) {
  return (
    <button type="button" className="gsi" onClick={onClick}>
      {/*
        The canonical mark, copied rather than re-traced. `viewBox` stays
        0 0 48 48 and width and height stay equal: the guidelines forbid
        altering the logo's aspect ratio, and a square box makes that
        structural rather than a thing to remember.
      */}
      <svg
        className="gsi__mark"
        width="18"
        height="18"
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
      Sign in with Google
    </button>
  )
}
