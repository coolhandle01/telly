import type { Subscription } from './profile'
import { STATIONS, type Station, type StationId } from './stations'

/**
 * Which station each subscription belongs to.
 *
 * Exclusive, and that is the point: a channel that turns up on all five is not
 * on any of them. Tuning around has to mean something, so a subscription has
 * one home and appears nowhere else — which is also how the real thing worked,
 * because a programme was bought by a broadcaster and that was that.
 *
 * The cost is honest: divide thirty subscriptions five ways and each station
 * has six, so there will be gaps. Gaps are what the test card is for.
 */
export type Lineup = ReadonlyMap<string, StationId>

/**
 * How well a station would like this supplier. Its appetite for the genre,
 * with standing as a tie-break so the better-watched channel gets first
 * refusal where two are equally on-brand.
 */
const STANDING_WEIGHT = 0.1

/**
 * What a station will pay over the odds for a genre it has given a night to.
 *
 * A station that has committed Thursday to comedy has to bid for comedy, or
 * it arrives at Thursday with nothing to put on and the night is a night in
 * name only.
 */
const THEME_BONUS = 0.15

export function fitFor(station: Station, subscription: Subscription): number {
  const themed = station.themes.some((theme) => theme.genres.includes(subscription.genre))
  return (
    station.appetite[subscription.genre] +
    (themed ? THEME_BONUS : 0) +
    STANDING_WEIGHT * subscription.standing
  )
}

/**
 * Deal the subscriptions out, best fit first.
 *
 * Strongest claims are settled first — a comedy channel gets the comedy
 * station before a merely comedy-ish one does — and no station may take more
 * than its share while another is short, so nothing ends up with the whole
 * pool and nothing ends up with none of it.
 */
export function assign(
  subscriptions: Iterable<Subscription>,
  stations: readonly Station[] = STATIONS,
): Lineup {
  const everyone = [...subscriptions].sort((a, b) => a.channelId.localeCompare(b.channelId))
  if (stations.length === 0) return new Map()

  const lineup = new Map<string, StationId>()

  /*
    Shorts first, and out of the auction entirely.

    A channel that posts nothing but forty-second clips is not a programme
    supplier, so it neither wants nor deserves a share of anybody's evening.
    It supplies the clip show, and the clip show is on one station, so that is
    where it goes whatever it happens to be about.
  */
  const clipShow = stations.find((station) =>
    station.dayparts.some((daypart) => daypart.id === 'clip-show'),
  )
  const all = everyone.filter((subscription) => {
    if (clipShow === undefined || subscription.format !== 'short') return true
    lineup.set(subscription.channelId, clipShow.id)
    return false
  })

  /*
    A draft, not an auction.

    Settling the keenest claims first sounds fair and is not: two stations a
    tenth of a point apart on the same genre are not equally served by it, the
    keener one takes every channel of that genre before the other gets a look
    in, and the loser is left with a long evening and six suppliers it did not
    want. Letting each station pick in turn gives every one of them its first
    choice, which is the thing that actually shows on screen.

    The order snakes — 1,2,3,4,5 then 5,4,3,2,1 — so picking last in one round
    is picking first in the next, and no station spends the whole draft taking
    what nobody else wanted.
  */
  const unclaimed = new Set(all.map((subscription) => subscription.channelId))
  const byChannelId = new Map(all.map((subscription) => [subscription.channelId, subscription]))

  for (let round = 0; unclaimed.size > 0; round++) {
    const picking = round % 2 === 0 ? stations : [...stations].reverse()
    for (const station of picking) {
      const pick = bestRemaining(station, unclaimed, byChannelId)
      if (pick === undefined) break
      lineup.set(pick, station.id)
      unclaimed.delete(pick)
    }
  }

  return lineup
}

/** This station's favourite of what is left. Ties go to the lower channel id. */
function bestRemaining(
  station: Station,
  unclaimed: ReadonlySet<string>,
  byChannelId: ReadonlyMap<string, Subscription>,
): string | undefined {
  let best: string | undefined
  let bestFit = -Infinity
  for (const channelId of unclaimed) {
    const subscription = byChannelId.get(channelId)
    if (subscription === undefined) continue
    const fit = fitFor(station, subscription)
    if (fit > bestFit || (fit === bestFit && best !== undefined && channelId < best)) {
      best = channelId
      bestFit = fit
    }
  }
  return best
}

/** The subscriptions one station has to work with, in a stable order. */
export function lineupFor(
  station: StationId,
  subscriptions: Iterable<Subscription>,
  lineup: Lineup,
): Subscription[] {
  return [...subscriptions]
    .filter((subscription) => lineup.get(subscription.channelId) === station)
    .sort((a, b) => a.channelId.localeCompare(b.channelId))
}
