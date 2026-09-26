/**
 * Conventional Commits, because the merge method is Squash and nothing else.
 *
 * A squash merge writes the pull request *title* as the commit subject on
 * main, so the title faces this rule as much as the commits do
 * 
 * see the `commits` job in `.github/workflows/analysers.yml`.
 *
 * The prefix is the only part that is machine-read. The body stays prose: what
 * changed and why, at whatever length the change deserves.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The default set of types, minus the ones this repository has no use for
    // (`perf` and `revert` are kept; `build` and `ci` earn their place with
    // Vite config and the workflows).
    'type-enum': [
      2,
      'always',
      ['build', 'chore', 'ci', 'docs', 'feat', 'fix', 'perf', 'refactor', 'revert', 'style', 'test'],
    ],
    // The default 100, not the 72 a human subject should aim for. Dependabot
    // writes its own titles and a grouped one runs long — "chore(deps-dev):
    // bump the dev-dependencies group across 1 directory with 12 updates" is
    // 83 columns — and a weekly title edited by hand to buy tidiness is a bad
    // trade. CONTRIBUTING asks for 72; this refuses at 100.
    'header-max-length': [2, 'always', 100],
    // The body is where the reasoning goes, and the default 100 columns is
    // wider than the prose in this repository is written to.
    'body-max-line-length': [2, 'always', 80],
  },
}
