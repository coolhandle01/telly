# Security

## What this app handles

`telly` runs entirely in the browser. There is no server, no database and no
backend of ours anywhere in the picture.

| Thing | Where it lives | Notes |
|---|---|---|
| OAuth **client ID** | inlined into the bundle at build time | Public by design. It identifies the app, it does not authorise anything. |
| **Access token** | memory only, for its ~1 hour life | Never written to storage. Never logged. Never placed in a URL. Sent in an `Authorization` header. |
| **Refresh token** | does not exist | Google Identity Services issues none to a browser client, which is the correct shape for an app with no backend. |
| Your **subscription list** and video metadata | IndexedDB on your machine, for a day | Titles, durations and IDs. No credentials. Clear site data and it is gone. |

There is no client secret. A browser application cannot keep one, so it does
not have one.

## Scope requested

`https://www.googleapis.com/auth/youtube.readonly` — and nothing else. It is
enough to read your subscriptions and their recent uploads. The app never
writes to your account, never posts, never subscribes, never deletes.

## Deliberate properties

- **The transport is injected.** Every module that talks to the network takes
  `fetch` as a parameter, so no test can reach the internet by construction.
- **Errors carry no token.** There is a test asserting the access token appears
  in no error object, including its non-enumerable properties.
- **Nothing is written to storage but the pool.** There is a test asserting the
  token appears in neither `localStorage`, `sessionStorage` nor `document.cookie`.
- **Only `VITE_`-prefixed variables reach the bundle**, and the only one used is
  the client ID. Vite drops everything else, which is the safe default; do not
  work around it.

## Reporting a problem

Open an issue. If you would rather not do that publicly, say so in an issue
with no detail and we will find another way.

This is a hobby television set for one person's sofa. It holds nothing worth
stealing and the worst case is someone reads your subscription list. Please
calibrate accordingly — but if you find something, we would like to know.
