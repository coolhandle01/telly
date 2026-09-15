# Google integration, and brand compliance

Sign-in itself is in [tokens.md](tokens.md). This is what happens with the token
once you have one, and what Google asks of the UI that requests it.

## The pipeline

```
subscriptions.list  ->  channels.list  ->  playlistItems.list  ->  videos.list
   (your subs)        (uploads playlist)     (recent videos)      (durations,
                       50 ids per call                            embeddable,
                                                                  category)
```

`src/library/youTubePoolSource.ts`.

**The two 50s are load-bearing.** `channels.list` and `videos.list` both accept
up to 50 IDs per call, and batching them is the difference between roughly
**220 quota units a day** over ~200 subscriptions and blowing the 10,000-unit
daily allowance before breakfast. A loop that fetches one ID at a time works
perfectly in development and dies on contact with a real subscription list.

Only `videos.list` returns duration, embeddability and category — the three
things the classifier needs — so the last hop is not optional.

**`playlistItems.list` is the one that cannot be batched**, so it is one call
per subscription: two hundred subscriptions is two hundred calls, and made one
after another that is most of a minute of a viewer looking at a button that
appears to do nothing. Eight are in the air at once (`mapLimit`). This costs no
extra quota — the charge is per call and the number of calls is unchanged — it
only stops the wall clock from being the sum of every round trip. It also does
not change the pool: `mapLimit` returns results in the order the items went in,
so the day planned from the pool does not depend on which channel's server
answered first.

Stopping matters as much as starting. A 401 or 403 sets a flag the workers
check before taking their next playlist, so a refused token costs at most the
calls already in flight rather than another two hundred.

## Progress

`load(onProgress?)` reports a fraction from 0 to 1, and the Telly Guide button
shows it while the set is programming. The denominator is arithmetic off the
subscription count — one call per 50 channels, one per channel for its uploads,
one per 50 videos — refined downward once the real video count is known. It
only ever shrinks, so the fraction only ever moves forwards; a load that
finishes a little early is a better lie than one that sits at 99%.

## Error triage

The rule is: **is this error about *them* or about *us*?**

```ts
} catch (error) {
  if (isFatal(error)) fatal = error
  else tick()
  return undefined
}
```

`isFatal` returns true **only for 401 and 403**.

A **404 playlist is skipped, not fatal.** Any subscription list that has been
around a while contains channels that have been deleted or gone private, and
that should cost you those channels — not the other two hundred. This was a real
bug: one dead playlist took the whole load down.

A **401 or 403 still fails the whole load**, because it is about our credentials
and will fail identically for every remaining channel. Continuing would mean two
hundred pointless requests and a misleading empty result.

## Caching

`CachedPoolSource` persists to IndexedDB with a **day-long TTL** — the same
life as a broadcast day — and degrades to calling straight through when there is
no usable store, so a private window still gets television.

What is stored is subscription metadata: titles, durations, IDs. No token ever
reaches it.

## Brand compliance

Verification aside, Google's sign-in branding guidelines constrain the button
itself, and the constraints are not the ones you would guess.

**The wording is a closed set.** "Sign in with Google", "Sign up with Google",
"Continue with Google", or "Sign in" on the icon-only variant, plus the
personalised "Sign in as …" / "Continue as …" forms. Localisation is the only
permitted deviation.

A wording like "Use my subscriptions" is more honest about what happens — telly
does not authenticate anyone, it asks an already-signed-in user to authorise a
read scope — but it is not on the list. Whether the closed set binds an
authorisation-only button is genuinely unclear. Assume it does: brand review
looks at the UI that triggers consent, and a rejection on wording costs a
multi-week round trip.

**None of the app's self-imposed constraints are a problem.** Google ships the
four-colour G as **inline SVG**, not an image file, and its own CSS declares
`font-family: 'Google Sans', arial, sans-serif` — so a build with no image
assets and no web fonts is Google's own published behaviour, not a compromise
against it. What fails review is wording, logo treatment and prominence.

`src/ui/GoogleSignInButton.tsx` therefore draws the mark by hand, and its tests
are compliance tests rather than UI tests — each pins a rule a sympathetic edit
would quietly break, far from the submission it would fail:

- permitted wording as the accessible name;
- the mark `aria-hidden`, so the label alone names the button;
- `viewBox="0 0 48 48"` with equal width and height, which makes distorting the
  logo structurally impossible rather than merely discouraged;
- the four brand colours pinned exactly — recolouring the G to match a teak
  cabinet is precisely the sympathetic change brand review rejects.

Two further rules apply if the theme ever changes: on `filled_blue` and
`filled_black` the G must sit on a **white tile** (36px, 3px radius, the 18px
glyph centred), which is the most commonly missed rule; and the button must be
sized to its content so the label never ellipsises. The light theme is used here
partly because it sidesteps the tile entirely.

The button sits **off the cabinet**, in `.set__corner`. A 1975 television had no
button for authorising a read scope, and the anachronism does less harm down
there.

## Verification

`youtube.readonly` is a **sensitive** scope, not a **restricted** one, so the
third-party security assessment (CASA) — which is triggered only by restricted
scopes — does not apply. For a television on one person's sofa, staying in
Testing costs one extra sign-in a week, which is cheaper than verification.

If that ever stops being true: the homepage and privacy policy must live on a
domain verified in Search Console as a **Domain property** via DNS TXT, by the
same Google account that is Owner or Editor on the Cloud project. Authorised
JavaScript origins are *not* domain-verified, so development on a free
subdomain is fine indefinitely.

One trap worth recording because it fails **silently**: never set
`Cross-Origin-Opener-Policy: same-origin` on the hosting. It nulls
`window.opener` in the consent popup, the callback never arrives, and sign-in
hangs with no console error. `same-origin-allow-popups` is the value that works;
doing nothing at all is also safe, since the default is `unsafe-none`. Never set
`Cross-Origin-Embedder-Policy: require-corp` either — cross-origin isolation
blocks `accounts.google.com/gsi/client` outright.
