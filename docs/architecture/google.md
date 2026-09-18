# Google integration, and brand compliance

Sign-in itself is in [tokens.md](tokens.md). This is what happens with the token
once you have one, and what Google asks of the UI that requests it.

## The pipeline

```
channels.list mine  ->  subscriptions.list  ->  channels.list  ->  playlistItems.list  ->  videos.list
  (whose these are)        (your subs)       (uploads playlist)     (recent videos)      (durations,
                                              50 ids per call                             embeddable,
                                                                                          category)
```

`src/library/youTubePoolSource.ts`, and the quota table in that file's header is
the same one as below.

**The two 50s are load-bearing.** `channels.list` and `videos.list` both accept
up to 50 IDs per call, and batching them is the difference between the cost
below and blowing the 10,000-unit daily allowance before breakfast. A loop that
fetches one ID at a time works perfectly in development and dies on contact with
a real subscription list.

A list call costs one unit whatever parts it asks for, so the cost is the number
of calls:

| call | per | 200 subs, 20 videos each |
|---|---|---|
| `channels.list` with `mine=true` | the owner | 1 |
| `subscriptions.list` | 50 subs | 4 |
| `channels.list` | 50 ids | 4 |
| `playlistItems.list` | 1 channel | 200 |
| `videos.list` | 50 ids | 80 |

**~290 units** against 10,000 a day. A `videos.list` per video would be 4,000 on
its own.

Only `videos.list` returns duration, embeddability and category (the three
things the classifier needs) so the last hop is not optional.

### Whose subscriptions these are

`ownerId()` is the first call: `channels.list` with `part=id&mine=true`, which
answers for whoever the token belongs to. One unit, and inside the
`youtube.readonly` scope already granted, so it asks for no profile scope and
learns no name and no address.

It exists to key the cache. It is memoised for the life of the source, which is
the life of a signed-in session, so it costs its one unit once; `forget()` drops
it, and the account that signs in next is keyed as itself.

## Error triage

The rule is: **is this error about *them* or about *us*?**

```ts
} catch (error) {
  if (isFatal(error)) throw error
  continue
}
```

`isFatal` returns true for **401, 403 and 429**, and for **every
`QuotaExceededError`** whatever status it carries.

A **404 playlist is skipped, not fatal.** Any subscription list that has been
around a while contains channels that have been deleted or gone private, and
that should cost you those channels, not the other two hundred. This was a real
bug: one dead playlist took the whole load down.

A **401, 403 or 429 fails the whole load**, because it is about our credentials
or our allowance and will fail identically for every remaining channel.
Continuing would mean two hundred pointless requests and a misleading empty
result.

429 is in `isFatal` by status as well as by reason. The per-minute limit comes
back as `rateLimitExceeded` or `userRateLimitExceeded`, which classify as
`QuotaExceededError`, but a 429 carrying neither reason is the same wall. It was
not always: a 429 inside the per-playlist loop used to be swallowed once per
playlist, so every playlist failed the same way and the load finished with an
empty pool, which the screen reported as "No videos found in your
subscriptions". That was false, and it is the reason for the second rule:

**Every playlist failing is a failure of the load.** `#listRecentVideoIds`
counts the playlists it lost and throws the first error it saw when it lost all
of them. An empty pool is shown as an empty subscription list, and this is the
case where that would be a lie.

What a viewer is told about any of this is in `src/ui/faultMessage.ts`, not
here: the endpoint, the status and Google's own wording stay in the `Error`. See
[components.md](components.md).

## Caching

`CachedPoolSource` persists to IndexedDB with a **day-long TTL** (the same
life as a broadcast day) and degrades to calling straight through when there is
no usable store, so a private window still gets television.

What is stored is subscription metadata: titles, durations, IDs. No token ever
reaches it.

**The key names whose data it is.** `CachedPoolSourceOptions.scope` is joined to
the key, and `createPoolSource` passes `() => live.ownerId()`, so the record is
filed under `pool:<the account's own channel id>`. Two accounts on one browser
each get their own record and neither can read the other's.

A scope that cannot be established is **not** a key. `#keyFor` returns
`undefined`, and there is then no read and no write at all, because reading
under the bare `pool` key would serve whoever was here last. A source that holds
nobody's data passes no scope: the fixture is the same pool for everyone.

`forget()` empties the store and forwards to the inner source, attempting both
whatever the other answers, and reporting a failure rather than swallowing it.
It is what signing out does to the copy held on this machine, and
`PoolStore.clear()`
empties **every** key rather than one account's: a viewer asking a browser to
forget them means the browser, and a set in a hall or a library has had more
than one person signed into it.

## Brand compliance

Verification aside, Google's sign-in branding guidelines constrain the button
itself, and the constraints are not the ones you would guess.

**The wording is a closed set.** "Sign in with Google", "Sign up with Google",
"Continue with Google", or "Sign in" on the icon-only variant, plus the
personalised "Sign in as …" / "Continue as …" forms. Localisation is the only
permitted deviation.

A wording like "Use my subscriptions" is more honest about what happens (telly
does not authenticate anyone, it asks an already-signed-in user to authorise a
read scope) but it is not on the list. Whether the closed set binds an
authorisation-only button is genuinely unclear. Assume it does: brand review
looks at the UI that triggers consent, and a rejection on wording costs a
multi-week round trip.

**None of the app's self-imposed constraints are a problem.** Google ships the
four-colour G as **inline SVG**, not an image file, and its own CSS declares
`font-family: 'Google Sans', arial, sans-serif`, so a build with no image
assets and no web fonts is Google's own published behaviour, not a compromise
against it. What fails review is wording, logo treatment and prominence.

`src/ui/GoogleSignInButton.tsx` therefore draws the mark by hand, and its tests
are compliance tests rather than UI tests; each pins a rule a sympathetic edit
would quietly break, far from the submission it would fail:

- permitted wording as the accessible name;
- the mark `aria-hidden`, so the label alone names the button;
- `viewBox="0 0 48 48"` with equal width and height, which makes distorting the
  logo structurally impossible rather than merely discouraged;
- the four brand colours pinned exactly: recolouring the G to match a teak
  cabinet is precisely the sympathetic change brand review rejects.

Two further rules apply if the theme ever changes: on `filled_blue` and
`filled_black` the G must sit on a **white tile** (36px, 3px radius, the 18px
glyph centred), which is the most commonly missed rule; and the button must be
sized to its content so the label never ellipsises. The light theme is used here
partly because it sidesteps the tile entirely.

The button sits **off the cabinet**, in `.set__corner`. A 1975 television had no
button for authorising a read scope, and the anachronism does less harm down
there.

**The way out carries no Google mark.** The guidelines cover the button that
starts the consent flow; every other use of the marks needs written permission.
So the sign-out control in the same corner is the set's own plain button, it
says `Sign out`, and it names Google nowhere. Neither control is rendered at all
while a page-load resume is still in flight ([tokens.md](tokens.md)).

## Verification

`youtube.readonly` is a **sensitive** scope, not a **restricted** one, so the
third-party security assessment (CASA), which is triggered only by restricted
scopes, does not apply. For a television on one person's sofa, staying in
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
`Cross-Origin-Embedder-Policy: require-corp` either; cross-origin isolation
blocks `accounts.google.com/gsi/client` outright.
