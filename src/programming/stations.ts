import { atClock, DAY_START_HOUR, MINUTES_PER_DAY, type Daypart } from '../domain'
import type { CardDesignId } from '../testcard/model'
import type { Genre } from './genre'

/**
 * The five stations, and what each of them is for.
 *
 * A station is a taste and a set of opening hours. Everything else (which
 * subscription belongs to it, what goes out at nine on a Thursday) falls out
 * of those two things, so this file is the whole of the editorial policy and
 * the rest of `programming/` is the machinery that carries it out.
 */

export type StationId = 1 | 2 | 3 | 4 | 5

export interface Theme {
  /** 0 is Sunday, as `Date.getDay` gives it. */
  weekday: number
  daypart: Daypart['id']
  /** What this station puts on then, above everything else it might. */
  genres: readonly Genre[]
}

/**
 * The symbol a station puts up between programmes. Each is a different
 * mechanism rather than a different colour of the same one, because that is
 * what made an ident recognisable in the second before the name appeared.
 */
export type IdentMotif = 'globe' | 'numeral' | 'chevron' | 'blocks' | 'ring'

export interface Ident {
  motif: IdentMotif
  /** Behind the symbol. Idents were a flat colour and a moving mark. */
  ground: string
  ink: string
}

export interface Station {
  id: StationId
  /** On the card, in the listings, and in continuity. */
  name: string
  /** One line under the masthead, saying what the station is. */
  billing: string
  /** The cards this station puts up. Each has its own look on the shelf. */
  cards: readonly CardDesignId[]
  /** Its symbol, held between programmes to bring the next one up on the mark. */
  ident: Ident
  /**
   * Where this station's carrier sits in the tuner's travel, 0..1.
   *
   * The preset buttons on a set of this period each had their own tuning slug
   * behind the flap, set once by whoever installed it. The ones nobody watched
   * got set carelessly, or drifted, and you found them again by hand.
   */
  stationAt: number
  /** The day, in order, tiling it exactly. */
  dayparts: readonly Daypart[]
  /** What it likes, 0..1 per genre. The whole of its character. */
  appetite: Readonly<Record<Genre, number>>
  /** Nights with a habit. */
  themes: readonly Theme[]
}

const SUNDAY = 0
const TUESDAY = 2
const WEDNESDAY = 3
const THURSDAY = 4
const FRIDAY = 5
const SATURDAY = 6

/** Mid-travel, where a correctly set preset sits. */
const CENTRE = 0.5

/** A day that starts with hours of nothing: the station is simply not up yet. */
const offAirUntil = (endMin: number): Daypart => ({
  id: 'closedown',
  name: 'Closedown',
  startMin: atClock(6),
  endMin,
  junction: true,
  offAir: true,
})

const closedownFrom = (startMin: number): Daypart => ({
  id: 'closedown',
  name: 'Closedown',
  startMin,
  endMin: MINUTES_PER_DAY,
  junction: true,
  offAir: true,
})

/**
 * A full-service day: breakfast through to the small hours, with the news on
 * the hour and children's television after school. The other four are all
 * variations on it.
 */
const ONE_DAY: readonly Daypart[] = [
  { id: 'breakfast', name: 'Breakfast', startMin: atClock(6), endMin: atClock(9, 15), junction: false },
  { id: 'mid-morning', name: 'Mid-Morning', startMin: atClock(9, 15), endMin: atClock(12), junction: false },
  { id: 'lunchtime-news', name: 'Lunchtime News', startMin: atClock(12), endMin: atClock(12, 30), junction: true },
  { id: 'afternoon', name: 'Afternoon', startMin: atClock(12, 30), endMin: atClock(15, 30), junction: false },
  { id: 'childrens', name: "Children's Television", startMin: atClock(15, 30), endMin: atClock(17), junction: true },
  { id: 'early-evening-news', name: 'Early Evening News', startMin: atClock(17), endMin: atClock(18), junction: true },
  { id: 'evening', name: 'Evening', startMin: atClock(18), endMin: atClock(21), junction: false },
  { id: 'prime', name: 'Peak Time', startMin: atClock(21), endMin: atClock(22, 30), junction: true, afterWatershed: true },
  { id: 'late-night', name: 'Late Night', startMin: atClock(22, 30), endMin: atClock(1, 30), junction: false, afterWatershed: true },
  closedownFrom(atClock(1, 30)),
]

