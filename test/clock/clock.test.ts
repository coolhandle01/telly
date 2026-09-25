import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SystemClock } from '@/clock/clock'

describe('SystemClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 9, 1, 30, 5))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports the current instant', () => {
    expect(new SystemClock().now()).toEqual(new Date(2026, 8, 9, 1, 30, 5))
  })

  it('ticks its subscribers once a second with the new instant', () => {
    const listener = vi.fn<(now: Date) => void>()
    new SystemClock().subscribe(listener)

    vi.advanceTimersByTime(2000)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(new Date(2026, 8, 9, 1, 30, 7))
  })

  it('stops calling a listener that has unsubscribed', () => {
    const listener = vi.fn<(now: Date) => void>()
    const unsubscribe = new SystemClock().subscribe(listener)

    unsubscribe()
    vi.advanceTimersByTime(3000)

    expect(listener).not.toHaveBeenCalled()
  })

  it('leaves no timer running once the last subscriber has gone', () => {
    const clock = new SystemClock()
    const first = clock.subscribe(vi.fn())
    const second = clock.subscribe(vi.fn())

    first()
    expect(vi.getTimerCount()).toBe(1)

    second()
    expect(vi.getTimerCount()).toBe(0)
  })
})
