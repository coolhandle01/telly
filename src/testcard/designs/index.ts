import { broadcastDayStart } from '../../domain'
import type { CardDesignId, TestCardModel, TestCardSpec } from '../model'
import { buildBarsCard } from './bars'
import { buildCrosshatchCard } from './crosshatch'
import { buildElectronicCard } from './electronic'
import { buildFaultCard } from './fault'
import { buildIdentCard } from './ident'
import { buildMonoscopeCard } from './monoscope'

export type CardDesign = (spec: TestCardSpec) => TestCardModel

/**
 * Every card the channel knows how to draw.
 *
 * The order is the rotation order, so adding one changes which card falls on
 * which day. That is fine (nobody has a right to Tuesday's card) but it is
 * why the rotation is derived from the date rather than stored anywhere.
 */
export const CARD_DESIGNS: Record<CardDesignId, CardDesign> = {
  electronic: buildElectronicCard,
  bars: buildBarsCard,
  monoscope: buildMonoscopeCard,
  crosshatch: buildCrosshatchCard,
  ident: buildIdentCard,
  // Present in the record so it can be drawn, absent from the rotation below
  // so it is never drawn by accident. A station does not take a turn at being
  // broken.
  fault: buildFaultCard,
}

/** The rotation, in order. */
export const DESIGN_ROTATION: readonly CardDesignId[] = [
  'electronic',
  'bars',
  'monoscope',
  'crosshatch',
  'ident',
]

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Which card today's is. Derived from the date, so every set tuned to this
 * channel shows the same card on the same day, and a card lasts a whole
 * broadcast day rather than changing under you at midnight.
 *
 * Counted in local days, not UTC ones, for the same reason the schedule is:
 * a viewer's day is the one their clock is showing.
 */
export function designForDate(
  now: Date,
  rotation: readonly CardDesignId[] = DESIGN_ROTATION,
): CardDesignId {
  if (rotation.length === 0) return DESIGN_ROTATION[0]
  // The *broadcast* day's date, not the calendar day's. At two in the morning
  // you are still watching yesterday's television, and the card is part of
  // that day: it should turn over at six with everything else, not at
  // midnight in the middle of late night.
  const day = broadcastDayStart(now)
  // Every step below carries NaN through to `rotation[NaN]`, and
  // `buildTestCard` indexes `CARD_DESIGNS` with whatever comes back.
  if (Number.isNaN(day.getTime())) return rotation[0]

  // The civil date, counted as a civil date. Dividing a *local* midnight by
  // 86,400,000 counts UTC days: under BST local midnight is 23.00 UTC the day
  // before, so the index lands on the previous day, consistently, which is
  // why it looks fine, right up until the clocks change and the rotation
  // either repeats a card or skips one. `Date.UTC` of the local Y/M/D is an
  // exact multiple of a day whatever the zone.
  const days = Math.floor(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()) / MS_PER_DAY)
  // JS % keeps the sign of the dividend; dates before 1970 would go negative.
  const index = ((days % rotation.length) + rotation.length) % rotation.length
  return rotation[index]
}
