import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAYPARTS,
  MINUTES_PER_DAY,
  SECONDS_PER_DAY,
  atClock,
  type Channel,
  type Daypart,
  type Pool,
  type Programme,
  type Schedule,
  type Video,
} from '@/domain'
import { fixturePool } from '../support/pool'
import { HeuristicClassifier, OverridingClassifier, type Affinities, type Classifier } from '@/schedule/classify'
import { plan } from '@/schedule/plan'

const MINUTE = 60
/** A broadcast day that begins at local 06.00 on a fixed date. */
const DAY_START = new Date(2026, 8, 9, 6, 0, 0)

function video(overrides: Partial<Video> & Pick<Video, 'id'>): Video {
  return {
    channelId: 'UC-test',
    // Named after the id, because two uploads of one channel with one name
    // are one programme and the packer treats them that way.
    title: `A Programme (${overrides.id})`,
    durationSec: 20 * MINUTE,
    publishedAt: '2026-09-08T12:00:00.000Z',
    ageRestricted: false,
    madeForKids: false,
    embeddable: true,
    isLive: false,
    ...overrides,
  }
}

function poolOf(videos: readonly Video[]): Pool {
  const channels = new Map<string, Channel>()
  for (const v of videos) channels.set(v.channelId, { id: v.channelId, title: v.channelId })
  return { videos, channels }
}

/** A classifier that answers from a lookup table, so a test can state its own facts. */
function classifierOf(byVideoId: Readonly<Record<string, Affinities>>): Classifier {
  return { classify: (v) => byVideoId[v.id] ?? {} }
}

/** A whole day in two parts: one programmable slot, then closedown. */
function twoPartDay(programmableMin: number, junction = true): readonly Daypart[] {
  return [
    { id: 'breakfast', name: 'Breakfast', startMin: 0, endMin: programmableMin, junction: false },
    {
      id: 'closedown',
      name: 'Closedown',
      startMin: programmableMin,
      endMin: MINUTES_PER_DAY,
      junction,
      offAir: true,
    },
  ]
}

const programmes = (schedule: Schedule): Programme[] =>
  schedule.items.map((i) => i.content).filter((c): c is Programme => c.kind === 'programme')

/**
 * The invariant the tuner depends on: contiguous, gapless, non-empty items
 * covering exactly one day from second zero.
 */
function assertCoversDayExactly(schedule: Schedule): void {
  expect(schedule.items.length).toBeGreaterThan(0)
  let expected = 0
  for (const item of schedule.items) {
    expect(item.startSec).toBe(expected)
    expect(item.endSec).toBeGreaterThan(item.startSec)
    expected = item.endSec
  }
  expect(expected).toBe(SECONDS_PER_DAY)
}

