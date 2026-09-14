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

  it('ignores what it cannot use rather than failing', () => {
    const unusable = [
      // Unparseable.
      '?at=banana',
      '?at=99:99',
      '?at=',
      '?at=25:00',
      // Parses perfectly, and is still no use: outside the broadcast day the
      // set holds a schedule for. The edges of what a `Date` can represent are
      // here because they parse — which is why checking the parse was never
      // enough, and an offset built from one put the clock a tick past the end
      // of time.
      `?at=${encodeURIComponent('+275760-09-13T00:00:00.000Z')}`,
      '?at=-271821-04-20T00:00:00.000Z',
      '?at=2400-01-01',
      // Yesterday, which is the case that matters: the set holds one day's
      // schedule and it is not the one that was on air then.
      '?at=2026-09-11T20:00',
    ]

    for (const junk of unusable) {
      expect(offsetFromQuery(junk, NOW), junk).toBe(0)
    }
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

/*
  Where the day's edges fall, which is the behaviour the bound added rather
  than a restatement of what it rejects.
*/
describe('offsetFromQuery, at the edges of the broadcast day', () => {
  it('runs to the edges of the day and no further', () => {
    const offsetTo = (target: Date) => target.getTime() - NOW.getTime()
    const start = new Date(2026, 8, 12, 6, 0, 0)
    const end = new Date(2026, 8, 13, 6, 0, 0)

    // Half-open, as every other span in the schedule is: 06.00 opens this day,
    // and the following 06.00 belongs to the next one.
    expect(offsetFromQuery(`?at=${start.toISOString()}`, NOW)).toBe(offsetTo(start))
    expect(offsetFromQuery(`?at=${new Date(start.getTime() - 1).toISOString()}`, NOW)).toBe(0)
    expect(offsetFromQuery(`?at=${new Date(end.getTime() - 1).toISOString()}`, NOW)).toBe(
      offsetTo(new Date(end.getTime() - 1)),
    )
    expect(offsetFromQuery(`?at=${end.toISOString()}`, NOW)).toBe(0)
  })

  it('bounds a wall-clock time by the same day, from the small hours too', () => {
    const smallHours = new Date(2026, 8, 13, 2, 0, 0) // still the 12th's day
    // 03.14 is later the same broadcast day, so it stands.
    expect(offsetFromQuery('?at=03:14', smallHours)).toBe(74 * 60 * 1000)
    // 06.01 is the next day's breakfast, and the set does not hold it.
    expect(offsetFromQuery('?at=06:01', smallHours)).toBe(0)
  })
})
