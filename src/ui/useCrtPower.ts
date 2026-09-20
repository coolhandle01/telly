import { useEffect, useRef, useState } from 'react'

/**
 * The tube's own idea of whether it is on.
 *
 * A CRT does not switch instantly in either direction. Switched off, the
 * deflection circuits die faster than the beam does: the raster collapses to a
 * line, then to a spot, which lingers on stored EHT and fading phosphor.
 * Switched on, the reverse: the line blooms outward as the scan comes up.
 *
 * So the set has four states, not two, and the picture must stay mounted
 * through the collapse or there would be nothing left to collapse.
 */
export type CrtPhase = 'off' | 'warming' | 'on' | 'collapsing'

/** Raster to spot. */
export const COLLAPSE_MS = 900
/** Spot to full picture. */
export const WARM_MS = 620

/** True when the viewer has asked for less movement. */
function prefersReducedMotion(): boolean {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

export function useCrtPower(on: boolean): CrtPhase {
  // Settled at whatever the set was doing when it mounted: nobody watched it
  // get there, so there is nothing to animate.
  const [phase, setPhase] = useState<CrtPhase>(on ? 'on' : 'off')
  const wasOn = useRef(on)
  const [reduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (reduced || wasOn.current === on) return
    wasOn.current = on

    // Synchronising with a timer is what an effect is for: the tube takes a
    // known time to collapse or to come up, and the phase has to change when
    // it does rather than when React next happens to render.
    // oxlint-disable-next-line react/set-state-in-effect -- see above
    setPhase(on ? 'warming' : 'collapsing')
    const timer = setTimeout(() => setPhase(on ? 'on' : 'off'), on ? WARM_MS : COLLAPSE_MS)
    return () => clearTimeout(timer)
  }, [on, reduced])

  // Asked for less movement: derived rather than animated, so there is no
  // intermediate state to catch the set in.
  return reduced ? (on ? 'on' : 'off') : phase
}
