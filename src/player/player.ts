import type { OnAir } from '../domain'

/**
 * The video player, behind an interface. jsdom has no YouTube IFrame API and no
 * test may ever fetch one, so this seam is the whole design: production gets
 * `YouTubeIframePlayer`, tests get `FakePlayer` and assert on the calls.
 *
 * It is deliberately dumb. It is told which video and how far in — it works
 * neither out for itself. The arithmetic belongs to `tune`, and the decision
 * about *when* to load belongs to the screen above.
 */

/** Why the picture went. Reported, never recovered from — see `onFault`. */
export interface PlayerFault {
  videoId: string
  /** The underlying player's own error code, kept for the log. */
  code: number
  reason: string
}

export interface Player {
  /** Show `videoId`, joined `offsetSec` seconds in. Always loads. */
  load(videoId: string, offsetSec: number): void
  stop(): void
  /** 0..1. Values outside the range are clamped. */
  setVolume(volume: number): void
  destroy(): void
  /**
   * Subscribe to faults — an embed blocked, a video gone. Returns an
   * unsubscribe, as `Clock.subscribe` does. Optional: a player that cannot
   * fault need not offer it, so the interface stays satisfiable by four
   * methods alone.
   */
  onFault?(listener: (fault: PlayerFault) => void): () => void
  /**
   * Whether there is actually a picture on screen right now. The channel shows
   * the test card until this says true, so a programme that fails in a way
   * nobody predicted still leaves a card up rather than a blank screen —
   * positive confirmation, not error detection.
   */
  onPicture?(listener: (hasPicture: boolean) => void): () => void
}

/** The one `OnAir` kind that has a picture: what the surface can show. */
export type ProgrammeOnAir = Extract<OnAir, { kind: 'programme' }>
