import { describe, expect, it, vi } from 'vitest'
import indexHtml from '../index.html?raw'
import { App, CHANNEL_NAME } from './App'
import { FixturePoolSource } from './library'
import { FakePlayer } from './player/fakePlayer'
import { render, screen, waitFor } from './test/render'
import { FakeClock } from './test/fakeClock'
import { createFakeSound } from './test/fakeAudio'

describe('App', () => {
  it('runs on the fixture pool in development, with no fuss about it', () => {
    // A fresh clone has no `.env.local` — it is deliberately not in the
    // repository — so there is nothing to sign in to and no button. In a dev
    // build that is not a fault, it is the documented way to work on the set
    // without credentials, and the viewer should see television.
    render(<App />)

    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull()
    expect(screen.queryByText(/service configuration/i)).toBeNull()
  })


  const mount = () =>
    render(
      <App
        clock={new FakeClock(new Date(2026, 8, 9, 14, 32, 7))}
        sound={createFakeSound()}
        poolSource={new FixturePoolSource()}
        player={new FakePlayer()}
      />,
    )

  it('mounts the channel, switched off', () => {
    mount()
    expect(screen.getByRole('region', { name: new RegExp(CHANNEL_NAME, 'i') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Power' })).toBeInTheDocument()
  })

  it('builds no audio context and fetches no iframe API on mount', () => {
    mount()
    expect(document.querySelector('script[src*="youtube.com"]')).toBeNull()
  })
})

/*
  Every test above mounts the set and leaves it switched off, which is why a
  crash reachable only *after* POWER went unseen. Switching it on is where the
  pool is fetched, the day is planned and the card is drawn — nearly all of
  the app — so these press the button.
*/
describe('App, switched on', () => {
  /** Switch on at an address, and report the tree that is left standing. */
  const switchOnAt = async (search: string): Promise<string> => {
    window.history.replaceState({}, '', search)
    // React logs an unhandled render error; the assertion is the DOM, not the log.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('shows television', async () => {
    expect((await switchOnAt('/')).length).toBeGreaterThan(10_000)
  })

  it('shows television at an hour asked for by ?at=', async () => {
    expect((await switchOnAt('/?at=03:14')).length).toBeGreaterThan(10_000)
  })

  /*
    The repro, kept. A link needs no crafting to speak of: `-271821-…` has no
    character needing escape, so it survives being pasted into a chat window.
    It parses, the offset it implies puts the clock a tick past the end of
    time, and the NaN that follows used to throw during render — which React
    answers by unmounting the tree, so what arrived was a white page.
  */
  it('shows television at an instant no schedule could reach', async () => {
    expect((await switchOnAt('/?at=-271821-04-20T00:00:00.000Z')).length).toBeGreaterThan(10_000)
    const maxDate = encodeURIComponent('+275760-09-13T00:00:00.000Z')
    expect((await switchOnAt(`/?at=${maxDate}`)).length).toBeGreaterThan(10_000)
  })

  /*
    And the class rather than the input, because the next throw will not be
    this one. A clock reporting an instant nothing can do arithmetic on is the
    same cascade, reached without the query string.
  */
  it('puts a caption up rather than going blank when the set throws', async () => {
    const stopped = { now: () => new Date(Number.NaN), subscribe: () => () => {} }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container, user } = render(
      <App
        clock={stopped}
        sound={createFakeSound()}
        poolSource={new FixturePoolSource()}
        player={new FakePlayer()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Power' }))
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull())
    quiet.mockRestore()

    // The card puts every line in capitals, as it does for Fault 01.
    expect(container.textContent).toContain('SERVICE FAULT')
    expect(container.textContent).toContain('FAULT 02')
  })
})

/*
  The document that delivers the app. It pulls two scripts from Google into
  its own origin and holds an access token in memory, so which origins may
  execute here is part of what ships.

  Why these directives and not others, and what a meta tag cannot carry, is in
  docs/architecture/threat-model.md.
*/
describe('the delivered document', () => {
  it('declares what may execute in it', () => {
    const csp = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i.exec(indexHtml)?.[0]
    expect(csp, 'no Content-Security-Policy meta tag').toBeDefined()

    expect(csp).toMatch(/script-src[^;"]*'self'/)
    expect(csp).toMatch(/script-src[^;"]*https:\/\/accounts\.google\.com/)
    expect(csp).toMatch(/script-src[^;"]*https:\/\/www\.youtube\.com/)
    expect(csp).toMatch(/object-src[^;"]*'none'/)
    expect(csp).toMatch(/base-uri[^;"]*'self'/)

    // Directives a meta-delivered policy cannot carry. Writing one is not a
    // stricter policy, it is a line the browser silently discards.
    expect(csp).not.toMatch(/frame-ancestors|sandbox|report-(uri|to)/)

    expect(indexHtml).toMatch(
      /name=["']referrer["'][^>]+content=["']strict-origin-when-cross-origin["']/i,
    )
  })
})
