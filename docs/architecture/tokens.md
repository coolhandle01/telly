# Token handling

`src/library/googleTokenProvider.ts`

## The shape, and why it is the right one

Google Identity Services hands a browser a **short-lived access token and no
refresh token**. For a page with no backend that is not a limitation, it is the
correct design: there is no server to keep a refresh token secret from, so there
is no refresh token to leak.

| | |
|---|---|
| Flow | GIS `initTokenClient` — the implicit token flow |
| Scope | `https://www.googleapis.com/auth/youtube.readonly`, and nothing else |
| Lifetime | ~1 hour, renewed silently while consent stands |
| Client secret | none exists |
| Refresh token | none issued |

The token **lives in memory for its hour and nowhere else**. It is never written
to storage, never logged, and never put in a URL. It is asked for again when it
expires, one minute early (`EXPIRY_MARGIN_MS`) so a request never goes out
holding a token that dies in flight.

The **client ID is inlined into the bundle**, which is correct and by design —
it is a public identifier. The control that actually matters is the OAuth
client's *authorised JavaScript origins*: that list, not the secrecy of the ID,
is what stops someone else's page using it.

## The gesture rule

This is the whole reason sign-in works, and it is the least obvious thing in the
codebase.

**A popup must be traceable to a user gesture, and that gesture does not survive
a network round-trip.**

Fetch Google's script *inside* the click handler and the browser has already
ended the activating task by the time the popup is asked for. It refuses, and
GIS reports `popup_failed_to_open`. The sign-in button appears to do nothing.

So the provider is split in two:

- **`prepare()`** — called on mount. Fetches the GIS script and builds the token
  client. Idempotent, memoised on `#ready`.
- **`signIn()`** — called *straight from the click*, with no `await` in front of
  it. When the client is already built, `#requestSynchronously` opens the popup
  inside the click's own task, which is the only way a browser will allow it.

The caller must respect the same rule. In `Channel.tsx`:

```tsx
onClick={() => {
  setSignInError(undefined)
  // Straight from the click: an await here would lose the user
  // gesture and the consent popup would be blocked.
  signIn().then(
    () => setSignedIn(true),
    (error: Error) => setSignInError(error.message),
  )
}}
```

If the client somehow is not ready, `signIn()` prepares and asks anyway — the
popup may well be blocked, but reporting that beats silently doing nothing.

`getAccessToken()` is the opposite case: a **silent** renewal opens no popup, so
it needs no gesture and is free to `await`. It succeeds while consent stands and
fails — rather than popping up — when it does not.

## The settle bug worth remembering

The token client is built **once**, but every sign-in attempt has its own
resolve/reject pair. The GIS callback is registered at construction, so if it
closes over the *first* attempt's settlers, a second sign-in never settles at
all: the popup completes, the token arrives, and the promise hangs for ever.

The fix is a `#settle` field that the callback reads at call time:

```ts
#settle: { resolve: (token: string) => void; reject: (error: Error) => void } | undefined
```

`#pending` enforces one flight at a time, so two callers cannot open two popups.

## Failing loudly

`loadGoogleIdentityServices` rejects on `script.onerror` and on a script that
loads but exposes no `oauth2` client. A blocked script that never settles is a
screen that never explains itself — and, because jsdom never fetches an external
resource, that failure mode is completely invisible to the test suite. See
[testing.md](testing.md).

## Consent lapses

While the app is unverified, Google expires consent roughly weekly — so expect
to sign in again about once a week. That is a property of the Testing
publishing status, not a bug. [google.md](google.md) covers what verification
would change.
