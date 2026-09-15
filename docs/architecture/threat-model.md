# Threat model

`telly` is a static bundle on GitHub Pages that holds a Google access token in
memory and reads one person's YouTube subscriptions with it. There is no server
of ours: every boundary it has is a line between a browser tab and somebody
else's infrastructure, or between this repository and the machine that publishes
it.

This document models those lines and the threats that live on them. Elements
that sit entirely inside one trust boundary — `domain/`, `schedule/`,
`programming/`, `broadcast/`, which touch no browser API at all
([README.md](README.md)) — carry no rows.

## The system, as data flows

```
  viewer                                                    Google account
    │  clicks, ?at=, keys                                          │
    │                                        consent, token        │
┌───┴──────────────── browser origin: https://telly.na-n.xyz ──────┼──────────┐
│                                                                  │          │
│  App ─ Channel ─ Guide / TestCard        GoogleTokenProvider ═══ B1 ═══► accounts.google.com
│     │                  ▲                        │  token                   (GIS script,
│     │                  │ titles                 │  in memory                consent popup)
│     │            YouTubePoolSource ◄════════════┘                          │
│     │                  │  ║                                                │
│     │                  │  ╚══════════════ B2 ═══════════════► www.googleapis.com/youtube/v3
│     │                  ▼                                                   │
│     │            CachedPoolSource ──► IndexedDB `testcard`/`pools`  (B6)    │
│     │                                                                      │
│  YouTubeIframePlayer ═══ B3 ═══► www.youtube.com  (iframe_api script, and   │
│                                                    the player frame)        │
│  SourceLink ─────────────────► github.com (new tab)                         │
└──────────────────────────────────▲──────────────────────────────────────────┘
                                   ║ B4: bundle over HTTPS
                            GitHub Pages ◄══ B5 ══ GitHub Actions ◄── repository
```

- **External entities** — the viewer; the Google account and its consent; the
  YouTube Data API; the owners of the channels the viewer subscribes to; GitHub
  as host and as CI.
- **Processes** — `GoogleTokenProvider`
  ([src/library/googleTokenProvider.ts](../../src/library/googleTokenProvider.ts)),
  `YouTubePoolSource`, `CachedPoolSource`, `YouTubeIframePlayer`, the React tree,
  and **the two remote scripts that execute as first-party code in this origin**.
- **Data stores** — the IndexedDB pool
  ([src/library/indexedDbPoolStore.ts](../../src/library/indexedDbPoolStore.ts)),
  the published bundle on Pages, the CI environments `github-pages` and
  `commitlint`.
- **Data flows** — consent and token; API requests carrying `Authorization:
  Bearer`; API metadata back; the cached pool; the bundle; the tag that triggers
  a release.

## The boundaries

| | Line | What crosses it |
|---|---|---|
| **B1** | browser origin ↔ `accounts.google.com` | the GIS script, the consent popup, and the access token |
| **B2** | browser origin ↔ `www.googleapis.com` | bearer-authenticated reads of subscriptions, channels, playlist items and videos |
| **B3** | browser origin ↔ `www.youtube.com` | the IFrame API script, and the player frame that plays the programme |
| **B4** | browser ↔ GitHub Pages | the bundle itself, over HTTPS, at the one origin the OAuth client authorises |
| **B5** | repository ↔ GitHub Actions | a `v*` tag, workflow tokens, the release App's private key, and the artefact that becomes the site |
| **B6** | page session ↔ IndexedDB | the subscription pool, at rest on the viewer's machine for a day |
| **B7** | this code ↔ the two remote scripts | `accounts.google.com/gsi/client` and `www.youtube.com/iframe_api` run **inside** the token-holding origin, unversioned and therefore without an integrity hash ([index.html:5-6](../../index.html)) |

B7 is the sharpest of them, because it is the only boundary the same-origin
policy does not draw for us: everything on the far side of B1–B3 is a separate
origin, and everything on the far side of B7 is this one.

## Threats

