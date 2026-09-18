import type { UserConfig } from 'vitest/config'
import base from './vite.config.ts'

/**
 * The clocks-change suite, which is meaningless anywhere the clocks do not
 * change. Run with `TZ=Europe/London`: see `npm run test:dst`.
 *
 * The base config's `exclude` is *replaced* rather than merged: it exists to
 * keep these files out of the ordinary run, and `mergeConfig` would
 * concatenate it here and exclude the only files this config includes.
 */
const config = base as UserConfig

export default {
  ...config,
  test: {
    ...config.test,
    include: ['src/**/*.dst.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**'],
    coverage: { enabled: false },
  },
} satisfies UserConfig
