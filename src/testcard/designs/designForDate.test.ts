import { describe, expect, it } from 'vitest'
import type { CardDesignId } from '../model'
import { designForDate } from './index'

const FIVE: readonly CardDesignId[] = ['electronic', 'bars', 'monoscope', 'crosshatch', 'ident']
const on = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h)

describe('designForDate', () => {
  it('holds one card for a whole broadcast day, six until six', () => {
    const openUp = designForDate(on(2026, 9, 12, 6), FIVE)
    const evening = designForDate(on(2026, 9, 12, 23), FIVE)
    const smallHours = designForDate(on(2026, 9, 13, 5), FIVE)

    expect(evening).toBe(openUp)
    // Half five the next morning is still last night's television, and still
    // last night's card. It used to turn over at midnight, in the middle of
    // late night, which is the one moment nobody would choose.
    expect(smallHours).toBe(openUp)
  })

  it('turns the card over at six in the morning, not at midnight', () => {
    const beforeSix = designForDate(on(2026, 9, 13, 5), FIVE)
    const afterSix = designForDate(on(2026, 9, 13, 6), FIVE)

    expect(afterSix).not.toBe(beforeSix)
  })

  it('changes card from one day to the next', () => {
    expect(designForDate(on(2026, 9, 13), FIVE)).not.toBe(designForDate(on(2026, 9, 12), FIVE))
  })

  it('comes back round after a full rotation', () => {
    expect(designForDate(on(2026, 9, 17), FIVE)).toBe(designForDate(on(2026, 9, 12), FIVE))
  })

  it('uses every card in the rotation across its length', () => {
    const seen = new Set(
      Array.from({ length: FIVE.length }, (_, i) => designForDate(on(2026, 9, 12 + i), FIVE)),
    )
    expect(seen.size).toBe(FIVE.length)
  })

  it('is the same for every set tuned in on the same day', () => {
    expect(designForDate(on(2026, 9, 12, 7), FIVE)).toBe(designForDate(on(2026, 9, 12, 19), FIVE))
  })

  it('gives the small hours the card of the day they belong to', () => {
    // 01.30 on the thirteenth is the twelfth's broadcast day.
    expect(designForDate(on(2026, 9, 13, 1), FIVE)).toBe(designForDate(on(2026, 9, 12, 12), FIVE))
  })

  it('survives a rotation of one, which is what it has until more are drawn', () => {
    expect(designForDate(on(2026, 9, 12), ['electronic'])).toBe('electronic')
    expect(designForDate(on(2031, 1, 1), ['electronic'])).toBe('electronic')
  })

  // Widened: this was the only test asking "whatever the date, a card comes
  // back", and its one extreme input was a perfectly ordinary Date. A clock
  // that hands this an Invalid Date carries NaN through the arithmetic, the
  // rotation is indexed with it, and the caller looks the result up in
  // CARD_DESIGNS and calls what it finds.
  it.each([
    ['a date before 1970', () => on(1967, 7, 1)],
    ['a date the arithmetic cannot use', () => new Date(Number.NaN)],
  ])('still gives back a card in the rotation for %s', (_case, date) => {
    expect(FIVE).toContain(designForDate(date(), FIVE))
  })
})
