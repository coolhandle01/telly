import type { Channel, Video } from '../domain'

/**
 * What a thing is, in the vocabulary a schedule is built from.
 *
 * Deliberately the list a programme controller would recognise rather than
 * YouTube's: YouTube sorts by where a video came from, a schedule sorts by
 * what it is for and who is likely to be in the room. The two overlap, and
 * everything below is the translation between them.
 */
export type Genre =
  | 'news'
  | 'factual'
  | 'society'
  | 'arts'
  | 'film'
  | 'comedy'
  | 'entertainment'
  | 'music'
  | 'sport'
  | 'gaming'
  | 'lifestyle'
  | 'food'
  | 'motoring'
  | 'nature'
  | 'travel'
  | 'children'

export const GENRES: readonly Genre[] = [
  'news', 'factual', 'society', 'arts', 'film', 'comedy', 'entertainment',
  'music', 'sport', 'gaming', 'lifestyle', 'food', 'motoring', 'nature',
  'travel', 'children',
] as const

/**
 * YouTube's topic vocabulary, as the last segment of the Wikipedia URLs in
 * `topicDetails.topicCategories`.
 *
 * A channel usually carries several, and they are not siblings: `Entertainment`
 * and `Humour` arrive together on a comedy channel because one is the parent of
 * the other. The number is how specific each is, so the leaf wins and the
 * channel reads as comedy rather than as light entertainment.
 */
interface Topic {
  readonly genre: Genre
  readonly specificity: number
}

const BROAD = 1
const LEAF = 2

const TOPICS: Readonly<Record<string, Topic>> = {
  // The broad parents. True of a great many channels, and on their own they
  // say very little.
  Entertainment: { genre: 'entertainment', specificity: BROAD },
  Knowledge: { genre: 'factual', specificity: BROAD },
  Society: { genre: 'society', specificity: BROAD },
  'Lifestyle_(sociology)': { genre: 'lifestyle', specificity: BROAD },
  Music: { genre: 'music', specificity: BROAD },
  Sport: { genre: 'sport', specificity: BROAD },

  // News and public life.
  Politics: { genre: 'news', specificity: LEAF },
  News: { genre: 'news', specificity: LEAF },
  Military: { genre: 'society', specificity: LEAF },
  Religion: { genre: 'society', specificity: LEAF },
  Business: { genre: 'society', specificity: LEAF },

  // Factual.
  Technology: { genre: 'factual', specificity: LEAF },
  Health: { genre: 'lifestyle', specificity: LEAF },

  // Arts, film, comedy.
  Performing_arts: { genre: 'arts', specificity: LEAF },
  Film: { genre: 'film', specificity: LEAF },
  Animated_cartoon: { genre: 'film', specificity: LEAF },
  Humour: { genre: 'comedy', specificity: LEAF },

  // Music, by genre. All of them land in the same place; the schedule cares
  // that it is music, and the persona cares which station likes music.
  Christian_music: { genre: 'music', specificity: LEAF },
  Classical_music: { genre: 'music', specificity: LEAF },
  Country_music: { genre: 'music', specificity: LEAF },
  Electronic_music: { genre: 'music', specificity: LEAF },
  Hip_hop_music: { genre: 'music', specificity: LEAF },
  Independent_music: { genre: 'music', specificity: LEAF },
  Jazz: { genre: 'music', specificity: LEAF },
  Pop_music: { genre: 'music', specificity: LEAF },
  Reggae: { genre: 'music', specificity: LEAF },
  Rhythm_and_blues: { genre: 'music', specificity: LEAF },
  Rock_music: { genre: 'music', specificity: LEAF },
  Soul_music: { genre: 'music', specificity: LEAF },
  Music_of_Asia: { genre: 'music', specificity: LEAF },
  Music_of_Latin_America: { genre: 'music', specificity: LEAF },
  // Percent-decoded before it gets here: the URL spells this `Children%27s_music`.
  "Children's_music": { genre: 'children', specificity: LEAF },

  // Sport, by sport.
  American_football: { genre: 'sport', specificity: LEAF },
  Association_football: { genre: 'sport', specificity: LEAF },
  Baseball: { genre: 'sport', specificity: LEAF },
  Basketball: { genre: 'sport', specificity: LEAF },
  Boxing: { genre: 'sport', specificity: LEAF },
  Cricket: { genre: 'sport', specificity: LEAF },
  Golf: { genre: 'sport', specificity: LEAF },
  Ice_hockey: { genre: 'sport', specificity: LEAF },
  Mixed_martial_arts: { genre: 'sport', specificity: LEAF },
  Motorsport: { genre: 'sport', specificity: LEAF },
  Professional_wrestling: { genre: 'sport', specificity: LEAF },
  Tennis: { genre: 'sport', specificity: LEAF },
  Volleyball: { genre: 'sport', specificity: LEAF },

  // Gaming, by kind of game.
  Video_game_culture: { genre: 'gaming', specificity: LEAF },
  Action_game: { genre: 'gaming', specificity: LEAF },
  'Action-adventure_game': { genre: 'gaming', specificity: LEAF },
  Casual_game: { genre: 'gaming', specificity: LEAF },
  Music_video_game: { genre: 'gaming', specificity: LEAF },
  Puzzle_video_game: { genre: 'gaming', specificity: LEAF },
  Racing_video_game: { genre: 'gaming', specificity: LEAF },
  'Role-playing_video_game': { genre: 'gaming', specificity: LEAF },
  Simulation_video_game: { genre: 'gaming', specificity: LEAF },
  Sports_game: { genre: 'gaming', specificity: LEAF },
  Strategy_video_game: { genre: 'gaming', specificity: LEAF },

  // The rest of daytime.
  Fashion: { genre: 'lifestyle', specificity: LEAF },
  Physical_attractiveness: { genre: 'lifestyle', specificity: LEAF },
  Physical_fitness: { genre: 'lifestyle', specificity: LEAF },
  Hobby: { genre: 'lifestyle', specificity: LEAF },
  Food: { genre: 'food', specificity: LEAF },
  Pet: { genre: 'nature', specificity: LEAF },
  Tourism: { genre: 'travel', specificity: LEAF },
  Vehicle: { genre: 'motoring', specificity: LEAF },
  Vehicles: { genre: 'motoring', specificity: LEAF },
}

