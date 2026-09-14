import { describe, expect, it } from 'vitest'
import { App, CHANNEL_NAME } from './App'
import { FixturePoolSource } from './library'
import { FakePlayer } from './player/fakePlayer'
import { act, render, screen } from './test/render'
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

  // Every test above mounts the set and leaves it switched off, which is why a
  // crash reachable only after POWER went unseen. This one switches it on, and
  // takes no `clock` — the offset the link asks for is the point.
  it('stays on air when the link asks for a time the calendar cannot hold', async () => {
    const search = window.location.search
    window.history.replaceState({}, '', '/?at=275760-09-13')

    try {
      const { user } = render(
        <App sound={createFakeSound()} poolSource={new FixturePoolSource()} player={new FakePlayer()} />,
      )
      await user.click(screen.getByRole('button', { name: 'Power' }))
      // One tick of the real clock is all it takes: the offset is already at
      // the ceiling, so the next second is an Invalid Date.
      await act(async () => {
        await new Promise((resume) => setTimeout(resume, 1_100))
      })

      expect(screen.getByRole('region', { name: new RegExp(CHANNEL_NAME, 'i') })).toBeInTheDocument()
    } finally {
      window.history.replaceState({}, '', `/${search}`)
    }
  }, 15_000)
})
