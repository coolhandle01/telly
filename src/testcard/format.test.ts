import { describe, expect, it } from 'vitest'
import { formatCardDate, formatClockTime, formatResumeMessage } from './format'

describe('formatCardDate', () => {
  it('renders the injected date as an upper-case broadcast date line', () => {
    expect(formatCardDate(new Date(2026, 8, 9, 1, 30))).toBe('WEDNESDAY 9 SEPTEMBER 2026')
  })

  it('does not pad the day of the month', () => {
    expect(formatCardDate(new Date(2026, 0, 1, 12, 0))).toBe('THURSDAY 1 JANUARY 2026')
  })
})

describe('formatClockTime', () => {
  it('renders hours, minutes and seconds zero-padded and dot separated', () => {
    expect(formatClockTime(new Date(2026, 8, 9, 1, 30, 5))).toBe('01.30.05')
  })

  it('renders midnight as 00.00.00 rather than 24.00.00', () => {
    expect(formatClockTime(new Date(2026, 8, 9, 0, 0, 0))).toBe('00.00.00')
  })
})

describe('formatResumeMessage', () => {
  it('names the injected resume time to the minute', () => {
    expect(formatResumeMessage(new Date(2026, 8, 9, 6, 0))).toBe(
      'NORMAL SERVICE WILL RESUME AT 06.00',
    )
  })
})
