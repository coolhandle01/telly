# Testing posture

The worst bugs this app has had were invisible to the whole suite. That is not
an indictment of it: it is the thing to understand before trusting one.

## The shape of the suite

No count is given here, because a count goes stale the day someone writes a
test and tells you nothing on the day it is right. `npx vitest run` prints the
current one. The shape is the part worth knowing:

- **The tests are `test/`, the app is `src/`.** `test/` mirrors `src/`: the
  tests for `src/ui/Channel.tsx` are `test/ui/Channel.test.tsx`, and they reach
  the app through the `@/` alias. The fakes, the fixture pool and the setup file
  are `test/support/`. `tsconfig.app.json` covers `src/` without the Vitest
  types, so Vitest's globals are not in scope in app code.
- **The pure layers carry the weight.** `domain/`, `schedule/`, `programming/`
  and `broadcast/` touch no browser API, so a whole broadcast day can be tested
  with no browser, no network and no real clock.
- **The I/O layers are tested through their seams**, with the fakes in the table
  below. No test reaches a network, a database or an audio context.
- **The component tests query the DOM a user sees**, never a class name or an
  SVG filter.
- **Some tests are compliance tests in UI-test clothing.**
  `GoogleSignInButton.test.tsx` pins Google's branding rules and
  `SourceLink.test.tsx` pins GitHub's, because the edits that break a brand rule
  are sympathetic ones nobody flags in review.
- **The clocks-change suite is separate.** `test/**/*.dst.test.ts` runs under
  `TZ=Europe/London` from its own config, and is excluded from the ordinary run.

## The gates

```bash
npm run lint         # oxlint
npm run typecheck    # tsc -b --noEmit
npm test             # vitest
npm run test:ci      # vitest run --coverage, then npm run test:dst
npm run build        # typecheck, then vite build
```

`npm run test:dst` sets `TZ=Europe/London` with POSIX shell syntax, which the
default npm shell on Windows does not run. There, run
`TZ=Europe/London npx vitest run --config vite.dst.config.ts` from a POSIX
shell.

**The type gate must be `tsc -b`.** Vite strips types without checking them, so
the build is not a type gate. And the root `tsconfig.json` here is
*solution-style*: it contains only references, so plain `tsc --noEmit` reads no
files and exits 0. That is a gate that **fails open**: green, and checking
nothing. Add `--force` when you want to be certain an incremental build has not
skipped the work.

`erasableSyntaxOnly` is on, which bans TypeScript syntax that has runtime
meaning, parameter properties in particular. Write the field and the assignment.

## The seams

Every piece of I/O sits behind an interface with an injected implementation.
This is not ceremony: jsdom has no Web Audio, no YouTube IFrame API and no
IndexedDB, so without these seams the behaviour could not be tested at all.

| Interface | Real | Fake |
|---|---|---|
| `Clock` | `SystemClock` | `FakeClock`: drive a whole day by hand |
| `Player` | `YouTubeIframePlayer` | `FakePlayer`: records calls, pushes faults |
| `Sound` | `WebAudioSound` | a stub asserting tone/hiss/stop |
| `PoolSource` | `YouTubePoolSource` | `FixturePoolSource`: seeded, deterministic |
| `PoolStore` | `IndexedDbPoolStore` | `inMemoryStore()`: a Map, and a write counter |
| `Session` | `googleSession` | `fakeSession()`: records the calls, resolves on demand |
| `AccessTokenProvider` | `GoogleTokenProvider` | any object returning a string |
| `Storage` | `sessionStorage` | `fakeStorage()`: so the held token is drivable |
| `FetchLike` | the platform `fetch` | canned payloads; no test can reach a network |

## A fake must not be more capable than the real thing

The YouTube IFrame API grafts `setVolume` and `loadVideoById` onto the player
at ready. Before that they are `undefined`, and calling one is a `TypeError`.

The fake IFrame API in `test/player/youtubePlayer.test.ts` throws the same
`TypeError` before ready, because a fake that answers straight away is *better*
than YouTube, and every before-ready bug is then green in the suite and a
console error in a living room. (`FakePlayer`, which stands in for the whole
`Player` in component tests, only records calls.)

A fake's job is to fail the way the real thing fails. Recording what was asked
of it is the easy half.

## Query the DOM a user sees

Tests ask for `getByRole('button', { name: 'Power' })`, never for a class name
or an SVG filter. That is why the cabinet could be rebuilt from plain buttons
into a wooden console without a single component test changing.

## Coverage says a line ran

