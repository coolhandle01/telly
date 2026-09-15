import type { DaypartId } from './daypart'
import type { ScheduleItem } from './schedule'

/**
 * What the tuner hands the screen. `offsetSec` is the whole point of the app:
 * you do not start a programme, you join one already in progress.
 */
export type OnAir =
  | {
      kind: 'programme'
      videoId: string
      title: string
      /** Seconds into the video, right now. */
      offsetSec: number
      endsAt: Date
      daypart: DaypartId
    }
  | {
      kind: 'filler'
      variant: 'closedown' | 'interlude' | 'ident'
      until: Date
      daypart: DaypartId
    }

/** What is on after this. Used by the now/next caption; absent at day's end. */
export interface NowAndNext {
  now: OnAir
  next?: ScheduleItem
}
