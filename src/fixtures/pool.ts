import type { Channel, Pool, Video } from '../domain'

/**
 * A deterministic stand-in for a real subscription feed, so the scheduler can
 * be tested (and the whole app run) with no network, no credentials and no
 * quota. Same seed, same pool, forever.
 *
 * Shaped like a subscription list rather than like a test: a few dozen
 * channels across every genre the stations care about, at every upload cadence
 * and every length, because a schedule is only interesting when the pool it is
 * built from disagrees with itself.
 */

/** mulberry32: small, fast, and good enough for choosing telly. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface ChannelSpec {
  id: string
  title: string
  /** As `topicDetails.topicCategories` gives them: Wikipedia slugs. */
  topics: readonly string[]
  categoryId?: string
  /** Typical upload length, in minutes: [min, max]. */
  lengthMin: [number, number]
  uploadsPerWeek: number
  /** Everything this channel posts is 18+. */
  restricted?: boolean
  /** Everything this channel posts is declared for children. */
  forKids?: boolean
}

/**
 * The subscription list. Genre, cadence and length are all deliberate: between
 * them they have to produce a plausible week on five stations at once, so
 * there is a daily news channel and a monthly film essayist, an hour of
 * documentary a week and a channel that posts nothing but forty-second clips.
 */
const CHANNEL_SPECS: readonly ChannelSpec[] = [
  // News and current affairs: the spine of the daytime schedule.
  { id: 'UC-news-1', title: 'Newsdesk Daily', topics: ['Politics', 'Society'], categoryId: '25', lengthMin: [8, 22], uploadsPerWeek: 14 },
  { id: 'UC-news-2', title: 'The World Tonight', topics: ['Politics', 'News'], categoryId: '25', lengthMin: [12, 28], uploadsPerWeek: 7 },
  { id: 'UC-news-3', title: 'Westminster Week', topics: ['Politics'], categoryId: '25', lengthMin: [26, 44], uploadsPerWeek: 1 },

  // Factual: the weekly hour, the explainer, the archive dig.
  { id: 'UC-doc-1', title: 'Documentary Hour', topics: ['Knowledge'], categoryId: '27', lengthMin: [48, 72], uploadsPerWeek: 1 },
  { id: 'UC-doc-2', title: 'The Long Essay', topics: ['Knowledge', 'Society'], categoryId: '27', lengthMin: [32, 58], uploadsPerWeek: 2 },
  { id: 'UC-doc-3', title: 'Archive Corner', topics: ['Knowledge'], categoryId: '27', lengthMin: [18, 34], uploadsPerWeek: 3 },
  { id: 'UC-sci-1', title: 'Laboratory Notes', topics: ['Knowledge', 'Technology'], categoryId: '28', lengthMin: [14, 26], uploadsPerWeek: 2 },
  { id: 'UC-sci-2', title: 'Two Minute Facts', topics: ['Knowledge'], categoryId: '27', lengthMin: [2, 6], uploadsPerWeek: 10 },
  { id: 'UC-tech-1', title: 'Bench Test', topics: ['Technology'], categoryId: '28', lengthMin: [11, 24], uploadsPerWeek: 3 },

  // Arts and film.
  { id: 'UC-arts-1', title: 'The Gallery Hour', topics: ['Performing_arts'], categoryId: '24', lengthMin: [40, 66], uploadsPerWeek: 1 },
  { id: 'UC-arts-2', title: 'Stage Door', topics: ['Performing_arts', 'Entertainment'], categoryId: '24', lengthMin: [16, 30], uploadsPerWeek: 2 },
  { id: 'UC-film-1', title: 'Picture House', topics: ['Film'], categoryId: '1', lengthMin: [55, 105], uploadsPerWeek: 1 },
  { id: 'UC-film-2', title: 'Frame by Frame', topics: ['Film', 'Knowledge'], categoryId: '1', lengthMin: [22, 40], uploadsPerWeek: 2 },

  // Comedy.
  { id: 'UC-com-1', title: 'The Half Hour', topics: ['Humour'], categoryId: '23', lengthMin: [24, 32], uploadsPerWeek: 1 },
  { id: 'UC-com-2', title: 'Panel Beaters', topics: ['Humour', 'Entertainment'], categoryId: '23', lengthMin: [38, 52], uploadsPerWeek: 1 },
  { id: 'UC-com-3', title: 'Sketchbook', topics: ['Humour'], categoryId: '23', lengthMin: [4, 11], uploadsPerWeek: 5 },

  // Music.
  { id: 'UC-mus-1', title: 'Session Tapes', topics: ['Music', 'Rock_music'], categoryId: '10', lengthMin: [28, 48], uploadsPerWeek: 1 },
  { id: 'UC-mus-2', title: 'Late Mix', topics: ['Electronic_music', 'Music'], categoryId: '10', lengthMin: [58, 120], uploadsPerWeek: 2 },
  { id: 'UC-mus-3', title: 'Three Chords', topics: ['Music'], categoryId: '10', lengthMin: [5, 12], uploadsPerWeek: 6 },

  // Sport.
  { id: 'UC-spo-1', title: 'Match of the Week', topics: ['Sport', 'Association_football'], categoryId: '17', lengthMin: [42, 64], uploadsPerWeek: 1 },
  { id: 'UC-spo-2', title: 'Touchline', topics: ['Sport'], categoryId: '17', lengthMin: [9, 18], uploadsPerWeek: 4 },

  // Gaming.
  { id: 'UC-gam-1', title: 'Continue?', topics: ['Video_game_culture'], categoryId: '20', lengthMin: [30, 55], uploadsPerWeek: 3 },
  { id: 'UC-gam-2', title: 'Speedrun Hour', topics: ['Video_game_culture', 'Action_game'], categoryId: '20', lengthMin: [50, 95], uploadsPerWeek: 2 },
  { id: 'UC-gam-3', title: 'Cartridge Club', topics: ['Video_game_culture'], categoryId: '20', lengthMin: [13, 24], uploadsPerWeek: 4 },

  // Lifestyle, food, motoring: the afternoon and the tabloid evening.
  { id: 'UC-life-1', title: 'Front Room Makeover', topics: ['Lifestyle_(sociology)'], categoryId: '26', lengthMin: [18, 32], uploadsPerWeek: 3 },
  { id: 'UC-life-2', title: 'Thirty Day Fit', topics: ['Physical_fitness', 'Health'], categoryId: '26', lengthMin: [12, 25], uploadsPerWeek: 4 },
  { id: 'UC-food-1', title: 'Kitchen Table Cookery', topics: ['Food'], categoryId: '26', lengthMin: [10, 20], uploadsPerWeek: 4 },
  { id: 'UC-food-2', title: 'The Sunday Roast', topics: ['Food', 'Lifestyle_(sociology)'], categoryId: '26', lengthMin: [40, 58], uploadsPerWeek: 1 },
  { id: 'UC-car-1', title: 'Garage Hours', topics: ['Vehicles'], categoryId: '2', lengthMin: [25, 44], uploadsPerWeek: 2 },
  { id: 'UC-car-2', title: 'Workshop Diaries', topics: ['Vehicles', 'Hobby'], categoryId: '2', lengthMin: [14, 26], uploadsPerWeek: 3 },

  // Nature, travel, society.
  { id: 'UC-nat-1', title: 'Hedgerow', topics: ['Pet', 'Lifestyle_(sociology)'], categoryId: '15', lengthMin: [20, 38], uploadsPerWeek: 2 },
  { id: 'UC-trav-1', title: 'Slow Road', topics: ['Tourism'], categoryId: '19', lengthMin: [30, 52], uploadsPerWeek: 1 },
  { id: 'UC-soc-1', title: 'Common Ground', topics: ['Society'], categoryId: '29', lengthMin: [22, 40], uploadsPerWeek: 2 },

  // Children's. Daytime only, and never anywhere near the late film.
  { id: 'UC-kid-1', title: 'Playmat', topics: ['Entertainment'], categoryId: '24', lengthMin: [6, 14], uploadsPerWeek: 5, forKids: true },

  // After nine, and only after nine.
  { id: 'UC-late-1', title: 'Night Signal', topics: ['Entertainment', 'Humour'], categoryId: '24', lengthMin: [55, 120], uploadsPerWeek: 2, restricted: true },

  // Shorts. Nothing under a minute belongs in a schedule, so these are only
  // ever the wee-hours clip show.
  { id: 'UC-clip-1', title: 'Sixty Seconds', topics: ['Entertainment'], categoryId: '24', lengthMin: [0.3, 0.95], uploadsPerWeek: 18 },
  { id: 'UC-clip-2', title: 'Off Cuts', topics: ['Humour'], categoryId: '23', lengthMin: [0.25, 1], uploadsPerWeek: 21 },
]

