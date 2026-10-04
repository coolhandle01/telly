import { describe, expect, it } from 'vitest'
import type { Subscription } from '@/programming/profile'
import { SLOTS } from '@/programming/slots'
import { isStrandLength, strandsFor } from '@/programming/strands'
import { stationById, type Station } from '@/programming/stations'

const one = stationById(1) as Station
const four = stationById(4) as Station

const sub = (overrides: Partial<Subscription> & Pick<Subscription, 'channelId'>): Subscription => ({
  title: overrides.channelId,
  genre: 'factual',
  cadenceDays: 7,
  cadence: 'weekly',
  typicalDurationSec: 55 * 60,
  format: 'hour',
  standing: 0.5,
  restricted: false,
  forChildren: false,
  uploads: 4,
  ...overrides,
})

describe('isStrandLength', () => {
  it('is an hour or a feature, once a week', () => {
    expect(isStrandLength(sub({ channelId: 'a' }))).toBe(true)
    expect(isStrandLength(sub({ channelId: 'b', format: 'feature' }))).toBe(true)
  })

  // A strip goes out across the week rather than on one night of it.
  it('is not something that turns up every day', () => {
    expect(isStrandLength(sub({ channelId: 'a', cadence: 'daily' }))).toBe(false)
  })

  it('is not something too short to be a series', () => {
    expect(isStrandLength(sub({ channelId: 'a', format: 'half-hour' }))).toBe(false)
    expect(isStrandLength(sub({ channelId: 'a', format: 'segment' }))).toBe(false)
  })
})

describe('strandsFor', () => {
  it('gives every weekly supplier a night and a slot', () => {
    const strands = strandsFor(one, [sub({ channelId: 'UC1' }), sub({ channelId: 'UC2' })])

    expect(strands.size).toBe(2)
    expect(strands.get('UC1')?.daypart).toBeDefined()
  })

  it('leaves the strips alone', () => {
    const strands = strandsFor(one, [sub({ channelId: 'UC1', cadence: 'daily' })])

    expect(strands.size).toBe(0)
  })

  // Four strands should be four nights, not two on Tuesday and none on
  // Thursday — which is what hashing a channel id to a weekday gives you.
  it('deals them round the week rather than hashing them to it', () => {
    const four_ = ['UC1', 'UC2', 'UC3', 'UC4'].map((channelId) => sub({ channelId }))
    const nights = [...strandsFor(one, four_).values()].map((strand) => strand.weekday)

    expect(new Set(nights).size).toBe(4)
  })

  it('starts the week on Monday, and saves Sunday for the seventh', () => {
    const seven = Array.from({ length: 7 }, (_, index) => sub({ channelId: `UC${index}` }))
    const nights = [...strandsFor(one, seven).values()].map((strand) => strand.weekday)

    expect(nights[0]).toBe(1)
    expect(nights[6]).toBe(0)
  })

  // Its night has to be one it could actually go out on. A travel series sits
  // best in Channel Four's afternoon, so only the watershed moves it.
  it('gives a restricted supplier a slot after the watershed', () => {
    const slotOf = (restricted: boolean) => {
      const strands = strandsFor(four, [sub({ channelId: 'UC1', restricted, genre: 'travel' })])
      return four.dayparts.find((entry) => entry.id === strands.get('UC1')?.daypart)
    }

    expect(slotOf(false)?.id).toBe('afternoon')
    expect(slotOf(true)?.afterWatershed).toBe(true)
  })

  // A feature-length news series: the bulletins want news most, and take no
  // features at all.
  it('gives a supplier a night in a daypart that takes its length', () => {
    const strand = strandsFor(one, [sub({ channelId: 'UC1', genre: 'news', format: 'feature' })]).get('UC1')

    expect(strand).toBeDefined()
    expect(SLOTS[strand!.daypart].lengths.feature).toBeGreaterThan(0)
  })

  // Peak time weighs standing and the afternoon does not, so standing is what
  // carries a well-watched series into the evening.
  it('gives a well-watched series its night in peak time', () => {
    const strand = strandsFor(one, [sub({ channelId: 'UC1', standing: 1 })]).get('UC1')

    expect(strand?.daypart).toBe('prime')
  })

  // With no standing to weigh, a factual hour scores the same in the
  // afternoon as in peak time, and the earlier of the two keeps it.
  it('leaves a tie with the earlier daypart', () => {
    const strand = strandsFor(one, [sub({ channelId: 'UC1', standing: 0 })]).get('UC1')

    expect(strand?.daypart).toBe('afternoon')
  })

  it('is a fact rather than a decision', () => {
    const subs = ['UC3', 'UC1', 'UC2'].map((channelId) => sub({ channelId }))

    expect(strandsFor(one, subs)).toEqual(strandsFor(one, [...subs].reverse()))
  })
})
