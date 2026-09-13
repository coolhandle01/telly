import type { Pool } from '../domain'

/**
 * Where a pool comes from. One method, so the app above can be handed a
 * fixture, the real API, or a cache over either, and cannot tell the difference.
 */
export interface PoolSource {
  load(): Promise<Pool>
}
