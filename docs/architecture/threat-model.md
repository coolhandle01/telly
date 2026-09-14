# Threat model

`src/security/review.test.tsx`

## What this is

telly runs entirely in one browser tab. It holds a read-only Google access
token in memory for an hour, reads one person's YouTube subscriptions with it,
and plays them in YouTube's own embed. There is no backend, no database and no
server of ours anywhere in the picture, so the whole attack surface is the tab,
the four external systems it talks to, and the pipeline that builds it.

The worst realistic outcome is that somebody reads a subscription list. That
number is what every severity below is calibrated against, and it is why this
document is short. [SECURITY.md](../../SECURITY.md) states what is stored
where; this states what could go wrong with it, and what answers each one.

## How it is derived

Data flows first, then threats on the boundaries they cross.

1. **Model it.** Four element kinds — external entity, process, data store,
   data flow — and then the trust boundaries: privilege changes, network hops,
   and the line between this code and anything it did not author.
2. **STRIDE, per element touching a boundary.** Each threat names the
   **attacker capability** it assumes — "controls a page that frames the app",
   "can open a pull request", "has the unlocked machine" — because a threat
   without one cannot be argued with. Each is followed to impact rather than
   stopped at mechanism.
3. **One response each**: mitigate, eliminate, transfer or accept. Accepted
   risks are recorded here with their reasoning, because an accepted risk
   nobody wrote down reads exactly like one nobody noticed.
4. **Each mitigation earns an observation.** A mitigation nothing observes is
   an intention. Most are settled by a test; the two that live in the build
   pipeline are settled by reading it, for the reason given below the table.

The findings behind it come from four independent audits run on disjoint lenses
— credentials and transport, untrusted input to sink, supply chain and CI, and
the model itself — each reproduced against the code before it was believed.
Two arrived misclassified and are recorded here as they actually are: the genre
tables are reached by an inherited key, which is a read and not prototype
pollution; and `#listSubscriptions` follows a page token without an upper
bound, which is unbounded work rather than a hang.

## The boundaries

Eight, numbered. The numbers are referenced by the STRIDE table below.

| # | Boundary | Crossed by |
|---|---|---|
| 1 | Browser tab ↔ Google's authorisation server | the consent popup, and the token that comes back |
| 2 | Browser tab ↔ YouTube Data API | a Bearer header out, subscription and video metadata in |
| 3 | The app's origin ↔ the scripts it loads into that origin | GIS and the IFrame API, executing as the app |
| 4 | The app's origin ↔ the cross-origin YouTube iframe | a video id in, a picture out |
| 5 | Memory ↔ IndexedDB | the pool, on its way to disk for a day |
| 6 | The repository ↔ anyone who can open a pull request | a branch, a title, and a diff |
| 7 | The CI runner ↔ GitHub Pages | the built bundle |
| 8 | The app ↔ its npm dependency tree | everything `npm ci` resolves |

**Boundary 3 is the one that repays reading twice.** A `<script src>` tag is
the *absence* of a boundary: `accounts.google.com/gsi/client`
(`src/library/googleTokenProvider.ts`) and `www.youtube.com/iframe_api`
(`src/player/youtubePlayer.ts`) run in the app's own realm, with the app's own
privileges, alongside the token. It is listed as a boundary because that is
where people expect one to be, and the entry exists to say it is not.

The tab can also be framed by another origin. GitHub Pages serves a static
bundle and the controls that would refuse framing — `X-Frame-Options`, and
CSP's `frame-ancestors` — are carried by HTTP headers only. The consequence is
covered under T11.

## STRIDE

Only elements touching a boundary. Each row names the capability assumed.

