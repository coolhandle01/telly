import { useEffect, useState } from 'react'
import { tune } from '../broadcast'
import type { Clock } from '../clock/clock'
import type { OnAir, Schedule } from '../domain'

/**
 * The clock drives the picture. What is on screen is whatever the schedule says
 * is on air *now* — never where a viewer left off.
 *
 * The only effect here subscribes to the clock, which is a genuine external
 * system; the on-air item itself is derived during render, so there is no
 * cascading state to keep in step.
 *
 * `undefined` means the schedule does not cover this instant — which is how the
 * screen learns the broadcast day has rolled over and it needs a new one.
 */
export function useOnAir(schedule: Schedule | undefined, clock: Clock): OnAir | undefined {
  const [now, setNow] = useState(() => clock.now())

  // Subscription only. The initial instant comes from the state initialiser,
  // and every later one arrives as a tick.
  useEffect(() => clock.subscribe(setNow), [clock])

  return schedule ? tune(schedule, now) : undefined
}
