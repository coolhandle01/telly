import type { Pool } from '../domain'
import { fixturePool, type PoolOptions } from '../fixtures/pool'
import type { LoadProgress, PoolSource } from './poolSource'

/**
 * The default source, and the reason the app runs at all before anyone signs
 * in: a deterministic pool with no credentials, no network and no quota. Same
 * seed, same schedule, forever — which is also what makes the planner testable.
 *
 * It wraps the same fixture the tests use on purpose. The fixture is the app's
 * demo mode as well as its test data, so there is only one of it.
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
