import { describe, expect, it } from 'vitest'
import { LOCK, PULL_IN, deflection, drift, isLocked } from '@/ui/deflection'

describe('drift', () => {
  it('is nothing at all at mid-travel', () => {
    expect(drift(LOCK)).toBe(0)
  })

  it('is nothing anywhere inside the pull-in band', () => {
    // The band is the point: a control that only locks at one exact value
    // could not be set by hand.
    expect(drift(LOCK + PULL_IN)).toBe(0)
    expect(drift(LOCK - PULL_IN)).toBe(0)
  })

  it('reaches the full amount at either stop', () => {
    expect(drift(1)).toBeCloseTo(1)
    expect(drift(0)).toBeCloseTo(1)
  })

  it('grows as the control is turned further out', () => {
    const near = drift(LOCK + PULL_IN + 0.05)
    const far = drift(LOCK + PULL_IN + 0.2)
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
  })

  it('is symmetrical about lock', () => {
    expect(drift(LOCK + 0.3)).toBeCloseTo(drift(LOCK - 0.3))
  })
})

describe('deflection', () => {
  it('stands the picture still when both controls are set', () => {
    const still = deflection(LOCK, LOCK)

    expect(isLocked(still)).toBe(true)
    expect(still.rollPeriodSec).toBeUndefined()
    expect(still.slipPeriodSec).toBeUndefined()
    expect(still.shearDeg).toBe(0)
  })

  it('rolls the picture up when the frame oscillator runs fast', () => {
    expect(deflection(0.95, LOCK).rollDirection).toBe(1)
  })

  it('rolls it down the screen when the oscillator runs slow', () => {
    expect(deflection(0.05, LOCK).rollDirection).toBe(-1)
  })

  it('rolls faster the further the control is from lock', () => {
    const creeping = deflection(LOCK + PULL_IN + 0.05, LOCK).rollPeriodSec
    const racing = deflection(1, LOCK).rollPeriodSec

    // A shorter period is a faster roll.
    expect(racing).toBeLessThan(creeping as number)
  })

  it('tears the picture into a shear, in the direction it was turned', () => {
    expect(deflection(LOCK, 1).shearDeg).toBeGreaterThan(0)
    expect(deflection(LOCK, 0).shearDeg).toBeLessThan(0)
  })

  it('slips sideways faster than it rolls, because the line rate is faster', () => {
    const out = deflection(1, 1)

    expect(out.slipPeriodSec).toBeLessThan(out.rollPeriodSec as number)
  })

  it('keeps the two oscillators independent', () => {
    // Losing the frame lock must not tear the lines, and vice versa: they are
    // separate circuits and a viewer diagnoses them separately.
    const rollingOnly = deflection(1, LOCK)
    expect(rollingOnly.shearDeg).toBe(0)
    expect(rollingOnly.slipPeriodSec).toBeUndefined()

    const tearingOnly = deflection(LOCK, 1)
    expect(tearingOnly.rollPeriodSec).toBeUndefined()
  })

  // At the stop each oscillator is at its worst: a roll every 0.09 s, a slip
  // every 0.055 s, and 26 degrees of shear.
  it('runs each oscillator at its fastest at the stop', () => {
    const worst = deflection(1, 1)

    expect(worst.rollPeriodSec).toBeCloseTo(0.09, 6)
    expect(worst.slipPeriodSec).toBeCloseTo(0.055, 6)
    expect(worst.shearDeg).toBeCloseTo(26, 6)
  })

  // Halfway out, the period is the geometric mean of its slowest and fastest,
  // not the average: the slow creep takes as much of the knob as the blur.
  it('speeds up geometrically, and shears in proportion, on the way out', () => {
    const halfway = LOCK + PULL_IN + 0.5 * (0.5 - PULL_IN)
    const half = deflection(halfway, halfway)

    expect(drift(halfway)).toBeCloseTo(0.5, 6)
    expect(half.rollPeriodSec).toBeCloseTo(Math.sqrt(2.6 * 0.09), 6)
    expect(half.slipPeriodSec).toBeCloseTo(Math.sqrt(0.9 * 0.055), 6)
    expect(half.shearDeg).toBeCloseTo(13, 6)
  })
})
