# Security

## What this app handles

`telly` runs entirely in the browser. It is served as static files from GitHub
Pages, and there is no server, no server-side database and no backend of ours
anywhere in the picture.

| Thing | Where it lives | Notes |
|---|---|---|
| OAuth **client ID** | inlined into the bundle at build time | Public by design. It identifies the app, it does not authorise anything. |
| **Access token** | this tab's `sessionStorage`, key `telly.google.token`, with the moment it expires | Kept there so that reloading the page does not sign you out. It lasts the lifetime Google gives it in `expires_in`, which Google describes as short-lived. Closing the tab clears it, though a browser that restores the tab restores it too; an expired one is dropped rather than used. The app never logs it and never puts it in a URL. It is sent in an `Authorization` header to YouTube's data service, and handed to Google's sign-in script to revoke on sign-out. |
| **Refresh token** | does not exist | Google Identity Services' token model issues none: Google's comparison of the two flows lists it as "Refresh token issued: No". |
| Your **subscription list** and video metadata | IndexedDB on your machine | Database `testcard`, store `pools`, key `pool:<your own channel id>`. The subscribed channels' ids, names, topics and subscriber counts, and up to twenty uploads from each with titles, durations, dates, categories, tags, view counts and flags. No credentials. Used for 24 hours, and kept until a fresh load replaces it, you sign out, you clear this site's data, or the browser evicts it. **Sign out** removes your record; clearing site data removes every record. |

There is no client secret. A browser application cannot keep one, so it does
not have one.

## Scope requested

`https://www.googleapis.com/auth/youtube.readonly`, and no other scope through
the token client. Google describes it as "View your YouTube account". The app
uses it to read your subscriptions and their uploads, and makes no request that
posts, comments, subscribes, unsubscribes or deletes.

The scope also covers reading your own channel id, from a `channels.list` call
with `mine=true`. That id is what the cached data is filed under, so two
accounts used in the same browser keep separate records.

## Signing out

**Sign out** does two things: it calls `google.accounts.oauth2.revoke` with the
current access token, which hands the grant back to Google and drops every
scope, and it removes your record from the `pools` object store, the one under
your own channel id. Another account's record is left alone: it is theirs, and
throwing it away would cost them a full fetch. Clearing this site's data
removes every record. If the browser refuses, or the account behind the record
cannot be established, the page says so.

The held token goes with it, whatever either half
answers, so the tab is signed out even where the revocation never reached
Google.

Google answers a revocation through its callback. The page treats any answer
other than success as unconfirmed, and says so. That includes `invalid_token`,
which Google's reference describes as "Token is already expired or revoked
before revoke method is called. In most cases, you can regard the grant
associated with the accessToken is revoked." When the revocation request cannot
reach Google, Google's script answers success (observed 26 September 2026 with
the request blocked), so the page shows a completed sign-out. Your Google
account's permissions page shows whether the grant is gone.

Withdrawing access from your Google account's permissions page removes telly's
grant, and does not reach the database on your machine.

## Deliberate properties

- **The transport is injected.** Every module that talks to the network takes
  `fetch`, or the loader for Google's or YouTube's script, as a parameter, and
  the tests hand in fakes rather than reaching the internet.
- **Errors carry no token.** There is a test asserting the access token appears
  in no error object, including its non-enumerable properties.
- **The token goes no further than the tab that fetched it.** There is a test
  asserting it appears in no request URL, and it reaches no log, no error
  object, no cookie and no `localStorage`. It is written to `sessionStorage`
  and nowhere else, which is what carries a session across a reload, and
  closing the tab clears that record. Everything this app writes, or asks
  Google's script to write, is in the table above.
- **An expired token is discarded and the screen follows it.** Nothing renews
  the token on its own. When the token is next asked for, or on a reload,
  `GoogleTokenProvider` finds it has expired, drops it and tells its
  subscribers, which is what puts the sign-in button back. Until then the page
  can still show you as signed in. Google's guide says an expired token is
  replaced by calling `requestAccessToken()` "from a user-driven event such as
  a button press", so the token running out ends the session.
- **Only `VITE_`-prefixed variables reach the bundle**, and the only one used is
  the client ID. Vite drops everything else, which is the safe default; do not
  work around it.

## Reporting a problem

Open an issue. If you would rather not do that publicly, say so in an issue
with no detail and we will find another way.

This is a hobby television set for one person's sofa. The most it holds is a
short-lived token that can view your YouTube account, and a saved copy of your
subscriptions. Please calibrate accordingly, but if you find something, we
would like to know.
