import type { DaypartId } from '../domain'
import type { Genre } from './genre'
import type { Format } from './profile'

/**
 * What each part of the day is for.
 *
 * This is the half of the judgement that has nothing to do with which station
 * is doing the judging: a cookery programme belongs to the morning and a film
 * belongs to the evening on any channel that carries either. What differs from
 * station to station is only whether it carries them at all, and that lives in
 * the station's own appetite.
 *
 * Together they make the whole decision: the slot says *when*, the station says
 * *whether*, and the two are multiplied.
 */
export interface Slot {
  /** How much this time of day wants each genre, 0..1. */
  wants: Partial<Record<Genre, number>>
  /** How well each length sits here, 0..1. */
  lengths: Partial<Record<Format, number>>
  /**
   * How much being well watched counts here, 0..1.
   *
   * At nine o'clock it counts for a great deal and at half past ten in the
   * morning it counts for nothing, which is the difference between peak time
   * and daytime stated as a number.
   */
  standingWeight: number
}

/**
 * What a genre gets when the slot has no opinion about it. Not zero: a station
 * with one kind of programme and a whole day to fill must still fill it, and
 * an hour of test card because nothing was an exact match is worse television
 * than a slightly odd choice.
 */
export const BASELINE_WANT = 0.2

const NOTHING: Slot = { wants: {}, lengths: {}, standingWeight: 0 }

export const SLOTS: Readonly<Record<DaypartId, Slot>> = {
  // Short items, briskly. Nobody sits down to breakfast television.
  breakfast: {
    wants: { news: 1, lifestyle: 0.7, food: 0.6, entertainment: 0.5, children: 0.5, factual: 0.4, sport: 0.4 },
    lengths: { segment: 1, 'half-hour': 0.8, hour: 0.15 },
    standingWeight: 0,
  },
  // The morning is for the house, and for whoever is in it.
  'mid-morning': {
    wants: { lifestyle: 0.9, food: 0.8, factual: 0.7, society: 0.6, nature: 0.6, travel: 0.6, arts: 0.4 },
    lengths: { 'half-hour': 1, segment: 0.7, hour: 0.5, feature: 0.1 },
    standingWeight: 0,
  },
  // A junction, and the one thing it is for.
  'lunchtime-news': {
    wants: { news: 1 },
    lengths: { segment: 1, 'half-hour': 0.9, hour: 0.2 },
    standingWeight: 0,
  },
  // The long afternoon: where a documentary or an old film goes.
  afternoon: {
    wants: { factual: 0.9, travel: 0.8, nature: 0.8, film: 0.7, food: 0.7, lifestyle: 0.7, society: 0.6, sport: 0.6, arts: 0.5 },
    lengths: { hour: 1, 'half-hour': 0.9, feature: 0.6, segment: 0.3 },
    standingWeight: 0,
  },
  childrens: {
    wants: { children: 1, entertainment: 0.6, comedy: 0.5, nature: 0.5 },
    lengths: { segment: 1, 'half-hour': 0.9, hour: 0.2 },
    standingWeight: 0,
  },
  'early-evening-news': {
    wants: { news: 1 },
    lengths: { 'half-hour': 1, segment: 0.9, hour: 0.2 },
    standingWeight: 0,
  },
  // Everyone is home and nobody has gone to bed. Nothing difficult.
  evening: {
    wants: { entertainment: 1, comedy: 0.9, factual: 0.8, sport: 0.8, gaming: 0.7, motoring: 0.7, food: 0.7, lifestyle: 0.6, music: 0.6, nature: 0.6 },
    lengths: { 'half-hour': 1, hour: 0.9, segment: 0.4, feature: 0.3 },
    standingWeight: 0.3,
  },
  // Nine o'clock. The best thing the station has, and it had better be.
  prime: {
    wants: { film: 1, comedy: 0.9, entertainment: 0.9, factual: 0.9, arts: 0.8, society: 0.8, sport: 0.8, music: 0.7, gaming: 0.6 },
    lengths: { hour: 1, feature: 0.8, 'half-hour': 0.7, segment: 0.1 },
    standingWeight: 0.6,
  },
  // Long, and loose, and nobody minds.
  'late-night': {
    wants: { film: 1, music: 1, comedy: 0.9, gaming: 0.8, arts: 0.8, society: 0.7, entertainment: 0.6 },
    lengths: { feature: 1, hour: 0.9, 'half-hour': 0.5, segment: 0.2 },
    standingWeight: 0.2,
  },
  // Quiet things for an empty room.
  overnight: {
    wants: { music: 1, factual: 0.8, travel: 0.8, nature: 0.8, film: 0.6 },
    lengths: { feature: 1, hour: 0.8, 'half-hour': 0.5, segment: 0.3 },
    standingWeight: 0,
  },
  // Where everything under a minute goes, and the only place it goes.
  'clip-show': {
    wants: {},
    lengths: { short: 1 },
    standingWeight: 0,
  },
  closedown: NOTHING,
}

export const wantOf = (slot: Slot, genre: Genre): number => slot.wants[genre] ?? BASELINE_WANT
export const lengthFit = (slot: Slot, format: Format): number => slot.lengths[format] ?? 0
