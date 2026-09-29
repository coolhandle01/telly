import { describe, expect, it } from 'vitest'
import { fixturePool } from '../support/pool'
import { assign, fitFor, lineupFor } from '@/programming/assign'
import { profile, type Subscription } from '@/programming/profile'
import { STATIONS, stationById } from '@/programming/stations'

const pool = fixturePool()
const profiles = profile(pool)
const subscriptions = [...profiles.values()]

const sub = (overrides: Partial<Subscription> & Pick<Subscription, 'channelId'>): Subscription => ({
  title: overrides.channelId,
  genre: 'entertainment',
  cadenceDays: 7,
  cadence: 'weekly',
  typicalDurationSec: 1800,
  format: 'half-hour',
  standing: 0.5,
  restricted: false,
  forChildren: false,
  uploads: 5,
  ...overrides,
})

describe('assign', () => {
  const lineup = assign(subscriptions)

  it('gives every subscription exactly one home', () => {
    expect(lineup.size).toBe(subscriptions.length)
    for (const subscription of subscriptions) {
      expect(stationById(lineup.get(subscription.channelId) ?? 0)).toBeDefined()
    }
  })

  // The whole reason for exclusivity: a channel that turns up on all five is
  // not on any of them, and tuning around stops meaning anything.
  it('puts a subscription on one station and nowhere else', () => {
    const everywhere = STATIONS.flatMap((station) =>
      lineupFor(station.id, subscriptions, lineup).map((entry) => entry.channelId),
    )

    expect(new Set(everywhere).size).toBe(everywhere.length)
  })

  it('leaves no station without a supply', () => {
    for (const station of STATIONS) {
      expect(lineupFor(station.id, subscriptions, lineup).length).toBeGreaterThan(0)
    }
  })

  /*
    Settling the keenest claims first sounds fair and is not: the station a
    tenth of a point keener on a genre would take every channel of it, and the
    other would arrive at its own evening with nothing it wanted.
  */
  it('shares them out rather than letting one station take the lot', () => {
    const counts = STATIONS.map((station) => lineupFor(station.id, subscriptions, lineup).length)

    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2)
  })

  it('gives every station its first choice', () => {
    for (const station of STATIONS) {
      const mine = lineupFor(station.id, subscriptions, lineup)
      const favourite = [...subscriptions].sort((a, b) => fitFor(station, b) - fitFor(station, a))[0]
      // Either it got the one it wanted most, or something it wants nearly as much.
      const best = Math.max(...mine.map((entry) => fitFor(station, entry)))
      expect(best).toBeGreaterThanOrEqual(fitFor(station, favourite) - 0.2)
    }
  })

  it('sends every station a subscription it actually likes', () => {
    for (const station of STATIONS) {
      const mine = lineupFor(station.id, subscriptions, lineup)
      const liked = mine.filter((entry) => station.appetite[entry.genre] >= 0.6)
      expect(liked.length).toBeGreaterThan(0)
    }
  })

  /*
    A channel that posts nothing but forty-second clips is not a programme
    supplier. It supplies the clip show, the clip show is on one station, and
    it neither wants nor deserves a share of anybody's evening.
  */
  it('sends the shorts to the station with the clip show', () => {
    const clipShow = STATIONS.find((station) =>
      station.dayparts.some((daypart) => daypart.id === 'clip-show'),
    )
    const shorts = subscriptions.filter((entry) => entry.format === 'short')

    expect(shorts.length).toBeGreaterThan(0)
    for (const short of shorts) expect(lineup.get(short.channelId)).toBe(clipShow?.id)
  })

  it('keeps the shorts out of the shares, so they crowd nobody out', () => {
    const withShorts = assign([...subscriptions, sub({ channelId: 'UC-zzz', format: 'short' })])
    const programmes = subscriptions.filter((entry) => entry.format !== 'short')
    const counted = (of: typeof lineup) =>
      STATIONS.map((station) => programmes.filter((e) => of.get(e.channelId) === station.id).length)

    expect(counted(withShorts)).toEqual(counted(lineup))
  })

  it('is a fact rather than a decision', () => {
    expect(assign(subscriptions)).toEqual(assign([...subscriptions].reverse()))
  })

  it('copes with no stations at all', () => {
    expect(assign(subscriptions, []).size).toBe(0)
  })

  it('copes with no subscriptions at all', () => {
    expect(assign([]).size).toBe(0)
  })

  /*
    Two stations and five channels of one genre, so both stations rank the
    channels the same way, by standing alone: A, then B, C, D and E.
  */
  describe('the draft', () => {
    const [first, second] = STATIONS
    const ranked = [
      sub({ channelId: 'UC-a', standing: 1 }),
      sub({ channelId: 'UC-b', standing: 0.9 }),
      sub({ channelId: 'UC-c', standing: 0.8 }),
      sub({ channelId: 'UC-d', standing: 0.7 }),
      sub({ channelId: 'UC-e', standing: 0.6 }),
    ]

    // The order reverses each round and back again: the second station takes
    // the second and third choices, and the first takes the fourth and the
    // fifth, which ends the draft part-way through a round.
    it('snakes, so each round starts with the station that picked last', () => {
      const lineup = assign(ranked, [first, second])

      expect(lineup.size).toBe(ranked.length)
      expect(lineupFor(first.id, ranked, lineup).map((s) => s.channelId)).toEqual(['UC-a', 'UC-d', 'UC-e'])
      expect(lineupFor(second.id, ranked, lineup).map((s) => s.channelId)).toEqual(['UC-b', 'UC-c'])
    })

    it('gives a tie between equally fitting channels to the lower channel id', () => {
      const twins = [sub({ channelId: 'UC-y' }), sub({ channelId: 'UC-x' })]
      const lineup = assign(twins, [first, second])

      expect(lineup.get('UC-x')).toBe(first.id)
      expect(lineup.get('UC-y')).toBe(second.id)
    })
  })
})

describe('lineupFor', () => {
  it("lists a station's subscriptions in channel id order, however they arrive", () => {
    const [first] = STATIONS
    const arriving = [sub({ channelId: 'UC-c' }), sub({ channelId: 'UC-a' }), sub({ channelId: 'UC-b' })]
    const lineup = new Map(arriving.map((s) => [s.channelId, first.id]))

    expect(lineupFor(first.id, arriving, lineup).map((s) => s.channelId)).toEqual(['UC-a', 'UC-b', 'UC-c'])
  })
})

describe('fitFor', () => {
  it("is the station's appetite for the genre", () => {
    const one = STATIONS[0]

    expect(fitFor(one, sub({ channelId: 'a', genre: 'news', standing: 0 }))).toBeGreaterThan(
      fitFor(one, sub({ channelId: 'b', genre: 'gaming', standing: 0 })),
    )
  })

  // Between two equally on-brand suppliers, the better watched one first.
  it('breaks a tie on standing', () => {
    const one = STATIONS[0]

    expect(fitFor(one, sub({ channelId: 'a', genre: 'news', standing: 1 }))).toBeGreaterThan(
      fitFor(one, sub({ channelId: 'b', genre: 'news', standing: 0 })),
    )
  })

  // A station that has committed Thursday to comedy must bid for comedy, or
  // it arrives at Thursday with nothing to put on.
  it('pays over the odds for a genre the station has given a night to', () => {
    const two = STATIONS[1]
    const themed = two.themes.flatMap((theme) => theme.genres)

    expect(themed).toContain('comedy')
    expect(fitFor(two, sub({ channelId: 'a', genre: 'comedy', standing: 0 }))).toBeGreaterThan(
      two.appetite.comedy,
    )
  })
})
