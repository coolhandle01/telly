import { describe, expect, it } from 'vitest'
import type { Subscription } from './profile'
import { isStrandLength, strandsFor } from './strands'
import { stationById, type Station } from './stations'

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
  // Thursday, which is what hashing a channel id to a weekday gives you.
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

  // Its night has to be one it could actually go out on.
  it('gives a restricted supplier a slot after the watershed', () => {
    const strands = strandsFor(four, [sub({ channelId: 'UC1', restricted: true, genre: 'film' })])
    const daypart = four.dayparts.find((entry) => entry.id === strands.get('UC1')?.daypart)

    expect(daypart?.afterWatershed).toBe(true)
  })

  it('is a fact rather than a decision', () => {
    const subs = ['UC3', 'UC1', 'UC2'].map((channelId) => sub({ channelId }))

    expect(strandsFor(one, subs)).toEqual(strandsFor(one, [...subs].reverse()))
  })
})
