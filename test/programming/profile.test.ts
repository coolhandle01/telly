import { describe, expect, it } from 'vitest'
import type { Channel, Pool, Video } from '@/domain'
import { fixturePool } from '../support/pool'
import { formatOf, profile } from '@/programming/profile'

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

  // Each ceiling belongs to the slot above it.
  it.each([
    [64, 'short'],
    [65, 'segment'],
    [10 * 60 - 1, 'segment'],
    [10 * 60, 'half-hour'],
    [35 * 60 - 1, 'half-hour'],
    [35 * 60, 'hour'],
    [70 * 60 - 1, 'hour'],
    [70 * 60, 'feature'],
  ])('reads %i seconds as %s', (durationSec, format) => {
    expect(formatOf(durationSec)).toBe(format)
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

  it("takes a channel's title from its details", () => {
    const profiles = profile(poolOf(series('UC1', 3, 1), [{ id: 'UC1', title: 'The Channel' }]))

    expect(profiles.get('UC1')?.title).toBe('The Channel')
  })

  // A pool can carry uploads from a channel it has no details for. Its id
  // stands in for the title, and it has nothing to rank on.
  it('reads a channel the pool has no details for', () => {
    const pool = poolOf(series('UC1', 3, 1))
    const read = profile({ ...pool, channels: new Map() }).get('UC1')

    expect(read?.title).toBe('UC1')
    expect(read?.standing).toBe(0.5)
  })

  it('reads a rhythm off as few as two uploads', () => {
    const profile2 = profile(poolOf(series('UC1', 2, 1))).get('UC1')

    expect(profile2?.cadenceDays).toBeCloseTo(1)
    expect(profile2?.cadence).toBe('daily')
  })

  // Up to two and a half days apart is daily, up to ten is weekly, and past
  // that a channel turns up when it turns up.
  it.each([
    [2.5, 'daily'],
    [3, 'weekly'],
    [10, 'weekly'],
    [11, 'occasional'],
  ])('calls uploads %d days apart %s', (everyDays, cadence) => {
    expect(profile(poolOf(series('UC1', 4, everyDays))).get('UC1')?.cadence).toBe(cadence)
  })

  // The API sends an empty string when a snippet has no date, which parses to
  // NaN. It is left out of the gaps rather than spoiling them: with only two
  // dated uploads, a NaN gap would be half the median.
  it('reads the rhythm past an upload with no publish date', () => {
    const videos = [...series('UC1', 2, 1), video({ id: 'UC1-undated', channelId: 'UC1', publishedAt: '' })]
    const read = profile(poolOf(videos)).get('UC1')

    expect(read?.cadenceDays).toBeCloseTo(1)
    expect(read?.cadence).toBe('daily')
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

    // The ids sort the other way from the ranking, so a comparison that fell
    // through to the tie-break on id would put them in the wrong order.
    it('falls back to subscribers where a channel hides its views', () => {
      const profiles = profile(
        poolOf([...series('UC-hidden', 3, 1), ...series('UC-open', 3, 1, { viewCount: 10 })], [
          { id: 'UC-hidden', title: 'Hidden', subscriberCount: 900_000 },
        ]),
      )

      expect(profiles.get('UC-hidden')?.standing).toBe(1)
      expect(profiles.get('UC-open')?.standing).toBe(0)
    })

    it('neither promotes nor buries a channel with nothing to rank on', () => {
      const profiles = profile(poolOf(series('UC1', 3, 1)))

      expect(profiles.get('UC1')?.standing).toBe(0.5)
    })

    // One figure is no ranking: placed first of one, its standing would be
    // 0 / 0, and a NaN standing reaches the draft.
    it('does not rank a lone channel with a figure against those without', () => {
      const profiles = profile(
        poolOf([...series('UC-seen', 3, 1, { viewCount: 10 }), ...series('UC-unseen', 3, 1)]),
      )

      expect(profiles.get('UC-seen')?.standing).toBe(0.5)
      expect(profiles.get('UC-unseen')?.standing).toBe(0.5)
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
