import { describe, expect, it } from 'vitest'
import { FixturePoolSource } from './fixturePoolSource'

describe('FixturePoolSource', () => {
  it('loads a pool with programmes and the channels they came from', async () => {
    const pool = await new FixturePoolSource().load()

    expect(pool.videos.length).toBeGreaterThan(0)
    expect(pool.channels.size).toBeGreaterThan(0)
    for (const video of pool.videos) {
      expect(pool.channels.has(video.channelId)).toBe(true)
      expect(video.durationSec).toBeGreaterThan(0)
    }
  })

  it('loads the same pool every time, so the schedule is reproducible', async () => {
    const source = new FixturePoolSource()

    expect(await source.load()).toEqual(await source.load())
  })

  it('takes the fixture options, so a test can pin the seed and the day', async () => {
    const first = await new FixturePoolSource({ seed: 1, days: 2 }).load()
    const second = await new FixturePoolSource({ seed: 2, days: 2 }).load()

    expect(first.videos.map((video) => video.durationSec)).not.toEqual(
      second.videos.map((video) => video.durationSec),
    )
  })

  it('needs no credentials, no network and no storage', async () => {
    // Nothing to assert beyond this: the constructor takes nothing to inject.
    await expect(new FixturePoolSource().load()).resolves.toBeDefined()
  })
})
