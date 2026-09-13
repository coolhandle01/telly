import { describe, expect, it } from 'vitest'
import type { Content, DaypartId, Schedule, ScheduleItem } from '../domain'
import { entryAt, listing } from './listing'

const programme = (title: string): Content => ({
  kind: 'programme',
  videoId: 'v',
  title,
  channelId: 'c',
  videoStartSec: 0,
})
const card = (variant: 'closedown' | 'interlude' | 'ident'): Content => ({
  kind: 'filler',
  variant,
})

function scheduleOf(
  items: readonly [number, number, DaypartId, Content][],
): Schedule {
  return {
    startsAt: new Date(2026, 8, 13, 6, 0, 0),
    items: items.map(
      ([startSec, endSec, daypart, content]): ScheduleItem => ({
        startSec,
        endSec,
        daypart,
        content,
      }),
    ),
  }
}

describe('listing', () => {
  it('gives every programme its own line', () => {
    const entries = listing(
      scheduleOf([
        [0, 600, 'breakfast', programme('One')],
        [600, 1200, 'breakfast', programme('Two')],
      ]),
    )

    expect(entries.map((e) => e.label)).toEqual(['One', 'Two'])
  })

  it('keeps two runs of the same programme apart, because the times say so', () => {
    const entries = listing(
      scheduleOf([
        [0, 600, 'breakfast', programme('Repeat')],
        [600, 1200, 'breakfast', programme('Repeat')],
      ]),
    )

    expect(entries).toHaveLength(2)
  })

  it('collapses a run of card into one line', () => {
    // Four and a half hours of test card is one line reading Closedown, and
    // no apology.
    const entries = listing(
      scheduleOf([
        [0, 100, 'closedown', card('closedown')],
        [100, 200, 'closedown', card('closedown')],
        [200, 16200, 'closedown', card('closedown')],
      ]),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ label: 'Closedown', startSec: 0, endSec: 16200 })
  })

  it('tells closedown and an interlude apart', () => {
    const entries = listing(
      scheduleOf([
        [0, 100, 'breakfast', card('interlude')],
        [100, 200, 'closedown', card('closedown')],
      ]),
    )

    expect(entries.map((e) => e.label)).toEqual(['Interlude', 'Closedown'])
  })

  it('counts a lone ident as an interlude rather than a programme', () => {
    // An ident normally belongs to the line above it, but a day that opens on
    // one has no line above it to join.
    const entries = listing(scheduleOf([[0, 40, 'breakfast', card('ident')]]))

    expect(entries[0]).toMatchObject({ kind: 'interlude', label: 'Interlude' })
  })

  it('never runs a line across a daypart, because the page is grouped by them', () => {
    const entries = listing(
      scheduleOf([
        [0, 100, 'breakfast', card('interlude')],
        [100, 200, 'mid-morning', card('interlude')],
      ]),
    )

    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.daypart)).toEqual(['breakfast', 'mid-morning'])
  })

  it('leaves a programme between two runs of card intact', () => {
    const entries = listing(
      scheduleOf([
        [0, 100, 'breakfast', card('interlude')],
        [100, 700, 'breakfast', programme('The Nine O’Clock Show')],
        [700, 800, 'breakfast', card('interlude')],
      ]),
    )

    expect(entries.map((e) => e.kind)).toEqual(['interlude', 'programme', 'interlude'])
  })
})

describe('entryAt', () => {
  const entries = listing(
    scheduleOf([
      [0, 600, 'breakfast', programme('One')],
      [600, 1200, 'breakfast', programme('Two')],
    ]),
  )

  it('finds what is on at an instant', () => {
    expect(entryAt(entries, 0)?.label).toBe('One')
    expect(entryAt(entries, 599)?.label).toBe('One')
  })

  it('is half-open, like the tuner: an ending is already the next line', () => {
    expect(entryAt(entries, 600)?.label).toBe('Two')
  })

  it('has nothing outside the day', () => {
    expect(entryAt(entries, 1200)).toBeUndefined()
  })
})
