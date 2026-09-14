import { describe, expect, it } from 'vitest'
import { parseIso8601Duration } from './duration'

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

/*
  A duration arrives as third-party text: whoever uploaded the video decides
  what `contentDetails.duration` says. That makes the pattern's own behaviour
  under hostile input part of what this parser promises.
*/
describe('parseIso8601Duration, given input nobody sane would send', () => {
  const time = (input: string): number => {
    const started = performance.now()
    parseIso8601Duration(input)
    return performance.now() - started
  }

  /*
    Catastrophic backtracking (CWE-1333) needs a quantifier nested inside
    another over the same characters, or alternatives that can claim the same
    substring. This pattern has neither: each `\d+(?:\.\d+)?` is disambiguated
    by a distinct mandatory trailing literal, so a failure backtracks that
    group linearly and moves on.

    Measured rather than argued, because "probably fine" is not an answer
    anyone can check, and the argument above is only as good as its author.
  */
  it('parses in linear time, however long the digits run', () => {
    const short = time(`P${'9'.repeat(1_000)}!`)
    const long = time(`P${'9'.repeat(50_000)}!`)

    // Fifty times the input, nothing like fifty times the work squared.
    expect(short).toBeLessThan(250)
    expect(long).toBeLessThan(250)
    expect(time(`PT${'1.'.repeat(20_000)}X`)).toBeLessThan(250)
  })

  /** An absurd duration is a number for the packer to reject, not a throw. */
  it('reads an absurd duration as a number rather than failing', () => {
    expect(parseIso8601Duration('P9999999999Y')).toBeGreaterThan(0)
    expect(parseIso8601Duration('')).toBe(0)
    expect(parseIso8601Duration('not a duration')).toBe(0)
  })
})
