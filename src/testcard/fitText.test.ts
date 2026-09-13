import { describe, expect, it } from 'vitest'
import { fitFontSize } from './fitText'

/** What the renderer will actually lay down, by the same monospace rule. */
const widthOf = (text: string, size: number, spacing = 0) =>
  text.length * (size * 0.6 + spacing)

describe('fitFontSize', () => {
  it('leaves a line that already fits alone', () => {
    expect(fitFontSize('SHORT', 1000, 40)).toBe(40)
  })

  it('shrinks a line that would overflow until it fits', () => {
    const text = 'NORMAL SERVICE WILL BE RESUMED AS SOON AS POSSIBLE'
    const maxWidth = 600

    const size = fitFontSize(text, maxWidth, 40)

    expect(size).toBeLessThan(40)
    expect(widthOf(text, size)).toBeLessThanOrEqual(maxWidth)
  })

  it('accounts for letter-spacing, which is not free', () => {
    const text = 'CHANNEL ONE'
    const maxWidth = 300
    const spacing = 4

    const size = fitFontSize(text, maxWidth, 60, spacing)

    expect(widthOf(text, size, spacing)).toBeLessThanOrEqual(maxWidth)
    // Ignoring the spacing would have produced something too wide.
    expect(widthOf(text, fitFontSize(text, maxWidth, 60), spacing)).toBeGreaterThan(maxWidth)
  })

  it('never returns a size at or below zero, however cramped', () => {
    expect(fitFontSize('A VERY LONG CAPTION INDEED', 4, 40, 10)).toBeGreaterThan(0)
  })

  it('is untroubled by empty text or a nonsense width', () => {
    expect(fitFontSize('', 100, 30)).toBe(30)
    expect(fitFontSize('ANY', 0, 30)).toBe(30)
  })
})
