/**
 * ISO 8601 durations, as `videos.list` reports them in `contentDetails.duration`.
 *
 * The awkward cases are the whole point: a minutes-only `PT2M` has no seconds
 * component, a live item reports the degenerate `P0D`, and `M` means *months*
 * before the `T` and *minutes* after it — which is where hand-rolled parsers
 * usually go wrong.
 */

const SECONDS_PER = {
  years: 365 * 24 * 60 * 60,
  months: 30 * 24 * 60 * 60,
  weeks: 7 * 24 * 60 * 60,
  days: 24 * 60 * 60,
  hours: 60 * 60,
  minutes: 60,
  seconds: 1,
} as const

// Each component is optional, but `P` alone, and a `T` with nothing after it,
// are not durations. The lookahead on `T` is what rejects a bare `PT`.
const ISO_8601_DURATION =
  /^P(?:(\d+(?:\.\d+)?)Y)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?=\d)(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/

/**
 * Whole seconds, rounded down. Anything unparseable is 0 rather than NaN or a
 * throw: a duration we cannot read is a video the scheduler should skip, not a
 * reason to lose the whole pool.
 */
export function parseIso8601Duration(iso: string): number {
  const match = ISO_8601_DURATION.exec(iso)
  if (!match) return 0

  const [, years, months, weeks, days, hours, minutes, seconds] = match
  if ([years, months, weeks, days, hours, minutes, seconds].every((part) => part === undefined)) {
    return 0
  }

  const total =
    Number(years ?? 0) * SECONDS_PER.years +
    Number(months ?? 0) * SECONDS_PER.months +
    Number(weeks ?? 0) * SECONDS_PER.weeks +
    Number(days ?? 0) * SECONDS_PER.days +
    Number(hours ?? 0) * SECONDS_PER.hours +
    Number(minutes ?? 0) * SECONDS_PER.minutes +
    Number(seconds ?? 0) * SECONDS_PER.seconds

  return Math.floor(total)
}