describe('plan, over the fixture pool', () => {
  const pool = fixturePool()
  const schedule = plan(pool, { dayStart: DAY_START })

  it('covers the whole broadcast day with no gaps and no overlaps', () => {
    assertCoversDayExactly(schedule)
  })

  it('actually schedules programmes rather than a day of filler', () => {
    expect(programmes(schedule).length).toBeGreaterThan(10)
  })

  it('dates the schedule from the start of the broadcast day', () => {
    expect(schedule.startsAt).toEqual(DAY_START)
  })

  it('takes the broadcast day containing an instant, not the instant', () => {
    const afternoon = plan(pool, { dayStart: new Date(2026, 8, 9, 14, 30, 15) })
    expect(afternoon.startsAt).toEqual(DAY_START)
  })

  it('gives closedown a single closedown filler and nothing else', () => {
    const items = schedule.items.filter((i) => i.daypart === 'closedown')
    expect(items).toHaveLength(1)
    expect(items[0].content).toEqual({ kind: 'filler', variant: 'closedown' })
    expect(items[0].startSec).toBe(atClock(1, 30) * 60)
    expect(items[0].endSec).toBe(SECONDS_PER_DAY)
  })

  it('never airs the same video twice in a day', () => {
    const ids = programmes(schedule).map((p) => p.videoId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never airs a video that is live or cannot be embedded', () => {
    const withLive = poolOf(
      pool.videos.map((v, i) => (i % 5 === 0 ? { ...v, isLive: true } : v)),
    )
    const aired = new Set(programmes(plan(withLive, { dayStart: DAY_START })).map((p) => p.videoId))
    expect(aired.size).toBeGreaterThan(0)
    for (const v of withLive.videos) {
      if (v.isLive || !v.embeddable) expect(aired.has(v.id)).toBe(false)
    }
  })

  it('starts every junction daypart at exactly its appointed minute', () => {
    for (const daypart of DEFAULT_DAYPARTS) {
      if (!daypart.junction) continue
      const first = schedule.items.find((i) => i.daypart === daypart.id)
      expect(first?.startSec).toBe(daypart.startMin * 60)
    }
  })

  it('only ever plays a programme from its own start', () => {
    for (const p of programmes(schedule)) expect(p.videoStartSec).toBe(0)
  })
})

describe('plan, determinism', () => {
  const pool = fixturePool()

  it('gives the same schedule for the same pool, options and seed', () => {
    expect(plan(pool, { dayStart: DAY_START, seed: 7 })).toEqual(
      plan(pool, { dayStart: DAY_START, seed: 7 }),
    )
  })

  it('gives a different but still valid schedule for a different seed', () => {
    const a = plan(pool, { dayStart: DAY_START, seed: 7 })
    const b = plan(pool, { dayStart: DAY_START, seed: 8 })
    expect(b.items).not.toEqual(a.items)
    assertCoversDayExactly(b)
  })
})

describe('plan, the junction rule', () => {
  const LONG_SEC = 3 * 60 * MINUTE
  const long = video({ id: 'long', channelId: 'UC-long', durationSec: LONG_SEC })
  const classifier = classifierOf({ long: { 'mid-morning': 1 } })
  const MID_MORNING_START = atClock(9, 15) * 60
  const NOON = atClock(12) * 60

  const options = { dayStart: DAY_START, classifier, maxOverrunSec: 60 * MINUTE }
  const schedule = plan(poolOf([long]), options)

  it('starts the lunchtime news on time even though the programme was still running', () => {
    const first = schedule.items.find((i) => i.daypart === 'lunchtime-news')
    expect(first?.startSec).toBe(NOON)
  })

  it('cuts the overrunning programme short at the junction', () => {
    const item = schedule.items.find(
      (i) => i.content.kind === 'programme' && i.content.videoId === 'long',
    )
    expect(item?.startSec).toBe(MID_MORNING_START)
    expect(item?.endSec).toBe(NOON)
    expect(item!.endSec - item!.startSec).toBeLessThan(LONG_SEC)
  })

  it('leaves the cut programme joined at its own beginning', () => {
    const item = schedule.items.find(
      (i) => i.content.kind === 'programme' && i.content.videoId === 'long',
    )
    expect((item!.content as Programme).videoStartSec).toBe(0)
  })

  it('lets the same programme overrun a daypart that is not a junction', () => {
    const floating = DEFAULT_DAYPARTS.map((d) =>
      d.id === 'lunchtime-news' ? { ...d, junction: false } : d,
    )
    const pushed = plan(poolOf([long]), { ...options, dayparts: floating })
    const item = pushed.items.find(
      (i) => i.content.kind === 'programme' && i.content.videoId === 'long',
    )
    expect(item?.endSec).toBe(MID_MORNING_START + LONG_SEC)
    expect(item!.endSec).toBeGreaterThan(NOON)
    expect(pushed.items.find((i) => i.daypart === 'lunchtime-news')?.startSec).toBe(item?.endSec)
    assertCoversDayExactly(pushed)
  })

  it('still covers the day exactly when a programme is cut short', () => {
    assertCoversDayExactly(schedule)
  })
})

describe('plan, when nothing is eligible', () => {
  it('gives a complete valid day of filler for an empty pool', () => {
    const schedule = plan(poolOf([]), { dayStart: DAY_START })
    assertCoversDayExactly(schedule)
    expect(programmes(schedule)).toHaveLength(0)
    expect(schedule.items.filter((i) => i.content.kind === 'filler')).toHaveLength(
      schedule.items.length,
    )
  })

  it('gives a complete valid day of filler for a wholly ineligible pool', () => {
    const pool = poolOf([
      video({ id: 'a', isLive: true }),
      video({ id: 'b', embeddable: false }),
      video({ id: 'c', durationSec: 0 }),
    ])
    const schedule = plan(pool, { dayStart: DAY_START })
    assertCoversDayExactly(schedule)
    expect(programmes(schedule)).toHaveLength(0)
  })

  it('gives filler to a daypart with nothing eligible even when other dayparts are full', () => {
    const shorts = [0, 1, 2].map((i) =>
      video({ id: `s${i}`, channelId: 'UC-short', durationSec: 4 * MINUTE }),
    )
    const schedule = plan(poolOf(shorts), {
      dayStart: DAY_START,
      classifier: classifierOf(Object.fromEntries(shorts.map((v) => [v.id, { breakfast: 1 }]))),
    })
    assertCoversDayExactly(schedule)
    expect(programmes(schedule)).toHaveLength(3)
    const evening = schedule.items.filter((i) => i.daypart === 'evening')
    expect(evening.every((i) => i.content.kind === 'filler')).toBe(true)
  })
})

/*
  A station with a handful of suppliers and nineteen hours to fill runs out,
  and what it did about that was show things again — the afternoon repeat of
  last night's documentary was the schedule, not a failure of it.
*/
describe('plan, repeats', () => {
  const durationSec = 30 * MINUTE
  /** Five hours of material and a whole day to put it in. */
  const library = Array.from({ length: 10 }, (_, index) => video({ id: `p${index}`, durationSec }))
  const wholeDay = {
    dayStart: DAY_START,
    dayparts: twoPartDay(24 * 60),
    classifier: classifierOf(Object.fromEntries(library.map((v) => [v.id, { breakfast: 1 }]))),
  }

  it('shows a programme again rather than showing the card all evening', () => {
    const aired = programmes(plan(poolOf(library), wholeDay))

    expect(aired.length).toBeGreaterThan(library.length)
    expect(aired.filter((programme) => programme.repeat).length).toBeGreaterThan(0)
  })

  it('marks only the second showing as a repeat', () => {
    const aired = programmes(plan(poolOf(library), wholeDay))
    const seen = new Set<string>()

    for (const programme of aired) {
      expect(programme.repeat).toBe(seen.has(programme.videoId) ? true : undefined)
      seen.add(programme.videoId)
    }
  })

  it('never shows the same thing three times', () => {
    const aired = programmes(plan(poolOf(library), wholeDay))
    const showings = new Map<string, number>()
    for (const programme of aired) {
      showings.set(programme.videoId, (showings.get(programme.videoId) ?? 0) + 1)
    }

    expect(Math.max(...showings.values())).toBe(2)
  })

  // Far enough apart that nobody is watching both.
  it('leaves hours between the two showings', () => {
    const schedule = plan(poolOf(library), wholeDay)
    const firstEnd = new Map<string, number>()

    for (const item of schedule.items) {
      if (item.content.kind !== 'programme') continue
      const seen = firstEnd.get(item.content.videoId)
      if (seen === undefined) firstEnd.set(item.content.videoId, item.endSec)
      else expect(item.startSec - seen).toBeGreaterThanOrEqual(4 * 3600)
    }
  })

  it('takes something new over something already shown', () => {
    const videos = [video({ id: 'seen', durationSec }), video({ id: 'unseen', durationSec })]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: twoPartDay(60),
      classifier: classifierOf({ seen: { breakfast: 1 }, unseen: { breakfast: 1 } }),
    })

    expect(new Set(programmes(schedule).map((p) => p.videoId)).size).toBe(2)
  })

  // Two uploads of one channel with one name are one programme, whatever
  // their ids say — which is how the same clip came round twice in an hour.
  it('treats two uploads of a channel with the same name as one programme', () => {
    const videos = [
      { ...video({ id: 'a', durationSec }), title: 'The Same Thing' },
      { ...video({ id: 'b', durationSec }), title: 'The Same Thing' },
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: twoPartDay(60),
      classifier: classifierOf({ a: { breakfast: 1 }, b: { breakfast: 1 } }),
    })

    expect(programmes(schedule)).toHaveLength(1)
  })

  it('lets two channels share a name, because that is a coincidence', () => {
    const videos = [
      { ...video({ id: 'a', channelId: 'UC-a', durationSec }), title: 'The News' },
      { ...video({ id: 'b', channelId: 'UC-b', durationSec }), title: 'The News' },
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: twoPartDay(60),
      classifier: classifierOf({ a: { breakfast: 1 }, b: { breakfast: 1 } }),
    })

    expect(programmes(schedule)).toHaveLength(2)
  })
})

