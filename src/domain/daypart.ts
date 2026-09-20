import { atClock, MINUTES_PER_DAY } from './time'

/**
 * The parts a broadcast day is divided into.
 *
 * Not all of them appear on every station: one opens at six and closes at
 * half one, another runs all night, and what each does with its evening is the
 * whole of its character. The list is the vocabulary, not a schedule.
 */
export type DaypartId =
  | 'breakfast'
  | 'mid-morning'
  | 'lunchtime-news'
  | 'afternoon'
  | 'childrens'
  | 'early-evening-news'
  | 'evening'
  | 'prime'
  | 'late-night'
  | 'overnight'
  | 'clip-show'
  | 'closedown'

export interface Daypart {
  id: DaypartId
  /** As it appears in continuity and the now/next caption. */
  name: string
  /** Minutes from the 06.00 anchor. */
  startMin: number
  endMin: number
  /**
   * A junction starts on time, always. A programme that would run into one is
   * cut short instead — "we're going over to the news now". Everything else
   * may overrun and push the schedule along.
   */
  junction: boolean
  /** Closedown carries no programmes at all; it is test card and tone. */
  offAir?: boolean
  /**
   * Past nine o'clock. Age-restricted material may go out here and nowhere
   * else, and children's television may not.
   */
  afterWatershed?: boolean
  /**
   * Printed as one line in the listings however many items are in it.
   *
   * For a strand of very short things: a paper printed `2.00 Clip Show`, not
   * two hundred and forty separate clips, and so does the guide.
   */
  stripped?: boolean
}

/** Nine o'clock, and the whole of the rule. */
export const WATERSHED_MIN = atClock(21)

/** The default day: one station's, and the shape the others are variations on. */
export const DEFAULT_DAYPARTS: readonly Daypart[] = [
  { id: 'breakfast', name: 'Breakfast', startMin: atClock(6), endMin: atClock(9, 15), junction: false },
  { id: 'mid-morning', name: 'Mid-Morning', startMin: atClock(9, 15), endMin: atClock(12), junction: false },
  { id: 'lunchtime-news', name: 'Lunchtime News', startMin: atClock(12), endMin: atClock(12, 30), junction: true },
  { id: 'afternoon', name: 'Afternoon', startMin: atClock(12, 30), endMin: atClock(15, 30), junction: false },
  { id: 'childrens', name: "Children's Television", startMin: atClock(15, 30), endMin: atClock(17), junction: true },
  { id: 'early-evening-news', name: 'Early Evening News', startMin: atClock(17), endMin: atClock(18), junction: true },
  { id: 'evening', name: 'Evening', startMin: atClock(18), endMin: atClock(21), junction: false },
  { id: 'prime', name: 'Peak Time', startMin: atClock(21), endMin: atClock(22, 30), junction: true, afterWatershed: true },
  { id: 'late-night', name: 'Late Night', startMin: atClock(22, 30), endMin: atClock(1, 30), junction: false, afterWatershed: true },
  { id: 'closedown', name: 'Closedown', startMin: atClock(1, 30), endMin: MINUTES_PER_DAY, junction: true, offAir: true },
] as const
