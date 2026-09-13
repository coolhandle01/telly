# The player, and the signal

## The card is the base signal

The test card renders **unconditionally** beneath every programme. The picture
is a layer above it, revealed only when the player reports one *actually
playing*. Programming is an override on a signal that is always there.

In `src/ui/Channel.tsx` that is an opacity gate — `pictureStyle(hasPicture)` —
over a ground of `#07090b` rather than pure black, so the glass has something to
act on.

This is **positive confirmation, not error detection**, and the distinction is
load bearing.

YouTube fails quietly. For some bad IDs it renders its own "unavailable" page
inside the iframe and never fires an error event at all. Wait for an error and
you wait for ever, with a black screen. Wait for a picture and the worst case is
the card staying up — and crucially, *nothing has to go right* for the card to
be there.

A watchdog backs it up: a programme that mounts without producing a picture
within eight seconds (`DEFAULT_START_TIMEOUT_MS`) faults with `'no picture'`,
and the caption changes from the programme title to an apology.

Only `PLAYING` (state 1) pulls the picture through. **Buffering counts as
progress but is not a picture** — it clears the watchdog without revealing the
video, because buffering is a picture on its way.

## Five things that look odd until they don't

Each of these was a real evening of black screen.

**An error tears the player down.** A YouTube player that has errored *stays*
errored — `loadVideoById` on it does nothing, silently. Without a rebuild, one
failed video means no picture for the rest of the night. `#onError` therefore
calls `#teardown()`.

**So does `stop()`.** The surface removes its host element when it unmounts, and
**an iframe that moves in the DOM reloads** — severing the player object from
the frame it thinks it is driving. This is why powering the set off and on used
to kill the stream until a refresh.

**Each mount gets a fresh target inside the host.** The IFrame API *replaces*
the element it is given with an iframe, so it cannot be handed the same one
twice:

```ts
const target = document.createElement('div')
target.style.position = 'absolute'
target.style.inset = '0'
this.#host.replaceChildren(target)
```

The size must also go in the *options* (`width: '100%', height: '100%'`), not
just in CSS on the host — the host is gone by the time the iframe exists. Both
host and target are `position: absolute; inset: 0`, because the iframe ends up
one level deeper than you expect and a percentage height resolves against
whatever it can find.

**Nothing may be asked of the handle until `onReady`.** `new YT.Player()`
returns an object immediately, but the API grafts its methods on only when the
frame reports ready. In between, the handle exists and `setVolume`,
`playVideo`, `loadVideoById`, `stopVideo` and `destroy` are all `undefined` —
so turning the volume knob, or a junction arriving, during those few hundred
milliseconds is a TypeError in the console and a programme that never starts.

Every call is therefore gated on `#ready`, and nothing is dropped: the volume
is held and applied at ready, and a cue that arrives mid-build is picked up by
`#onReady` rather than ignored. That last part matters — the frame was built
for one programme and the schedule may have moved on, so starting the one it
was built for would be showing the *wrong* programme, not merely a late one.

Two consequences fall out of the same fact. A mount whose host has left the
document is **abandoned**, because the surface can unmount while the API is
still being fetched and a player built into a detached element can never show
anyone a picture. And every mount takes a **generation number**, because a torn
down frame still fires its callbacks — the API has no idea it is gone — and
without that they land on whatever player exists by the time they arrive.

**The load effect deliberately omits `offsetSec`** from its dependencies. It
moves every second, and reloading on it would restart the video on every tick.
A programme's identity is `videoId` plus `endsAt`, so a repeat later in the same
day still counts as a new item.

## Loading the API

`loadYouTubeIframeApi` must have both a **reject path and a `script.onerror`**.
Without them, a blocked script leaves a promise that never settles, which is
indistinguishable from one that is merely slow — and the screen never explains
itself. The same rule applies to the GIS loader; see [tokens.md](tokens.md).

## The seam

`Player` is an interface. `YouTubeIframePlayer` is the real one;
`FakePlayer` records calls and pushes faults on demand. jsdom has no media and
no IFrame API, so without this seam none of the behaviour above could be tested
at all — and, as [testing.md](testing.md) notes, jsdom never fetches an external
resource so it never fires `error` either. Every failure mode on this page was
found in a real browser, not in the suite.
