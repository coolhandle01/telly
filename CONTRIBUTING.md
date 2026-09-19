# Contributing

## Running it

```bash
npm install
npm run dev
```

Node 20.19+ or 22.12+ is the floor (a Vite requirement, and what `engines`
says). `.nvmrc` pins **24**, the current Active LTS, and `@types/node` tracks
it: types from a newer line than the runtime typecheck clean and then crash,
so a check in `analysers.yml` holds the two majors together. Node 26 becomes
LTS on 2026-10-28; moving to it means bumping both in one commit.

| | |
|---|---|
| `npm test` | watch-mode tests |
| `npm run test:ci` | once, with coverage |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | oxlint |
| `npm run build` | typecheck, then bundle |
| `npm run preview` | serve the real bundle |

It runs with no credentials at all: without a client ID it uses a
deterministic fixture pool, so the schedule, the cards and the whole
clock-driven core work offline and in CI.

## How the code is arranged

The interesting parts are pure functions. `plan(pool, options)` turns a pool of
videos into a day's schedule; `tune(schedule, now)` turns an instant into what
is on air. Neither touches the DOM, the network or the clock: a whole
broadcast day is provable in a millisecond.

`planStations(pool, options)` sits on top: it profiles the subscriptions,
deals them out between the five stations and plans a day for each. Also pure.

Everything that *is* I/O sits behind an interface with an injected
implementation: `Clock`, `Player`, `Sound`, `PoolSource`, `AccessTokenProvider`,
`FetchLike`. That is not ceremony. jsdom has no Web Audio, no IFrame API and no
IndexedDB, so these seams are the only way the behaviour is testable at all,
and each one has a fake beside it.

[docs/architecture/](docs/architecture/) is the long version: the scheduler, the
player's failure modes, token handling, the Data API, and the testing posture
below argued properly. [docs/research/](docs/research/) is why the set looks the
way it does.

## What is expected of a change

- **Test first.** A red test that fails on its *assertion*, not on an import
  error. Under `strict`, stubbing with `undefined` will not compile: stub the
  real signature with a wrong value.
- **Query the DOM a user sees.** `getByRole` with the accessible name,
  `userEvent` over `fireEvent`, no snapshots, never assert on component state.
  The entire cabinet was rebuilt once without a single component test changing,
  which is what this buys.
- **The type gate is separate.** Vite strips types without checking them, so
  `npm run typecheck` is its own step and `build` depends on it. Use `tsc -b`;
  the root config is solution-style and plain `tsc --noEmit` checks nothing.
- **Watch what the suite would not notice.** Coverage says a line ran, not that
  anyone would notice it being wrong. `npm run mutate` breaks the code on
  purpose and every survivor names a missing assertion; narrow it with
  `MUTATION_TESTS="src/broadcast" npx stryker run --mutate "src/broadcast/tune.ts"`,
  which takes minutes rather than an afternoon. Check one survivor by hand
  before believing a bad score: see `docs/architecture/testing.md`.
- **Run `npm run test:dst` if you touch anything with a date in it.** CI is
  UTC, where the clocks never change, so the ordinary suite cannot see a
  British Summer Time bug, and three were sitting there. Those tests live in
  `*.dst.test.ts`, run under `TZ=Europe/London`, and are excluded from the
  normal run because there they would fail for the wrong reason.
- **jsdom is not a browser.** It has no layout, no media, no IndexedDB, and it
  never fetches an external resource, so it never fires `error` either. Several
  of this app's nastiest bugs were invisible to a green suite and obvious in
  Chromium. If you change anything that loads, plays or paints, look at it.

## Branching and merging

`main` is protected and publishes itself, so changes arrive by pull request.

```bash
git switch -c fix/guide-column-height
# work, commit
git push -u origin fix/guide-column-height
```

Branches take the same shape as commits: `<type>/<what-it-does>`, from the same
list of types below. `fix/guide-column-height`, `feat/station-idents`,
`docs/branching`. A ruleset refuses anything else, so the name is settled
before the first commit rather than argued about at review, and a branch list
then reads like a changelog instead of a pile of nouns.

`claude/*` is refused too. Agents branch by what the change does, like
everybody else.

Open the pull request and wait for the checks. There are eight, one per thing
that can be wrong, so a red one says what broke before you open it:

| Check | What it is |
|---|---|
| `oxlint` | the lint |
| `commit messages` | the pull request title, which is what `main` keeps, and every commit on the branch. It re-runs when you rename, so a bad title can be fixed in place |
| `tsc` | the typecheck, separate because Vite strips types without checking them |
| `vite build` | proves it bundles |
| `vitest` | the suite, with coverage |
| `british summer time` | the same suite under `TZ=Europe/London` |
| `Analyze (javascript-typescript)` | CodeQL over the app |
| `Analyze (actions)` | CodeQL over these workflows, which run with a token |

Merging starts a release rather than finishing one. `bumpversion.yml` reads the
conventional commits since the last tag, decides the increment, writes the
changelog and tags, and the tag is what fires `release.yml`, which runs these
same workflows again against the tagged commit before it publishes. Which is
the other reason the prefixes matter: `fix:` and `feat:` are what choose the
version number, so a change filed under the wrong type ships under the wrong
one. A docs-only merge warrants no release and quietly produces none.

Every action is pinned to a commit rather than a tag: a tag is a moving pointer
somebody else controls, and these run with a token.

Linear history, so squash or rebase rather than a merge commit. Delete the
branch afterwards; GitHub offers.

The repository owner can bypass the ruleset. That is for the night something is
broken in production, not the ordinary route, and it extends to anything
pushing on the owner's behalf, which inherits the bypass without inheriting the
judgement about when it is warranted. If a pull request is possible, open one.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org): a type, an
optional scope, then the subject.

```
fix(guide): keep the tuned column the same height as the others

box-shadow paints outside the box and contributes nothing to layout, so
getBoundingClientRect reported all five columns identical and the ring was
invisible to the measurement that was supposed to catch it.
```

Types: `build` `chore` `ci` `docs` `feat` `fix` `perf` `refactor` `revert`
`style` `test`. Aim for a subject within 72 columns, so it survives
`git log --oneline`; the check refuses at 100, which is where Dependabot's
grouped titles sit. Body wrapped at 80.

Only the prefix is machine-read. The body stays prose: what changed and why,
at whatever length the change deserves, which is often several paragraphs.

### The pull request title is the commit message

This is the one the check enforces, and the only one it can.

Squash is the only merge method the ruleset allows, so a branch's own commit
subjects are discarded at merge: the title you type becomes the commit subject
on `main`, permanently, in `git log`, long after the pull request is a closed
tab. And that subject is what decides the next version, because
`commit-and-tag-version` reads it. A branch of immaculate commits still lands
as `Update stuff`, and ships no release at all, if the title says
`Update stuff`.

So write the title as the commit you want on `main`:

```
fix(guide): keep the tuned column the same height as the others
```

not `Fixed the guide bug`. Check one before you open the pull request with:

```bash
echo "fix(guide): keep the tuned column the same height as the others" | npx commitlint
```

Commits on the branch are yours. Write them well (a reviewer reads them, and
you will read them again) but nothing refuses a merge over them, because
nothing they say survives it.

## Style

British spelling in prose and captions, since the thing is a British telly.
Comments explain *why*; the code already says what. If a comment restates the
line beneath it, delete one of them.
