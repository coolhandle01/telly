import { broadcastDayStart, type Pool, type Schedule } from '../domain'
import { plan, type PlanOptions } from '../schedule/plan'
import { assign, type Lineup } from './assign'
import { profile, type Subscription } from './profile'
import { StationClassifier } from './stationClassifier'
import { STATIONS, stationById, type Station, type StationId } from './stations'

/**
 * One subscription list in, five broadcast days out.
 *
 * Every station reads the same pool and plans from its own share of it, with
 * its own hours and its own taste, so tuning around the presets shows five
 * genuinely different evenings rather than one schedule wearing five hats.
 *
 * Pure and deterministic, like the packer it sits on: the same pool and the
 * same date give the same week, every time and on every machine.
 */
export interface Listings {
  /** Which subscription belongs to which station. */
  lineup: Lineup
  /** What each subscription is, as read off its uploads. */
  profiles: ReadonlyMap<string, Subscription>
  /** One broadcast day per station. */
  schedules: ReadonlyMap<StationId, Schedule>
}

export interface ListingsOptions extends Omit<PlanOptions, 'dayparts' | 'classifier'> {
  stations?: readonly Station[]
}

export function planStations(pool: Pool, options: ListingsOptions): Listings {
  const stations = options.stations ?? STATIONS
  const profiles = profile(pool)
  const lineup = assign(profiles.values(), stations)

  const schedules = new Map<StationId, Schedule>()
  for (const station of stations) {
    schedules.set(station.id, planStation(station, pool, profiles, lineup, options))
  }

  return { lineup, profiles, schedules }
}

/** One station's day. Exported because the set only ever needs one at a time. */
export function planStation(
  station: Station,
  pool: Pool,
  profiles: ReadonlyMap<string, Subscription>,
  lineup: Lineup,
  options: ListingsOptions,
): Schedule {
  const dayStart = broadcastDayStart(options.dayStart)
  const mine = onlyOurs(profiles, lineup, station.id)

  return plan(poolFor(pool, lineup, station.id), {
    /*
      A low floor on purpose.

      The packer's own floor exists to stop a classifier that has no opinion
      filling the evening with noise. This one has opinions — what may go out
      when is decided outright, before anything is scored — so what is left is
      a preference order, and a station with a thin night would still rather
      repeat its travel programme than show the card for ninety minutes.
    */
    minAffinity: STATION_MIN_AFFINITY,
    ...options,
    dayStart,
    dayparts: station.dayparts,
    classifier: new StationClassifier(station, mine, dayStart),
    // Shuffled per station and per day. Per station, or five schedules would
    // make the same choices in the same order; per day, or a station with a
    // handful of suppliers would run the same evening all week.
    seed: (options.seed ?? DEFAULT_SEED) + station.id * SEED_STEP + dayIndex(dayStart),
  })
}

const STATION_MIN_AFFINITY = 0.005
const DEFAULT_SEED = 1967
const SEED_STEP = 101
const MS_PER_DAY = 86_400_000

/**
 * Which day this is, counted in civil days. `Date.UTC` of the local date, for
 * the same reason the card rotation uses it: dividing a local midnight by a
 * day counts UTC days, which is off by one for half the year.
 */
function dayIndex(dayStart: Date): number {
  return Math.floor(
    Date.UTC(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate()) / MS_PER_DAY,
  )
}

/** The pool as one station sees it: its own suppliers and nobody else's. */
function poolFor(pool: Pool, lineup: Lineup, station: StationId): Pool {
  return {
    videos: pool.videos.filter((video) => lineup.get(video.channelId) === station),
    channels: pool.channels,
  }
}

function onlyOurs(
  profiles: ReadonlyMap<string, Subscription>,
  lineup: Lineup,
  station: StationId,
): ReadonlyMap<string, Subscription> {
  const mine = new Map<string, Subscription>()
  for (const [channelId, subscription] of profiles) {
    if (lineup.get(channelId) === station) mine.set(channelId, subscription)
  }
  return mine
}

export { STATIONS, stationById, type Station, type StationId }