| # | Boundary | Threat | Capability assumed | Response |
|---|---|---|---|---|
| T1 | 1 | **S** — another origin obtains a token under this client ID | controls a web page the viewer visits | **accept** |
| T2 | 1, 5 | **I** — the in-memory token is read | can already execute script in this origin | **mitigate** |
| T3 | 2 | **I** — the token escapes into a URL, a log or an error | can read browser history, or an error the app throws | **mitigate** |
| T4 | 2 | **T** — API responses are altered in flight | can intercept traffic to `googleapis.com` | **transfer** |
| T5 | 3 | **T** — a third-party script serves a hostile payload | controls Google's script infrastructure | **accept** |
| T6 | 4 | **E** — embedded video content reaches outside its frame | controls a channel the viewer subscribes to | **transfer** |
| T7 | 2, 5 | **D** — third-party metadata drives the app into unbounded work | controls a channel the viewer subscribes to, or the `baseUrl` override | **mitigate** |
| T8 | 5 | **I** — the cached subscription list is read off disk | has the unlocked machine, or its profile directory | **accept** |
| T9 | 5 | **D** — a record of the wrong shape reaches the reader | same-origin write access to the store | **mitigate** |
| T10 | 6 | **E** — a pull request runs attacker-chosen code on the runner | can open a pull request | **mitigate** |
| T11 | — | **S** — the tab is framed and its controls redressed | controls a page the viewer visits | **accept** |
| T12 | 7, 8 | **T** — a dependency or the published bundle carries code nobody reviewed | can publish to a dependency, or reach the runner | **mitigate** |

### What each response is

**T1** rests on Google's own control. The OAuth client's *authorised JavaScript
origins* list, not the secrecy of the client ID, is what decides who may obtain
a token under it — see [tokens.md](tokens.md). The lever is in the Google Cloud
console, so the response is to keep that list correct rather than to write
code.

**T2** is bounded by design rather than prevented. The scope requested is
`youtube.readonly` and nothing else, so a stolen token reads and cannot write;
it lives about an hour, in memory, and is renewed a minute early
(`EXPIRY_MARGIN_MS`). The lifetime is what the bound rests on, so the response treats the reported
`expires_in` as untrusted input like any other and clamps it rather than
believing it. A Content-Security-Policy on the delivered document names the
origins allowed to execute here, which is what keeps the capability this
threat assumes hard to come by.

The policy lives in a `<meta>` tag in `index.html` because a static host can
serve no other kind, and that shapes it. A meta-delivered policy silently
drops `frame-ancestors`, `sandbox` and the reporting directives, so framing is
not defended by it and none of those is written there pretending otherwise —
see T11. `style-src` allows inline because the cabinet is drawn in inline
styles and ten components ship their own `<style>` block; tightening that is a
rebuild of how the set is drawn rather than an edit to the policy. React
escapes what it renders and nothing in `src/` reaches for `innerHTML`, so the
allowlist is a backstop against a mistake nobody has made yet rather than a
hole being closed — boundary 3 is the reason to have one anyway.

It was checked in a browser rather than asserted at, because a policy that
breaks the app is invisible to jsdom: the built bundle, the dev server with a
client ID, and the dev server on fixtures, each loaded in Chromium with no
violation reported. Both Google scripts were fetched and then refused by the
network rather than by the policy, which is what an allowed request looks like
from a machine with no egress to Google — a blocked one raises a violation
instead. `frame-src` and `connect-src` are reasoned rather than observed for
that reason: the consent popup, the Data API and the embedded frame all need
egress to exercise, so they want one look at devtools during sign-in and
playback on the deployed site.

**T3** is closed in code that cites the weakness it defends against: the token
travels in an `Authorization` header because URLs reach history, referrers and
server logs (CWE-598), and `toApiError` builds messages from the status and the
API's own body, never from the request. See [google.md](google.md).

**T4** is TLS's job. `API_BASE` is `https://` with no fallback, and certificate
validation is the browser's.

**T5** is accepted, and this is the reasoning. The capability required is a
compromise of Google's own script infrastructure, which would be felt across a
large fraction of the web at once. Subresource Integrity is unavailable: both
URLs are unversioned and Google updates them in place, so a pinned hash would
break sign-in the next time they shipped. The impact is bounded by what is
already true — an hour of read-only access, nothing persistent, no write scope.
Every site embedding these scripts makes the same call.

**T6** is YouTube's. The IFrame API builds its own frame and configures its own
sandboxing; a video id reaches it as a structured option and is never
concatenated into a URL here, so the embed's origin is fixed whatever the id
says. The transparent shim over the stage (`PlayerSurface.tsx`) absorbs stray
clicks aimed at YouTube's chrome, which is a viewing decision rather than a
security control.

**T7** covers the metadata a subscribed channel controls. Titles, tags and
durations arrive as third-party text and reach a schedule and a card, so the
response is a bound on each: a caption cut to a length a card can hold, a
duration that parses in linear time, a topic read only from the table's own
keys, an `?at=` that resolves to an instant inside the broadcast day the set is
already in — it holds one day's schedule, and a day planned from today's pool
and captioned as some other day's is not a schedule anybody broadcast — and a
subscription pager that stops rather than following a page
token for as long as one is offered.

