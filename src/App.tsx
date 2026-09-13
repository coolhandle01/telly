import { useEffect, useMemo } from 'react'
import { SystemClock, type Clock } from './clock/clock'
import { OffsetClock, offsetFromQuery } from './clock/offsetClock'
import {
  createPoolSource,
  GoogleTokenProvider,
  isYouTubeConfigured,
  type PoolSource,
} from './library'
import { YouTubeIframePlayer, loadYouTubeIframeApi, type Player } from './player'
import { WebAudioSound, type Sound } from './audio/sound'
import { Channel } from './ui/Channel'

export const CHANNEL_NAME = 'CHANNEL ONE'

/** Where the set came from. Drawn in the corner opposite the paper. */
export const SOURCE_URL = 'https://github.com/coolhandle01/telly'

// Module-level so a re-render never swaps them out from under a subscription.
// None of these touches the machine until it is used: no audio context until
// the viewer asks for sound, no iframe API until a programme is on air.
const systemClock = new SystemClock()
const webAudioSound = new WebAudioSound(() => new AudioContext())

export interface AppProps {
  /** Overridable so a test can mount the whole app without a browser. */
  clock?: Clock
  sound?: Sound
  poolSource?: PoolSource
  player?: Player
}

/**
 * A build that reached a viewer without a client ID cannot show anyone their
 * own television, and no viewer can do anything about it — the ID is baked in
 * at build time, so its absence is a deployment that went out wrong.
 *
 * In development it is not a fault at all: it is how the app is meant to run
 * before anyone has a client ID, on the fixture pool, which is what makes it
 * possible to work on the set offline and in CI.
 */
const NO_CLIENT_ID = {
  code: 'Fault 01 \u00b7 no service configuration',
  detail: ['This receiver has not been', 'configured for a service.'],
} as const

export function App({ clock, sound = webAudioSound, poolSource, player }: AppProps = {}) {
  // `?at=03:14` runs the channel at that hour — still ticking, so programmes
  // end and junctions arrive as they would. It is how you look at closedown
  // without sitting up until half one in the morning.
  const shifted = useMemo(() => {
    if (clock) return clock
    const offset = offsetFromQuery(window.location.search, systemClock.now())
    return offset === 0 ? systemClock : new OffsetClock(systemClock, offset)
  }, [clock])

  const built = useMemo(() => {
    const host = document.createElement('div')
    return { player: new YouTubeIframePlayer(loadYouTubeIframeApi, host), playerHost: host }
  }, [])

  // With a client ID configured the channel can use your own subscriptions,
  // once you have signed in; without one it runs on the fixture pool and there
  // is nothing to sign in to.
  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID as string | undefined
  const tokens = useMemo(
    () => (isYouTubeConfigured(clientId) ? new GoogleTokenProvider(clientId!.trim()) : undefined),
    [clientId],
  )
  const defaultSource = useMemo(() => createPoolSource({ tokens }), [tokens])

  // Fetch Google's script now, not when the button is clicked: a popup must
  // be traceable to a user gesture, and that gesture does not survive the
  // round-trip. Failure is ignored here — sign-in reports it properly.
  useEffect(() => {
    void tokens?.prepare().catch(() => undefined)
  }, [tokens])

  return (
    <Channel
      channelName={CHANNEL_NAME}
      clock={shifted}
      poolSource={poolSource ?? defaultSource}
      player={player ?? built.player}
      playerHost={player ? undefined : built.playerHost}
      sound={sound}
      sourceUrl={SOURCE_URL}
      signIn={tokens ? () => tokens.signIn().then(() => undefined) : undefined}
      // A deployed build with no client ID is broken, and says so on the
      // screen. A dev build with none is running on fixtures, which is the
      // documented way to work on this without credentials.
      fault={tokens || import.meta.env.DEV ? undefined : NO_CLIENT_ID}
    />
  )
}
