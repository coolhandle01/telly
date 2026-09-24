import { useEffect, useMemo } from 'react'
import { SystemClock, type Clock } from './clock/clock'
import {
  createPoolSource,
  googleSession,
  GoogleTokenProvider,
  isYouTubeConfigured,
  type PoolSource,
} from './library'
import { YouTubeIframePlayer, loadYouTubeIframeApi, type Player } from './player'
import { WebAudioSound, type Sound } from './audio/sound'
import { Channel } from './ui/Channel'
import { FaultBoundary } from './ui/FaultBoundary'

export const CHANNEL_NAME = 'CHANNEL ONE'

/** Where the set came from. Drawn in the corner opposite the paper. */
export const SOURCE_URL = 'https://github.com/coolhandle01/telly'

// Module-level so a re-render never swaps them out from under a subscription.
// None of these touches the machine until it is used: no audio context until
// the viewer asks for sound, no iframe API until a programme is on air.
const systemClock = new SystemClock()
const webAudioSound = new WebAudioSound(() => new AudioContext())

export interface AppProps {
  /**
   * Where "now" comes from. The set runs on the wall clock; a test hands it a
   * `FakeClock` and drives the whole broadcast day by hand, which is how any
   * hour is looked at without sitting up for it.
   */
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

export function App({
  clock = systemClock,
  sound = webAudioSound,
  poolSource,
  player,
}: AppProps = {}) {
  const built = useMemo(() => {
    const host = document.createElement('div')
    return { player: new YouTubeIframePlayer(loadYouTubeIframeApi, host), playerHost: host }
  }, [])

  // With a client ID configured the channel can use your own subscriptions,
  // once you have signed in; without one it runs on the fixture pool and there
  // is nothing to sign in to.
  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID as string | undefined
  const tokens = useMemo(
    () =>
      isYouTubeConfigured(clientId)
        ? new GoogleTokenProvider(clientId!.trim(), {
            // Every way a page load can stay signed out ends at the same
            // sign-in button, so the reason is lost at the moment it is
            // known. A development build puts it in the console, where
            // somebody working on this can read it. A deployed build is
            // given nothing and reports nothing.
            diagnose: import.meta.env.DEV
              ? (event, detail) => console.info(`[telly] ${event}${detail ? `: ${detail}` : ''}`)
              : undefined,
          })
        : undefined,
    [clientId],
  )
  const defaultSource = useMemo(() => createPoolSource({ tokens }), [tokens])

  // Signing out is both halves at once: the grant goes back to Google and the
  // copy of the subscriptions goes out of this browser's database.
  const session = useMemo(
    () => (tokens ? googleSession(tokens, defaultSource) : undefined),
    [tokens, defaultSource],
  )

  // Fetch Google's script now, not when the button is clicked: a popup must
  // be traceable to a user gesture, and that gesture does not survive the
  // round-trip. Failure is ignored here — sign-in reports it properly.
  useEffect(() => {
    void tokens?.prepare().catch(() => undefined)
  }, [tokens])

  return (
    // A card under every programme, and a card under the receiver itself.
    <FaultBoundary channelName={CHANNEL_NAME} clock={clock}>
      <Channel
        channelName={CHANNEL_NAME}
        clock={clock}
        poolSource={poolSource ?? defaultSource}
        player={player ?? built.player}
        playerHost={player ? undefined : built.playerHost}
        sound={sound}
        sourceUrl={SOURCE_URL}
        session={session}
        // A deployed build with no client ID is broken, and says so on the
        // screen. A dev build with none is running on fixtures, which is the
        // documented way to work on this without credentials.
        fault={tokens || import.meta.env.DEV ? undefined : NO_CLIENT_ID}
      />
    </FaultBoundary>
  )
}
