import { describe, expect, it } from 'vitest'
import type { Video } from '@/domain'
import { profile, type Subscription } from '@/programming/profile'
import { StationClassifier } from '@/programming/stationClassifier'
import { STATIONS, stationById, type Station } from '@/programming/stations'

const MINUTE = 60
/** A Thursday, which is comedy night on Channel Two. */
const THURSDAY = new Date(2026, 8, 10, 6, 0, 0)
/** A Monday, which is nothing in particular anywhere. */
const MONDAY = new Date(2026, 8, 7, 6, 0, 0)

const one = stationById(1) as Station
const two = stationById(2) as Station
const five = stationById(5) as Station

const video = (overrides: Partial<Video> & Pick<Video, 'id'>): Video => ({
  channelId: 'UC1',
  title: 'A Programme',
  durationSec: 30 * MINUTE,
  publishedAt: '2026-09-08T12:00:00.000Z',
  ageRestricted: false,
  madeForKids: false,
  embeddable: true,
  isLive: false,
  ...overrides,
})

/** One supplier, profiled by hand, so a test can say exactly what it is. */
function profiles(...entries: (Partial<Subscription> & Pick<Subscription, 'channelId'>)[]) {
  const map = new Map<string, Subscription>()
  for (const entry of entries) {
    map.set(entry.channelId, {
      title: entry.channelId,
      genre: 'factual',
      cadenceDays: 1,
      cadence: 'daily',
      typicalDurationSec: 30 * MINUTE,
      format: 'half-hour',
      standing: 0.5,
      restricted: false,
      forChildren: false,
      uploads: 8,
      ...entry,
    })
  }
  return map
}

const classify = (station: Station, on: Date, subscription: Parameters<typeof profiles>[0], item: Video) =>
  new StationClassifier(station, profiles(subscription), on).classify(item)

