import type { Pool } from '../domain'

/**
 * Where a pool comes from. The app above can be handed a fixture, the real
 * API, or a cache over either, and cannot tell the difference.
 */
export interface PoolSource {
  load(): Promise<Pool>
  /**
   * Drop whatever this source is keeping on the machine, answering once it is
   * gone. Signing out calls it, and waits.
   *
   * Optional: only a source that keeps something has anything to drop.
   */
  forget?(): Promise<void>
}