/** Eleven till two. Nothing before lunch, and an hour longer at the end of it. */
const TWO_DAY: readonly Daypart[] = [
  offAirUntil(atClock(11)),
  { id: 'mid-morning', name: 'Late Morning', startMin: atClock(11), endMin: atClock(13), junction: false },
  { id: 'afternoon', name: 'Afternoon', startMin: atClock(13), endMin: atClock(16, 30), junction: false },
  { id: 'childrens', name: "Children's Television", startMin: atClock(16, 30), endMin: atClock(18), junction: true },
  { id: 'evening', name: 'Evening', startMin: atClock(18), endMin: atClock(21), junction: false },
  { id: 'prime', name: 'Peak Time', startMin: atClock(21), endMin: atClock(23), junction: true, afterWatershed: true },
  { id: 'late-night', name: 'Late Night', startMin: atClock(23), endMin: atClock(2), junction: false, afterWatershed: true },
  closedownFrom(atClock(2)),
]

/** Six till half two: the longest day of the five that still closes down. */
const THREE_DAY: readonly Daypart[] = [
  { id: 'breakfast', name: 'Breakfast', startMin: atClock(6), endMin: atClock(9, 30), junction: false },
  { id: 'mid-morning', name: 'Mid-Morning', startMin: atClock(9, 30), endMin: atClock(12), junction: false },
  { id: 'lunchtime-news', name: 'Lunchtime News', startMin: atClock(12), endMin: atClock(12, 30), junction: true },
  { id: 'afternoon', name: 'Afternoon', startMin: atClock(12, 30), endMin: atClock(15, 30), junction: false },
  { id: 'childrens', name: "Children's Television", startMin: atClock(15, 30), endMin: atClock(17), junction: true },
  { id: 'early-evening-news', name: 'Early Evening News', startMin: atClock(17), endMin: atClock(17, 30), junction: true },
  { id: 'evening', name: 'Evening', startMin: atClock(17, 30), endMin: atClock(21), junction: false },
  { id: 'prime', name: 'Peak Time', startMin: atClock(21), endMin: atClock(23), junction: true, afterWatershed: true },
  { id: 'late-night', name: 'Late Night', startMin: atClock(23), endMin: atClock(2, 30), junction: false, afterWatershed: true },
  closedownFrom(atClock(2, 30)),
]

/** Afternoons and nights only, and the latest closedown of any of them. */
const FOUR_DAY: readonly Daypart[] = [
  offAirUntil(atClock(15)),
  { id: 'afternoon', name: 'Afternoon', startMin: atClock(15), endMin: atClock(17, 30), junction: false },
  { id: 'evening', name: 'Evening', startMin: atClock(17, 30), endMin: atClock(21), junction: false },
  { id: 'prime', name: 'Peak Time', startMin: atClock(21), endMin: atClock(23, 30), junction: true, afterWatershed: true },
  { id: 'late-night', name: 'Late Night', startMin: atClock(23, 30), endMin: atClock(3), junction: false, afterWatershed: true },
  closedownFrom(atClock(3)),
]

/**
 * Twenty-four hours. Nothing closes down, which means something has to fill
 * the small hours, so the clip show gets them, and everything under a minute
 * in the whole subscription list ends up there.
 */