It does not say anyone would notice it being wrong. Two things follow:

- **Mutation by hand.** Every mutation pass done on this codebase has found real
  gaps: assertions that would pass with the logic inverted.
- **Read the coverage report carefully**, rather than assuming a file is covered.

`coverage.include` is set explicitly rather than `all: true`: the comment in
`vite.config.ts` records that Vitest 5 removed that flag and that an explicit
`include` is the all-files behaviour. Without one, an unimported module scores
100% by being invisible.

## Mutation testing

```bash
npm run mutate                                     # everything, slowly
MUTATION_TESTS="src/broadcast" npx stryker run --mutate "src/broadcast/tune.ts"
```

Stryker breaks the code on purpose (flips a comparison, drops a term, empties
a return), and a mutant that no test notices is an assertion you do not have.
`tune.ts`, the function the whole app rests on, scored **100%** when last run:
45 mutants killed, 3 timed out (a mutated binary search that never terminates
counts as caught), none survived.

Two things about the setup are deliberate and both would otherwise waste an
afternoon.

**It uses the command runner, not the Vitest runner.** Stryker's Vitest
integration reads its coverage back through `ctx.state.getFiles()`, a Vitest
internal that changed in Vitest 5. It comes back empty, so Stryker concludes no
test covers any mutant, runs nothing, and reports **everything as survived**.
`tune.ts` scored 2% that way, and the same mutants, applied by hand, were
killed by the suite immediately. A mutation score that low on well-tested code
is a broken harness, not a bad suite: check one survivor by hand before
believing any of it.

**The test scope comes from `$MUTATION_TESTS`.** The command runner re-runs the
whole suite for every mutant, and the whole suite took 20 seconds when this was
written. Two concurrent runs of it on four cores exceeded every sane timeout and
*every* mutant "timed out", which scores as killed and tells you nothing. The command interpolates
the variable through the shell, so a run can be narrowed to the tests that
could plausibly kill the mutants, and each attempt takes about three seconds.
Narrow the scope too far and a real killer is excluded, and you get a false
survivor; the whole-suite default is the honest one.

The sandbox is a full copy of the project, tests included, so `.stryker-tmp` is
excluded from Vitest, oxlint and git. Without that, `vitest run` finds every
test file twice and lints instrumented code.

## UTC is not a timezone anyone lives in

CI runs in UTC, where the clocks never change, so no test running there can
see a British Summer Time bug, and for a long while none did. Three were
waiting: a broadcast day assumed to be 86,400 seconds when twice a year it is
23 or 25 hours, a test-card rotation counting UTC days from a local midnight
(which repeats a card in March and skips one in October), and a listings page
counting wall-clock times from the day's anchor instead of reading them off
real instants.

`npm run test:dst` runs `test/**/*.dst.test.ts` under `TZ=Europe/London`, with
its own Vitest config. Merging configs was the wrong tool, since the base
config's `exclude` exists to keep these files *out* of the ordinary run and
`mergeConfig` concatenates rather than replaces, which excluded the only files
the config included.

The first test in that file asserts the timezone it is running in. A suite that
silently degrades to a no-op when its one precondition is missing is worse than
no suite, because it reports green.

## jsdom is not a browser

This is the important section.

jsdom has **no layout**, **no media** and **no navigation**, and the one that
actually bites is that **the suite never loads an external script**: the GIS
and IFrame API loaders are injected, so a script that never arrives and never
fires `error` is something a test has to hand in on purpose. A promise waiting
on an `onload` that will never come is indistinguishable from one that is
merely pending.

Five bugs reached a living room through a fully green suite:

| Bug | What jsdom could not see |
|---|---|
| Blocked IFrame API → black screen for ever | the script never loads, so `onerror` never fires |
| Errored player never recovers | no media, so no error state to recover from |
| Power cycle killed the stream | no layout, so no iframe reloading when moved |
| Picture rendered 640×390 in the corner | no layout, so no size to be wrong |
| Privacy and terms links answered with the television | no navigation, so an href pointing at nothing renders like one that works |

## So: drive the real thing

For anything involving layout, media or an external resource, run the gates and
then **drive the built app in Chromium** and measure or screenshot it. A
bounding box and a screenshot together catch the entire class of bug above, and
take about a minute.

```bash
VITE_YOUTUBE_CLIENT_ID=placeholder npx vite build
# serve dist/, then drive it with Playwright and assert on real geometry
```

The rule of thumb: **if the assertion would be different in a browser with a
window, the suite cannot make it.**