/*
  The one place the schedule reaches for a tidy time rather than preferring one:
  a programme that ends at 20.57 leaves three minutes, and what a station does
  with three minutes is put its own symbol up and start the next one at nine.
*/
describe('plan, idents', () => {
  const day = (programmableMin: number) => twoPartDay(programmableMin)
  const fillers = (schedule: Schedule) =>
    schedule.items.filter((item) => item.content.kind === 'filler')

  it('holds the ident up to the next quarter', () => {
    // Fourteen minutes leaves one, and a minute is not a programme.
    const videos = [video({ id: 'a', durationSec: 14 * MINUTE })]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: day(60),
      classifier: classifierOf({ a: { breakfast: 1 } }),
    })

    const ident = fillers(schedule).find(
      (item) => item.content.kind === 'filler' && item.content.variant === 'ident',
    )
    expect(ident?.startSec).toBe(14 * MINUTE)
    expect(ident?.endSec).toBe(15 * MINUTE)
  })

  it('starts the next programme on the mark', () => {
    const videos = [
      video({ id: 'a', durationSec: 14 * MINUTE }),
      video({ id: 'b', durationSec: 20 * MINUTE }),
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: day(60),
      classifier: classifierOf({ a: { breakfast: 1 }, b: { breakfast: 1 } }),
    })

    const second = programmes(schedule)[1]
    expect(second).toBeDefined()
    const item = schedule.items.find(
      (entry) => entry.content.kind === 'programme' && entry.content.videoId === second.videoId,
    )
    expect((item?.startSec ?? 0) % (15 * MINUTE)).toBe(0)
  })

  // More than a few minutes is a real gap, and a real gap is the card's.
  it('leaves a long gap to the card rather than the symbol', () => {
    const videos = [video({ id: 'a', durationSec: 5 * MINUTE })]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: day(60),
      classifier: classifierOf({ a: { breakfast: 1 } }),
    })

    const variants = new Set(
      fillers(schedule).map((item) => (item.content.kind === 'filler' ? item.content.variant : '')),
    )
    expect(variants.has('ident')).toBe(false)
  })

  it('does not hold one up with nothing to follow it', () => {
    const schedule = plan(poolOf([]), { dayStart: DAY_START, dayparts: day(60) })

    const variants = fillers(schedule).map((item) =>
      item.content.kind === 'filler' ? item.content.variant : '',
    )
    expect(variants).not.toContain('ident')
  })
})

