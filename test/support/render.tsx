import { render as rtlRender, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'

/**
 * The app has no providers to wrap yet, but the seam belongs here from the
 * start: returning `user` from one `setup()` keeps pointer and keyboard state
 * consistent across a test.
 */
export function render(ui: ReactElement, options?: RenderOptions) {
  return {
    user: userEvent.setup(),
    ...rtlRender(ui, options),
  }
}

// The `react` skill's re-export: one import for `render`, `screen` and the rest.
// This is test infrastructure, never part of a Fast Refresh boundary.
// oxlint-disable-next-line only-export-components
export * from '@testing-library/react'
