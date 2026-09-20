# The em dash pass, and what it left behind

A record of reading every file in the `fix/security-issues` diff against
`main`, one at a time, to find what the punctuation sweep did.

## Already walked back

- 83 files whose only change was replaced punctuation, reverted whole.
- 205 punctuation-only hunks inside 34 files the branch does change,
  reverted line by line, leaving the real edits.

The pull request went from 137 changed files to 54.

## Files whose change can still be walked back

None. Every file left in the diff carries a real change.

## What the sweep left behind, found by reading

These are not punctuation. They are damage the punctuation pass did while
it was rewriting lines, and they survived the revert because the revert
only undid changes that were punctuation-only.

### `src/ui/controls/ControlPanel.tsx`

The `@media (max-width: 40rem)` block contains a verbatim copy of the
desktop `.tv-fascia__grille` rule: thirty lines of identical
declarations and the same comment, overriding nothing. The indentation
of the copy does not match the block it sits in.

### `src/ui/controls/Knob.tsx`

`.tv-knob__label` declares `letter-spacing` and `text-transform` twice,
with the same values both times, on either side of `${NO_SELECT}`.

### `src/index.css`

The comment above `.set__stage` describes `minmax(0, 1fr)` grid tracks
and why opening the guide cannot move the television. The rule beneath
it is `position: relative; isolation: isolate`. The tracks it describes
are not there. Three consecutive blank lines after `.testcard`.

### `src/testcard/designs/designForDate.test.ts`

The comment at the last test cites `offsetClock.ts:52-53` and the `?at=`
query parameter as the reason the test exists. This branch deletes
`src/clock/offsetClock.ts`, and `scheduling.md` records that `?at=` is
gone.

## Stale, but not from the sweep

### `SECURITY.md`

Three claims the branch's own code contradicts.

- The table says the access token is **memory only** and **never written
  to storage**. `googleTokenProvider.ts` writes it to `sessionStorage`
  under `telly.google.token`, which is what carries a session across a
  reload.
- The table lists a **sign-in flag** at `localStorage` key
  `telly.google.granted`. That key is now only ever removed. What is
  written is `telly.google.account`, the account's `sub`.
- *Deliberate properties* says a test asserts the token appears in
  neither `localStorage`, `sessionStorage` nor `document.cookie`. That
  test is gone, and the assertion would now be false.
- The same bullet says the two things written are the pool and the
  sign-in flag. It is three, and one of them is the token.

### `docs/architecture/threat-model.md`

T4 and T32 describe the same removed design: the token in a private
field with no second copy, the `localStorage` grant flag as an accepted
risk, and the deleted test as evidence. The token at rest in
`sessionStorage` has no row.

## What was read

Read in full with the Read tool, in diff order: `.env.example`,
`analysers.yml`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`,
`SECURITY.md`, `docs/README.md`, `docs/architecture/README.md`,
`components.md`, `google.md`, `player.md`, `release-process.md`,
`scheduling.md`, `stations.md`, `technologies.md`, `testing.md`,
`threat-model.md`, `tokens.md`, `research/programming.md`,
`research/test-cards.md`, `index.html`, `llms.txt`,
`privacy/index.html`, `terms/index.html`, `App.test.tsx`, `App.tsx`,
`index.css`, `cachedPoolSource.ts`, `createPoolSource.ts`,
`googleTokenProvider.ts`, `library/index.ts`, `indexedDbPoolStore.ts`,
`poolSource.ts`, `poolStore.ts`, `session.ts`, `youTubePoolSource.ts`,
`assign.ts`, `designForDate.test.ts`, `designs/index.ts`, `Channel.tsx`,
`FaultBoundary.tsx`, `ControlPanel.tsx`, `Knob.tsx`, `faultMessage.ts`.

`offsetClock.ts` and `offsetClock.test.ts` are deletions.

Not read: `cachedPoolSource.test.ts`, `googleTokenProvider.test.ts`,
`indexedDbPoolStore.test.ts`, `session.test.ts`,
`youTubePoolSource.test.ts`, `Channel.test.tsx`,
`FaultBoundary.test.tsx`, `faultMessage.test.ts`. Eight test files. The
hunk-level check reports no punctuation-only hunks left in any of them,
but that is a check rather than a reading, and it is not what was asked
for.
