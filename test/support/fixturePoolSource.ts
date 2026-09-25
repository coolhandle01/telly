import type { Pool } from '@/domain'
import { fixturePool, type PoolOptions } from './pool'
import type { LoadProgress, PoolSource } from '@/library/poolSource'

/**
 * A source for tests: a deterministic pool with no credentials, no network and
 * no quota. Same seed, same schedule, forever, which is what makes the planner
 * testable. The videos are made up, so the app never uses it.
 */
export class FixturePoolSource implements PoolSource {
  readonly #options: PoolOptions

  constructor(options: PoolOptions = {}) {
    this.#options = options
  }

  // There is no network here and nothing to wait for, so the only honest
  // report is the finished one.
  async load(onProgress?: LoadProgress): Promise<Pool> {
    const pool = fixturePool(this.#options)
    onProgress?.(1)
    return pool
  }
}
