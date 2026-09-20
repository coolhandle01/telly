import { useEffect, useRef, type CSSProperties } from 'react'
import type { Player, PlayerFault, ProgrammeOnAir } from './player'

export interface PlayerSurfaceProps {
  /** What is on air. Already tuned: the offset arrives computed. */
  onAir: ProgrammeOnAir
  /** Injected, never constructed here: jsdom has no iframe API to construct. */
  player: Player
  /**
   * The element the player draws into, adopted into the stage so the shim
   * lands on top of it. Omit it and the surface is just the frame and shim.
   */
  host?: HTMLElement
  /** 0..1. Left alone entirely when absent. */
  volume?: number
  onFault?: (fault: PlayerFault) => void
  /** True once there is genuinely a picture. The card stays up until then. */
  onPicture?: (hasPicture: boolean) => void
}

const stageStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  overflow: 'hidden',
  background: '#000',
}

const frameStyle: CSSProperties = { position: 'absolute', inset: 0 }

/**
 * Transparent, on top, and inert to assistive technology: it exists only to
 * eat stray clicks before they reach YouTube's own chrome. It takes no focus,
 * so the page's real controls keep their place in the tab order.
 */
const shimStyle: CSSProperties = { ...frameStyle, background: 'transparent' }

export function PlayerSurface({ onAir, player, host, volume, onFault, onPicture }: PlayerSurfaceProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  const onFaultRef = useRef(onFault)
  const onPictureRef = useRef(onPicture)

  const { videoId, title, offsetSec } = onAir
  const endsAt = onAir.endsAt.getTime()

  useEffect(() => {
    if (!host) return
    // The host must fill the frame itself. The player mounts an iframe *inside*
    // it, and an iframe sized 100% against a host of indefinite height
    // collapses to a postage stamp in the corner of the screen.
    host.style.position = 'absolute'
    host.style.inset = '0'
    frameRef.current?.append(host)
    return () => host.remove()
  }, [host])

  // Retuning: a new programme loads, the same one does not. `offsetSec` is
  // deliberately absent from the dependencies: it moves every second, and
  // reloading on it would restart the video on every tick. The effect closes
  // over the offset from the render that brought the new programme in, which
  // is exactly the instant we are joining it at.
  useEffect(() => {
    player.load(videoId, offsetSec)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [player, videoId, endsAt])

  useEffect(() => {
    if (volume === undefined) return
    player.setVolume(volume)
  }, [player, volume])

  useEffect(() => {
    onFaultRef.current = onFault
    onPictureRef.current = onPicture
  })

  // Reported upwards; recovery is the screen's business, not the player's.
  useEffect(() => player.onFault?.((fault) => onFaultRef.current?.(fault)), [player])

  useEffect(() => player.onPicture?.((has) => onPictureRef.current?.(has)), [player])

  // The picture never outlives the screen.
  useEffect(() => () => player.stop(), [player])

  return (
    <section aria-label={title} style={stageStyle}>
      <div ref={frameRef} style={frameStyle} />
      <div data-testid="player-shim" aria-hidden="true" style={shimStyle} />
    </section>
  )
}
