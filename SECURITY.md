# Security

## What this app handles

`telly` runs entirely in the browser. There is no server, no database and no
backend of ours anywhere in the picture.

| Thing | Where it lives | Notes |
|---|---|---|
| OAuth **client ID** | inlined into the bundle at build time | Public by design. It identifies the app, it does not authorise anything. |
| **Access token** | memory only, for its ~1 hour life | Never written to storage. Never logged. Never placed in a URL. Sent in an `Authorization` header. |
| **Refresh token** | does not exist | Google Identity Services issues none to a browser client, which is the correct shape for an app with no backend. |
| Your **subscription list** and video metadata | IndexedDB on your machine, for a day | Database `testcard`, store `pools`, key `pool:<your own channel id>`. Titles, durations and IDs. No credentials. **Sign out** empties the store, and so does clearing site data. |
| A **sign-in flag** | `localStorage`, key `telly.google.granted`, value `1` | Records that a consent screen was completed in this browser, so a later page load can take the grant up without prompting. Not the token and not a credential. Removed on sign-out. |

There is no client secret. A browser application cannot keep one, so it does
not have one.

## Scope requested

`https://www.googleapis.com/auth/youtube.readonly`, and nothing else. It is
enough to read your subscriptions and their recent uploads, and it carries no
permission to post, comment, subscribe, unsubscribe or delete.

It also covers reading your own channel id, from a `channels.list` call with
`mine=true`. That id is what the cached schedule data is filed under, so two
accounts used in the same browser do not read each other's record.

## Signing out

**Sign out** does two things: it calls `google.accounts.oauth2.revoke` with the
current access token, which hands the grant back to Google and drops every
scope, and it empties the `pools` object store, every key in it rather than
only the signed-in account's. If the browser refuses to empty the database the
page says so.

Withdrawing access from Google's own security settings stops the token being
accepted, and does not reach the database on your machine.

## Deliberate properties

- **The transport is injected.** Every module that talks to the network takes
  `fetch` as a parameter, so no test can reach the internet by construction.
- **Errors carry no token.** There is a test asserting the access token appears
  in no error object, including its non-enumerable properties.
- **The token is never written down.** There is a test asserting it appears in
  neither `localStorage`, `sessionStorage` nor `document.cookie`, and another
  asserting it appears in no request URL. The two things this app does write
  are the pool and the sign-in flag, both in the table above.
- **An expired token is discarded and the screen follows it.** Google Identity
  Services refreshes nothing by itself, so `GoogleTokenProvider` watches the
  clock, drops the stale token before asking for another, and tells its
  subscribers, which is what puts the sign-in button back.
- **Only `VITE_`-prefixed variables reach the bundle**, and the only one used is
  the client ID. Vite drops everything else, which is the safe default; do not
  work around it.

## Reporting a problem

Open an issue. If you would rather not do that publicly, say so in an issue
with no detail and we will find another way.

This is a hobby television set for one person's sofa. It holds nothing worth
stealing and the worst case is someone reads your subscription list. Please
calibrate accordingly, but if you find something, we would like to know.
