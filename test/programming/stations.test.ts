import { describe, expect, it } from 'vitest'
import { atClock, type Daypart, type DaypartId } from '@/domain'
import { SLOTS } from '@/programming/slots'
import { opensAt, STATIONS, type Station } from '@/programming/stations'

/*
  The rules the five stations are built on, checked over every one of them,
  rather than each value copied back out of the table.
*/
describe('every station', () => {
  const onAir = (station: Station) => station.dayparts.filter((daypart) => !daypart.offAir)

  it('has nights with a habit, each on a daypart it has on air and naming a genre', () => {
    for (const station of STATIONS) {
      expect(station.themes.length, station.name).toBeGreaterThan(0)
      for (const theme of station.themes) {
        expect(onAir(station).map((daypart) => daypart.id), station.name).toContain(theme.daypart)
        expect(theme.genres.length, station.name).toBeGreaterThan(0)
      }
    }
  })

  // The points a schedule cuts back to, whatever is running: the news goes
  // out on time, and so does everything else a viewer sets a clock by.
  const JUNCTIONS: readonly DaypartId[] = [
    'lunchtime-news',
    'early-evening-news',
    'childrens',
    'prime',
    'clip-show',
    'closedown',
  ]

  it('holds the news, the children, peak time, the clip show and closedown to their times', () => {
    for (const station of STATIONS) {
      for (const daypart of station.dayparts) {
        expect(daypart.junction, `${station.name} ${daypart.id}`).toBe(JUNCTIONS.includes(daypart.id))
      }
    }
  })

  it('starts every junction on the hour, the quarter or the half', () => {
    for (const station of STATIONS) {
      for (const daypart of station.dayparts.filter((each) => each.junction)) {
        expect(daypart.startMin % 15, `${station.name} ${daypart.id}`).toBe(0)
      }
    }
  })

  it('keeps everything before peak time on the family side of the watershed', () => {
    const after: readonly DaypartId[] = ['prime', 'late-night', 'clip-show']
    for (const station of STATIONS) {
      for (const daypart of onAir(station)) {
        expect(daypart.afterWatershed ?? false, `${station.name} ${daypart.id}`).toBe(after.includes(daypart.id))
      }
    }
  })

  // A slot with no lengths takes nothing at all, and one with no wants takes
  // everything alike. The clip show takes only shorts, whatever they are about.
  it('gives every daypart it has on air a slot that takes something', () => {
    for (const station of STATIONS) {
      for (const daypart of onAir(station)) {
        const slot = SLOTS[daypart.id]
        expect(Object.keys(slot.lengths), `${station.name} ${daypart.id}`).not.toHaveLength(0)
        if (daypart.id !== 'clip-show') expect(Object.keys(slot.wants), daypart.id).not.toHaveLength(0)
      }
    }
  })
})

// An affinity map leaves out a daypart that does not want a video, and never
// records a zero, so a slot that does not want a genre leaves it out too.
describe('every slot', () => {
  it('wants each genre it names by more than nothing', () => {
    for (const [id, slot] of Object.entries(SLOTS)) {
      for (const [genre, want] of Object.entries(slot.wants)) {
        expect(want, `${id} ${genre}`).toBeGreaterThan(0)
      }
    }
  })
})

const offAir = (startMin: number, endMin: number): Daypart => ({
  id: 'closedown',
  name: 'Closedown',
  startMin,
  endMin,
  junction: false,
  offAir: true,
})

const withDay = (dayparts: readonly Daypart[]): Station => ({ ...STATIONS[0], dayparts })

/*
  The closedown card says when service resumes, and it takes the hour from
  here.
*/
describe('opensAt', () => {
  // Every station opens at six, when the broadcast day does.
  it('opens every station at six in the morning', () => {
    expect(STATIONS.map((station) => [station.name, opensAt(station)])).toEqual([
      ['CHANNEL ONE', 6],
      ['CHANNEL TWO', 6],
      ['CHANNEL THREE', 6],
      ['CHANNEL FOUR', 6],
      ['CHANNEL FIVE', 6],
    ])
  })

  it('reads the clock past midnight for a station that opens in the small hours', () => {
    const lateStarter = withDay([
      offAir(atClock(6), atClock(1, 30)),
      { id: 'late-night', name: 'Late Night', startMin: atClock(1, 30), endMin: atClock(5, 59), junction: false },
    ])

    expect(opensAt(lateStarter)).toBe(1)
  })

  it('is the start of the day for a station that never opens', () => {
    expect(opensAt(withDay([offAir(atClock(6), atClock(5, 59))]))).toBe(6)
  })
})
