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
- **Every test runs in every zone.** `ZONES` in `vite.config.ts` lists them, UTC
  and Europe/London, and each is a Vitest project named after the zone.
  `test/**/*.dst.test.ts` is a project of its own, `clocks-change`, pinned to
  Europe/London.

## The gates

```bash
npm run lint         # oxlint
npm run typecheck    # tsc -b --noEmit
npm test             # vitest
npm run test:ci      # vitest run --coverage, every project
npm run build        # typecheck, then vite build
```

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
npm run mutate                                                                     # all of src/ except main.tsx
MUTATION_TESTS="test/broadcast" npx stryker run --mutate "src/broadcast/tune.ts"   # one file, against its own tests
```

Stryker breaks the code on purpose (flips a comparison, drops a term, empties
a return), and a mutant that no test notices is either an assertion you do not
have or code that does nothing. So a survivor is a question: apply it by hand,
run the tests, and watch what fails. If nothing can, the mutant is equivalent
and the finding is about the code.

`stryker.config.mjs` mutates every file in `src/` except `main.tsx`, and every
mutant runs the whole suite: every test in every zone, and the clocks-change
tests. `--mutate` points a run at part of `src/`.

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

**`MUTATION_TESTS` narrows the suite.** Unset, every mutant runs everything,
which is the honest default. Set, `stryker.config.mjs` writes it into the
command as a Vitest filter over test paths, so it names `test/`, not `src/`. It
is an environment variable: the example above sets it in a POSIX shell, and in
PowerShell it is `$env:MUTATION_TESTS = "test/broadcast"` first. Narrow it too
far and a real killer is excluded, and you get a false survivor.

**The command holds nothing for a shell to expand.** Stryker hands it to Node's
`exec`, which is `cmd.exe` on Windows and `/bin/sh` elsewhere, and it runs the
same in both. The zones come from the projects' `env`, not from the command.

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

So every test runs in each zone in `ZONES` in `vite.config.ts`, UTC and
Europe/London, as a project named after the zone that sets `TZ` through
Vitest's `env`. `test/timezone.test.ts` proves each project runs in the zone it
is named after, whatever the machine's own zone. `test/**/*.dst.test.ts` is the
`clocks-change` project, pinned to Europe/London. Adding a zone is adding it to
`ZONES`.

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