/** YouTube's own category for a single video. Coarser, but always present. */
const CATEGORIES: Readonly<Record<string, Genre>> = {
  '1': 'film',
  '2': 'motoring',
  '10': 'music',
  '15': 'nature',
  '17': 'sport',
  '19': 'travel',
  '20': 'gaming',
  '22': 'entertainment',
  '23': 'comedy',
  '24': 'entertainment',
  '25': 'news',
  '26': 'lifestyle',
  '27': 'factual',
  '28': 'factual',
  '29': 'society',
}

/** YouTube's News & Politics category. The hard gate into the news dayparts. */
export const NEWS_CATEGORY_ID = '25'

/**
 * A last resort, for a channel YouTube has no topics for and whose uploads
 * carry no category. Word-bounded: "mixture" is not a mix, and a "newsagent"
 * is not news.
 */
const TITLE_HINTS: readonly (readonly [RegExp, Genre])[] = [
  [/\b(news|bulletin|dispatch|report)\b/i, 'news'],
  [/\b(documentar(y|ies)|explained?|history|archive|lecture)\b/i, 'factual'],
  [/\b(comedy|sketch|standup|stand-up|sitcom)\b/i, 'comedy'],
  [/\b(film|cinema|movies?|picture house)\b/i, 'film'],
  [/\b(gig|session|album|mixtape|mix|record)\b/i, 'music'],
  [/\b(match|league|cup|fixture|highlights)\b/i, 'sport'],
  [/\b(gameplay|speedrun|playthrough|lets? play)\b/i, 'gaming'],
  [/\b(recipe|cookery|cooking|kitchen|bake)\b/i, 'food'],
  [/\b(garage|engine|motor|car|driving)\b/i, 'motoring'],
  [/\b(travel|journey|road trip|tour)\b/i, 'travel'],
]

/**
 * Look a key up in a table without finding what the table inherited.
 *
 * These slugs and ids arrive over the network, and a plain `TABLE[key]` does
 * not only answer for the keys the table has: `__proto__` finds
 * `Object.prototype`, `constructor` finds `Object`. Both are truthy, so a
 * caller weighing candidates takes one as real and then measures every later
 * one against `undefined` — which nothing beats, so the genuine topic behind
 * it is thrown away and the channel is filed as something it is not.
 */
const own = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined

/** The genre a single topic slug stands for, or undefined if it is not one. */
export const topicGenre = (slug: string): Genre | undefined => own(TOPICS, slug)?.genre

/**
 * What a whole channel is, from its topics, the categories of its uploads and
 * finally its name.
 *
 * The channel is the unit because a channel is what a viewer subscribed to and
 * what a schedule commissions: one video's category can be anything the
 * uploader clicked, but a channel that YouTube files under `Humour` is a
 * comedy channel every week of the year.
 */
export function genreOf(channel: Channel | undefined, videos: readonly Video[]): Genre {
  // A declared children's channel is children's television whatever else it is
  // about, because that decides when it may go out rather than merely what it
  // is like.
  if (videos.length > 0 && videos.every((video) => video.madeForKids)) return 'children'

  const fromTopics = bestTopic(channel?.topics)
  if (fromTopics !== undefined) return fromTopics

  const fromCategories = modalCategory(videos)
  if (fromCategories !== undefined) return fromCategories

  const name = channel?.title ?? ''
  for (const [pattern, genre] of TITLE_HINTS) if (pattern.test(name)) return genre

  // Nothing said anything. Light entertainment is where an unlabelled
  // programme goes, and always was.
  return 'entertainment'
}

/** The most specific topic on the channel; ties break in list order. */
function bestTopic(topics: readonly string[] | undefined): Genre | undefined {
  let best: Topic | undefined
  for (const slug of topics ?? []) {
    const topic = own(TOPICS, slug)
    if (topic && (best === undefined || topic.specificity > best.specificity)) best = topic
  }
  return best?.genre
}

/** The genre most of a channel's uploads are filed under. */
function modalCategory(videos: readonly Video[]): Genre | undefined {
  const counts = new Map<Genre, number>()
  for (const video of videos) {
    const genre = video.categoryId === undefined ? undefined : own(CATEGORIES, video.categoryId)
    if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1)
  }

  let best: Genre | undefined
  let bestCount = 0
  // Iterated in the fixed genre order rather than insertion order, so a tie
  // between two categories resolves the same way every time.
  for (const genre of GENRES) {
    const count = counts.get(genre) ?? 0
    if (count > bestCount) {
      best = genre
      bestCount = count
    }
  }
  return best
}
