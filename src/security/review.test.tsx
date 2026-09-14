/**
 * The security review, as tests.
 *
 * Cross-cutting by nature — a weakness is a path from an untrusted input to a
 * sink, and those paths do not respect module boundaries — so this is the one
 * suite that does not sit beside the thing it tests.
 *
 * Two kinds of test live here, and the difference is the point:
 *
 * - **Green tests** pin behaviour that is already right, so a later change
 *   cannot quietly undo it, and record the negative results. That the ISO-8601
 *   duration regex is linear-time is measured here precisely because
 *   "probably fine" is not an answer anyone can check.
 *
 * - **`DISABLED_` tests** are named for the *correct* behaviour of something
 *   currently wrong, and are skipped. Enabling one is part of its fix — the
 *   `tdd` convention for a known bug. It keeps the bar green while leaving the
 *   finding reproducible, rather than living only in a report nobody reads
 *   twice.
 *
 * Beside each `DISABLED_` test is a green characterisation test proving the
 * weakness is real *today*. When the fix lands, the characterisation test is
 * the one to delete — it exists to stop the finding being argued away.
 *
 * Nothing here touches the network: the transport and the clock are injected
 * everywhere, which is what makes the whole review observable offline.
 */
import { describe, expect, it, vi } from 'vitest'
import indexHtmlRaw from '../../index.html?raw'
import { App } from '../App'
import { offsetFromQuery } from '../clock/offsetClock'
import { CachedPoolSource } from '../library/cachedPoolSource'
import { GoogleTokenProvider } from '../library/googleTokenProvider'
import { YouTubePoolSource } from '../library/youTubePoolSource'
import { parseIso8601Duration } from '../library/duration'
import { buildTestCard } from '../testcard/buildTestCard'
import { FixturePoolSource } from '../library'
import type { PoolStore, StoredPool } from '../library/poolStore'
import type { Pool } from '../domain'
import { FakePlayer } from '../player/fakePlayer'
import { genreOf } from '../programming/genre'
import { createFakeSound } from '../test/fakeAudio'
import { render, screen, waitFor } from '../test/render'

/*
  The repository, read through Vite rather than through `node:fs`.

  `src` is compiled by `tsconfig.app.json`, which types the browser and
  deliberately not Node — so a test here may not reach for `readFileSync`
  without dragging Node's types into the app's own build. `?raw` and
  `import.meta.glob` are the bundler's own answer, they typecheck under the
  config the app actually uses, and they resolve the same way in the suite as
  in the build. Eager, because a test that has to await its own fixtures reads
  worse for no benefit at this size.
*/
// The options must be written out at each call: `import.meta.glob` is a
// compile-time transform, not a function, so it cannot read a shared constant.

