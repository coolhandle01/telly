import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * The behaviour every rotary control on the set shares: drag it, or focus it
 * and use the keys. Extracted because the volume knob and the hold trimmers
 * are the same control at two sizes, and a trimmer that turned differently
 * from the knob beside it would be a bug nobody could name.
 */

export const MIN = 0
export const MAX = 1
export const DEFAULT_STEP = 0.05

/** PageUp/PageDown move this many arrow-steps at once — a coarse grab. */
const PAGE_STEPS = 5

export interface RotaryOptions {
  /** 0..1. The control is controlled: it draws what it is handed. */
  value: number
  onChange: (value: number) => void
  /** How far one arrow key moves it. */
  step?: number
  /** How far the pointer must travel, vertically, to sweep the whole range. */
  travelPx?: number
}

export const clamp = (value: number): number => Math.min(MAX, Math.max(MIN, value))

/** Binary fractions of a step do not land on round numbers; this lands them. */
export const tidy = (value: number): number => Math.round(value * 1e6) / 1e6

export function useRotary({ value, onChange, step = DEFAULT_STEP, travelPx = 150 }: RotaryOptions) {
  const drag = useRef<{ pointerId: number; y: number; value: number } | null>(null)
  const current = clamp(value)

  /** Report only real movement: a clamped-at-the-stop key is not a change. */
  const move = (next: number) => {
    const clamped = tidy(clamp(next))
    if (clamped !== tidy(current)) onChange(clamped)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const page = step * PAGE_STEPS
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        move(current + step)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        move(current - step)
        break
      case 'PageUp':
        move(current + page)
        break
      case 'PageDown':
        move(current - page)
        break
      case 'Home':
        move(MIN)
        break
      case 'End':
        move(MAX)
        break
      default:
        // Tab, and everything else, belongs to the page.
        return
    }
    // Ours: the page must not scroll out from under the viewer as well.
    event.preventDefault()
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    drag.current = { pointerId: event.pointerId, y: event.clientY, value: current }
    // Capture, so a hand that slides off the control still turns it.
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const started = drag.current
    if (!started || started.pointerId !== event.pointerId) return
    // Up is more: screen Y grows downward, so the travel is start minus now.
    const travelled = (started.y - event.clientY) / travelPx
    move(Math.round(clamp(started.value + travelled) / step) * step)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return { current, onKeyDown, onPointerDown, onPointerMove, endDrag }
}
