import { describe, expect, it } from 'vitest'
import { broadcastDayLength, broadcastDayStart } from '@/domain'
import { fixturePool } from '../support/pool'
import { assertCoversDay } from '@/schedule/plan'
import { planStations } from '@/programming/schedules'
import { STATIONS } from '@/programming/stations'

const pool = fixturePool()
/** A Thursday. Comedy night on Channel Two, and nothing special anywhere else. */
const THURSDAY = new Date(2026, 8, 10, 14, 0, 0)

const listings = planStations(pool, { dayStart: THURSDAY })

const programmesOn = (station: number) =>
  (listings.schedules.get(station as never)?.items ?? []).flatMap((item) =>
    item.content.kind === 'programme' ? [item.content] : [],
  )

describe('planStations', () => {
  it('plans one broadcast day for every station', () => {
    expect(listings.schedules.size).toBe(STATIONS.length)
    for (const station of STATIONS) {
      const schedule = listings.schedules.get(station.id)
      expect(schedule?.startsAt).toEqual(broadcastDayStart(THURSDAY))
      assertCoversDay(schedule?.items ?? [], broadcastDayLength(broadcastDayStart(THURSDAY)))
    }
  })

  // The point of exclusivity, seen from the sofa: tuning around has to show
  // five different evenings rather than one schedule in five hats.
  it('shows a different evening on every preset', () => {
    const evenings = STATIONS.map((station) =>
      programmesOn(station.id)
        .map((programme) => programme.videoId)
        .join(),
    )

    expect(new Set(evenings).size).toBe(STATIONS.length)
  })

  it('shows a station only its own suppliers', () => {
    for (const station of STATIONS) {
      for (const programme of programmesOn(station.id)) {
        expect(listings.lineup.get(programme.channelId)).toBe(station.id)
      }
    }
  })

  it('gives every station something to broadcast', () => {
    for (const station of STATIONS) {
      expect(programmesOn(station.id).length).toBeGreaterThan(5)
    }
  })

  /*
    A station with seven suppliers and nineteen hours cannot fill them all with
    new material, and never could. What it did about that was repeat things.
  */
  it('repeats rather than showing the card all evening', () => {
    const all = STATIONS.flatMap((station) => programmesOn(station.id))
    const repeats = all.filter((programme) => programme.repeat)

    expect(repeats.length).toBeGreaterThan(0)
    // But never so often that a programme is the whole schedule.
    const showings = new Map<string, number>()
    for (const programme of all) {
      showings.set(programme.videoId, (showings.get(programme.videoId) ?? 0) + 1)
    }
    expect(Math.max(...showings.values())).toBeLessThanOrEqual(2)
  })

  it('keeps the station off air when the station is off air', () => {
    // Channel Four does not open until the afternoon.
    const morning = listings.schedules.get(4)?.items.find((item) => item.startSec === 0)

    expect(morning?.content).toEqual({ kind: 'filler', variant: 'closedown' })
  })

  it('never closes Channel Five down', () => {
    const closedowns = listings.schedules
      .get(5)
      ?.items.filter((item) => item.content.kind === 'filler' && item.content.variant === 'closedown')

    expect(closedowns).toHaveLength(0)
  })

  it('puts the shorts in the small hours and nowhere else', () => {
    const clips = listings.schedules.get(5)?.items.filter((item) => item.daypart === 'clip-show')

    expect(clips?.length).toBeGreaterThan(20)
    for (const station of STATIONS) {
      for (const item of listings.schedules.get(station.id)?.items ?? []) {
        if (item.daypart === 'clip-show') continue
        if (item.content.kind !== 'programme') continue
        expect(item.endSec - item.startSec).toBeGreaterThan(65)
      }
    }
  })

  it('is a fact rather than a decision', () => {
    const again = planStations(fixturePool(), { dayStart: THURSDAY })

    expect(again.schedules).toEqual(listings.schedules)
  })

  it('gives a different day a different schedule', () => {
    const friday = planStations(pool, { dayStart: new Date(2026, 8, 11, 14, 0, 0) })

    expect(friday.schedules.get(1)).not.toEqual(listings.schedules.get(1))
  })

  it('shows the card, rather than falling over, with nothing to broadcast', () => {
    const empty = planStations({ videos: [], channels: new Map() }, { dayStart: THURSDAY })

    for (const station of STATIONS) {
      const items = empty.schedules.get(station.id)?.items ?? []
      assertCoversDay(items, broadcastDayLength(broadcastDayStart(THURSDAY)))
      expect(items.every((item) => item.content.kind !== 'programme')).toBe(true)
    }
  })
})