describe('plan, gaps', () => {
  const one = video({ id: 'one', durationSec: 10 * MINUTE })
  const classifier = classifierOf({ one: { breakfast: 1 } })

  it('makes a gap longer than a held ident an interlude', () => {
    const schedule = plan(poolOf([one]), {
      dayStart: DAY_START,
      dayparts: twoPartDay(15),
      classifier,
    })
    assertCoversDayExactly(schedule)
    expect(schedule.items[0].endSec).toBe(10 * MINUTE)
    expect(schedule.items[1]).toEqual({
      startSec: 10 * MINUTE,
      endSec: 15 * MINUTE,
      daypart: 'breakfast',
      content: { kind: 'filler', variant: 'interlude' },
    })
  })

  it('pads the last couple of minutes to a junction with the ident', () => {
    // Not a caption saying what is coming. A station with two minutes to fill
    // before the hour put its own mark up, and this is that.
    const schedule = plan(poolOf([one]), {
      dayStart: DAY_START,
      dayparts: twoPartDay(12),
      classifier,
    })
    assertCoversDayExactly(schedule)
    expect(schedule.items[1].content).toEqual({ kind: 'filler', variant: 'ident' })
    expect(schedule.items[1].startSec).toBe(10 * MINUTE)
    expect(schedule.items[1].endSec).toBe(12 * MINUTE)
  })

  it('never captions what is coming next: a schedule has no continuity kind', () => {
    // The whole vocabulary of a gap is card, ident, closedown. A station that
    // had something to say said it over its own symbol.
    const schedule = plan(fixturePool(), { dayStart: DAY_START })
    const kinds = new Set(schedule.items.map((item) => item.content.kind))
    expect([...kinds].sort()).toEqual(['filler', 'programme'])
  })
})