### B1 — sign-in, and the token

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T1 | Viewer identity · **S** | — | The app authenticates nobody. Identity is the Google session in the browser, and authorisation is a consent the viewer grants to a scope. | CWE-287 | **Transfer** — to Google Identity Services | [googleTokenProvider.ts:143-149](../../src/library/googleTokenProvider.ts) |
| T2 | Consent flow · **S** | Hosts a page that presents the same public client ID | A consent granted on an attacker's page yields a token to that page. The client ID is public by design; the authorised-JavaScript-origins list on the OAuth client is what refuses the request, and it names `https://telly.na-n.xyz` alone. | CWE-346 | **Transfer** — to Google's origin check on the OAuth client | [tokens.md](tokens.md), [README.md:240-242](../../README.md) |
| T3 | GIS script flow · **T** | Sits on the network between the browser and `accounts.google.com` | Arbitrary JavaScript in the origin that holds the token. The script URL is `https://` and fixed, and `script-src` names the host. | CWE-494 | **Mitigate** | [googleTokenProvider.ts:12](../../src/library/googleTokenProvider.ts), CSP at [index.html:10](../../index.html) |
| T4 | Token in memory · **I** | Runs any script in this origin | Read of the viewer's subscriptions for the token's remaining hour. The scope is read-only, no refresh token exists, and the token lives in a private field, re-requested a minute before expiry. `connect-src` permits only `self`, `googleapis.com` and `accounts.google.com`, which closes fetch, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon` to every other host. It does not reach top-level navigation or `window.open`, so a script in this origin carries the token out in a URL, and no directive covers that: `navigate-to` left CSP Level 3 in September 2022 and shipped in no browser. The hour, the read-only scope and the absence of a second copy are what bound this threat; the policy narrows it. | CWE-522 | **Mitigate** | [googleTokenProvider.ts:13](../../src/library/googleTokenProvider.ts), [:76](../../src/library/googleTokenProvider.ts), [:201-214](../../src/library/googleTokenProvider.ts); asserted absent from `localStorage`, `sessionStorage` and `document.cookie` by [googleTokenProvider.test.ts:145-158](../../src/library/googleTokenProvider.test.ts); [index.html:14](../../index.html) |
| T5 | GIS loader · **D** | Blocks the script — an extension, a firewall, an outage | Sign-in is impossible. The loader rejects instead of hanging, the failure is reported under the cabinet, and a failed `prepare()` does not stop the set coming on. | CWE-703 | **Mitigate** | [googleTokenProvider.ts:51-73](../../src/library/googleTokenProvider.ts), [Channel.tsx:381-390](../../src/ui/Channel.tsx), [App.tsx:75-77](../../src/App.tsx) |

### B2 — the YouTube Data API

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T6 | Request flow · **I** | Reads URLs — browser history, a referrer, a proxy log | A token in a query string is replayable for an hour. It travels in the `Authorization` header, and the error type is built from status, reason and message with no URL and no headers. | CWE-598 | **Mitigate** | [youTubePoolSource.ts:314-327](../../src/library/youTubePoolSource.ts), [:330-349](../../src/library/youTubePoolSource.ts) |
| T7 | Video and channel metadata · **T** | Owns a channel the viewer subscribes to, and therefore its titles and tags | Titles reach the DOM as listing rows and as the caption on the test card. Both are React text children — `{entry.label}` and `{shape.text}`, plus an `aria-label` set as a prop — and `src/` contains no `dangerouslySetInnerHTML` and no `innerHTML` write. | CWE-79 | **Mitigate** | [Guide.tsx:436](../../src/ui/Guide.tsx), [TestCardSvg.tsx:73-93](../../src/testcard/TestCardSvg.tsx), [Channel.tsx:544](../../src/ui/Channel.tsx) |
| T8 | Watershed metadata · **T** | Owns a subscribed channel, and declares `madeForKids`; YouTube declares `ytAgeRestricted` | A mis-declared video is scheduled before the watershed. The two flags are recorded as the API reports them and the scheduler acts on them. | CWE-807 | **Accept** — the API's judgement is the only age signal available to a browser client, the viewer chose the subscription, and the watershed is read off the API in both directions ([stations.md](stations.md)) | [youTubePoolSource.ts:291-296](../../src/library/youTubePoolSource.ts) |
| T9 | Quota · **D** | Holds a large subscription list, or reloads repeatedly | The 10,000-unit daily allowance is spent and no pool loads. IDs are batched 50 to a call, the pool is cached for a broadcast day, and quota reasons are classified as their own error. | CWE-770 | **Mitigate** | [youTubePoolSource.ts:127-133](../../src/library/youTubePoolSource.ts), [:39](../../src/library/youTubePoolSource.ts), [cachedPoolSource.ts:17](../../src/library/cachedPoolSource.ts) |
| T10 | Load loop · **D** | Deletes or privates one subscribed channel | One 404 playlist ends the whole load. Only 401 and 403 are fatal; anything else costs that channel alone. | CWE-703 | **Mitigate** | [youTubePoolSource.ts:143-145](../../src/library/youTubePoolSource.ts), [:249-255](../../src/library/youTubePoolSource.ts) |

### B3 — the player frame

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T11 | Player frame · **I** | — (YouTube, by construction) | Watch history and YouTube's own cookies attach to the account inside a frame on `www.youtube.com`, a separate origin that reads neither this DOM nor this token. `frame-src` names the permitted frame origins. | CWE-359 | **Transfer** — to YouTube, disclosed to the viewer | [public/privacy/index.html](../../public/privacy/index.html), [index.html:15](../../index.html) |
| T12 | Player · **D** | Pulls, privates or geoblocks a scheduled video; or blocks the API script | A frame that renders YouTube's own error page fires no `onError`, and the screen stays black. A watchdog reports "no picture" after 8s, the card sits under every programme and is revealed when there is none, and a failed load rebuilds rather than latching. | CWE-390 | **Mitigate** | [youtubePlayer.ts:133](../../src/player/youtubePlayer.ts), [:363-371](../../src/player/youtubePlayer.ts), [:328-354](../../src/player/youtubePlayer.ts), [Channel.tsx:533-546](../../src/ui/Channel.tsx) |
| T13 | Player frame · **E** | Owns a subscribed channel, and thus what plays | The frame gets no controls, no keyboard, no related videos and no full-screen handover: `controls: 0, disablekb: 1, rel: 0, playsinline: 1`. The viewer is handed a picture and nothing to press. | CWE-1021 | **Mitigate** | [youtubePlayer.ts:8-14](../../src/player/youtubePlayer.ts) |

### B7 — the two remote scripts in this origin

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T14 | `gsi/client` and `iframe_api` · **T** | Changes what `accounts.google.com` or `www.youtube.com` serves | Either script runs as first-party code beside the in-memory token, with the origin's IndexedDB and DOM. Both are unversioned, so neither carries an SRI hash. CSP is the containment that remains, and it is partial: `default-src 'none'`, `script-src` pinned to `self` and those two hosts, `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, `connect-src` naming three hosts. It governs what is fetched, framed, submitted and loaded as script. It governs no navigation at all, so script running here reaches any host by navigating to it. The page's own navigations are three anchors to constants: the two legal pages, same-origin, and the source link. The policy ships in the built artefact as well as in source. | CWE-829 | **Accept** — Google already holds the token by virtue of issuing it, and GIS is the only route to one for a browser client with no backend | [index.html:5-19](../../index.html), `dist/index.html` |
| T15 | Response headers · **T** | — | GitHub Pages sets no response headers, and the defaults are the ones sign-in needs: `Cross-Origin-Opener-Policy` defaults to `unsafe-none`, which keeps `window.opener` alive for the consent popup, and cross-origin isolation is absent, which is what lets `gsi/client` load at all. The policy therefore travels in the document. | CWE-693 | **Accept** — the two headers a hardening checklist would add are the two that break this flow silently | [google.md:114-120](google.md), [README.md:244-249](../../README.md) |
| T16 | Outbound link · **I** | Controls the linked page | `target="_blank"` hands `window.opener` to the opened page. The link carries `rel="noreferrer noopener"` and its `href` is a constant. | CWE-1022 | **Mitigate** | [SourceLink.tsx:29-35](../../src/ui/SourceLink.tsx), [App.tsx:17](../../src/App.tsx) |

