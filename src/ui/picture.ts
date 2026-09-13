/**
 * What the picture controls do.
 *
 * Where V and H are oscillators that either lock or do not, these three are
 * continuous adjustments with no right answer the set can find for itself —
 * which is why they were on the front of the cabinet and the hold controls
 * were behind the flap. Mid-travel is "as transmitted", and every other
 * setting is a preference, or a mistake, rather than a fault.
 *
 * Tuning is the exception and sits here anyway: a tuner *does* lock, over a
 * band, and what it loses first is not the picture.
 */

import { CENTRE, bandDrift, clamp01 } from './trim'

export { CENTRE }

/**
 * How far either side of station the tuner still holds. Same idea as the hold
 * controls' pull-in band, and the same reason: a control that only worked at
 * one exact point could not be set by hand.
 */
export const STATION = 0.07

/** Beam turned right down. Not quite black — a CRT still glows. */
const MIN_GAIN = 0.12
/** Beam turned right up: the blacks go this far towards white. */
const MAX_LIFT = 0.42
/** Colour turned right up. Twice as saturated as transmitted. */
const MAX_SATURATION = 2
/** Snow over the picture with the tuner right off station. */
const MAX_SNOW = 0.85

/**
 * How far past the edge of the band the noise swamps the picture entirely.
 *
 * Three times the colour's, so the ordering holds: chroma first, picture much
 * later. And short in absolute terms, because that is how a tuner behaves — a
 * station holds over a band and then goes, rather than fading away across the
 * rest of the dial. Spread over the whole travel instead, a preset set a fifth
 * of a turn out comes up as a faintly speckled picture, when what it actually
 * gives you is snow.
 */
const SNOW_FULL_AT = 0.16

/**
 * How far past the edge of the band the colour has gone entirely.
 *
 * The chroma subcarrier sits at the top of the channel and is the first thing
 * a mistuned set loses: the picture is still perfectly watchable in black and
 * white long after the colour has given up, which is the detail that makes
 * this read as tuning rather than as a broken saturation slider.
 */
const COLOUR_LOST_AT = 0.05

export interface Picture {
  /** Multiplies the picture: a beam turned down crushes the shadows. */
  gain: number
  /** White laid over it: a beam turned up greys the blacks out. */
  lift: number
  /** 1 is as transmitted, 0 is monochrome. */
  saturation: number
  /** Snow over the picture when the tuner is off station. */
  snow: number
}

/**
 * How far off station the tuner is: 0 anywhere it holds, 1 at the far stop.
 *
 * `stationAt` is where this preset's carrier actually sits. A preset was tuned
 * once, by hand, by whoever installed the set — and the ones nobody watched
 * were tuned carelessly, so finding them again means turning the knob.
 */
export const offStation = (tuning: number, stationAt: number = CENTRE): number =>
  bandDrift(tuning, STATION, stationAt)

export function picture(
  brightness: number,
  colour: number,
  tuning: number,
  stationAt: number = CENTRE,
): Picture {
  const b = clamp01(brightness)
  // How far past the edge of the band the tuner is, in travel. Nothing until
  // the lock breaks, and then both losses are measured from there.
  const past =
    offStation(tuning, stationAt) === 0
      ? 0
      : Math.abs(clamp01(tuning) - clamp01(stationAt)) - STATION

  // Two different things either side of centre, because a brightness control
  // sets the black level rather than a gain: turned down the shadows crush
  // into black, turned up the blacks stop being black at all. Multiplying for
  // both would make a bright picture merely brighter, which is not the fault.
  const below = Math.max(0, CENTRE - b) / CENTRE
  const above = Math.max(0, b - CENTRE) / CENTRE

  return {
    gain: 1 - below * (1 - MIN_GAIN),
    lift: above * MAX_LIFT,
    // Colour is what the tuner loses first, and it takes the colour control
    // with it: no subcarrier, no colour to turn up.
    saturation: clamp01(colour) * MAX_SATURATION * (1 - Math.min(1, past / COLOUR_LOST_AT)),
    snow: Math.min(1, past / SNOW_FULL_AT) * MAX_SNOW,
  }
}

/**
 * A preset with nothing on it.
 *
 * Not the same thing as a station transmitting a test card, which is what this
 * used to show: a card means somebody is on the air with nothing to broadcast.
 * An empty preset means there is no carrier at all, and a set given no carrier
 * shows the noise that was always underneath one — full snow, no colour in it,
 * and no adjustment on the front of the cabinet that can bring a picture out.
 */
export const NO_SIGNAL: Picture = { gain: 1, lift: 0, saturation: 0, snow: 1 }

/** True when every control is where the picture is as transmitted. */
export const isAsTransmitted = (shown: Picture): boolean =>
  shown.gain === 1 && shown.lift === 0 && shown.saturation === 1 && shown.snow === 0