describe('plan, honouring the classifier', () => {
  const pool = fixturePool()

  it('puts a pinned channel where it is pinned and nowhere else', () => {
    const pinned = 'UC-sci-2'
    const classifier = new OverridingClassifier(new HeuristicClassifier(pool), {
      [pinned]: ['late-night'],
    })
    const schedule = plan(pool, { dayStart: DAY_START, classifier })

    const daypartsOf = (channelId: string) =>
      new Set(
        schedule.items
          .filter((i) => i.content.kind === 'programme' && i.content.channelId === channelId)
          .map((i) => i.daypart),
      )

    expect(daypartsOf(pinned)).toEqual(new Set(['late-night']))
  })

  it('would have put that channel in breakfast without the pin', () => {
    const schedule = plan(pool, { dayStart: DAY_START })
    const breakfast = schedule.items.filter(
      (i) =>
        i.daypart === 'breakfast' &&
        i.content.kind === 'programme' &&
        i.content.channelId === 'UC-sci-2',
    )
    expect(breakfast.length).toBeGreaterThan(0)
  })
})

describe('plan, ranking and eligibility', () => {
  const durationSec = 10 * MINUTE

  it('does not run one channel twice over while another is still waiting', () => {
    const videos = [
      video({ id: 'a0', channelId: 'UC-a', durationSec }),
      video({ id: 'a1', channelId: 'UC-a', durationSec }),
      video({ id: 'a2', channelId: 'UC-a', durationSec }),
      video({ id: 'b0', channelId: 'UC-b', durationSec }),
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: twoPartDay(20),
      classifier: classifierOf(Object.fromEntries(videos.map((v) => [v.id, { breakfast: 1 }]))),
    })

    const aired = programmes(schedule)
    expect(aired).toHaveLength(2)
    expect(aired[0].channelId).not.toBe(aired[1].channelId)
  })

  it('refuses a live, unembeddable or zero-length video however much a classifier wants it', () => {
    const videos = [
      video({ id: 'live', isLive: true, durationSec }),
      video({ id: 'blocked', embeddable: false, durationSec }),
      video({ id: 'zero', durationSec: 0 }),
      video({ id: 'ok', durationSec }),
    ]
    // A classifier that is wrong about everything. Eligibility is not its call.
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: twoPartDay(20),
      classifier: { classify: () => ({ breakfast: 1 }) },
    })

    expect(programmes(schedule).map((p) => p.videoId)).toEqual(['ok'])
  })
})

