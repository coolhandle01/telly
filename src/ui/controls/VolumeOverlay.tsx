import { useEffect, useRef, useState } from 'react'
import { Osd } from './Osd'

export interface VolumeOverlayProps {
  /** 0..1. Anything outside is treated as the end it is nearest. */
  volume: number
  /** How many bars the row is cut into. Default 20. */
  segments?: number
}

const DEFAULT_SEGMENTS = 20
const DEFAULT_HOLD_MS = 2000

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/**
 * `VOL` and a row of bars burnt over the picture. Presentational only:
 * whoever renders it has already decided it should be seen.
 */
export function VolumeOverlay({ volume, segments = DEFAULT_SEGMENTS }: VolumeOverlayProps) {
  const level = clamp01(volume)
  // Rounded, not truncated: at nine-tenths of the way up the last bar should
  // be lit, and at a hair above silence the first one should be.
  const litCount = Math.round(level * segments)

  return (
    <Osd word="VOL" label={`VOL ${Math.round(level * 100)}%`}>
      <span className="tv-osd__bars" aria-hidden="true">
        {Array.from({ length: segments }, (_, index) => (
          <span
            key={index}
            className="tv-osd__seg"
            data-testid="segment"
            data-lit={String(index < litCount)}
          />
        ))}
      </span>
    </Osd>
  )
}

/**
 * True for `holdMs` after `value` changes, then false again: the timer that
 * decides when a display is on screen at all.
 *
 * Deliberately false on the first render: arriving at a volume is not the same
 * event as changing it, and a set does not flash its OSD when you walk in.
 */
// oxlint-disable-next-line only-export-components
export function useTransientFlag(value: number, holdMs = DEFAULT_HOLD_MS): boolean {
  const [showing, setShowing] = useState(false)
  const previous = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Nothing pending survives the unmount.
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (previous.current === value) return
    previous.current = value
    // Restart the hold rather than extending it: the last change is the one
    // being watched, and two quick nudges should not leave it up for twice as
    // long.
    clearTimeout(timer.current)
    setShowing(true)
    timer.current = setTimeout(() => setShowing(false), holdMs)
  }, [value, holdMs])

  return showing
}