const TITLE_WORDS = [
  'Return', 'Notes', 'Story', 'Machine', 'Winter', 'Question', 'Harbour',
  'Signal', 'Method', 'Garden', 'Circuit', 'Letter', 'Island', 'Practice',
  'Bridge', 'Furnace', 'Lantern', 'Quarry', 'Meadow', 'Ledger',
]

export interface PoolOptions {
  seed?: number
  /** The pool is built looking back from here. */
  now?: Date
  /** How far back uploads run. */
  days?: number
  /** Fraction of videos that cannot be embedded. Filtered at plan time. */
  unembeddableRate?: number
}

export function fixturePool({
  seed = 1967,
  now = new Date('2026-09-09T11:00:00'),
  days = 14,
  unembeddableRate = 0.06,
}: PoolOptions = {}): Pool {
  const rand = seeded(seed)
  const videos: Video[] = []
  const channels = new Map<string, Channel>()

  for (const spec of CHANNEL_SPECS) {
    channels.set(spec.id, {
      id: spec.id,
      title: spec.title,
      topics: spec.topics,
      subscriberCount: 5_000 + Math.floor(rand() * 2_000_000),
    })

    const count = Math.max(1, Math.round((spec.uploadsPerWeek * days) / 7))
    for (let i = 0; i < count; i++) {
      const [lo, hi] = spec.lengthMin
      const durationSec = Math.max(15, Math.round((lo + rand() * (hi - lo)) * 60))
      // Spaced by the channel's own cadence rather than scattered, so an
      // upload rhythm is something the profiler can actually observe.
      const gapMs = (7 / spec.uploadsPerWeek) * 24 * 60 * 60 * 1000
      const agoMs = (i + rand() * 0.6) * gapMs
      const words = `${TITLE_WORDS[Math.floor(rand() * TITLE_WORDS.length)]} ${TITLE_WORDS[Math.floor(rand() * TITLE_WORDS.length)]}`

      videos.push({
        id: `${spec.id}-v${String(i).padStart(3, '0')}`,
        channelId: spec.id,
        title: `${spec.title}: ${words}`,
        durationSec,
        publishedAt: new Date(now.getTime() - agoMs).toISOString(),
        categoryId: spec.categoryId,
        viewCount: Math.floor(1_000 + rand() * 900_000),
        ageRestricted: spec.restricted === true,
        madeForKids: spec.forKids === true,
        embeddable: rand() >= unembeddableRate,
        isLive: false,
      })
    }
  }

  videos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  return { videos, channels }
}
