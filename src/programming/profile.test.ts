import { describe, expect, it } from 'vitest'
import type { Channel, Pool, Video } from '../domain'
import { fixturePool } from '../fixtures/pool'
import { formatOf, profile } from './profile'

const DAY = 86_400_000
const START = Date.parse('2026-09-09T12:00:00.000Z')

const video = (overrides: Partial<Video> & Pick<Video, 'id'>): Video => ({
  channelId: 'UC1',
  title: 'A Programme',
  durationSec: 1200,
  publishedAt: '2026-09-08T12:00:00.000Z',
  ageRestricted: false,
  madeForKids: false,
  embeddable: true,
  isLive: false,
  ...overrides,
})

/** `count` uploads, `everyDays` apart, walking back from a fixed instant. */
function series(
  channelId: string,
  count: number,
  everyDays: number,
  overrides: Partial<Video> = {},
): Video[] {
  return Array.from({ length: count }, (_, index) =>
    video({
      id: `${channelId}-${index}`,
      channelId,
      publishedAt: new Date(START - index * everyDays * DAY).toISOString(),
      ...overrides,
    }),
  )
}

function poolOf(videos: readonly Video[], channels: readonly Channel[] = []): Pool {
  const known = new Map(channels.map((channel) => [channel.id, channel]))
  for (const item of videos) {
    if (!known.has(item.channelId)) known.set(item.channelId, { id: item.channelId, title: item.channelId })
  }
  return { videos, channels: known }
}

describe('formatOf', () => {
  // Slots, not running times: a half-hour has never held thirty minutes.
  it('reads a duration as the slot it would be given', () => {
    expect(formatOf(40)).toBe('short')
    expect(formatOf(5 * 60)).toBe('segment')
    expect(formatOf(28 * 60)).toBe('half-hour')
    expect(formatOf(30 * 60)).toBe('half-hour')
    expect(formatOf(48 * 60)).toBe('hour')
    expect(formatOf(95 * 60)).toBe('feature')
  })
})

describe('profile', () => {
  it('reads a rhythm off the upload dates', () => {
    const profiles = profile(poolOf([...series('UC-strip', 10, 1), ...series('UC-strand', 6, 7)]))

    expect(profiles.get('UC-strip')?.cadence).toBe('daily')
    expect(profiles.get('UC-strand')?.cadence).toBe('weekly')
    expect(profiles.get('UC-strand')?.cadenceDays).toBeCloseTo(7)
  })

  // One holiday, or one day a channel posted four times, must not change what
  // the channel is.
  it('takes the median gap rather than the average one', () => {
    const bunched = [
      ...series('UC1', 5, 7),
      video({ id: 'UC1-late', channelId: 'UC1', publishedAt: new Date(START - 200 * DAY).toISOString() }),
    ]

    expect(profile(poolOf(bunched)).get('UC1')?.cadence).toBe('weekly')
  })

  it('calls a channel with one upload occasional rather than inventing a gap', () => {
    const profiles = profile(poolOf(series('UC1', 1, 7)))

    expect(profiles.get('UC1')?.cadence).toBe('occasional')
    expect(profiles.get('UC1')?.uploads).toBe(1)
  })

  it('ignores what cannot be scheduled when reading a channel', () => {
    const profiles = profile(
      poolOf([
        ...series('UC1', 4, 1, { durationSec: 1800 }),
        video({ id: 'live', channelId: 'UC1', isLive: true, durationSec: 0 }),
        video({ id: 'blocked', channelId: 'UC1', embeddable: false, durationSec: 30 }),
      ]),
    )

    expect(profiles.get('UC1')?.uploads).toBe(4)
    expect(profiles.get('UC1')?.typicalDurationSec).toBe(1800)
  })

  it('leaves out a channel with nothing schedulable at all', () => {
    const profiles = profile(poolOf([video({ id: 'live', channelId: 'UC-dead', isLive: true })]))

    expect(profiles.has('UC-dead')).toBe(false)
  })

  /*
    Standing is a place in the queue, not a number of views. The figure is
    absent whenever an uploader hides it and spans three orders of magnitude
    when it is not, so only the ordering is usable.
  */
  describe('standing', () => {
    it('ranks the pool rather than reading the figures', () => {
      const profiles = profile(
        poolOf([
          ...series('UC-small', 3, 1, { viewCount: 40 }),
          ...series('UC-middle', 3, 1, { viewCount: 4_000 }),
          ...series('UC-huge', 3, 1, { viewCount: 40_000_000 }),
        ]),
      )

      expect(profiles.get('UC-small')?.standing).toBe(0)
      expect(profiles.get('UC-middle')?.standing).toBe(0.5)
      expect(profiles.get('UC-huge')?.standing).toBe(1)
    })

    it('falls back to subscribers where a channel hides its views', () => {
      const profiles = profile(
        poolOf([...series('UC-shy', 3, 1), ...series('UC-open', 3, 1, { viewCount: 10 })], [
          { id: 'UC-shy', title: 'Shy', subscriberCount: 900_000 },
        ]),
      )

      expect(profiles.get('UC-shy')?.standing).toBe(1)
      expect(profiles.get('UC-open')?.standing).toBe(0)
    })

    it('neither promotes nor buries a channel with nothing to rank on', () => {
      const profiles = profile(poolOf(series('UC1', 3, 1)))

      expect(profiles.get('UC1')?.standing).toBe(0.5)
    })
  })

  describe('who may go out when', () => {
    // Judged on the whole channel: one rated upload makes it a channel to keep
    // after the watershed.
    it('marks a channel restricted if it has ever been rated', () => {
      const profiles = profile(
        poolOf([...series('UC1', 3, 1), video({ id: 'rated', channelId: 'UC1', ageRestricted: true })]),
      )

      expect(profiles.get('UC1')?.restricted).toBe(true)
    })

    it("marks a channel children's only when all of it is", () => {
      const profiles = profile(
        poolOf([
          ...series('UC-kids', 3, 1, { madeForKids: true }),
          ...series('UC-mixed', 2, 1, { madeForKids: true }),
          video({ id: 'grown', channelId: 'UC-mixed' }),
        ]),
      )

      expect(profiles.get('UC-kids')?.forChildren).toBe(true)
      expect(profiles.get('UC-mixed')?.forChildren).toBe(false)
    })
  })

  it('reads every channel in the pool it ships with', () => {
    const pool = fixturePool()
    const profiles = profile(pool)

    expect(profiles.size).toBe(pool.channels.size)
    // A subscription list this varied must land on more than a couple of
    // genres, or the stations have nothing to divide up.
    expect(new Set([...profiles.values()].map((entry) => entry.genre)).size).toBeGreaterThan(8)
  })

  it('is a fact rather than a decision: the same pool gives the same profiles', () => {
    expect(profile(fixturePool())).toEqual(profile(fixturePool()))
  })
})
