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

  it.each([
    // The everyday shape of a YouTube duration: two digits in each place.
    ['PT1H23M45S', 5025],
    ['PT12H34M56S', 45296],
    // Every component at once, each in two digits: 10 years, 11 months,
    // 12 weeks, 13 days, 14 hours, 15 minutes and 16 seconds.
    ['P10Y11M12W13DT14H15M16S', 352_304_116],
    ['PT1.5M', 90],
    ['PT1.5H', 5400],
    // YouTube sends no fractions, but they parse: two decimal places in every
    // component is 1.25 times one of each.
    ['P1.25Y1.25M1.25W1.25DT1.25H1.25M1.25S', 43_528_576],
  ])('parses %s as %i seconds', (iso, seconds) => {
    expect(parseIso8601Duration(iso)).toBe(seconds)
  })

  it('returns zero for a duration with anything before or after it', () => {
    expect(parseIso8601Duration('xPT1M')).toBe(0)
    expect(parseIso8601Duration('PT1Mx')).toBe(0)
  })

  it('returns zero for a duration it cannot make sense of', () => {
    expect(parseIso8601Duration('')).toBe(0)
    expect(parseIso8601Duration('banana')).toBe(0)
    expect(parseIso8601Duration('PT')).toBe(0)
    expect(parseIso8601Duration('P')).toBe(0)
    expect(parseIso8601Duration('1H')).toBe(0)
  })
})