const FIVE_DAY: readonly Daypart[] = [
  { id: 'breakfast', name: 'Breakfast', startMin: atClock(6), endMin: atClock(9), junction: false },
  { id: 'mid-morning', name: 'Mid-Morning', startMin: atClock(9), endMin: atClock(12), junction: false },
  { id: 'lunchtime-news', name: 'Lunchtime News', startMin: atClock(12), endMin: atClock(12, 15), junction: true },
  { id: 'afternoon', name: 'Afternoon', startMin: atClock(12, 15), endMin: atClock(16), junction: false },
  { id: 'childrens', name: "Children's Television", startMin: atClock(16), endMin: atClock(17, 30), junction: true },
  { id: 'early-evening-news', name: 'Early Evening News', startMin: atClock(17, 30), endMin: atClock(18), junction: true },
  { id: 'evening', name: 'Evening', startMin: atClock(18), endMin: atClock(21), junction: false },
  { id: 'prime', name: 'Peak Time', startMin: atClock(21), endMin: atClock(23), junction: true, afterWatershed: true },
  { id: 'late-night', name: 'Late Night', startMin: atClock(23), endMin: atClock(2), junction: false, afterWatershed: true },
  { id: 'clip-show', name: 'Clip Show', startMin: atClock(2), endMin: atClock(4, 30), junction: true, afterWatershed: true, stripped: true },
  { id: 'overnight', name: 'Overnight', startMin: atClock(4, 30), endMin: MINUTES_PER_DAY, junction: false },
]

/** Shorthand: everything not named sits at nothing. */
const appetite = (likes: Partial<Record<Genre, number>>): Readonly<Record<Genre, number>> => ({
  news: 0, factual: 0, society: 0, arts: 0, film: 0, comedy: 0, entertainment: 0,
  music: 0, sport: 0, gaming: 0, lifestyle: 0, food: 0, motoring: 0, nature: 0,
  travel: 0, children: 0,
  ...likes,
})

