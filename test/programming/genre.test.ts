import { describe, expect, it } from 'vitest'
import type { Channel, Video } from '@/domain'
import { genreOf, topicGenre } from '@/programming/genre'

const video = (overrides: Partial<Video> = {}): Video => ({
  id: 'v1',
  channelId: 'UC1',
  title: 'A Programme',
  durationSec: 1200,
  publishedAt: '2026-09-08T12:00:00.000Z',
  ageRestricted: false,
  madeForKids: false,
  embeddable: true,
  isLive: false,
  ...overrides,
})

const channel = (overrides: Partial<Channel> = {}): Channel => ({
  id: 'UC1',
  title: 'A Channel',
  ...overrides,
})

describe('topicGenre', () => {
  it("knows YouTube's own vocabulary", () => {
    expect(topicGenre('Humour')).toBe('comedy')
    expect(topicGenre('Video_game_culture')).toBe('gaming')
    expect(topicGenre('Association_football')).toBe('sport')
    expect(topicGenre('Lifestyle_(sociology)')).toBe('lifestyle')
  })

  it('says nothing about a slug that is not one of them', () => {
    expect(topicGenre('Beekeeping')).toBeUndefined()
  })
})

describe('genreOf', () => {
  it("takes the channel's topics over its uploads", () => {
    const it_ = genreOf(channel({ topics: ['Humour'] }), [video({ categoryId: '25' })])

    expect(it_).toBe('comedy')
  })

  // A comedy channel carries `Entertainment` too, because one is the parent of
  // the other. Reading the parent would file every comedian under light
  // entertainment.
  it('takes the more specific topic when a channel carries both', () => {
    expect(genreOf(channel({ topics: ['Entertainment', 'Humour'] }), [])).toBe('comedy')
    expect(genreOf(channel({ topics: ['Humour', 'Entertainment'] }), [])).toBe('comedy')
  })

  it('falls back to what most of the uploads are filed under', () => {
    const videos = [video({ categoryId: '25' }), video({ categoryId: '25' }), video({ categoryId: '10' })]

    expect(genreOf(channel(), videos)).toBe('news')
  })

  it('breaks a tie between two categories the same way every time', () => {
    const one = genreOf(channel(), [video({ categoryId: '25' }), video({ categoryId: '10' })])
    const other = genreOf(channel(), [video({ categoryId: '10' }), video({ categoryId: '25' })])

    expect(one).toBe(other)
  })

  it('reads the channel name when there is nothing else to read', () => {
    expect(genreOf(channel({ title: 'The News at Ten' }), [video()])).toBe('news')
    expect(genreOf(channel({ title: 'Kitchen Table Cookery' }), [video()])).toBe('food')
  })

  // Word-bounded on purpose: a newsagent is not a news programme.
  it('does not read a name that merely contains the word', () => {
    expect(genreOf(channel({ title: 'Newsagent Diaries' }), [video()])).toBe('entertainment')
  })

  it('files an unlabelled channel as light entertainment', () => {
    expect(genreOf(channel(), [video()])).toBe('entertainment')
    expect(genreOf(undefined, [])).toBe('entertainment')
  })

  /*
    Children's television is a scheduling fact before it is a subject: it
    decides when a thing may go out, so it outranks whatever else the channel
    happens to be about.
  */
  it("files a declared children's channel as children's, whatever its topics say", () => {
    const kids = genreOf(channel({ topics: ['Video_game_culture'] }), [
      video({ madeForKids: true }),
      video({ madeForKids: true }),
    ])

    expect(kids).toBe('children')
  })

  it("does not file a channel as children's on one declared upload", () => {
    const mixed = genreOf(channel({ topics: ['Video_game_culture'] }), [
      video({ madeForKids: true }),
      video({ madeForKids: false }),
    ])

    expect(mixed).toBe('gaming')
  })
})
