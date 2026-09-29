import { describe, expect, it } from 'vitest'
import { atClock, type Daypart } from '@/domain'
import { opensAt, STATIONS, type Station } from '@/programming/stations'

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
  it('is the hour each station first carries programmes', () => {
    expect(STATIONS.map((station) => [station.name, opensAt(station)])).toEqual([
      ['CHANNEL ONE', 6],
      ['CHANNEL TWO', 11],
      ['CHANNEL THREE', 6],
      ['CHANNEL FOUR', 15],
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
