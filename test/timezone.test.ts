import { expect, it } from 'vitest'

/**
 * Each zone project in `vite.config.ts` is named after the zone it sets, and
 * this proves the zone took, whatever zone the machine is in. A setting that
 * did not take would run the whole suite once per zone in the machine's own
 * zone and report every run green.
 */
it('runs in the zone its project is named after', ({ task }) => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(task.file.projectName)
})
