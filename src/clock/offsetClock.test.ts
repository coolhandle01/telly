import { describe, expect, it } from 'vitest'
import { FakeClock } from '../test/fakeClock'
import { OffsetClock, offsetFromQuery } from './offsetClock'

const NOW = new Date(2026, 8, 12, 20, 15, 0)

describe('offsetFromQuery', () => {
  it('is no offset at all when nothing is asked for', () => {
    expect(offsetFromQuery('', NOW)).toBe(0)
    expect(offsetFromQuery('?other=1', NOW)).toBe(0)
  })

  it('jumps forward to the next occurrence of a wall-clock time', () => {
    // 03:14 from 20:15 is tomorrow morning, not this morning.
    const offset = offsetFromQuery('?at=03:14', NOW)
    expect(new Date(NOW.getTime() + offset)).toEqual(new Date(2026, 8, 13, 3, 14, 0, 0))
  })

  it('stays on the same day when the time is still ahead', () => {
    const offset = offsetFromQuery('?at=22:30', NOW)
    expect(new Date(NOW.getTime() + offset)).toEqual(new Date(2026, 8, 12, 22, 30, 0, 0))
  })

  it('takes a full instant too', () => {
    const offset = offsetFromQuery('?at=2026-09-13T03:14', NOW)
    expect(new Date(NOW.getTime() + offset).getHours()).toBe(3)
  })

  it('goes back to a time already gone, within the same broadcast day', () => {
    // 09.00 is behind 20.15, but both belong to the day that opened at 06.00,
    // so it means this morning rather than tomorrow.
    const offset = offsetFromQuery('?at=09:00', NOW)
    expect(offset).toBeLessThan(0)
    expect(new Date(NOW.getTime() + offset)).toEqual(new Date(2026, 8, 12, 9, 0, 0, 0))
  })

  it('reaches the 06.00 the day opened on', () => {
    const offset = offsetFromQuery('?at=06:00', NOW)
    expect(new Date(NOW.getTime() + offset)).toEqual(new Date(2026, 8, 12, 6, 0, 0, 0))
  })

  it.each([
    // The 06.00 ahead opens the next broadcast day; it is not part of this one.
    ['the 06.00 that ends it', '?at=2026-09-13T06:00'],
    ['a later hour of the day after', '?at=2026-09-13T09:00'],
    ['the day before', '?at=2026-09-11T20:15'],
  ])('refuses an instant outside the broadcast day: %s', (_case, query) => {
    expect(offsetFromQuery(query, NOW)).toBe(0)
  })

  // Widened: the four original values were all typos: none of them *parses*,
  // so the one branch with no range check (offsetClock.ts:52-53) was never
  // reached by the test whose job is to break it. The last three parse
  // perfectly and sit at the edges of what a Date can hold.
  it.each([
    ['?at=banana'],
    ['?at=99:99'],
    ['?at='],
    ['?at=25:00'],
    // The largest instant Date can represent: new Date('275760-09-13') is
    // 8_640_000_000_000_000, not NaN, so the guard at :53 lets it through.
    ['?at=275760-09-13'],
    // The same instant in a format the hh:mm regex cannot see either.
    ['?at=Sep 13 275760'],
    // And the smallest.
    ['?at=-271821-04-20'],
  ])('ignores nonsense rather than failing: %s', (junk) => {
    const offset = offsetFromQuery(junk, NOW)

    expect(offset).toBe(0)

    // The assertion the narrow version never made: toBe(0) says nothing about
    // the instant the offset produces, and the instant is where the damage is.
    // A clock that has ticked on one second must still be able to say when it is.
    const inner = new FakeClock(NOW)
    const clock = new OffsetClock(inner, offset)
    inner.set(new Date(NOW.getTime() + 1000))
    expect(Number.isNaN(clock.now().getTime())).toBe(false)
  })
})

describe('OffsetClock', () => {
  it('reads the offset instant, and keeps ticking', () => {
    const inner = new FakeClock(NOW)
    const clock = new OffsetClock(inner, 60 * 60 * 1000)
    const seen: Date[] = []
    clock.subscribe((now) => seen.push(now))

    expect(clock.now()).toEqual(new Date(2026, 8, 12, 21, 15, 0))

    inner.set(new Date(2026, 8, 12, 20, 15, 30))

    expect(seen).toEqual([new Date(2026, 8, 12, 21, 15, 30)])
  })

  it('unsubscribes through to the clock underneath', () => {
    const inner = new FakeClock(NOW)
    const clock = new OffsetClock(inner, 0)
    const stop = clock.subscribe(() => {})
    expect(inner.subscriberCount).toBe(1)
    stop()
    expect(inner.subscriberCount).toBe(0)
  })
})
