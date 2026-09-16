import { describe, expect, it } from 'vitest'
import { App, CHANNEL_NAME } from './App'
import { FixturePoolSource } from './library'
import type { PoolSource } from './library'
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

  // Nothing in the suite has ever rendered a throwing tree, so no test owns the
  // root's survival of one. There is no error boundary anywhere above Channel
  // (main.tsx:6), so a single render-time throw unmounts the whole root and
  // leaves an empty document — the failure mode this app's own philosophy (a
  // card under every programme, a caption under the cabinet) exists to prevent,
  // and the one a fault card cannot report because it has gone too.
  it('keeps something on the screen when a render throws', async () => {
    // A pool whose `channels` is a plain object rather than a Map: the shape a
    // stored record comes back as when anything but this app wrote it.
    // planStations runs in render (Channel.tsx:237) and calls .get on it.
    const misshapen: PoolSource = {
      load: async () => ({
        videos: [
          {
            id: 'v1',
            channelId: 'UC1',
            title: 'Programme',
            durationSec: 1800,
            publishedAt: '2026-09-01T00:00:00Z',
            ageRestricted: false,
            madeForKids: false,
            embeddable: true,
            isLive: false,
          },
        ],
        channels: {} as unknown as Map<string, never>,
      }),
    }
    const view = render(
      <App
        clock={new FakeClock(new Date(2026, 8, 9, 14, 32, 7))}
        sound={createFakeSound()}
        poolSource={misshapen}
        player={new FakePlayer()}
      />,
    )

    await view.user.click(screen.getByRole('button', { name: 'Power' }))

    // A set that cannot provide a service says so on the screen, the same way
    // it does for every other fault.
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /closedown test card/i })).toBeInTheDocument(),
    )
    expect(screen.getByText(/receiver fault/i)).toBeInTheDocument()
    expect(view.container).not.toBeEmptyDOMElement()
  })
})
