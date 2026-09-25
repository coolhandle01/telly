import { act, renderHook, render, screen, within } from '../../support/render'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VolumeOverlay, useTransientFlag } from '@/ui/controls/VolumeOverlay'

const display = () => screen.getByRole('img', { name: /vol/i })
const lit = () => within(display()).getAllByTestId('segment').filter((s) => s.dataset.lit === 'true')
const segments = () => within(display()).getAllByTestId('segment')

describe('VolumeOverlay', () => {
  it('shows the letters a 70s set put on screen', () => {
    render(<VolumeOverlay volume={0.5} />)

    expect(display()).toHaveTextContent('VOL')
  })

  it('draws twenty segments unless told otherwise', () => {
    render(<VolumeOverlay volume={0.5} />)

    expect(segments()).toHaveLength(20)
    expect(lit()).toHaveLength(10)
  })

  it('lights none at all at silence', () => {
    render(<VolumeOverlay volume={0} />)

    expect(lit()).toHaveLength(0)
    expect(segments()).toHaveLength(20)
  })

  it('lights every one at full', () => {
    render(<VolumeOverlay volume={1} />)

    expect(lit()).toHaveLength(20)
  })

  it('lights a share of the row that matches the volume', () => {
    render(<VolumeOverlay volume={0.25} segments={16} />)

    expect(segments()).toHaveLength(16)
    expect(lit()).toHaveLength(4)
  })

  it('rounds to the nearest segment rather than truncating', () => {
    render(<VolumeOverlay volume={0.78} segments={10} />)

    expect(lit()).toHaveLength(8)
  })

  it('lights the segments from the left, contiguously', () => {
    render(<VolumeOverlay volume={0.3} segments={10} />)

    expect(segments().map((s) => s.dataset.lit)).toEqual([
      'true', 'true', 'true', 'false', 'false', 'false', 'false', 'false', 'false', 'false',
    ])
  })

  it('survives a volume outside the range it was promised', () => {
    const { rerender } = render(<VolumeOverlay volume={-1} segments={10} />)
    expect(lit()).toHaveLength(0)
    expect(display()).toHaveAccessibleName('VOL 0%')

    rerender(<VolumeOverlay volume={3} segments={10} />)
    expect(lit()).toHaveLength(10)
    // Not 300%: the display reads the set's volume back, not the caller's sum.
    expect(display()).toHaveAccessibleName('VOL 100%')
  })

  it('names the level for anyone who cannot see the bars', () => {
    render(<VolumeOverlay volume={0.4} />)

    expect(screen.getByRole('img', { name: /40%/ })).toBeInTheDocument()
  })
})

describe('useTransientFlag', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is down on the first render, because nothing has changed yet', () => {
    const { result } = renderHook(({ value }) => useTransientFlag(value), {
      initialProps: { value: 0.8 },
    })

    expect(result.current).toBe(false)

    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(false)
  })

  it('comes up when the value changes', () => {
    const { result, rerender } = renderHook(({ value }) => useTransientFlag(value), {
      initialProps: { value: 0.8 },
    })

    rerender({ value: 0.85 })

    expect(result.current).toBe(true)
  })

  it('stays up for the hold and then goes down', () => {
    const { result, rerender } = renderHook(({ value }) => useTransientFlag(value), {
      initialProps: { value: 0.8 },
    })
    rerender({ value: 0.85 })

    act(() => vi.advanceTimersByTime(1999))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('holds for as long as it was asked to', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useTransientFlag(value, 500),
      { initialProps: { value: 0.8 } },
    )
    rerender({ value: 0.85 })

    act(() => vi.advanceTimersByTime(499))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  it('restarts the hold on a second change rather than adding to it', () => {
    const { result, rerender } = renderHook(({ value }) => useTransientFlag(value), {
      initialProps: { value: 0.8 },
    })
    rerender({ value: 0.85 })

    act(() => vi.advanceTimersByTime(1500))
    rerender({ value: 0.9 })

    // The first hold would have expired here; the second one has not.
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(false)
  })

  it('stays down while the value is merely re-rendered unchanged', () => {
    const { result, rerender } = renderHook(({ value }) => useTransientFlag(value), {
      initialProps: { value: 0.8 },
    })

    rerender({ value: 0.8 })
    rerender({ value: 0.8 })

    expect(result.current).toBe(false)
  })

  it('drops its timer when it is taken off screen', () => {
    const { rerender, unmount } = renderHook(({ value }) => useTransientFlag(value), {
      initialProps: { value: 0.8 },
    })
    rerender({ value: 0.85 })

    unmount()

    // A timer still pending here would set state on a dead hook.
    expect(vi.getTimerCount()).toBe(0)
  })
})
