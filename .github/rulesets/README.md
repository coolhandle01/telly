# Rulesets

What protects `main`, in the form GitHub imports and exports.

**Settings → Rules → Rulesets → New ruleset ▾ → Import a ruleset** takes one of
these files. An existing ruleset exports back to the same shape from its own
page, and `POST /repos/{owner}/{repo}/rulesets` accepts it unchanged — so these
are the configuration, not a description of it.

## Why two and not one

A bypass applies to a **whole ruleset**, never to a single rule inside it. One
ruleset holding both the checks and the approval requirement means that
clicking past the approval — which a solo maintainer must, because nobody can
approve their own pull request — also clicks past every check in the same
ruleset. The merge button does not distinguish, so a red pull request merges by
the same gesture as a green one.

Split, the bypass only reaches what it is meant to:

| | Bypass | What it holds |
|---|---|---|
| `main-gates.json` | **nobody** | the checks, code scanning, linear history, no force pushes, no deletion |
| `main-review.json` | repository admin | pull request required, one approval |

The gates apply to everyone, always, including the owner. The review is the
speed bump you knowingly step over.

## Before importing

**Both files ship with an empty `bypass_actors`.** Add *Repository admin* to
`main — review` in the UI after importing — the numeric id for a built-in
repository role is not something worth hard-coding here, and one click is
cheaper than being wrong. Leave `main — gates` empty; that is the entire point
of it.

**A required check that cannot run blocks every pull request, permanently.**
`required_status_checks` names contexts, and a context only reports if the
workflow producing it exists on the branch under test *and* on `main`. Naming a
check before its workflow reaches `main` deadlocks the repository until it gets
there — which happened here, to a Dependabot pull request that then sat waiting
on seven checks that did not yet exist. Every context in `main-gates.json` comes
from `.github/workflows/analysers.yml`, `tests.yml` or `codeql.yml`. Add names
after the workflow lands, never before.
