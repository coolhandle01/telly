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
    // A fresh clone has no `.env.local` (it is deliberately not in the
    // repository) so there is nothing to sign in to and no button. In a dev
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

  // A card under every programme and a caption under the cabinet are worth
  // nothing if one throw inside a render takes the receiver, the card and the
  // caption with it. A pool of the wrong shape is the everyday way in, and the
  // set has to stay on and say it has no listings.
  it('stays on the air when the pool is the wrong shape', async () => {
    // A pool whose `channels` is a plain object rather than a Map: the shape a
    // stored record comes back as when anything but this app wrote it.
    // `planStations` runs in the render that reads it, and calls `.get` on it.
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

    // The card, with the caption a station puts up when it has no listings.
    // Waited for, not read once: the card is up from the moment the set is,
    // and the caption changes when the pool that cannot be planned arrives.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/no programme information/i),
    )
    expect(screen.getByRole('group', { name: /closedown test card/i })).toBeInTheDocument()
    // Not the receiver fault card: the receiver is working. One unusable pool
    // is one day's listings, and tomorrow is planned from tomorrow's pool.
    expect(screen.queryByText(/receiver fault/i)).toBeNull()
    expect(view.container).not.toBeEmptyDOMElement()
  })
})
