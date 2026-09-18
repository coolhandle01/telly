import { atClock, type Channel, type Daypart, type DaypartId, type Video } from '../domain'
import { isEligible, type Affinities, type Classifier } from '../schedule/classify'
import { NEWS_CATEGORY_ID } from './genre'
import { formatOf, SHORT_MAX_SEC, type Subscription } from './profile'
import { lengthFit, SLOTS, wantOf } from './slots'
import type { Station } from './stations'
import { strandsFor, type Strand } from './strands'

/**
 * The station's own judgement of what to put where, for one broadcast day.
 *
 * Built per station per day, because half of the decision depends on which day
 * it is: Thursday is comedy night, the weekly documentary goes out on its own
 * night, and neither of those is a property of a video.
 */
export class StationClassifier implements Classifier {
  readonly #station: Station
  readonly #profiles: ReadonlyMap<string, Subscription>
  readonly #strands: ReadonlyMap<string, Strand>
  readonly #weekday: number

  constructor(
    station: Station,
    profiles: ReadonlyMap<string, Subscription>,
    /** Any instant in the broadcast day being planned. */
    dayStart: Date,
  ) {
    this.#station = station
    this.#profiles = profiles
    this.#strands = strandsFor(station, [...profiles.values()])
    this.#weekday = dayStart.getDay()
  }

  classify(video: Video, _channel?: Channel): Affinities {
    if (!isEligible(video)) return {}

    const subscription = this.#profiles.get(video.channelId)
    if (subscription === undefined) return {}

    const format = formatOf(video.durationSec)
    const strand = this.#strands.get(video.channelId)
    const isNews = video.categoryId === NEWS_CATEGORY_ID

    const affinities: Affinities = {}
    for (const daypart of this.#station.dayparts) {
      if (daypart.offAir) continue
      if (!this.#allowed(video, subscription, daypart)) continue

      const slot = SLOTS[daypart.id]
      const length = lengthFit(slot, format)
      // Length is the gate, not a preference. Nothing else may put a
      // ninety-second item in the nine o'clock slot.
      if (length === 0) continue

      let score = wantOf(slot, subscription.genre) * length

      // A news bulletin is a news bulletin. It goes in the news, and it is
      // damped everywhere else rather than barred, because a station with a
      // thin afternoon would rather repeat the lunchtime bulletin than show
      // the card.
      if (isNews && !NEWS_DAYPARTS.has(daypart.id)) score *= NEWS_DAMPING
      if (!isNews && NEWS_DAYPARTS.has(daypart.id)) continue

      // Being well watched counts at nine and counts for nothing at ten in
      // the morning.
      score *= 1 + slot.standingWeight * subscription.standing

      score *= this.#theme(daypart.id, subscription)
      score *= strandLift(strand, daypart.id, this.#weekday)

      // Scaled rather than clipped. Clipping at one loses the ordering
      // exactly where it matters most: a series on its own night and a
      // comedy on comedy night both run past one, and the packer could no
      // longer tell them apart.
      if (score > 0) affinities[daypart.id] = Math.min(1, score / MAX_SCORE)
    }

    return affinities
  }

  /** The rules that are not preferences: who may go out when, at all. */
  #allowed(video: Video, subscription: Subscription, daypart: Daypart): boolean {
    // The watershed, in both directions. Nothing rated goes out before nine,
    // and nothing made for children goes out after tea.
    if ((video.ageRestricted || subscription.restricted) && !daypart.afterWatershed) return false
    if (video.madeForKids && daypart.startMin >= BEDTIME) return false

    // A short is not a programme. The clip show is the only thing it is for,
    // and a station without one simply never shows it.
    const short = video.durationSec < SHORT_MAX_SEC
    return short === (daypart.id === 'clip-show')
  }

  /**
   * Thursday night is comedy night, which means two things: comedy is lifted,
   * and everything else is pushed down. A night with a habit that still shows
   * whatever came to hand is not a night with a habit.
   */
  #theme(daypart: DaypartId, subscription: Subscription): number {
    const theme = this.#station.themes.find(
      (candidate) => candidate.weekday === this.#weekday && candidate.daypart === daypart,
    )
    if (theme === undefined) return 1
    return theme.genres.includes(subscription.genre) ? THEME_LIFT : THEME_DAMPING
  }
}

/** The heaviest any slot weighs being well watched. Peak time, and only it. */
const MAX_STANDING_WEIGHT = 0.6

/** Which parts of the day are the news, and take nothing else. */
const NEWS_DAYPARTS = new Set<DaypartId>(['lunchtime-news', 'early-evening-news'])

/** What a news item keeps of its score outside the bulletins. */
const NEWS_DAMPING = 0.25

/** After this, children's television is over. */
const BEDTIME = atClock(18)

const THEME_LIFT = 2
const THEME_DAMPING = 0.5

/** What a series is worth in its own slot, and outside it. */
const STRAND_LIFT = 2.5
const STRAND_HELD_BACK = 0.5

/** The most any of this can come to: a perfect slot, on its night, in peak. */
const MAX_SCORE = 1 * (1 + MAX_STANDING_WEIGHT) * THEME_LIFT * STRAND_LIFT

/**
 * A series is worth a great deal on its night and very little on any other,
 * which is what keeps it *being* a series: without the second half, a strand
 * simply goes out on the first day of the week that has room for it.
 */
function strandLift(strand: Strand | undefined, daypart: DaypartId, weekday: number): number {
  if (strand === undefined) return 1
  const tonight = strand.weekday === weekday && strand.daypart === daypart
  return tonight ? STRAND_LIFT : STRAND_HELD_BACK
}
