import type { CSSProperties, ReactNode } from 'react'
import type { CrtPhase } from './useCrtPower'
import { isLocked, type Deflection } from './deflection'
import { isAsTransmitted, type Picture } from './picture'

export interface ScreenProps {
  /** Named for the channel, since this is the set's screen and not a card's. */
  label: string
  /** What the tube is doing. Drives the collapse and the warm-up. */
  phase?: CrtPhase
  /** What the deflection oscillators are doing. Omit for a picture that holds. */
  deflection?: Deflection
  /** How the set is showing it. Omit for the picture as transmitted. */
  picture?: Picture
  /**
   * The set's own character generator: `CH 3`, `VOL`.
   *
   * Not part of what is being received, so it goes in above the snow. The
   * numbers are made inside the cabinet and mixed in after the tuner, which is
   * why you can always read the volume: a set that hid its own display
   * whenever there was nothing to watch would hide it exactly when you were
   * most likely to be turning something.
   */
  overlay?: ReactNode
  children: ReactNode
}

/**
 * The glass. A 4:3 surface with black behind it, and whatever is on air drawn
 * over that: a card, a picture, a caption.
 *
 * It belongs to the television, not to any one thing shown on it, which is
 * why it is here and not inside the card.
 *
 * Three nested layers, because they are three different circuits and each may
 * be doing something at once: the tube carries the power phases, the raster
 * carries the frame oscillator, and the line layer carries the line
 * oscillator. Stacking them keeps each one's transform its own: a single
 * element cannot be collapsing, rolling and tearing at the same time.
 *
 * The set's own on-screen display sits outside all three, in `overlay`. It is
 * generated in the cabinet rather than received, so nothing the tuner does
 * reaches it.
 */
export function Screen({
  label,
  phase = 'on',
  deflection,
  picture,
  overlay,
  children,
}: ScreenProps) {
  const holding = !deflection || isLocked(deflection)
  const asTransmitted = !picture || isAsTransmitted(picture)

  const style = {
    ...(deflection && {
      '--roll-period': deflection.rollPeriodSec ? `${deflection.rollPeriodSec}s` : undefined,
      '--roll-dir': deflection.rollDirection,
      '--shear': `${deflection.shearDeg}deg`,
      '--slip-period': deflection.slipPeriodSec ? `${deflection.slipPeriodSec}s` : undefined,
    }),
    ...(picture && {
      '--gain': picture.gain,
      '--lift': picture.lift,
      '--saturation': picture.saturation,
      '--snow': picture.snow,
    }),
  } as CSSProperties

  return (
    <div
      className="screen"
      data-phase={phase}
      data-hold={holding ? 'locked' : 'lost'}
      data-picture={asTransmitted ? 'as-transmitted' : 'adjusted'}
      style={style}
      role="region"
      aria-label={label}
    >
      {/*
        Everything the beam draws lives in the tube, including the snow, which
        is drawn by the same beam as the picture and so dies with it. Hung
        outside, it stayed at full size while the raster collapsed underneath
        it and then vanished, which is what an overlay does and not what a
        television does.
      */}
      <div className="screen__tube">
        <div className="screen__raster" data-rolling={deflection?.rollPeriodSec ? 'true' : 'false'}>
          <div className="screen__line" data-tearing={deflection?.slipPeriodSec ? 'true' : 'false'}>
            {children}
          </div>
        </div>
        {/*
          Laid over the picture, not mixed into it: a brightness control sets
          the black level, so turning it up stops the blacks being black rather
          than making a bright picture brighter.
        */}
        <span className="screen__lift" aria-hidden="true" />
        {/*
          Snow. Off station there is no signal to show, only the noise that was
          always there underneath one.
        */}
        <span className="screen__snow" data-snowing={picture?.snow ? 'true' : 'false'} aria-hidden="true" />
        {/*
          The set talking about itself, over the top of whatever it is
          receiving, or not receiving. Inside the tube, so it dies with the
          picture when the power goes; above the snow, because the tuner has
          nothing to do with it.
        */}
        {overlay ? <div className="screen__osd">{overlay}</div> : null}
      </div>
      {/*
        The spot. When the power goes the deflection dies faster than the beam
        does, so the raster collapses to a line and then to a point, which
        lingers on stored EHT and fading phosphor before it goes.
      */}
      <span className="screen__spot" aria-hidden="true" />
    </div>
  )
}