Behind all of them sits `FaultBoundary` (see
[components.md](components.md)), which catches what the next unforeseen throw
turns out to be and draws a fault card. React unmounts the tree on a throw
during render, and an unmounted tree is a blank screen — which is what a set
looks like when it is *off*, and so the one thing it must not say when it is on
and broken.

**T8** is accepted. The store holds titles, durations and ids — no credentials —
and encrypting it under a key the app must also hold buys nothing against
somebody who has the machine. Clearing site data removes it.

**T9** keeps the cache honest about being best-effort. The response makes a
record that does not read as a pool a cache miss like any other, answered from
the live source, so what is on disk cannot take the channel off air.

**T10** rests on the workflows' own shape, which is where it is legible.
Values from the event context reach a `run:` block through `env:`, where the
shell reads one argument instead of source; the jobs a pull request can reach
declare `contents: read`; and the workflow holding the App key triggers only on
a push to `main`, which needs write access. Read `.github/workflows/` to check
it — that is a shorter and more honest read than any assertion about it.

**T11** is accepted on two grounds. The controls that refuse framing are
header-only and this is a static host, so the response would have to be a move
to different hosting; and the one action worth redressing — granting account
access — happens on Google's page, behind Google's own framing defences. The
set's own controls are a power switch and five presets.

**T12** rests on reproducibility. Every action is pinned to a full commit SHA,
every job installs with `npm ci` against the committed lockfile, CodeQL reads
both the TypeScript and the workflows, Dependabot proposes updates weekly, and
the release smoke-tests the built bundle before it is published.

## Where the mitigations are observed

Every **mitigate** row has a test, written as an abuse case: hostile input,
and the assertion that the system holds. Most gather in
`src/security/review.test.tsx`, because a weakness is a path from an input to a
sink and those paths do not respect module boundaries. The two the token's own
module already proved — that it reaches no storage, and appears in no error
object's own properties — stay beside it in `googleTokenProvider.test.ts` and
`youTubePoolSource.test.ts`, where they were written.

Two conventions make the file readable, and between them the suite is the
honest record of where each mitigation stands. A mitigation that is in place
has a test asserting it. A mitigation still being landed has its observation
written and **skipped**, named for the behaviour it will assert, so enabling it
is part of that mitigation's own change — the `DISABLED_` convention from the
**tdd** skill. Read the column below as the current state, not as a plan:

| Threat | Observed by | State |
|---|---|---|
| T2 | the token is absent from storage | asserted |
| T2 | an overflowing `expires_in` still expires | skipped, pending its change |
| T2 | the delivered document declares what may execute in it | asserted |
| T3 | the token appears in no request URL, and in no error object's own properties | asserted |
| T7 | a pathological duration parses in linear time | asserted |
| T7 | a caption is cut to a length a card can hold | skipped, pending its change |
| T7 | the subscription pager stops rather than following a token indefinitely | skipped, pending its change |
| T7 | an inherited key is not read as a topic | skipped, pending its change |
| T7 | an `?at=` outside the broadcast day is ignored, on a 23- and 25-hour day too | asserted |
| T7 | an unforeseen throw draws a fault card, not a blank screen | asserted |
| T9 | a record of the wrong shape resolves from the live source | skipped, pending its change |

T10 and T12 are absent from that table on purpose. Both live in the workflow
files rather than in the app, and a test that reads YAML and asserts on it
proves only that the YAML still says what it said — it re-states the file
rather than exercising anything. The workflows *are* the record, CodeQL reads
them under the `actions` language on every pull request, and a linter built for
the job (`actionlint`, `zizmor`) is the tool if these ever want a gate. A
vitest suite is not.

The negative results are pinned green as well: that the duration regex is
linear-time is *measured* there rather than asserted in prose, and no shipped
module registers a `message` listener, so the next person to wonder can run it
instead of re-reading this.

## When to re-run it

When a **boundary** moves. A new external input, a new store, a new privilege,
a dependency that starts executing this code, a change of host. Little else in
a diff warrants it, and a model regenerated on every change is one nobody
reads. The boundaries and the reasoning above are written to stay true; today's
counts and versions deliberately live in the tests, where they fail loudly.
