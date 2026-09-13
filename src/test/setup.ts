import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom gives each test *file* a fresh document, not each test, so anything
// global is ours to reset.
afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
})
