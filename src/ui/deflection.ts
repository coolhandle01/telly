/**
 * What the hold controls actually do.
 *
 * Vertical and horizontal hold set the free-running frequency of the two
 * deflection oscillators. Set correctly, each runs close enough to the sync
 * pulses in the signal to be pulled into step with them, and the picture
 * stands still. Set wrongly, the oscillator free-runs at the wrong rate and
 * the picture walks: vertically it rolls, horizontally it tears into diagonal
 * bands as each line starts a little before or after the last.
 *
 * Both controls are therefore the same idea twice, at two different speeds,
 * which is why one function describes both.
 */

import { CENTRE, bandDrift, clamp01 } from './trim'

/** Mid-travel: where the engineer left it, and where it locks. */
export const LOCK = CENTRE

/**
 * How far either side of lock still holds. An oscillator pulls in over a
 * *band*, not at a point, which is the whole reason a hold control can be
 * found by hand rather than only by instrument.
 */
export const PULL_IN = 0.09

/** Slowest visible roll: a picture creeping up the screen. */
const SLOWEST_ROLL_SEC = 2.6
/** Fastest: frames faster than the eye resolves them. */
const FASTEST_ROLL_SEC = 0.09

/** Line-rate slip is faster than frame-rate roll, because the line rate is. */
const SLOWEST_SLIP_SEC = 0.9
const FASTEST_SLIP_SEC = 0.055

/** Shear across the picture when the line oscillator is at its worst. */
const MAX_SHEAR_DEG = 26

export interface Deflection {
  /** Seconds for the picture to travel its own height. Absent when locked. */
  rollPeriodSec?: number
  /** 1 rolls the picture up the screen, -1 rolls it down. */
  rollDirection: 1 | -1
  /** Shear across the picture, in degrees. Zero when locked. */
  shearDeg: number
  /** Seconds per sideways slip. Absent when locked. */
  slipPeriodSec?: number
}

/**
 * How far out of lock a control is: 0 anywhere inside the pull-in band,
 * rising to 1 at either stop.
 */
export const drift = (value: number): number => bandDrift(value, PULL_IN)

/**
 * Geometric rather than linear, because these are frequencies. A linear ramp
 * spends most of its travel in a blur; on a geometric one the slow creep just
 * off lock occupies as much of the control as the fast end does, which is what
 * makes the set findable by hand.
 */
const period = (slowest: number, fastest: number, amount: number): number =>
  slowest * (fastest / slowest) ** clamp01(amount)

export function deflection(vertical: number, horizontal: number): Deflection {
  const rolling = drift(vertical)
  const tearing = drift(horizontal)

  return {
    // Too fast an oscillator takes the next frame early, so the picture is
    // carried upward; too slow and it falls down the screen.
    rollDirection: vertical > LOCK ? 1 : -1,
    rollPeriodSec: rolling === 0 ? undefined : period(SLOWEST_ROLL_SEC, FASTEST_ROLL_SEC, rolling),
    shearDeg: tearing === 0 ? 0 : (horizontal > LOCK ? 1 : -1) * tearing * MAX_SHEAR_DEG,
    slipPeriodSec: tearing === 0 ? undefined : period(SLOWEST_SLIP_SEC, FASTEST_SLIP_SEC, tearing),
  }
}

/** True when both oscillators are in step and the picture is standing still. */
export const isLocked = (deflection: Deflection): boolean =>
  deflection.rollPeriodSec === undefined && deflection.slipPeriodSec === undefined
