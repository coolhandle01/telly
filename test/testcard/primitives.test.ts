import { describe, expect, it } from 'vitest'
import type { TestCardSpec } from '@/testcard/model'
import { cardFrame, castellatedFrame } from '@/testcard/primitives'

const spec = (overrides: Partial<TestCardSpec> = {}): TestCardSpec => ({
  variant: 'closedown',
  now: new Date(2026, 8, 9, 1, 30, 5),
  channelName: 'CHANNEL ONE',
  ...overrides,
})

const drawn = (overrides: Partial<TestCardSpec> = {}) => {
  const s = spec(overrides)
  return castellatedFrame(cardFrame(s), s, '#808080')
}

const picture = (overrides: Partial<TestCardSpec> = {}) => {
  const [shape] = drawn(overrides).filter((s) => s.role === 'picture')
  return shape
}

describe('cardFrame', () => {
  // A border taken from the longer side would eat a tall card's picture.
  it('takes the border from the shorter side, whichever way round the card is', () => {
    const wide = cardFrame(spec({ width: 1600, height: 400 }))
    const tall = cardFrame(spec({ width: 400, height: 1600 }))

    expect(wide.border).toBe(tall.border)
    expect(wide.border).toBe(cardFrame(spec({ width: 400, height: 400 })).border)
  })
})

describe('castellatedFrame', () => {
  it('runs as many castellations as the spec asks for', () => {
    const blocks = drawn({ castellationsAcross: 21, castellationsDown: 15 }).filter(
      (s) => s.role === 'castellation',
    )

    expect(blocks).toHaveLength(2 * 21 + 2 * 15)
  })

  it('frames the picture in a line finer than the border, heavier on a bigger card', () => {
    const small = picture({ width: 320, height: 240 })
    const large = picture({ width: 2048, height: 1536 })
    const border = cardFrame(spec({ width: 2048, height: 1536 })).border

    expect(small.strokeWidth).toBeGreaterThanOrEqual(1)
    expect(large.strokeWidth).toBeGreaterThan(small.strokeWidth as number)
    expect(large.strokeWidth).toBeLessThan(border)
  })
})
