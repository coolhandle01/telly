import { describe, expect, it } from 'vitest'
import type { Schedule, ScheduleItem } from '../domain'
import { nowAndNext, tune } from './tune'

const DAY_START = new Date(2026, 8, 9, 6, 0, 0)

/** The instant `sec` seconds into the broadcast day. */
const at = (sec: number): Date => new Date(DAY_START.getTime() + sec * 1000)

const programme = (
  startSec: number,
  endSec: number,
  videoId: string,
  videoStartSec = 0,
): ScheduleItem => ({
  startSec,
  endSec,
  daypart: 'breakfast',
  content: {
    kind: 'programme',
    videoId,
    title: `Programme ${videoId}`,
    channelId: 'chan-1',
    videoStartSec,
  },
})

/**
 * A hand-made day, small enough to reason about every edge of. Contiguous and
 * gapless, as the scheduler guarantees:
 *
 *   0 .. 600     programme `one`, from the top of the video
 *   600 .. 660   the station's ident, padding to the junction
 *   660 .. 1500  programme `two`, joined 300s in — a junction cut its front off
 *   1500 .. 1800 interlude filler
 */
const DAY: Schedule = {
  startsAt: DAY_START,
  items: [
    programme(0, 600, 'one'),
    {
      startSec: 600,
      endSec: 660,
      daypart: 'breakfast',
      content: { kind: 'filler', variant: 'ident' },
    },
    programme(660, 1500, 'two', 300),
    {
      startSec: 1500,
      endSec: 1800,
      daypart: 'mid-morning',
      content: { kind: 'filler', variant: 'interlude' },
    },
  ],
}

describe('tune', () => {
  it('joins a programme in progress, at the right point in the video', () => {
    expect(tune(DAY, at(90))).toEqual({
      kind: 'programme',
      videoId: 'one',
      title: 'Programme one',
      offsetSec: 90,
      endsAt: at(600),
      daypart: 'breakfast',
    })
  })

  it('counts the offset from where the item starts in the video, not from zero', () => {
    // 90s into an item that itself begins 300s into the video.
    expect(tune(DAY, at(750))).toMatchObject({ videoId: 'two', offsetSec: 390 })
  })

  it('round-trips: the offset lands exactly where the item ends in the video', () => {
    // The last second of `two`: 839s into the item, 300s of which were cut.
    expect(tune(DAY, at(1499))).toMatchObject({ videoId: 'two', offsetSec: 1139 })
  })

  it('is at the very top of the video on an item\'s first second', () => {
    expect(tune(DAY, at(660))).toMatchObject({ videoId: 'two', offsetSec: 300 })
  })

  it('is still on the outgoing item for its last whole second', () => {
    expect(tune(DAY, at(599))).toMatchObject({ videoId: 'one', offsetSec: 599 })
  })

  it('gives the boundary instant to the item that starts there, not the one that ends', () => {
    expect(tune(DAY, at(600))).toMatchObject({
      kind: 'filler',
      variant: 'ident',
      until: at(660),
    })
  })

  it('is on air at the very first instant of the day', () => {
    expect(tune(DAY, at(0))).toMatchObject({ videoId: 'one', offsetSec: 0 })
  })

  it('holds the same second for the whole of that second', () => {
    expect(tune(DAY, new Date(DAY_START.getTime() + 999))).toMatchObject({ offsetSec: 0 })
  })

  it('is on air for the last whole second of the day', () => {
    expect(tune(DAY, at(1799))).toEqual({
      kind: 'filler',
      variant: 'interlude',
      until: at(1800),
      daypart: 'mid-morning',
    })
  })

  it('is off air the instant the day ends', () => {
    expect(tune(DAY, at(1800))).toBeUndefined()
  })

  it('is off air one second before the day begins', () => {
    expect(tune(DAY, at(-1))).toBeUndefined()
  })

  it('is off air a whole day away', () => {
    expect(tune(DAY, at(86_400))).toBeUndefined()
  })

  it('is off air when the schedule has no items at all', () => {
    expect(tune({ startsAt: DAY_START, items: [] }, at(0))).toBeUndefined()
  })

  describe('over a long schedule', () => {
    const MINUTE = 60
    const COUNT = 100
    const LONG: Schedule = {
      startsAt: DAY_START,
      items: Array.from({ length: COUNT }, (_, i) =>
        programme(i * MINUTE, (i + 1) * MINUTE, `vid-${i}`),
      ),
    }

    it('finds the right item at every boundary in the day', () => {
      for (let i = 0; i < COUNT; i++) {
        expect(tune(LONG, at(i * MINUTE))).toMatchObject({
          videoId: `vid-${i}`,
          offsetSec: 0,
        })
        expect(tune(LONG, at((i + 1) * MINUTE - 1))).toMatchObject({
          videoId: `vid-${i}`,
          offsetSec: MINUTE - 1,
        })
      }
    })

    it('is off air either side of a long day', () => {
      expect(tune(LONG, at(-1))).toBeUndefined()
      expect(tune(LONG, at(COUNT * MINUTE))).toBeUndefined()
    })
  })
})

describe('nowAndNext', () => {
  it('reports what is on and what follows it', () => {
    expect(nowAndNext(DAY, at(90))).toEqual({
      now: tune(DAY, at(90)),
      next: DAY.items[1],
    })
  })

  it('has no next at the end of the day', () => {
    expect(nowAndNext(DAY, at(1799))).toEqual({ now: tune(DAY, at(1799)) })
  })

  it('reports nothing at all when the day is over', () => {
    expect(nowAndNext(DAY, at(1800))).toBeUndefined()
  })
})
