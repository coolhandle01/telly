# telly

A browser television. It reads the signed-in viewer's YouTube subscriptions and
schedules them into a broadcast day on a 1975 set. No server, no backend, one
trust boundary: the browser talks to Google and to nobody else.

Vite 8, React 19, TypeScript, Vitest 5, oxlint. `.nvmrc` pins Node 24.

## Commands

```
npm run dev        # the set, on the fixture pool
npm test           # watch
npm run test:ci    # coverage, then the DST suite under TZ=Europe/London
npm run test:dst   # the clocks-change suite on its own
npm run typecheck  # tsc -b --noEmit
npm run lint       # oxlint
npm run build      # typecheck, then vite build
npm run mutate     # stryker
```

Run `npm run lint`, `npm run typecheck` and `npm run test:ci` before you push.
The DST suite is separate because it needs a fixed zone, and it is the one that
catches the 23 hour and 25 hour broadcast days.

## The shape of it

- `src/domain/` is the broadcast day. It starts at 06.00 and ends at the next
  06.00, which twice a year is not 24 hours long: `broadcastDayLength` is the
  only thing that knows how long a day is, and everything else asks it.
- `src/library/` fetches the pool. `PoolSource` is the seam: a fixture, the
  YouTube API, or a cache over either, and the app above cannot tell which.
- `src/programming/` and `src/schedule/` turn a pool into five stations'
  listings. `planStations` runs inside a render.
- `src/ui/` is the set, the room and the paper. `src/testcard/` draws the cards.
- `src/clock/` is the only source of "now". Nothing else calls `new Date()`.

`docs/architecture/` carries the design: `google.md` and `tokens.md` for the
sign-in, `scheduling.md` for the day, `threat-model.md` for what is accepted
and what is mitigated. Keep them true when you change the code they describe.

## Google, and what it costs to get this wrong

The app asks for `youtube.readonly`, which is a **sensitive** scope, so it
cannot leave testing mode until it passes OAuth verification. Unverified means
nobody outside the listed test users can sign in at all. A rejection costs
weeks.

Before touching anything in the sign-in path or in `public/privacy/` or
`public/terms/`, read `oauth-verification` and `policy-documents` from the
raceware-cognition plugins. The rules that have already cost a rejection:

- **What the policy says must be what the code does.** The policy said data was
  held in memory only while `CachedPoolSource` was writing the viewer's
  subscriptions into IndexedDB. Read the code, then write the sentence.
- **A cache of somebody's data is keyed to whose it is.** The key is
  `pool:<the account's own channel id>`, from `channels.list` with `mine=true`.
  Two accounts on one browser must not read each other's record.
- **Sign-out is two operations.** `google.accounts.oauth2.revoke` hands the
  grant back, and the object store is emptied. One without the other leaves
  either the data or the grant standing.
- **A token that has expired is discarded and the screen follows it.** GIS
  refreshes nothing by itself. `GoogleTokenProvider` watches the clock and
  tells its subscribers, and the corner of the room shows the session that
  exists rather than the outcome of the last click.
- **Google's branding guidelines cover the sign-in button only.** Its wording is
  a closed set. Any other use of the marks needs written permission, so the
  sign-out control carries no Google mark and no Google wording.
- **API error text is for whoever is holding the Error.** The endpoint, the
  status and Google's own message never reach the screen. `serviceMessage`
  turns an error into the station's own words, and that is all a viewer sees.

## The shape that has caused every late bug here

Five bugs were found after this work was thought finished. All five were one
shape, in two variants. Look for both before writing an operation that fails.

- **Two obligations are not a sequence.** `await a(); await b()` means a's
  failure eats b. Signing out revokes the grant *and* clears the machine, and
  written in sequence a blocked Google script left the subscriptions on the
  disk. Attempt every obligation, collect the outcomes, report which failed:
  `Promise.allSettled`, then decide.
- **One `catch` over two operations cannot tell you which failed.** `resume()`
  wrapped the script fetch and the token request together, so a blocked script
  looked exactly like Google refusing the grant, and the app forgot a grant
  that was still good. Separate the attempts, or the handler is guessing.

The reporting half of the same shape: a message that names the wrong failure is
worse than no message, because it sends someone to fix a thing that is not
broken. Every failure a viewer sees is a typed error (`SignInError.reason`,
`SignOutError.revoked` and `.cleared`, `YouTubeApiError.status`) turned into a
sentence in `src/ui/faultMessage.ts`, with a test per sentence. Nothing else
puts text on the screen, and no `error.message` ever reaches it.

## Writing code here

- **Read the manual before you write the code, and read the examples.** Every
  expensive mistake in this repo's history was a guess at an API that was
  documented.
- **A comment says what the code does and why it has to.** Never what an API
  lacks, never what would happen without the code, never the counterfactual.
  "Returns undefined because the API has no way to signal this" is the wrong
  comment; what it does is the only thing worth writing down.
- **Do not claim a thing works until you have run it.** "The tests pass" means
  you ran them and read the output.
- Nothing in `src/` calls `console.*`. There is no logging layer, on purpose:
  a token must never reach a log.
- `import.meta.env.VITE_*` is inlined into the bundle and is public. Only the
  OAuth client ID may live there. A client secret or an API key must never be
  given a `VITE_` name.

## Git

Conventional Commits. Branch as `<type>/<short-desc>`, never commit on `main`.
Ask before anything reaches GitHub: push, force-push, branch create or delete,
PR open or close or merge, comment, review, resolve. A commit is not a push.

**No em dashes.** Not the glyph, not `&mdash;`, not anywhere: prose, code,
comments, commit messages, PR bodies.

**Never publish session URLs.** `https://claude.ai/code/session_...` links point
at a private conversation and this repo is public. Keep them out of commit
messages, PR titles and bodies, issues, comments and reviews.