export const STATIONS: readonly Station[] = [
  {
    id: 1,
    name: 'CHANNEL ONE',
    billing: 'The national service',
    cards: ['monoscope', 'bars'],
    ident: { motif: 'globe', ground: '#101c2c', ink: '#e8eef6' },
    // Dead centre. Whoever set this one up cared, because it is the one
    // everybody watches.
    stationAt: CENTRE,
    dayparts: ONE_DAY,
    appetite: appetite({
      news: 1, factual: 0.9, society: 0.8, arts: 0.7, nature: 0.7, children: 0.7,
      film: 0.5, travel: 0.5, food: 0.4, sport: 0.4, entertainment: 0.3,
      comedy: 0.3, lifestyle: 0.2, music: 0.2, motoring: 0.2,
    }),
    themes: [
      { weekday: SUNDAY, daypart: 'afternoon', genres: ['factual', 'nature'] },
      { weekday: SUNDAY, daypart: 'prime', genres: ['film', 'factual'] },
      { weekday: SATURDAY, daypart: 'evening', genres: ['entertainment', 'sport'] },
    ],
  },
  {
    id: 2,
    name: 'CHANNEL TWO',
    billing: 'Serious, but not solemn',
    cards: ['electronic', 'monoscope', 'crosshatch'],
    ident: { motif: 'numeral', ground: '#1d2416', ink: '#e7edda' },
    stationAt: CENTRE,
    dayparts: TWO_DAY,
    appetite: appetite({
      factual: 1, arts: 0.9, comedy: 0.9, music: 0.8, food: 0.8, nature: 0.7,
      society: 0.6, travel: 0.6, film: 0.6, sport: 0.5, lifestyle: 0.4,
      news: 0.3, motoring: 0.3, gaming: 0.2, children: 0.2,
    }),
    themes: [
      // Thursday night is comedy night. It has been for fifty years.
      { weekday: THURSDAY, daypart: 'prime', genres: ['comedy'] },
      { weekday: THURSDAY, daypart: 'late-night', genres: ['comedy'] },
      { weekday: SATURDAY, daypart: 'prime', genres: ['arts', 'music'] },
      { weekday: SUNDAY, daypart: 'evening', genres: ['factual'] },
    ],
  },
  {
    id: 3,
    name: 'CHANNEL THREE',
    billing: 'Popular television',
    cards: ['bars', 'ident'],
    ident: { motif: 'chevron', ground: '#2a1410', ink: '#f2ddc4' },
    stationAt: CENTRE,
    dayparts: THREE_DAY,
    appetite: appetite({
      entertainment: 1, sport: 0.9, lifestyle: 0.9, motoring: 0.8, comedy: 0.7,
      gaming: 0.7, food: 0.6, news: 0.6, music: 0.5, travel: 0.5, children: 0.5,
      film: 0.4, nature: 0.4, factual: 0.3, society: 0.2, arts: 0.1,
    }),
    themes: [
      { weekday: SATURDAY, daypart: 'evening', genres: ['entertainment'] },
      { weekday: SATURDAY, daypart: 'prime', genres: ['entertainment', 'music'] },
      { weekday: SUNDAY, daypart: 'afternoon', genres: ['sport', 'motoring'] },
      { weekday: FRIDAY, daypart: 'prime', genres: ['sport'] },
    ],
  },
  {
    id: 4,
    name: 'CHANNEL FOUR',
    billing: 'The alternative',
    cards: ['crosshatch', 'electronic'],
    ident: { motif: 'blocks', ground: '#120f1d', ink: '#ecd8f2' },
    // Nobody ever set this one properly. It is findable, and you have to look.
    stationAt: 0.28,
    dayparts: FOUR_DAY,
    appetite: appetite({
      film: 1, arts: 1, society: 0.9, comedy: 0.8, music: 0.8, travel: 0.6,
      factual: 0.6, entertainment: 0.5, news: 0.4, gaming: 0.4, food: 0.4,
      lifestyle: 0.3, nature: 0.3, sport: 0.2, motoring: 0.2, children: 0,
    }),
    themes: [
      // The satirical talk show, and the variety that follows it.
      { weekday: FRIDAY, daypart: 'prime', genres: ['comedy', 'society'] },
      { weekday: FRIDAY, daypart: 'late-night', genres: ['comedy', 'music'] },
      { weekday: SATURDAY, daypart: 'prime', genres: ['comedy', 'entertainment'] },
      { weekday: SATURDAY, daypart: 'late-night', genres: ['music', 'film'] },
      { weekday: SUNDAY, daypart: 'prime', genres: ['film'] },
      { weekday: TUESDAY, daypart: 'prime', genres: ['society', 'arts'] },
    ],
  },
  {
    id: 5,
    name: 'CHANNEL FIVE',
    billing: 'Round the clock',
    cards: ['ident', 'bars', 'electronic'],
    ident: { motif: 'ring', ground: '#0f1f1e', ink: '#dcefe6' },
    stationAt: 0.76,
    dayparts: FIVE_DAY,
    appetite: appetite({
      gaming: 0.9, motoring: 0.9, lifestyle: 0.8, entertainment: 0.8, nature: 0.8,
      sport: 0.7, food: 0.7, travel: 0.7, comedy: 0.6, children: 0.6, music: 0.6,
      film: 0.5, factual: 0.4, society: 0.3, arts: 0.2, news: 0.2,
    }),
    themes: [
      { weekday: WEDNESDAY, daypart: 'prime', genres: ['gaming'] },
      { weekday: SATURDAY, daypart: 'prime', genres: ['film', 'entertainment'] },
      { weekday: SUNDAY, daypart: 'afternoon', genres: ['nature', 'travel'] },
    ],
  },
]

export const STATION_IDS: readonly StationId[] = STATIONS.map((station) => station.id)

/** The one the set comes up on, and the only one tuned dead centre. */
export const DEFAULT_STATION: StationId = 1

export function stationById(id: number): Station | undefined {
  return STATIONS.find((station) => station.id === id)
}

/**
 * The wall-clock hour this station opens up: the start of the first part of
 * its day that carries programmes.
 *
 * The closedown card says when service resumes, and on a station that does not
 * open until the afternoon that is not six in the morning.
 */
export function opensAt(station: Station): number {
  const first = station.dayparts.find((daypart) => !daypart.offAir)
  if (first === undefined) return DAY_START_HOUR
  return Math.floor((DAY_START_HOUR * 60 + first.startMin) / 60) % 24
}
