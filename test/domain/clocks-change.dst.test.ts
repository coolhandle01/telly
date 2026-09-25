import { describe, expect, it } from 'vitest'
import { FixturePoolSource } from '../support/fixturePoolSource'
import { plan } from '@/schedule/plan'
import { tune } from '@/broadcast'
import { designForDate } from '@/testcard/designs'
import type { CardDesignId } from '@/testcard/model'
import { SECONDS_PER_DAY, broadcastDayLength, broadcastDayStart, secondsIntoDay } from '@/domain/time'

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
