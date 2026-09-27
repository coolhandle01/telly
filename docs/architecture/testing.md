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
npm run mutate                                                                     # the files in the table below
MUTATION_TESTS="test/broadcast" npx stryker run --mutate "src/broadcast/tune.ts"   # one file, against its own tests
```

Stryker breaks the code on purpose (flips a comparison, drops a term, empties
a return), and a mutant that no test notices is either an assertion you do not
have or code that does nothing. So a survivor is a question: apply it by hand,
run the tests, and watch what fails. If nothing can, the mutant is equivalent
and the finding is about the code.

**It mutates a short list of files.** Every mutant runs the whole suite, so
`mutate` in `stryker.config.json` names the files where a false green costs
most, not the ones with the worst score:

| File | What a surviving mutant there would let through |
|---|---|
| `src/broadcast/tune.ts` | the wrong programme, or the right one at the wrong second |
| `src/domain/time.ts` | a broadcast day of the wrong length |
| `src/library/googleTokenProvider.ts` | a sign-in, an expiry or a revocation handled wrongly |
| `src/library/session.ts` | a sign-out that does only one of its two things |
| `src/library/cachedPoolSource.ts` | one account reading another's saved subscriptions |
| `src/ui/faultMessage.ts` | a message naming the wrong failure, or Google's own text on screen |

`--mutate` replaces the list, for a run pointed anywhere else.

**It uses the command runner, not the Vitest runner.** Stryker's Vitest runner
narrows each mutant's run with a `testNamePattern` built from the test's
`describe` chain joined with a space, and Vitest 5 matches the pattern against
names joined with `" > "`. It matches nothing, every test is skipped, and a
mutant that no test ran against is reported Survived (stryker-js#6210). The
command runner has no name filter to get wrong: it sets the active mutant in
the environment, runs the command, and reads its exit code.
`@stryker-mutator/vitest-runner` is not installed.

**The dry run cannot catch a harness that lies.** It is the only process
running, so it passes, and a result is fabricated only afterwards, under the
load of every concurrent run. These settings stop that, and each one inflates
the score if it goes:

- **`--maxWorkers=1`.** Stryker already runs one command per core. Without this,
  each of those starts several Vitest workers of its own, the runs overrun the
  timeout, and Stryker scores a timeout as killed.
- **`timeoutMS`, set by hand.** Stryker's default is derived from the dry run,
  the one run that has the machine to itself.
- **No `--coverage`, which is why the command is not `npm run test:ci`.** Vitest
  refuses to start a coverage run while another process holds the coverage
  directory, and exits 1 before running a test, which Stryker scores as a kill.

A timeout is scored as killed, never as survived, so load can hide a real
survivor but cannot invent one.

**`--bail=1` changes how long a kill takes, never the score.** A run stops at
its first failing test. A failure is a kill wherever it comes, and a run with no
failure runs the whole suite as it would have anyway.

**The clocks-change suite runs as well.** After the ordinary suite, the command
runs `vite.dst.config.ts` under `TZ=Europe/London`. `broadcastDayLength` only
meets a 23 or 25 hour day there, so without it a mutant that makes every day 24
hours long would survive in UTC, where every day is.

**`$MUTATION_TESTS` narrows the ordinary suite.** Unset, it expands to nothing
and every mutant runs everything, which is the honest default. Set, it is a
Vitest filter over test paths, so it names `test/`, not `src/`. Narrow it too
far and a real killer is excluded, and you get a false survivor.

**It needs a POSIX shell.** Stryker hands the command to Node's `exec`, which
uses `cmd.exe` on Windows, where neither `$MUTATION_TESTS` nor `TZ=` means
anything. Run it on Linux, macOS or WSL.

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
