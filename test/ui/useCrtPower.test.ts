import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { COLLAPSE_MS, useCrtPower, WARM_MS } from '@/ui/useCrtPower'

describe('useCrtPower', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts settled, because nobody watched the set reach that state', () => {
    expect(renderHook(() => useCrtPower(false)).result.current).toBe('off')
    expect(renderHook(() => useCrtPower(true)).result.current).toBe('on')
  })

  it('collapses before it is off', () => {
    const { result, rerender } = renderHook(({ on }) => useCrtPower(on), {
      initialProps: { on: true },
    })

    rerender({ on: false })
    expect(result.current).toBe('collapsing')

    act(() => void vi.advanceTimersByTime(COLLAPSE_MS))
    expect(result.current).toBe('off')
  })

  it('warms up before it is on', () => {
    const { result, rerender } = renderHook(({ on }) => useCrtPower(on), {
      initialProps: { on: false },
    })

    rerender({ on: true })
    expect(result.current).toBe('warming')

    act(() => void vi.advanceTimersByTime(WARM_MS))
    expect(result.current).toBe('on')
  })

  it('abandons a collapse if the set is switched back on part-way', () => {
    const { result, rerender } = renderHook(({ on }) => useCrtPower(on), {
      initialProps: { on: true },
    })

    rerender({ on: false })
    act(() => void vi.advanceTimersByTime(COLLAPSE_MS / 3))
    rerender({ on: true })

    expect(result.current).toBe('warming')
    act(() => void vi.advanceTimersByTime(WARM_MS))
    expect(result.current).toBe('on')
  })

  it('switches instantly for a viewer who asked for less movement', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const { result, rerender } = renderHook(({ on }) => useCrtPower(on), {
      initialProps: { on: true },
    })

    rerender({ on: false })

    expect(result.current).toBe('off')
  })
})
