import { describe, expect, it } from 'vitest'
import { LOCK, PULL_IN, deflection, drift, isLocked } from './deflection'

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
})
