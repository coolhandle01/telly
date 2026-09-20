# Security

## What this app handles

`telly` runs entirely in the browser. There is no server, no database and no
backend of ours anywhere in the picture.

| Thing | Where it lives | Notes |
|---|---|---|
| OAuth **client ID** | inlined into the bundle at build time | Public by design. It identifies the app, it does not authorise anything. |
| **Access token** | this tab's `sessionStorage`, key `telly.google.token`, for its ~1 hour life | Kept there so that reloading the page does not sign you out. It goes when the tab closes. Never logged, never placed in a URL, and sent in an `Authorization` header. |
| **Refresh token** | does not exist | Google Identity Services issues none to a browser client, which is the correct shape for an app with no backend. |
| Your **subscription list** and video metadata | IndexedDB on your machine, for a day | Database `testcard`, store `pools`, key `pool:<your own channel id>`. Titles, durations and IDs. No credentials. **Sign out** empties the store, and so does clearing site data. |
| **Which account signed in** | `localStorage`, key `telly.google.account` | Google's own `sub` for the account, read out of the sign-in itself. It names the account when you sign in again, so you are not asked to pick it out of a list. Not the token, not a credential, and different for every app. Removed on sign-out. |

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
scope, and it removes your record from the `pools` object store, the one under
your own channel id. Another account's record is left alone: it is theirs, and
throwing it away would cost them a day's quota to fetch again. Clearing this
site's data removes every record. If the browser refuses, or the account behind
the record cannot be established, the page says so.

The held token and the account identifier go with it, whatever either half
answers, so the tab is signed out even where the revocation never reached
Google.

Withdrawing access from Google's own security settings stops the token being
accepted, and does not reach the database on your machine.

## Deliberate properties

- **The transport is injected.** Every module that talks to the network takes
  `fetch` as a parameter, so no test can reach the internet by construction.
- **Errors carry no token.** There is a test asserting the access token appears
  in no error object, including its non-enumerable properties.
- **The token goes no further than the tab that fetched it.** There is a test
  asserting it appears in no request URL, and it reaches no log, no error
  object, no cookie and no `localStorage`. It is written to `sessionStorage`
  and nowhere else, which is what carries a session across a reload, and that
  record dies with the tab. Everything this app writes is in the table above.
- **An expired token is discarded and the screen follows it.** Google Identity
  Services refreshes nothing by itself, so `GoogleTokenProvider` watches the
  clock, drops the stale token and tells its subscribers, which is what puts
  the sign-in button back. There is no silent renewal to attempt in its place:
  a token comes from a popup and a popup comes from a click, so the hour
  running out ends the session.
- **Only `VITE_`-prefixed variables reach the bundle**, and the only one used is
  the client ID. Vite drops everything else, which is the safe default; do not
  work around it.

## Reporting a problem

Open an issue. If you would rather not do that publicly, say so in an issue
with no detail and we will find another way.

This is a hobby television set for one person's sofa. It holds nothing worth
stealing and the worst case is someone reads your subscription list. Please
calibrate accordingly — but if you find something, we would like to know.
