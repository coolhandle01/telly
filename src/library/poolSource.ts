import type { Pool } from '../domain'

/**
 * How far along a load is, as a fraction from 0 to 1.
 *
 * Never goes backwards, and reaching 1 means the pool is in hand. It is an
 * estimate: the work is a few hundred API calls whose exact number is not
 * known until the subscription list is, so the denominator is refined as the
 * load learns what it is doing. Refining it can only move the fraction
 * forwards — a load that finishes a little early is a better lie than one that
 * sits at 99% while it does the last third of the work.
 */
export type LoadProgress = (fraction: number) => void

/**
 * Where a pool comes from. One method, so the app above can be handed a
 * fixture, the real API, or a cache over either, and cannot tell the difference.
 *
 * `onProgress` is optional on both sides: a caller need not care, and a source
 * with nothing to report need not pretend. A source that takes several seconds
 * over a live account should report, because several seconds of a button doing
 * nothing is indistinguishable from a broken one.
 */
export interface PoolSource {
  load(onProgress?: LoadProgress): Promise<Pool>
}