describe('plan, what it prefers', () => {
  it('prefers the fresher of two otherwise identical uploads', () => {
    const videos = [
      video({ id: 'stale', channelId: 'UC-a', durationSec: 10 * MINUTE, publishedAt: '2026-08-01T05:00:00.000Z' }),
      video({ id: 'fresh', channelId: 'UC-b', durationSec: 10 * MINUTE, publishedAt: '2026-09-09T05:00:00.000Z' }),
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      dayparts: twoPartDay(25),
      classifier: classifierOf({ stale: { breakfast: 1 }, fresh: { breakfast: 1 } }),
    })

    expect(programmes(schedule).map((p) => p.videoId)).toEqual(['fresh', 'stale'])
  })

  it('prefers a programme that ends on a quarter hour to one that ends at random', () => {
    // Seed 2 ranks 'untidy' above 'tidy' on the seeded jitter alone, so this
    // passes only if ending on the junction is what decided it.
    const videos = [
      video({ id: 'tidy', channelId: 'UC-a', durationSec: 15 * MINUTE }),
      video({ id: 'untidy', channelId: 'UC-b', durationSec: 1250 }),
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      seed: 2,
      dayparts: twoPartDay(40),
      classifier: classifierOf({ tidy: { breakfast: 1 }, untidy: { breakfast: 1 } }),
    })

    const aired = programmes(schedule)
    expect(aired.map((p) => p.videoId)).toEqual(['tidy', 'untidy'])
    expect(schedule.items[0].endSec).toBe(15 * MINUTE)
  })

  it('will not take a programme that overruns its daypart by more than the allowance', () => {
    const long = video({ id: 'long', durationSec: 20 * MINUTE + 601 })
    const options = {
      dayStart: DAY_START,
      dayparts: twoPartDay(20),
      classifier: classifierOf({ long: { breakfast: 1 } }),
    }

    expect(programmes(plan(poolOf([long]), options))).toHaveLength(0)
    expect(
      programmes(plan(poolOf([long]), { ...options, maxOverrunSec: 700 })).map((p) => p.videoId),
    ).toEqual(['long'])
  })

  it('will not take a video whose affinity is below the threshold', () => {
    const shy = video({ id: 'shy', durationSec: 10 * MINUTE })
    const options = {
      dayStart: DAY_START,
      dayparts: twoPartDay(20),
      classifier: classifierOf({ shy: { breakfast: 0.1 } }),
    }

    expect(programmes(plan(poolOf([shy]), options))).toHaveLength(0)
    expect(
      programmes(plan(poolOf([shy]), { ...options, minAffinity: 0.05 })).map((p) => p.videoId),
    ).toEqual(['shy'])
  })

  it('prefers the programme that fits the time left to one that would run over it', () => {
    // 'over' ends bang on the half hour and would win on tidiness alone; it is
    // the overrun penalty, and only that, which keeps it off.
    const videos = [
      video({ id: 'fits', channelId: 'UC-a', durationSec: 20 * MINUTE }),
      video({ id: 'over', channelId: 'UC-b', durationSec: 30 * MINUTE }),
    ]
    const schedule = plan(poolOf(videos), {
      dayStart: DAY_START,
      seed: 1,
      dayparts: twoPartDay(20),
      classifier: classifierOf({ fits: { breakfast: 1 }, over: { breakfast: 1 } }),
    })

    expect(programmes(schedule).map((p) => p.videoId)).toEqual(['fits'])
  })
})

describe('plan, the edges of the day', () => {
  it('cuts a programme off at the end of the broadcast day', () => {
    const whole: readonly Daypart[] = [
      { id: 'breakfast', name: 'All Day', startMin: 0, endMin: MINUTES_PER_DAY, junction: false },
    ]
    const marathon = video({ id: 'marathon', durationSec: SECONDS_PER_DAY + 300 })
    const schedule = plan(poolOf([marathon]), {
      dayStart: DAY_START,
      dayparts: whole,
      classifier: classifierOf({ marathon: { breakfast: 1 } }),
    })

    assertCoversDayExactly(schedule)
    expect(schedule.items).toHaveLength(1)
    expect(schedule.items[0].endSec).toBe(SECONDS_PER_DAY)
  })

  it('fills the day before the first daypart begins', () => {
    const late: readonly Daypart[] = [
      { id: 'breakfast', name: 'Breakfast', startMin: 30, endMin: 60, junction: false },
      {
        id: 'closedown',
        name: 'Closedown',
        startMin: 60,
        endMin: MINUTES_PER_DAY,
        junction: true,
        offAir: true,
      },
    ]
    const schedule = plan(poolOf([]), { dayStart: DAY_START, dayparts: late })

    assertCoversDayExactly(schedule)
    expect(schedule.items[0].startSec).toBe(0)
    expect(schedule.items[0].endSec).toBe(30 * MINUTE)
    expect(schedule.items[0].daypart).toBe('breakfast')
  })
})

describe('plan, the dayparts it is given', () => {
  it('does not care what order the dayparts arrive in', () => {
    const pool = fixturePool()
    const inOrder = plan(pool, { dayStart: DAY_START, dayparts: DEFAULT_DAYPARTS })
    const shuffled = plan(pool, {
      dayStart: DAY_START,
      dayparts: [...DEFAULT_DAYPARTS].reverse(),
    })
    expect(shuffled).toEqual(inOrder)
  })

  it('falls back to the default day when given none', () => {
    const pool = fixturePool()
    expect(plan(pool, { dayStart: DAY_START, dayparts: [] })).toEqual(
      plan(pool, { dayStart: DAY_START, dayparts: DEFAULT_DAYPARTS }),
    )
  })
})
