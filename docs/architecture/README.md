# Architecture

## The rule everything follows

Wall-clock time is the only input, and two pure functions carry the whole app:

```ts
plan(pool, options) -> Schedule      // deterministic, once per broadcast day
tune(schedule, now) -> OnAir         // pure, called every tick
```

The app never asks *what shall we play next?* It asks *what should be on air at
14:32:07, and how far into it are we?* That question gives join-in-progress,
closedown, overruns and the test card for nothing, and it makes a whole
broadcast day provable in a millisecond with no network, no browser and no real
clock.

Everything else — sign-in, the Data API, IndexedDB, the iframe player, WebAudio
— is I/O bolted to the edges.

## The documents

| | |
|---|---|
| [scheduling.md](scheduling.md) | The broadcast day, dayparts, the junction rule, the classifier and the packer. The core. |
| [stations.md](stations.md) | The five broadcasters: genre, the draft, themed nights, strands and the watershed. |
| [components.md](components.md) | The React tree: the set, the screen, the fascia, and how a drawn cabinet stays testable. |
| [player.md](player.md) | The YouTube IFrame API, the card-as-base-signal rule, and four failure modes it has to survive. |
| [tokens.md](tokens.md) | Google Identity Services, the user-gesture rule, and why a token never reaches storage. |
| [google.md](google.md) | The Data API pipeline, the quota arithmetic, error triage, and sign-in brand compliance. |
| [testing.md](testing.md) | The gates, the seams, and the precise shape of jsdom's blind spot. |
| [threat-model.md](threat-model.md) | The trust boundaries, the data-flow diagram, and every threat with what was done about it. |
| [technologies.md](technologies.md) | What it is made of: the two runtime dependencies, the toolchain, and the services it talks to. |
| [release-process.md](release-process.md) | Branch to tag to deploy: every gate, what runs it, and what cannot be verified from the repository. |

## The layout, and what each directory is allowed to know

```
src/
  domain/      the shared vocabulary: time, dayparts, videos, schedule, on-air
  schedule/    the classifier interface and the packer
  programming/ the five stations: genre, profiles, the draft, what goes where
  broadcast/   tune() — wall clock in, what-is-on-air out
  player/      the YouTube IFrame API, behind a seam
  library/     subscriptions -> uploads -> videos; cached in IndexedDB under
               whose they are, plus sign-in and the Session seam over it
  testcard/    the five card designs, their geometry, and the renderer
  audio/       what comes out of the speaker: the line-up tone, and the hiss
  ui/          the screen, the cabinet it sits in, and the only place a
               failure becomes words
  fixtures/    the pool it runs on with no credentials
```

`domain/` is the frozen vocabulary and depends on nothing. `schedule/`,
`programming/` and `broadcast/` depend on `domain/` and on no browser API at
all, which is what makes them provable. `library/`, `player/` and `ui/` are
where the outside world is allowed in, each behind an interface.

`ui/Channel.tsx` is the composition root: it is the only module that knows the
clock, the pool source, the player and the cabinet all exist at once.

## The decisions, in one place

Each is argued in the document named, and each looks arbitrary until you try
the alternative.

| Decision | Where |
|---|---|
| The broadcast day is 06:00 → 06:00, and positions in it are integer offsets | [scheduling.md](scheduling.md) |
| News starts on time; everything else floats | [scheduling.md](scheduling.md) |
| A programme may go out twice a day, four hours apart, and only as a last resort | [scheduling.md](scheduling.md) |
| A subscription belongs to one station and appears on no other | [stations.md](stations.md) |
| Stations pick in turn rather than bidding, so each gets its first choice | [stations.md](stations.md) |
| The watershed is read off the API, in both directions | [stations.md](stations.md) |
| The test card is the base signal, revealed *under* the picture, not an error state | [player.md](player.md) |
| A picture is confirmed positively — waiting for an error waits for ever | [player.md](player.md) |
| A preset with no station shows snow and hiss; a card means somebody is transmitting | [components.md](components.md) |
| The sound follows what is on the screen, never what is in the schedule | [components.md](components.md) |
| An error, and a stop, both tear the player down | [player.md](player.md) |
| The GIS script is fetched on mount, never in the click handler | [tokens.md](tokens.md) |
| A reload keeps the session because the token crosses it; Google is asked nothing at page load | [tokens.md](tokens.md) |
| Signing out is two operations: revoke at Google, and empty the store | [tokens.md](tokens.md) |
| The screen follows the session, not the last click | [tokens.md](tokens.md) |
| A 404 playlist is skipped; 401, 403, 429 and a spent quota are fatal | [google.md](google.md) |
| The cache is keyed to whose data it is, and an unknown account is not a key | [google.md](google.md) |
| The sign-in button's wording is Google's to choose, not ours | [google.md](google.md) |
| What a failure says on the screen is the station's words, never the API's | [components.md](components.md) |
| A render throw shows the fault card and never retries | [components.md](components.md) |
| Every piece of I/O sits behind an injected interface | [testing.md](testing.md) |
| The type gate must be `tsc -b`, because `tsc --noEmit` fails open here | [testing.md](testing.md) |
| Two runtime dependencies, and everything else is a dev tool | [technologies.md](technologies.md) |
| Mutation testing exists but is not a gate, and cannot fail a build | [release-process.md](release-process.md) |
