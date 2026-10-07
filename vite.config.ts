import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { Connect, Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Serve `public/<dir>/index.html` for a request to `public/<dir>/`.
 *
 * The privacy policy and the terms are plain files under `public/`, not routes
 * the app knows about. A static host answers `/privacy/` with the index.html
 * inside it; Vite's own static middleware does not, so the request falls
 * through to the single-page fallback and the dev server returns the app —
 * leaving the television on screen at an address that is not the television.
 * This makes the servers we develop against behave like the one we deploy to.
 */
function publicDirectoryIndex(): Plugin {
  const rewriteUnder = (root: string): Connect.NextHandleFunction => {
    return (req, _res, next) => {
      const [path, query] = (req.url ?? '/').split('?')
      if (path !== '/' && path.endsWith('/') && existsSync(join(root, path, 'index.html'))) {
        req.url = `${path}index.html${query ? `?${query}` : ''}`
      }
      next()
    }
  }

  return {
    name: 'public-directory-index',
    // Registered from the hook bodies, so they run ahead of the static and
    // fallback middlewares rather than behind them. Each server is asked which
    // directory it is actually serving: `public/` in development, the build
    // output in preview.
    configureServer: (server) =>
      void server.middlewares.use(rewriteUnder(server.config.publicDir)),
    configurePreviewServer: (server) =>
      void server.middlewares.use(
        rewriteUnder(resolve(server.config.root, server.config.build.outDir)),
      ),
  }
}

/**
 * Every test runs once in each of these zones, as a Vitest project named after
 * the zone. Adding a zone is adding it here.
 */
const ZONES = ['UTC', 'Europe/London']

const EXCLUDE = ['**/node_modules/**', '**/dist/**', '.stryker-tmp/**']

// One config for the app and its tests: aliases and plugins resolve identically
// in the bundle and in the suite, so a test cannot pass against a module graph
// the build will not produce.
export default defineConfig({
  base: './',
  plugins: [react(), publicDirectoryIndex()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    watch: {
      // A running browser holds its profile's session files open, and watching
      // one throws EBUSY on Windows and takes the dev server down with it. The
      // browser we drive the app with keeps its profile in `.browser/`, and
      // Playwright writes its snapshots to `.playwright-mcp/`. Neither is
      // source, and `.gitignore` does not reach the watcher.
      ignored: ['**/.browser/**', '**/.playwright-mcp/**'],
    },
  },
  test: {
    environment: 'jsdom',
    // Stryker's sandbox is a full copy of the project, tests and all. Without
    // this, a mutation run makes `vitest` find every test file twice, and the
    // copies it finds are instrumented.
    exclude: EXCLUDE,
    globals: true, // describe/it/expect without imports
    setupFiles: './test/support/setup.ts',
    restoreMocks: true, // no spy leaks between tests
    // `env` sets TZ inside each test process, so no shell has to. The app is
    // src/ and its tests are test/, so nothing in src/ is test code. The
    // clocks-change tests are about Europe/London's clocks, so they are a
    // project of their own, pinned there, whatever ZONES holds.
    projects: [
      ...ZONES.map((zone) => ({
        extends: true,
        test: {
          name: zone,
          env: { TZ: zone },
          include: ['test/**/*.test.{ts,tsx}'],
          exclude: [...EXCLUDE, '**/*.dst.test.ts'],
        },
      })),
      {
        extends: true,
        test: {
          name: 'clocks-change',
          env: { TZ: 'Europe/London' },
          include: ['test/**/*.dst.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // The `vite` skill mandates `all: true` so an unimported module cannot
      // score 100% by being invisible. Vitest 5 removed that flag: an explicit
      // `include` now *is* the all-files behaviour, so this is the same gate.
      include: ['src/**/*.{ts,tsx}'],
    },
  },
})
