import { describe, expect, it } from 'vitest'
import { offsetFromQuery } from '../clock/offsetClock'
import { FixturePoolSource } from '../library'
import { plan } from '../schedule/plan'
import { tune } from '../broadcast'
import { designForDate } from '../testcard/designs'
import type { CardDesignId } from '../testcard/model'
import { SECONDS_PER_DAY, broadcastDayLength, broadcastDayStart, secondsIntoDay } from './time'

/**
 * The two days a year the arithmetic is wrong.
 *
 * This file runs under `TZ=Europe/London` — `npm run test:dst` — because the
 * rest of the suite runs wherever the machine is, and CI is UTC, where British
 * Summer Time does not exist and none of this can happen. That is exactly why
 * none of it was caught.
 *
 * UK clocks go forward 01.00 -> 02.00 on Sunday 29 March 2026, and back
 * 02.00 -> 01.00 on Sunday 25 October 2026. Both fall *inside* a broadcast day
 * that began at 06.00 the morning before.
 */

const SPRING = new Date(2026, 2, 28, 12, 0) // Saturday, the day the change lands in
const AUTUMN = new Date(2026, 9, 24, 12, 0)

const ROTATION: readonly CardDesignId[] = ['electronic', 'bars', 'monoscope', 'crosshatch', 'ident']

it('is running somewhere that has British Summer Time', () => {
  // Without this the rest of the file is a very confident no-op.
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Europe/London')
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(-60)
})

describe('the length of a broadcast day', () => {
  it('is twenty-three hours when the clocks go forward', () => {
    expect(broadcastDayLength(broadcastDayStart(SPRING))).toBe(23 * 3600)
  })

  it('is twenty-five hours when they go back', () => {
    expect(broadcastDayLength(broadcastDayStart(AUTUMN))).toBe(25 * 3600)
  })

  it('is a plain day the rest of the year', () => {
    expect(broadcastDayLength(broadcastDayStart(new Date(2026, 8, 12, 12)))).toBe(SECONDS_PER_DAY)
  })

  it('always reaches exactly the next day, whatever the clocks did', () => {
    for (const day of [SPRING, AUTUMN]) {
      const start = broadcastDayStart(day)
      const next = broadcastDayStart(new Date(day.getTime() + SECONDS_PER_DAY * 1000))
      expect(secondsIntoDay(next, start)).toBe(broadcastDayLength(start))
    }
  })
})

describe('a schedule for one of those days', () => {
  const scheduleFor = async (day: Date) =>
    plan(await new FixturePoolSource().load(), { dayStart: day })

  it('covers the short day exactly, with nothing left over', async () => {
    const schedule = await scheduleFor(SPRING)
    expect(schedule.items.at(-1)?.endSec).toBe(23 * 3600)
  })

  it('covers the long day exactly, rather than running out an hour early', async () => {
    // This is the one that shows: an October evening used to reach the end of
    // its own schedule at 05.00 and have nothing at all to put on until six.
    const schedule = await scheduleFor(AUTUMN)
    expect(schedule.items.at(-1)?.endSec).toBe(25 * 3600)
  })

  it('has something on air at every hour of the long day', async () => {
    const schedule = await scheduleFor(AUTUMN)
    const start = schedule.startsAt.getTime()

    for (let hour = 0; hour < 25; hour++) {
      const at = new Date(start + hour * 3600 * 1000)
      expect(tune(schedule, at), `${hour}h in`).toBeDefined()
    }
  })

  it('is still on air in the last minute before the next day starts', async () => {
    const schedule = await scheduleFor(AUTUMN)
    const nextStart = broadcastDayStart(new Date(AUTUMN.getTime() + SECONDS_PER_DAY * 1000))

    expect(tune(schedule, new Date(nextStart.getTime() - 60_000))).toBeDefined()
  })
})

describe('the card rotation', () => {
  const stepsFrom = (year: number, month: number, day: number, days: number) =>
    Array.from({ length: days }, (_, i) => {
      const a = designForDate(new Date(year, month - 1, day + i, 12))
      const b = designForDate(new Date(year, month - 1, day + i + 1, 12))
      return (ROTATION.indexOf(b) - ROTATION.indexOf(a) + ROTATION.length) % ROTATION.length
    })

  it('advances by one every day through the spring forward', () => {
    // It used to repeat a card here: 1 1 1 0 1 1.
    expect(stepsFrom(2026, 3, 26, 6)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('advances by one every day through the autumn back', () => {
    // And skip one here: 1 1 1 2 1 1.
    expect(stepsFrom(2026, 10, 22, 6)).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('holds one card across a broadcast day that is twenty-five hours long', () => {
    // The 24th's broadcast day: 06.00 on Saturday through to 06.00 on Sunday,
    // with an extra hour in the middle of it. One card for all twenty-five.
    const openUp = designForDate(new Date(2026, 9, 24, 6, 0))

    expect(designForDate(new Date(2026, 9, 24, 23, 30))).toBe(openUp)
    expect(designForDate(new Date(2026, 9, 25, 1, 30))).toBe(openUp)
    expect(designForDate(new Date(2026, 9, 25, 5, 30))).toBe(openUp)
    // And the next one is a different card, not the same one again.
    expect(designForDate(new Date(2026, 9, 25, 6, 0))).not.toBe(openUp)
  })
})

describe('the bound on ?at=', () => {
  /*
    `?at=` may move the clock anywhere inside the broadcast day it is already
    in, and nowhere else — the set holds one day's schedule and that is the one
    it can show you. Which makes the bound exactly as long as the day is, and
    twice a year that is not twenty-four hours.

    Assume 86,400 and the spring day grants an hour it does not have, while the
    autumn day refuses the last real hour of itself. Both are wrong in the
    direction nobody notices until October.
  */
  const offsetTo = (target: Date, now: Date) => target.getTime() - now.getTime()

  it('reaches the last hour of a twenty-five hour day', () => {
    const now = new Date(2026, 9, 24, 20, 0) // Saturday evening, the long day
    // 05.30 on the Sunday is inside a day that ends at 06.00 — and it is an
    // hour that only exists because the clocks went back.
    const lateOn = new Date(2026, 9, 25, 5, 30)

    expect(offsetFromQuery(`?at=${lateOn.toISOString()}`, now)).toBe(offsetTo(lateOn, now))
    // The next day's 06.00 is still refused, long day or not.
    expect(offsetFromQuery(`?at=${new Date(2026, 9, 25, 6, 0).toISOString()}`, now)).toBe(0)
  })

  it('stops at the end of a twenty-three hour day', () => {
    const now = new Date(2026, 2, 28, 20, 0) // Saturday evening, the short day
    const lastMinute = new Date(2026, 2, 29, 5, 59)

    expect(offsetFromQuery(`?at=${lastMinute.toISOString()}`, now)).toBe(offsetTo(lastMinute, now))
    expect(offsetFromQuery(`?at=${new Date(2026, 2, 29, 6, 0).toISOString()}`, now)).toBe(0)
  })

  it('measures the bound by the day, not by twenty-four hours', () => {
    const spring = new Date(2026, 2, 28, 7, 0)
    const autumn = new Date(2026, 9, 24, 7, 0)
    const reach = (now: Date) => {
      const start = broadcastDayStart(now)
      return broadcastDayLength(start) * 1000 - (now.getTime() - start.getTime())
    }

    // An hour short in spring, an hour over in autumn. A fixed 24 would make
    // these the same number, which is the bug.
    expect(reach(spring)).toBe(22 * 3600 * 1000)
    expect(reach(autumn)).toBe(24 * 3600 * 1000)
  })
})
