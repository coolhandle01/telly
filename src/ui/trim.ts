/**
 * The arithmetic every trimmer on the set shares.
 *
 * All five run 0..1 with mid-travel as the setting the picture was made for,
 * and three of them — both holds and the tuner — lock over a *band* either
 * side of it rather than at a point. That band is not a nicety: a control
 * that only worked at one exact value could not be found by hand, which is
 * the only way anyone ever set one.
 */

/** Mid-travel: as transmitted. */
export const CENTRE = 0.5

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/**
 * Binary fractions do not land on round numbers. Without this, a control
 * parked exactly on the edge of its band reports a drift of 1.3e-16 — which
 * is zero to any eye and to any physical circuit, but is emphatically not
 * zero to `=== 0`, so the set would say it had lost a lock it plainly had.
 */
const tidy = (value: number): number => Math.round(value * 1e6) / 1e6

/**
 * How far out of its band a control is: 0 anywhere inside it, rising to 1 at
 * whichever stop is further from the band's centre.
 *
 * `centre` is where the band sits. Mid-travel for a hold, which locks on what
 * was transmitted; somewhere else for a tuner, because each preset was set by
 * hand and the ones nobody watched were set carelessly.
 */
export function bandDrift(value: number, band: number, centre: number = CENTRE): number {
  const middle = clamp01(centre)
  const off = Math.abs(clamp01(value) - middle)
  if (off <= band) return 0
  // Measured against the longer side, so the drift still reaches 1 at the far
  // stop when the band is nearer one end than the other.
  const reach = Math.max(middle, 1 - middle) - band
  return reach <= 0 ? 1 : tidy(Math.min(1, (off - band) / reach))
}
