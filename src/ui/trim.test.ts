import { describe, expect, it } from 'vitest'
import { CENTRE, bandDrift } from './trim'

describe('bandDrift', () => {
  it('is nothing at mid-travel', () => {
    expect(bandDrift(CENTRE, 0.09)).toBe(0)
  })

  it('is exactly nothing on the edge of the band, at any width', () => {
    // Regression, and a subtle one: 0.5 + 0.07 is 0.07000000000000006 away
    // from 0.5, so the naive comparison falls straight through the band and
    // reports a drift of 1.3e-16. That is zero to any eye and to any real
    // circuit, but not to `=== 0` — so a set with its tuner parked exactly on
    // the mark would insist it had lost the station.
    for (const band of [0.05, 0.07, 0.09, 0.11, 0.23]) {
      expect(bandDrift(CENTRE + band, band), `+${band}`).toBe(0)
      expect(bandDrift(CENTRE - band, band), `-${band}`).toBe(0)
    }
  })

  it('reaches the full amount at either stop', () => {
    expect(bandDrift(1, 0.09)).toBe(1)
    expect(bandDrift(0, 0.09)).toBe(1)
  })

  it('never exceeds it, however far past the stop it is asked about', () => {
    expect(bandDrift(4, 0.09)).toBe(1)
    expect(bandDrift(-4, 0.09)).toBe(1)
  })

  it('grows with the distance out of the band', () => {
    expect(bandDrift(0.75, 0.09)).toBeGreaterThan(bandDrift(0.65, 0.09))
  })

  it('is symmetrical about mid-travel', () => {
    expect(bandDrift(CENTRE + 0.3, 0.09)).toBe(bandDrift(CENTRE - 0.3, 0.09))
  })
})
