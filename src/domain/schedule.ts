import type { DaypartId } from './daypart'

/** A programme: one video, played from `startSec` of the broadcast day. */
export interface Programme {
  kind: 'programme'
  videoId: string
  title: string
  channelId: string
  /**
   * Seconds into the *video* at which this item begins. Normally 0; non-zero
   * when a junction cut the front off, or a repeat starts partway.
   */
  videoStartSec: number
  /**
   * Shown earlier the same day. A station with a handful of suppliers and
   * nineteen hours to fill repeats, and says so — the listings printed (R)
   * against it, and so does this.
   */
  repeat?: boolean
}

/**
 * A gap, and there are only three kinds.
 *
 * `closedown` is the station off air for the night and `interlude` is a gap
 * long enough to be worth the card. `ident` is the short one: the station's
 * symbol, held for a minute or two to bring the next programme up onto the
 * hour or the quarter. That last one is the whole of what a station did with
 * a couple of spare minutes. It did not print a caption saying what was
 * coming; it put its own mark up and started the next thing on the mark.
 */
export interface Filler {
  kind: 'filler'
  variant: 'closedown' | 'interlude' | 'ident'
}

export type Content = Programme | Filler

export interface ScheduleItem {
  /** Seconds from the broadcast day's 06.00 anchor. Half-open: [start, end). */
  startSec: number
  endSec: number
  daypart: DaypartId
  content: Content
}

export interface Schedule {
  /** The instant this broadcast day began — local 06.00. */
  startsAt: Date
  /** Contiguous and gapless, covering exactly one day. */
  items: readonly ScheduleItem[]
}
