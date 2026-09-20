import { describe, expect, it } from 'vitest'
import type { Channel, DaypartId, Pool, Video } from '../domain'
import {
  HeuristicClassifier,
  OverridingClassifier,
  isEligible,
  type Affinities,
  type Classifier,
} from './classify'

const MINUTE = 60

function video(overrides: Partial<Video> & Pick<Video, 'id'>): Video {
  return {
    channelId: 'UC-test',
    title: 'A Programme',
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

/** The daypart this video wants most, or undefined if it wants none. */
function topDaypart(affinities: Affinities): DaypartId | undefined {
  const ranked = Object.entries(affinities)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a)
  return ranked.length > 0 ? (ranked[0][0] as DaypartId) : undefined
}

const heuristic = new HeuristicClassifier()

describe('isEligible', () => {
  it('rejects a live video', () => {
    expect(isEligible(video({ id: 'v', isLive: true }))).toBe(false)
  })

  it('rejects a video reporting no duration, which is usually a finished stream', () => {
    expect(isEligible(video({ id: 'v', durationSec: 0 }))).toBe(false)
  })

  it('rejects a video that cannot be embedded', () => {
    expect(isEligible(video({ id: 'v', embeddable: false }))).toBe(false)
  })

  it('accepts an ordinary video', () => {
    expect(isEligible(video({ id: 'v' }))).toBe(true)
  })
})

describe('HeuristicClassifier', () => {
  it('gives a live video no affinity anywhere', () => {
    expect(heuristic.classify(video({ id: 'v', isLive: true }))).toEqual({})
  })

  it('gives an unembeddable video no affinity anywhere', () => {
    expect(heuristic.classify(video({ id: 'v', embeddable: false }))).toEqual({})
  })

  it('never gives closedown any affinity', () => {
    for (const durationSec of [MINUTE, 5 * MINUTE, 20 * MINUTE, 45 * MINUTE, 120 * MINUTE]) {
      expect(heuristic.classify(video({ id: 'v', durationSec })).closedown).toBeUndefined()
    }
  })

  it('puts a video of five minutes or less in breakfast', () => {
    expect(topDaypart(heuristic.classify(video({ id: 'v', durationSec: 3 * MINUTE })))).toBe('breakfast')
  })

  it('puts a video of eight to twenty-five minutes in mid-morning', () => {
    expect(topDaypart(heuristic.classify(video({ id: 'v', durationSec: 18 * MINUTE })))).toBe('mid-morning')
  })

  it('puts a video of twenty-five to sixty minutes in the evening', () => {
    expect(topDaypart(heuristic.classify(video({ id: 'v', durationSec: 45 * MINUTE })))).toBe('evening')
  })

  it('puts a video over an hour in the afternoon or late night', () => {
    const affinities = heuristic.classify(video({ id: 'v', durationSec: 100 * MINUTE }))
    expect(topDaypart(affinities)).toMatch(/^(afternoon|late-night)$/)
    expect(affinities.afternoon).toBeGreaterThan(0)
    expect(affinities['late-night']).toBeGreaterThan(0)
  })

  it('gates the news dayparts on category 25', () => {
    const notNews = heuristic.classify(video({ id: 'v', title: 'The News at Ten', durationSec: 20 * MINUTE }))
    expect(notNews['lunchtime-news']).toBeUndefined()
    expect(notNews['early-evening-news']).toBeUndefined()

    const news = heuristic.classify(
      video({ id: 'v', title: 'The News at Ten', durationSec: 20 * MINUTE, categoryId: '25' }),
    )
    expect(news['lunchtime-news']).toBeGreaterThan(0)
    expect(news['early-evening-news']).toBeGreaterThan(0)
  })

  it('damps a news video out of the entertainment dayparts', () => {
    const ordinary = heuristic.classify(video({ id: 'v', durationSec: 18 * MINUTE }))
    const news = heuristic.classify(video({ id: 'v', durationSec: 18 * MINUTE, categoryId: '25' }))
    expect(news['mid-morning']).toBeGreaterThan(0)
    expect(news['mid-morning']).toBeLessThan(ordinary['mid-morning'] as number)
  })

  it('will not let a keyword put a short in a two-hour slot', () => {
    // The bug from a real evening: a thirty-second short with "live" in its
    // title scored 0.2 for late night — nothing from its duration, all of it
    // from the word — and went out between two feature-length programmes.
    // Duration is the hard signal; a keyword can move a programme up the
    // running order, not into a slot it does not fit.
    const short = heuristic.classify(
      video({ id: 'short', title: 'watching this LIVE for the first time', durationSec: 30 }),
    )

    expect(short['late-night']).toBeUndefined()
  })

  it('gives a video with no duration at all no affinity anywhere', () => {
    // A stream that has just ended reports no duration, and plays as
    // YouTube's own "this live event has ended" card with no error event.
    const ended = heuristic.classify(video({ id: 'ended', durationSec: 0 }))

    expect(Object.keys(ended)).toEqual([])
  })

  it('lifts the late night for a title that reads like a mix', () => {
    const plain = heuristic.classify(video({ id: 'v', title: 'Harbour Notes', durationSec: 55 * MINUTE }))
    const mix = heuristic.classify(
      video({ id: 'v', title: 'Harbour Notes: Winter Mix', durationSec: 55 * MINUTE }),
    )
    // 55 minutes sits outside the late-night band, so the lift has room to show.
    expect(plain['late-night']).toBeLessThan(1)
    expect(mix['late-night']).toBeGreaterThan(plain['late-night'] as number)
  })

  it('does not read a keyword out of the middle of a longer word', () => {
    const plain = heuristic.classify(video({ id: 'v', title: 'Harbour Notes', durationSec: 55 * MINUTE }))
    const mixture = heuristic.classify(
      video({ id: 'v', title: 'Harbour Mixture', durationSec: 55 * MINUTE }),
    )
    expect(mixture).toEqual(plain)
  })

  it('lifts the evening for a channel that consistently posts forty-minute pieces', () => {
    const channelId = 'UC-essays'
    const backCatalogue = [0, 1, 2, 3, 4].map((i) =>
      video({ id: `back-${i}`, channelId, durationSec: 40 * MINUTE }),
    )
    const subject = video({ id: 'subject', channelId, durationSec: 20 * MINUTE })
    const observed = new HeuristicClassifier(poolOf([...backCatalogue, subject]))

    const blind = heuristic.classify(subject)
    const informed = observed.classify(subject)

    expect(informed.evening).toBeGreaterThan(blind.evening as number)
  })

  it('keeps every affinity within nought to one', () => {
    const affinities = new HeuristicClassifier(poolOf([])).classify(
      video({ id: 'v', title: 'Live Podcast Mix Essay Documentary Review Part 1', durationSec: 70 * MINUTE }),
    )
    for (const score of Object.values(affinities)) {
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })

  it('ignores a channel with too few uploads to be a pattern', () => {
    const channelId = 'UC-thin'
    const subject = video({ id: 'subject', channelId, durationSec: 20 * MINUTE })
    const observed = new HeuristicClassifier(
      poolOf([video({ id: 'one', channelId, durationSec: 40 * MINUTE }), subject]),
    )
    expect(observed.classify(subject)).toEqual(heuristic.classify(subject))
  })

  it('counts a channel as a pattern at exactly the number of uploads it takes', () => {
    // The boundary itself, which nothing pinned: one test used two uploads and
    // another used six, so `>=` could become `>` and the whole suite stayed
    // green. A mutation pass walked straight through it.
    const channelId = 'UC-just-enough'
    const subject = video({ id: 'subject', channelId, durationSec: 20 * MINUTE })
    const observed = new HeuristicClassifier(
      poolOf([
        ...[0, 1].map((i) => video({ id: `back-${i}`, channelId, durationSec: 40 * MINUTE })),
        subject,
      ]),
    )

    // Three uploads counting this one is a pattern; two is not.
    expect(observed.classify(subject).evening).toBeGreaterThan(
      heuristic.classify(subject).evening as number,
    )
  })

  it("learns nothing from a channel's ineligible uploads", () => {
    const channelId = 'UC-live'
    const subject = video({ id: 'subject', channelId, durationSec: 20 * MINUTE })
    const observed = new HeuristicClassifier(
      poolOf([
        ...[0, 1, 2, 3, 4].map((i) =>
          video({ id: `l-${i}`, channelId, durationSec: 40 * MINUTE, isLive: true }),
        ),
        subject,
      ]),
    )
    expect(observed.classify(subject)).toEqual(heuristic.classify(subject))
  })
})

describe('OverridingClassifier', () => {
  const inner: Classifier = { classify: () => ({ breakfast: 0.9, evening: 0.4 }) }

  it('pins a channel to exactly the dayparts it is pinned to', () => {
    const pinned = new OverridingClassifier(inner, { 'UC-pin': ['late-night', 'evening'] })
    expect(pinned.classify(video({ id: 'v', channelId: 'UC-pin' }))).toEqual({
      'late-night': 1,
      evening: 1,
    })
  })

  it('wins outright over a confident inner classifier', () => {
    const pinned = new OverridingClassifier(inner, { 'UC-pin': ['late-night'] })
    expect(pinned.classify(video({ id: 'v', channelId: 'UC-pin' })).breakfast).toBeUndefined()
  })

  it('leaves an unpinned channel to the inner classifier', () => {
    const pinned = new OverridingClassifier(inner, { 'UC-pin': ['late-night'] })
    expect(pinned.classify(video({ id: 'v', channelId: 'UC-other' }))).toEqual({
      breakfast: 0.9,
      evening: 0.4,
    })
  })

  it('passes the channel through to the inner classifier', () => {
    const seen: Array<Channel | undefined> = []
    const spy: Classifier = {
      classify: (_video, channel) => {
        seen.push(channel)
        return {}
      },
    }
    const channel: Channel = { id: 'UC-other', title: 'Other' }
    new OverridingClassifier(spy, {}).classify(video({ id: 'v', channelId: 'UC-other' }), channel)
    expect(seen).toEqual([channel])
  })

  it('still gives a live or unembeddable video no affinity, pinned or not', () => {
    const pinned = new OverridingClassifier(inner, { 'UC-pin': ['late-night'] })
    expect(pinned.classify(video({ id: 'v', channelId: 'UC-pin', isLive: true }))).toEqual({})
    expect(pinned.classify(video({ id: 'v', channelId: 'UC-pin', embeddable: false }))).toEqual({})
  })

  it('pins a channel that the heuristics would have filed elsewhere', () => {
    const shorts = video({ id: 'v', channelId: 'UC-pin', durationSec: 3 * MINUTE })
    expect(topDaypart(heuristic.classify(shorts))).toBe('breakfast')
    const pinned = new OverridingClassifier(heuristic, { 'UC-pin': ['late-night'] })
    expect(topDaypart(pinned.classify(shorts))).toBe('late-night')
  })
})