### B4 — the hosted bundle

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T17 | Published bundle · **T** | Serves content at `telly.na-n.xyz` | A substituted bundle runs on the one origin the OAuth client authorises, so it obtains tokens for this client ID while the viewer reads the real domain on the consent screen. The site is published only from a tagged release's artefact, and the custom domain is pinned in the repository. | CWE-494 | **Mitigate** | [release.yml:5-7](../../.github/workflows/release.yml), [:88-98](../../.github/workflows/release.yml), [public/CNAME](../../public/CNAME) |
| T18 | Domain · **S** | Claims the `telly` CNAME target, or the registrar account | Identical to T17, and from outside the repository. The DNS record, the Pages custom domain and `public/CNAME` all name the same host, and HTTPS is enforced on it. | CWE-350 | **Transfer** — to the registrar and to GitHub's custom-domain verification | [README.md:232-242](../../README.md) |
| T19 | Host logs · **I** | GitHub | Request IPs and times. The app transmits nothing to this host beyond fetching the bundle: there is no backend, no analytics and no beacon. | CWE-359 | **Accept** — hosting is a static-file fetch and the record is GitHub's, as the privacy policy states | [public/privacy/index.html](../../public/privacy/index.html) |

### B5 — repository and CI

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T20 | `commits` job · **E** | Opens a pull request, choosing its title | `${{ }}` pasted into a `run:` body is shell source, so a crafted title executes on the runner. The title reaches the shell as the environment variable `TITLE`, which is data. | CWE-94 | **Mitigate** | [analysers.yml:72-75](../../.github/workflows/analysers.yml) |
| T21 | Third-party actions · **T** | Moves a tag on an action's repository | Attacker code in the release runner, where the Pages id-token and the release App's key live. Every third-party `uses:` names a 40-character commit SHA; the only unpinned references are this repository's own reusable workflows. | CWE-829 | **Mitigate** | all of [.github/workflows/](../../.github/workflows/), e.g. [release.yml:35-36](../../.github/workflows/release.yml) |
| T22 | Workflow tokens · **E** | Executes a step, by T20 or T21 | Write access to the repository from a test runner. Each workflow declares `permissions: contents: read` at the top, and write is granted per job: `pages: write` and `id-token: write` on publish, `contents: write` on the release job alone. | CWE-250 | **Mitigate** | [release.yml:9-10](../../.github/workflows/release.yml), [:90-92](../../.github/workflows/release.yml), [:105-106](../../.github/workflows/release.yml), [tests.yml:9-10](../../.github/workflows/tests.yml), [analysers.yml:9-10](../../.github/workflows/analysers.yml), [bumpversion.yml:18-19](../../.github/workflows/bumpversion.yml) |
| T23 | Release provenance · **S** | Pushes a `v*` tag | The live site changes. The release runs the same analysers, tests and CodeQL against the tagged commit before it builds; tags come from `bumpversion.yml` on a push to `main`, authenticated by a short-lived App installation token scoped to this repository; `/src/library/`, `/.github/` and `/SECURITY.md` have a named owner. | CWE-345 | **Mitigate** | [release.yml:15-26](../../.github/workflows/release.yml), [bumpversion.yml:10-12](../../.github/workflows/bumpversion.yml), [:29-38](../../.github/workflows/bumpversion.yml), [CODEOWNERS](../../CODEOWNERS) |
| T24 | Build inputs · **I** | Reads a build log or the artefact | The build reads one value, `vars.VITE_YOUTUBE_CLIENT_ID`, a public identifier held as a variable precisely because marking it secret would only hide it from the log. The App private key is a secret on the `commitlint` environment and is read by no other workflow. Vite inlines only `VITE_`-prefixed variables, and `.env` files are ignored by git apart from the example. | CWE-540 | **Mitigate** | [release.yml:41-43](../../.github/workflows/release.yml), [bumpversion.yml:25-33](../../.github/workflows/bumpversion.yml), [createPoolSource.ts:10-23](../../src/library/createPoolSource.ts), [.gitignore:18-20](../../.gitignore) |
| T25 | npm dependency tree · **T** | Publishes a version of any package in the tree | Code execution during the build and code in the shipped bundle. Installs are `npm ci` against the committed `package-lock.json` with its integrity hashes, updates arrive weekly and grouped, and CodeQL analyses both `javascript-typescript` and `actions`. | CWE-1357 | **Mitigate** | [tests.yml:22](../../.github/workflows/tests.yml), [release.yml:40](../../.github/workflows/release.yml), [dependabot.yml](../../.github/dependabot.yml), [codeql.yml:28-33](../../.github/workflows/codeql.yml) |

