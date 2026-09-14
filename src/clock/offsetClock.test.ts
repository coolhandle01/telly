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

  it('ignores nonsense rather than failing', () => {
    for (const junk of ['?at=banana', '?at=99:99', '?at=', '?at=25:00']) {
      expect(offsetFromQuery(junk, NOW)).toBe(0)
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
