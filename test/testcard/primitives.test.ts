import { describe, expect, it } from 'vitest'
import type { CircleShape, LineShape, RectShape, Shape, TestCardSpec, TextShape } from '@/testcard/model'
import {
  barsForFrequency,
  captionBox,
  cardFrame,
  castellatedFrame,
  castellations,
  clockBox,
  convergence,
  gratings,
  resolutionWedges,
} from '@/testcard/primitives'

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

const FRAME = cardFrame(spec())

const byId = <T extends Shape>(shapes: Shape[], id: string): T =>
  shapes.find((shape) => shape.id === id) as T

const startingWith = <T extends Shape>(shapes: Shape[], prefix: string): T[] =>
  shapes.filter((shape) => shape.id.startsWith(prefix)) as T[]

/** A line's width in Courier New, which advances 0.6em a glyph. */
const widthOf = (line: TextShape): number =>
  line.text.length * (line.fontSize * 0.6 + (line.letterSpacing ?? 0))

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

describe('castellations', () => {
  it('divides each side edge evenly between the top and bottom runs', () => {
    const blocks = castellations(1024, 768, 48, 17, 13)

    for (const side of ['left', 'right']) {
      const run = startingWith<RectShape>(blocks, `castellation-${side}-`)
      const height = (768 - 2 * 48) / 13
      expect(run).toHaveLength(13)
      run.forEach((block, j) => {
        expect(block.y).toBeCloseTo(48 + j * height, 9)
        expect(block.height).toBeCloseTo(height, 9)
      })
    }
  })
})

describe('gratings', () => {
  it('puts more bars in every step up the frequencies', () => {
    const counts = [1.5, 2.5, 3.5, 4.5].map(barsForFrequency)

    counts.forEach((count, i) => {
      if (i > 0) expect(count).toBeGreaterThan(counts[i - 1])
    })
  })

  it('bars each patch in alternating ink, light at both ends against its dark frame', () => {
    const shapes = gratings(FRAME.picture, [3.5])
    const frame = byId<RectShape>(shapes, 'grating-frame-r3.5')
    const bars = startingWith<RectShape>(shapes, 'grating-frame-r3.5-')

    expect(bars[0].fill).not.toBe(frame.fill)
    expect(bars[1].fill).toBe(frame.fill)
    bars.forEach((bar, j) => expect(bar.fill).toBe(bars[j % 2].fill))
  })
})

describe('resolutionWedges', () => {
  // The lines fan from the wedge's inner corner to points walked evenly round
  // its two outer edges, from one end of that walk to the other.
  it('ends its lines evenly round the outer edges of the wedge, corner to corner', () => {
    const shapes = resolutionWedges(FRAME.picture, FRAME.width)
    const frame = byId<RectShape>(shapes, 'wedge-frame-tl')
    const lines = startingWith<LineShape>(shapes, 'wedge-line-tl-')
    const size = frame.width
    const ends = lines.map((line) => ({ x: line.x2, y: line.y2 }))
    const step = (2 * size) / (lines.length - 1)

    lines.forEach((line) => expect(line).toMatchObject({ x1: frame.x + size, y1: frame.y + size }))
    expect(ends[0]).toEqual({ x: frame.x + size, y: frame.y })
    expect(ends[ends.length - 1]).toEqual({ x: frame.x, y: frame.y + size })
    ends.forEach((end, t) => {
      expect(end.x === frame.x || end.y === frame.y).toBe(true)
      if (t > 0) {
        const walked = Math.abs(end.x - ends[t - 1].x) + Math.abs(end.y - ends[t - 1].y)
        expect(walked).toBeCloseTo(step, 9)
      }
    })
  })
})

describe('convergence', () => {
  const shapes = convergence(FRAME.picture, FRAME.centre)

  it('runs the crosshair out past the circle, both ways', () => {
    const circle = byId<CircleShape>(shapes, 'convergence-circle')
    const across = byId<LineShape>(shapes, 'crosshair-horizontal')
    const down = byId<LineShape>(shapes, 'crosshair-vertical')

    expect(across.x1).toBeLessThan(circle.cx - circle.r)
    expect(across.x2).toBeGreaterThan(circle.cx + circle.r)
    expect(down.y1).toBeLessThan(circle.cy - circle.r)
    expect(down.y2).toBeGreaterThan(circle.cy + circle.r)
  })

  it('draws both circles as outlines, not discs', () => {
    shapes
      .filter((shape) => shape.kind === 'circle')
      .forEach((circle) => expect(circle).toMatchObject({ fill: 'none' }))
  })
})

describe('captionBox', () => {
  it('sets its three lines inside the box, top to bottom, however long the name', () => {
    const shapes = captionBox(
      FRAME.picture,
      FRAME.centre,
      spec({ channelName: 'THE NORTHERN AND MIDLAND TELEVISION SERVICE' }),
    )
    const box = byId<RectShape>(shapes, 'caption-box')
    const lines = ['caption-channel', 'caption-date', 'caption-message'].map((id) =>
      byId<TextShape>(shapes, id),
    )

    lines.forEach((line, i) => {
      expect(line.y).toBeGreaterThan(i === 0 ? box.y : lines[i - 1].y)
      expect(line.y).toBeLessThan(box.y + box.height)
      expect(widthOf(line)).toBeLessThanOrEqual(box.width)
    })
  })
})

describe('clockBox', () => {
  it('sets the time inside its box, no taller and no wider', () => {
    const shapes = clockBox(FRAME.picture, FRAME.centre, new Date(2026, 8, 9, 1, 30, 5))
    const box = byId<RectShape>(shapes, 'clock-box')
    const time = byId<TextShape>(shapes, 'clock-time')

    expect(time.y).toBeGreaterThan(box.y)
    expect(time.y).toBeLessThan(box.y + box.height)
    expect(time.fontSize).toBeLessThan(box.height)
    expect(widthOf(time)).toBeLessThanOrEqual(box.width)
  })
})