### B6 — the pool at rest, and the viewer's own inputs

| # | Element · STRIDE | Attacker capability | Impact | CWE | Response | Where it lives |
|---|---|---|---|---|---|---|
| T26 | IndexedDB pool · **I** | Has the unlocked machine, or runs code in this origin | A day-old list of subscription titles, channel IDs, video IDs and durations. What is written is the pool and only the pool; no token reaches it, and a browser that offers no store gets television without a cache. | CWE-312 | **Accept** — the worst case is that someone reads the subscription list, which [SECURITY.md](../../SECURITY.md) records as the app's worst case | [cachedPoolSource.ts:92-94](../../src/library/cachedPoolSource.ts), [indexedDbPoolStore.ts:81-88](../../src/library/indexedDbPoolStore.ts) |
| T27 | IndexedDB pool · **T** | Writes the origin's `pools` store | A forged schedule: titles and video IDs the viewer never subscribed to, played in the embed for up to a day. The forged fields reach the same escaped text sinks as T7, and a record stamped in the future is distrusted; an unreadable record is a cache miss rather than a fault. | CWE-20 | **Accept** — writing this store requires already running in this origin or holding the machine, at which point the pool is the smaller prize | [cachedPoolSource.ts:56-75](../../src/library/cachedPoolSource.ts) |
| T28 | `?at=` · **T** | Gets the viewer to open a crafted link | The channel runs at a different hour of its own schedule. The parameter is parsed to a millisecond offset, rejected out of range, and anything unparseable yields 0; it reaches a clock and nothing else. | CWE-20 | **Accept** — the value shifts a displayed time and reaches no sink beyond the clock | [offsetClock.ts:38-54](../../src/clock/offsetClock.ts) |
| T29 | The client as a whole · **R** | The account holder | Nothing here records what was read: the app keeps no log and there is no server to keep one. The record of what a token did is Google's own account activity, and consent is revocable from the account, which takes effect immediately. | CWE-778 | **Accept** — a single-viewer television with a read-only scope has no action worth disputing, and the authoritative record sits with the issuer | [public/privacy/index.html](../../public/privacy/index.html) |

## The accepted risks, collected

Nine threats are accepted, each for a reason that is a property of the design
rather than an omission:

- **T8** — the age and audience flags come from the API because a browser client
  has no other age signal.
- **T14** and **T15** — the two remote scripts execute in this origin without an
  integrity hash, because Google serves them unversioned; CSP is the containment
  that remains, and the response headers a checklist would add break sign-in. The
  policy bounds what is fetched and loaded, not navigation, so script in this
  origin still reaches any host by going there.
- **T19** — the host's request log is GitHub's, and the app sends it nothing but
  a fetch for the bundle.
- **T26**, **T27** — the cached pool is readable and writable by anyone who
  already holds the machine or the origin, and it holds no credential.
- **T28** — `?at=` reaches a clock.
- **T29** — there is no log, and the issuer holds the authoritative record.

The scope requested is `youtube.readonly`, so the account is never written to;
the token lasts about an hour; no refresh token and no client secret exist. That
is the ceiling on every one of these.

## When this is re-run

The model is tied to boundaries, not to code. A new external input, a new store,
a new remote script in the origin, a scope beyond `youtube.readonly`, a backend
of ours, or a host that sets response headers each move a line on the diagram
above.
