import { describe, expect, it } from 'vitest'
import {
  SECONDS_PER_DAY,
  atClock,
  broadcastDayLength,
  broadcastDayStart,
  secondsIntoDay,
} from '@/domain/time'

/*
  The broadcast day's own arithmetic, at L0. The clocks-change tests cover the
  two days a year the length is not 24 hours; this covers every other day, in
  every zone the suite runs in.
*/

describe('atClock', () => {
  it('puts 06.00 at the start of the day', () => {
    expect(atClock(6)).toBe(0)
  })

  it('counts minutes past the anchor', () => {
    expect(atClock(9, 15)).toBe(195)
  })

  it('puts the small hours at the end of the day, not before its start', () => {
    expect(atClock(0)).toBe(18 * 60)
    expect(atClock(5, 59)).toBe(24 * 60 - 1)
  })
})

describe('broadcastDayStart', () => {
  it('is this morning at 06.00 in the afternoon', () => {
    expect(broadcastDayStart(new Date(2026, 8, 9, 14, 32, 7))).toEqual(new Date(2026, 8, 9, 6, 0))
  })

  it('is this morning at 06.00 exactly', () => {
    expect(broadcastDayStart(new Date(2026, 8, 9, 6, 0))).toEqual(new Date(2026, 8, 9, 6, 0))
  })

  it('is yesterday morning in the small hours', () => {
    expect(broadcastDayStart(new Date(2026, 8, 9, 5, 59, 59))).toEqual(new Date(2026, 8, 8, 6, 0))
  })
})

describe('broadcastDayLength', () => {
  it('is 24 hours on a day the clocks do not change', () => {
    expect(broadcastDayLength(new Date(2026, 8, 9, 6, 0))).toBe(SECONDS_PER_DAY)
  })
})

describe('secondsIntoDay', () => {
  it('counts whole seconds, rounding down', () => {
    const start = new Date(2026, 8, 9, 6, 0)
    expect(secondsIntoDay(new Date(start.getTime() + 61_999), start)).toBe(61)
  })
})
