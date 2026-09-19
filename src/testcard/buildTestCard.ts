import { CARD_DESIGNS, designForDate } from './designs'
import type { TestCardModel, TestCardSpec } from './model'

/**
 * Draw a card: whichever design the spec names, or else the one whose turn it
 * is today.
 *
 * Pure: a spec of plain values in, a plain-data model out. No DOM, no clock,
 * no randomness, so the whole of a card's geometry is provable in a test that
 * mounts nothing.
 */
export function buildTestCard(spec: TestCardSpec): TestCardModel {
  const design = CARD_DESIGNS[spec.design ?? designForDate(spec.now, spec.rotation)]
  return design(spec)
}