/** Every workflow, keyed by path. These are the files that run with a token. */
const WORKFLOWS = import.meta.glob<string>('../../.github/workflows/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** Every module the app ships, tests excluded — the sink surface, as text. */
const SOURCES = import.meta.glob<string>('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The delivered document, exactly as it leaves the repository. */
const INDEX_HTML: string = indexHtmlRaw

const basename = (path: string): string => path.split('/').pop() ?? path

const emptyPool: Pool = { videos: [], channels: new Map() }
const someTokens = { getAccessToken: () => Promise.resolve('tok') }

// ---------------------------------------------------------------------------
// TELLY-SEC-01 — CWE-94 · A03/A08 · a pull request title is shell source
// ---------------------------------------------------------------------------

/**
 * GitHub substitutes a `${{ }}` expression into a `run:` block as *text*,
 * before any shell parses it. A pull request title is chosen by whoever opens
 * the pull request, and `analysers.yml` runs on `pull_request` — which fires
 * for forks — so the title is attacker-supplied shell source on the runner.
 *
 * The fix is to pass the value through `env:` instead, where the shell sees a
 * variable rather than source. That is what this test is written against.
 */
describe('TELLY-SEC-01 · workflow expressions in shell blocks', () => {
  const workflows = (): { name: string; body: string }[] =>
    Object.entries(WORKFLOWS).map(([path, body]) => ({ name: basename(path), body }))

  /** `run:` lines only. An `if:` is read by the expression engine, not a shell. */
  const injectableRunLines = (body: string): string[] =>
    body
      .split('\n')
      .filter((line) => /^\s*(-\s*)?run:/.test(line) && /\$\{\{\s*github\.event\./.test(line))
      .map((line) => line.trim())

  it('characterises the injection that exists today', () => {
    expect(workflows().length).toBeGreaterThan(0) // the glob found them at all
    const offenders = workflows().flatMap(({ name, body }) =>
      injectableRunLines(body).map((line) => `${name}: ${line}`),
    )
    // Recorded, not asserted away: this is the finding.
    expect(offenders).toEqual([
      'analysers.yml: run: echo "${{ github.event.pull_request.title }}" | npx commitlint',
    ])
  })

  it('proves the substitution really does escape the quotes', () => {
    // What GitHub hands the shell, for a title that closes the quote itself.
    const title = 'feat: x"; touch pwned; echo "done'
    const rendered = `echo "${title}" | npx commitlint`
    // Two commands where the workflow author wrote one.
    expect(rendered.split(';').length).toBeGreaterThan(1)
    expect(rendered).toContain('; touch pwned;')
  })

  it.skip('DISABLED_ no workflow interpolates an event field into a shell block', () => {
    for (const { name, body } of workflows()) {
      expect(injectableRunLines(body), `${name} interpolates an event field into run:`).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-02 — CWE-20 -> CWE-755 · A10 · a crafted ?at= link blanks the set
// ---------------------------------------------------------------------------

/**
 * `?at=` takes a wall-clock time or a full ISO instant, and anything that
 * `new Date()` will parse becomes an offset. One millisecond past the largest
 * instant a `Date` can hold is `Invalid Date`, and every arithmetic result
 * downstream of it is `NaN` — through `broadcastDayStart`, into the card
 * rotation and the packer's day length, until something throws during render.
 *
 * React's answer to a throw in render is to unmount the tree. There is no
 * error boundary, so the whole set goes, and what the viewer gets from a link
 * someone sent them is a white page.
 */
const MAX_DATE_ISO = '%2B275760-09-13T00:00:00.000Z'
/**
 * The other end of the range, and the worse one: a `-` needs no escaping, so
 * this is a link that can be typed into a chat window and will be followed.
 */
const MIN_DATE_ISO = '-271821-04-20T00:00:00.000Z'

/** Switch the set on at an address and report what is left standing. */
async function switchOnAt(search: string): Promise<string> {
  window.history.replaceState({}, '', search)
  // React logs the unhandled render error; the assertion is the DOM, not the log.
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
  // This render's own container, so two mounts in one file cannot read as one.
  let container: HTMLElement | undefined
  try {
    const mounted = render(
      <App sound={createFakeSound()} poolSource={new FixturePoolSource()} player={new FakePlayer()} />,
    )
    container = mounted.container
    await mounted.user.click(screen.getByRole('button', { name: 'Power' }))
    await waitFor(() => expect(container?.innerHTML).not.toBe(''))
  } catch {
    // A throw escaping render *is* the crash. The DOM below says so.
  } finally {
    quiet.mockRestore()
  }
  return container?.innerHTML ?? ''
}

describe('TELLY-SEC-02 · a crafted ?at= link', () => {
  it('shows television at an ordinary ?at=', async () => {
    expect((await switchOnAt('/?at=03:14')).length).toBeGreaterThan(10_000)
  })

  it('characterises the blank screen a crafted link produces today', async () => {
    // An empty root is an unmounted tree: React's answer to a throw in render.
    expect(await switchOnAt(`/?at=${MAX_DATE_ISO}`)).toBe('')
  })

  it('characterises the same crash from a link needing no escaping at all', async () => {
    expect(await switchOnAt(`/?at=${MIN_DATE_ISO}`)).toBe('')
  })

  it('shows that the guard is a range check, not a parse check', () => {
    const now = new Date(2026, 8, 12, 20, 15, 0)
    // One millisecond further out stops parsing, and is correctly ignored.
    expect(offsetFromQuery(`?at=${MAX_DATE_ISO.replace('000Z', '001Z')}`, now)).toBe(0)
    // Just inside the range parses, and is not checked against anything.
    expect(offsetFromQuery(`?at=${MIN_DATE_ISO}`, now)).toBeLessThan(-8e15)
  })

  it.skip('DISABLED_ an ?at= outside any sane range is ignored, as an unparseable one is', () => {
    const now = new Date(2026, 8, 12, 20, 15, 0)
    expect(offsetFromQuery(`?at=${MAX_DATE_ISO}`, now)).toBe(0)
    expect(offsetFromQuery(`?at=${MIN_DATE_ISO}`, now)).toBe(0)
  })

  it.skip('DISABLED_ a set switched on at an unrepresentable instant still shows a picture', async () => {
    expect((await switchOnAt(`/?at=${MAX_DATE_ISO}`)).length).toBeGreaterThan(10_000)
    expect((await switchOnAt(`/?at=${MIN_DATE_ISO}`)).length).toBeGreaterThan(10_000)
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-03 — CWE-20/CWE-755 · A10 · a corrupt cache is not a cache miss
// ---------------------------------------------------------------------------

/**
 * `CachedPoolSource` says in its own header that a corrupt object store "gets
 * television anyway, just without the saving", and that "losing the cache is
 * never a reason to lose the channel". The `try` around the read makes that
 * true of a read that *throws*. It is not true of a read that *succeeds* and
 * returns a record of the wrong shape: `toPool` is called outside the guard,
 * so the channel is lost to the one failure the comment names.
 *
 * It does not heal, either. The bad record stays on disk, so every reload
 * finds it again until the viewer clears their site data.
 */
describe('TELLY-SEC-03 · a cache record of the wrong shape', () => {
  const storeHolding = (entry: unknown): PoolStore => ({
    read: () => Promise.resolve(entry as StoredPool),
    write: () => Promise.resolve(),
  })

  const countingSource = () => {
    let loads = 0
    return { loads: () => loads, load: () => { loads += 1; return Promise.resolve(emptyPool) } }
  }

  it('characterises the channel being lost to a corrupt record today', async () => {
    const inner = countingSource()
    const corrupt = { savedAt: Date.now(), videos: [], channels: {} }

    await expect(new CachedPoolSource(inner, storeHolding(corrupt)).load()).rejects.toThrow(
      /channels\.map is not a function/,
    )
    // The live source was never asked — the fallback the comment promises.
    expect(inner.loads()).toBe(0)
  })

  it('is already correct when the read itself throws', async () => {
    const inner = countingSource()
    const throwing: PoolStore = {
      read: () => Promise.reject(new Error('object store gone')),
      write: () => Promise.resolve(),
    }
    await expect(new CachedPoolSource(inner, throwing).load()).resolves.toBeDefined()
    expect(inner.loads()).toBe(1)
  })

  it.skip('DISABLED_ a record of the wrong shape is a cache miss like any other', async () => {
    const inner = countingSource()
    const corrupt = { savedAt: Date.now(), videos: [], channels: {} }

    await expect(new CachedPoolSource(inner, storeHolding(corrupt)).load()).resolves.toBeDefined()
    expect(inner.loads()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-04 — CWE-835 · A06 · pagination with no upper bound
// ---------------------------------------------------------------------------

/**
 * `#listSubscriptions` follows `nextPageToken` in a `do..while` with no cap and
 * no memory of the tokens it has already seen. A response that always offers
 * another page is followed for ever: the tab hangs and the day's quota goes.
 *
 * Google is not the attacker here. `baseUrl` is documented as an override "for
 * a proxy deployment", and it is that proxy — or a Google-side paging bug —
 * that this has no defence against. The point of a bound is that it does not
 * depend on the other end behaving.
 */
describe('TELLY-SEC-04 · following nextPageToken', () => {
  /** A subscriptions page that always claims there is another. */
  const endlessPages = (ceiling: number) => {
    let calls = 0
    return {
      calls: () => calls,
      fetch: () => {
        calls += 1
        if (calls > ceiling) return Promise.reject(new Error('harness ceiling'))
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [], nextPageToken: 'always-one-more' }),
        })
      },
    }
  }

  it('characterises the unbounded loop today', async () => {
    const CEILING = 300
    const endless = endlessPages(CEILING)
    await new YouTubePoolSource({ fetch: endless.fetch, tokens: someTokens }).load().catch(() => {})

    // Only the test's own ceiling stopped it. The source imposed nothing.
    expect(endless.calls()).toBeGreaterThan(CEILING)
  })

  it.skip('DISABLED_ the subscription list stops chasing a token that never ends', async () => {
    const CEILING = 300
    const endless = endlessPages(CEILING)
    await new YouTubePoolSource({ fetch: endless.fetch, tokens: someTokens }).load().catch(() => {})

    expect(endless.calls()).toBeLessThan(CEILING)
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-05 — CWE-1284 · A07 · an expiry that never arrives
// ---------------------------------------------------------------------------

/**
 * `TokenResponse.expires_in` is typed `number | string`, so the interface
 * already expects something other than a number — and then `Number()` takes it
 * unchecked. `Infinity` (or `1e999`, which overflows to it) puts the expiry
 * past every clock there will ever be, and `isSignedIn` answers true for ever.
 *
 * The silent renewal that the whole design rests on then never runs: the held
 * token dies on the hour as usual and every call after that is a 401 the app
 * has no reason to look for. Not a live exploit — this value comes from
 * Google over TLS — but the type says the authors expected worse than they
 * checked for, and the fix is a line.
 */
describe('TELLY-SEC-05 · the lifetime Google reports', () => {
  const gisReturning = (expires: unknown) => () =>
    Promise.resolve({
      accounts: {
        oauth2: {
          initTokenClient: (config: { callback: (response: unknown) => void }) => ({
            requestAccessToken: () =>
              config.callback({ access_token: 'tok-abc', expires_in: expires }),
          }),
        },
      },
    } as never)

  const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000

  const signedInTenYearsOn = async (expires: unknown): Promise<boolean> => {
    let clock = 0
    const provider = new GoogleTokenProvider('client-1', {
      loadGis: gisReturning(expires),
      now: () => clock,
    })
    await provider.signIn()
    clock += TEN_YEARS_MS
    return provider.isSignedIn
  }

  it('expires an ordinary hour-long token', async () => {
    expect(await signedInTenYearsOn(3600)).toBe(false)
  })

  it('characterises the token that never expires today', async () => {
    expect(await signedInTenYearsOn('Infinity')).toBe(true)
    expect(await signedInTenYearsOn('1e999')).toBe(true)
  })

  it.skip('DISABLED_ an overflowing expires_in does not mean a token that never expires', async () => {
    expect(await signedInTenYearsOn('Infinity')).toBe(false)
    expect(await signedInTenYearsOn('1e999')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-06 — CWE-1188/CWE-693 · A02 · nothing constrains what may execute
// ---------------------------------------------------------------------------

/**
 * The page pulls two scripts from Google into its own origin and holds an
 * access token in memory. Nothing declares which origins may execute there.
 *
 * A meta-tag policy is the only kind a static host can serve, and it cannot
 * carry `frame-ancestors`, `sandbox` or the reporting directives — browsers
 * drop those unless they arrive as a header. Everything the app actually needs
 * to constrain does work from a meta tag, so the absence is worth closing even
 * though the ceiling is real.
 */
describe('TELLY-SEC-06 · the delivered document', () => {
  const html = () => INDEX_HTML

  it('characterises the absent policy today', () => {
    expect(html()).not.toMatch(/http-equiv=["']Content-Security-Policy["']/i)
    expect(html()).not.toMatch(/name=["']referrer["']/i)
  })

  it.skip('DISABLED_ the document declares what may execute in it', () => {
    const csp = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(html())?.[0]
    expect(csp, 'no Content-Security-Policy meta tag').toBeDefined()

    // The two origins the app genuinely needs, and no others.
    expect(csp).toMatch(/script-src[^;"]*'self'/)
    expect(csp).toMatch(/script-src[^;"]*https:\/\/accounts\.google\.com/)
    expect(csp).toMatch(/script-src[^;"]*https:\/\/www\.youtube\.com/)
    expect(csp).toMatch(/object-src[^;"]*'none'/)
    expect(csp).toMatch(/base-uri[^;"]*'self'/)

    // Directives a meta-delivered policy cannot carry. Writing one here is not
    // a stricter policy, it is a directive the browser silently discards.
    expect(csp).not.toMatch(/frame-ancestors|sandbox|report-(uri|to)/)

    expect(html()).toMatch(/name=["']referrer["'][^>]+content=["']strict-origin-when-cross-origin["']/i)
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-07 — CWE-1321-adjacent · lookup tables reached by an untrusted key
// ---------------------------------------------------------------------------

/**
 * The genre tables are object literals indexed by a string that arrived over
 * the network. `TOPICS['__proto__']` is not a miss — it is `Object.prototype`,
 * which is truthy, so it becomes the best topic seen so far and then loses
 * every later comparison, because `2 > undefined` is false.
 *
 * A channel carrying it is classified as entertainment rather than as what it
 * is. YouTube writes `topicCategories`, not the creator, so this is hardening
 * rather than a live path — but the cache round-trips those strings through
 * storage, and the fix (`Object.hasOwn`, or a `Map`) costs nothing.
 */
describe('TELLY-SEC-07 · genre tables reached by an inherited key', () => {
  const channelWith = (topics: string[]) =>
    ({ id: 'UC1', title: 'A channel', topics }) as never

  it('characterises the suppression today', () => {
    expect(genreOf(channelWith(['Humour']), [])).toBe('comedy')
    // The same channel, with one inherited key in front of its real topic.
    expect(genreOf(channelWith(['__proto__', 'Humour']), [])).toBe('entertainment')
  })

  it.skip('DISABLED_ an inherited key is not a topic', () => {
    for (const poison of ['__proto__', 'constructor', 'toString', 'valueOf']) {
      expect(genreOf(channelWith([poison, 'Humour']), []), `${poison} shadowed the real topic`).toBe(
        'comedy',
      )
    }
  })
})

// ---------------------------------------------------------------------------
// TELLY-SEC-08 — CWE-1284 · A06 · a programme title with no length on it
// ---------------------------------------------------------------------------

/**
 * A video title is written by whoever uploaded the video, and the card puts it
 * up as the caption. Nothing between the two says how long a title may be, so
 * a channel the viewer subscribes to decides how much text goes into a single
 * SVG `<text>` run.
 *
 * `fitFontSize` is closed-form, so this is not a hang — it shrinks the type to
 * the 1px floor and hands the browser one very long run to lay out. The card
 * stops being a card. A cap is the fix, and a cap is what a caption wants
 * anyway: no continuity announcer ever read out two hundred thousand
 * characters.
 */
describe('TELLY-SEC-08 · how long a caption may be', () => {
  const cardWith = (message: string) =>
    buildTestCard({
      design: 'crosshatch',
      channelName: 'CHANNEL ONE',
      now: new Date(2026, 8, 12, 20, 15),
      message,
    } as never)

  const longestRun = (message: string): number =>
    Math.max(
      ...(cardWith(message).shapes as { text?: string }[])
        .filter((shape) => typeof shape.text === 'string')
        .map((shape) => shape.text!.length),
    )

  it('characterises the uncapped caption today', () => {
    expect(longestRun('X'.repeat(200_000))).toBe(200_000)
  })

  it('is unbothered by an ordinary title', () => {
    expect(longestRun('THE NINE O\'CLOCK NEWS')).toBeGreaterThan(0)
  })

  it.skip('DISABLED_ a caption is cut to something a card could hold', () => {
    expect(longestRun('X'.repeat(200_000))).toBeLessThanOrEqual(200)
  })
})

// ---------------------------------------------------------------------------
// Negative results — pinned, so nobody has to take them on trust twice
// ---------------------------------------------------------------------------

describe('checked and found sound', () => {
  /**
   * Catastrophic backtracking needs a quantifier nested inside another over the
   * same characters, or alternatives that can claim the same substring. The
   * ISO-8601 duration pattern has neither: each `\d+(?:\.\d+)?` is disambiguated
   * by a distinct mandatory trailing literal, so a failure backtracks that group
   * linearly and moves on. Measured rather than argued.
   */
  it('parses a pathological duration in linear time (CWE-1333: not vulnerable)', () => {
    const time = (input: string): number => {
      const started = performance.now()
      parseIso8601Duration(input)
      return performance.now() - started
    }

    const short = time(`P${'9'.repeat(1_000)}!`)
    const long = time(`P${'9'.repeat(50_000)}!`)

    // Fifty times the input, nothing like fifty times the work squared.
    expect(long).toBeLessThan(250)
    expect(time(`PT${'1.'.repeat(20_000)}X`)).toBeLessThan(250)
    expect(short).toBeLessThan(250)
  })

  /** An absurd duration is filtered by the packer's overrun rule, not trusted. */
  it('reads an absurd duration as a number rather than throwing', () => {
    expect(parseIso8601Duration('P9999999999Y')).toBeGreaterThan(0)
    expect(parseIso8601Duration('')).toBe(0)
    expect(parseIso8601Duration('not a duration')).toBe(0)
  })

  /** The token goes in a header. A URL ends up in history, referrers and logs. */
  it('never puts the access token in a request URL (CWE-598)', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = []
    const fetch = (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, headers: init.headers })
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ items: [] }) })
    }

    await new YouTubePoolSource({ fetch, tokens: someTokens }).load()

    expect(seen.length).toBeGreaterThan(0)
    for (const { url, headers } of seen) {
      expect(url).not.toContain('tok')
      expect(headers.Authorization).toBe('Bearer tok')
    }
  })

  /** No listener means no origin check to get wrong. */
  it('registers no window message listener for the cross-origin player', () => {
    const shipped = Object.entries(SOURCES).filter(([path]) => !/\.test\.tsx?$/.test(path))

    expect(shipped.length).toBeGreaterThan(50) // the glob found the app at all
    for (const [path, source] of shipped) {
      expect(source, `${path} listens for window messages`).not.toMatch(
        /addEventListener\(\s*['"]message['"]/,
      )
    }
  })
})
