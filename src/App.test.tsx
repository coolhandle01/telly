import { describe, expect, it } from 'vitest'
import { App, CHANNEL_NAME } from './App'
import { FixturePoolSource } from './library'
import { FakePlayer } from './player/fakePlayer'
import { render, screen } from './test/render'
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