describe('StationClassifier', () => {
  it('offers nothing for a channel this station does not carry', () => {
    const classifier = new StationClassifier(one, profiles({ channelId: 'UC-mine' }), MONDAY)

    expect(classifier.classify(video({ id: 'v', channelId: 'UC-theirs' }))).toEqual({})
  })

  it('offers nothing this station has no daypart for', () => {
    // Channel Four is off air all morning, so nothing can go out then.
    const four = stationById(4) as Station
    const offered = classify(four, MONDAY, { channelId: 'UC1' }, video({ id: 'v' }))

    expect(Object.keys(offered)).not.toContain('breakfast')
  })

  /*
    The watershed, in both directions and without exceptions. These are the
    only judgements in the file that are not preferences.
  */
  describe('the watershed', () => {
    it('keeps an age-rated programme out of everything before nine', () => {
      const offered = classify(one, MONDAY, { channelId: 'UC1' }, video({ id: 'v', ageRestricted: true }))

      expect(Object.keys(offered)).toEqual(expect.arrayContaining(['prime']))
      for (const daypart of Object.keys(offered)) {
        expect(['prime', 'late-night']).toContain(daypart)
      }
    })

    it('keeps a restricted supplier out too, whatever this upload is rated', () => {
      const offered = classify(one, MONDAY, { channelId: 'UC1', restricted: true }, video({ id: 'v' }))

      for (const daypart of Object.keys(offered)) {
        expect(['prime', 'late-night']).toContain(daypart)
      }
    })

    it("sends children's television home before the evening", () => {
      const offered = classify(
        one,
        MONDAY,
        { channelId: 'UC1', genre: 'children' },
        video({ id: 'v', madeForKids: true, durationSec: 9 * MINUTE }),
      )

      expect(Object.keys(offered)).toEqual(expect.arrayContaining(['childrens']))
      expect(Object.keys(offered)).not.toContain('evening')
      expect(Object.keys(offered)).not.toContain('prime')
    })
  })

  /*
    A short is not a programme. Fifty of them are a clip show, and that is the
    only thing in the schedule they are for.
  */
  describe('shorts', () => {
    it('offers a short to the clip show and to nothing else', () => {
      const offered = classify(five, MONDAY, { channelId: 'UC1', format: 'short' }, video({ id: 'v', durationSec: 40 }))

      expect(Object.keys(offered)).toEqual(['clip-show'])
    })

    it('has nowhere at all to put one on a station with no clip show', () => {
      const offered = classify(one, MONDAY, { channelId: 'UC1', format: 'short' }, video({ id: 'v', durationSec: 40 }))

      expect(offered).toEqual({})
    })

    it('keeps a real programme out of the clip show', () => {
      const offered = classify(five, MONDAY, { channelId: 'UC1' }, video({ id: 'v' }))

      expect(Object.keys(offered)).not.toContain('clip-show')
    })
  })

  describe('the news', () => {
    const bulletin = video({ id: 'v', categoryId: '25', durationSec: 20 * MINUTE })

    it('is the only thing the bulletins will take', () => {
      const notNews = classify(one, MONDAY, { channelId: 'UC1' }, video({ id: 'v', durationSec: 20 * MINUTE }))

      expect(Object.keys(notNews)).not.toContain('lunchtime-news')
      expect(Object.keys(notNews)).not.toContain('early-evening-news')
    })

    // Damped elsewhere rather than barred: a station with a thin afternoon
    // would rather repeat the lunchtime bulletin than show the card.
    it('is damped outside the bulletins rather than barred from them', () => {
      const offered = classify(one, MONDAY, { channelId: 'UC1', genre: 'news' }, bulletin)

      expect(offered['lunchtime-news']).toBeGreaterThan(0)
      expect(offered.afternoon ?? 0).toBeGreaterThan(0)
      expect(offered.afternoon ?? 0).toBeLessThan(offered['lunchtime-news'] ?? 0)
    })
  })

  describe('a night with a habit', () => {
    const sitcom = video({ id: 'v', durationSec: 30 * MINUTE })
    const comic = { channelId: 'UC1', genre: 'comedy' } as const
    const scientist = { channelId: 'UC1', genre: 'factual' } as const

    it('lifts what the night is for', () => {
      const thursday = classify(two, THURSDAY, comic, sitcom).prime ?? 0
      const monday = classify(two, MONDAY, comic, sitcom).prime ?? 0

      expect(thursday).toBeGreaterThan(monday)
    })

    // A night that still shows whatever came to hand is not a night with a
    // habit. The other genres have to give way as well.
    it('pushes down what it is not for', () => {
      const thursday = classify(two, THURSDAY, scientist, sitcom).prime ?? 0
      const monday = classify(two, MONDAY, scientist, sitcom).prime ?? 0

      expect(thursday).toBeLessThan(monday)
    })
  })

  describe('a weekly series', () => {
    const hourLong = video({ id: 'v', durationSec: 55 * MINUTE })
    const weekly = { channelId: 'UC1', cadence: 'weekly', format: 'hour' } as const

    it('is worth far more on its own night than on any other', () => {
      const classifier = new StationClassifier(one, profiles(weekly), MONDAY)
      const scores = new Set<number>()
      for (let day = 0; day < 7; day++) {
        const on = new Date(2026, 8, 7 + day, 6, 0, 0)
        const offered = new StationClassifier(one, profiles(weekly), on).classify(hourLong)
        scores.add(Math.max(0, ...Object.values(offered)))
      }

      expect(classifier.classify(hourLong)).toBeDefined()
      // One night stands out from the other six.
      expect(scores.size).toBeGreaterThan(1)
    })

    // Without the holding back, a series simply goes out on the first day of
    // the week with room for it, and stops being a series.
    it('is held back on the nights that are not its own', () => {
      const best = (on: Date) => {
        const offered = new StationClassifier(one, profiles(weekly), on).classify(hourLong)
        return Math.max(0, ...Object.values(offered))
      }
      const week = Array.from({ length: 7 }, (_, day) => best(new Date(2026, 8, 7 + day, 6, 0, 0)))
      const top = Math.max(...week)

      expect(week.filter((score) => score === top)).toHaveLength(1)
    })
  })

  it('reads the pool it ships with without falling over', () => {
    for (const station of STATIONS) {
      const classifier = new StationClassifier(station, profile({ videos: [], channels: new Map() }), MONDAY)
      expect(classifier.classify(video({ id: 'v' }))).toEqual({})
    }
  })
})
