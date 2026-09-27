/**
 * `npm run mutate`. `docs/architecture/testing.md` says why each setting is
 * there.
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  tempDirName: '.stryker-tmp',

  testRunner: 'command',
  commandRunner: {
    // MUTATION_TESTS, when set, is a Vitest filter over test paths. It is
    // written into the command here, so the command holds nothing a shell has
    // to expand and runs the same in cmd.exe as in a POSIX shell.
    command: ['npx vitest run', process.env.MUTATION_TESTS, '--maxWorkers=1 --bail=1 --silent=true']
      .filter(Boolean)
      .join(' '),
  },
  coverageAnalysis: 'off',
  timeoutMS: 120_000,

  mutate: ['src/**/*.ts', 'src/**/*.tsx', '!src/main.tsx'],
  thresholds: { high: 90, low: 75, break: null },
}
