import { describe, expect, it } from 'vitest'
import { parseIso8601Duration } from '@/library/duration'

describe('parseIso8601Duration', () => {
  it('parses hours, minutes and seconds together', () => {
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723)
  })

  it('parses a seconds-only duration', () => {
    expect(parseIso8601Duration('PT45S')).toBe(45)
  })

  it('parses a minutes-only duration, which has no seconds component at all', () => {
    expect(parseIso8601Duration('PT2M')).toBe(120)
  })

  it('parses an hours-only duration', () => {
    expect(parseIso8601Duration('PT3H')).toBe(10800)
  })

  it('parses the degenerate P0D that live items report', () => {
    expect(parseIso8601Duration('P0D')).toBe(0)
  })

  it('parses days, which very long uploads and live streams use', () => {
    expect(parseIso8601Duration('P1DT2H')).toBe(93600)
  })

  it('parses weeks, the one component that never combines with the others', () => {
    expect(parseIso8601Duration('P2W')).toBe(1209600)
  })

  it('does not confuse the minutes designator with the months designator', () => {
    // P1M is one month; PT1M is one minute. The T is the only thing between them.
    expect(parseIso8601Duration('PT1M')).toBe(60)
    expect(parseIso8601Duration('P1M')).toBe(2592000)
  })

  it('parses fractional seconds by rounding down to whole seconds', () => {
    expect(parseIso8601Duration('PT1M30.5S')).toBe(90)
  })

  it('returns zero for a duration it cannot make sense of', () => {
    expect(parseIso8601Duration('')).toBe(0)
    expect(parseIso8601Duration('banana')).toBe(0)
    expect(parseIso8601Duration('PT')).toBe(0)
    expect(parseIso8601Duration('P')).toBe(0)
    expect(parseIso8601Duration('1H')).toBe(0)
  })
})
