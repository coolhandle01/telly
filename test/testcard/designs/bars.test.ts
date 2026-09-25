import { describe, expect, it } from 'vitest'
import { buildBarsCard } from '@/testcard/designs/bars'
import {
  shapesOfRole,
  type RectShape,
  type Shape,
  type ShapeRole,
  type TestCardModel,
  type TestCardSpec,
} from '@/testcard/model'

const NOW = new Date(2026, 8, 9, 1, 30, 5)
const RESUMES = new Date(2026, 8, 9, 6, 0, 0)
/** Long enough ago that no ambient clock could have produced it. */
const LONG_AGO = new Date(1967, 6, 1, 11, 5, 9)

function spec(overrides: Partial<TestCardSpec> = {}): TestCardSpec {
  return {
    variant: 'closedown',
    now: NOW,
    channelName: 'CHANNEL ONE',
    resumesAt: RESUMES,
    ...overrides,
  }
}

const card = (overrides: Partial<TestCardSpec> = {}): TestCardModel => buildBarsCard(spec(overrides))

const round = (n: number): number => Math.round(n * 1e6) / 1e6

/** The same shape reflected in the card's vertical axis. */
function mirror(shape: Shape, width: number): Shape {
  switch (shape.kind) {
    case 'rect':
      return { ...shape, x: width - shape.x - shape.width }
    case 'circle':
      return { ...shape, cx: width - shape.cx }
    case 'line':
      return { ...shape, x1: width - shape.x1, x2: width - shape.x2 }
    case 'text':
      return { ...shape, x: width - shape.x }
  }
}

/** A shape's identity for comparison: every field but the id, numbers rounded. */
function key(shape: Shape): string {
  const rounded = Object.fromEntries(
    Object.entries(shape)
      .filter(([field]) => field !== 'id')
      .map(([field, value]) => [field, typeof value === 'number' ? round(value) : value]),
  ) as Record<string, unknown>

  return JSON.stringify(Object.entries(rounded).sort(([a], [b]) => a.localeCompare(b)))
}

function assertMirrorSymmetric(model: TestCardModel, shapes: Shape[]): void {
  expect(shapes.length).toBeGreaterThan(0)
  const present = shapes.map((shape) => key(shape)).sort()
  const reflected = shapes.map((shape) => key(mirror(shape, model.width))).sort()
  expect(reflected).toEqual(present)
}

const rects = (model: TestCardModel, ...roles: ShapeRole[]): RectShape[] =>
  shapesOfRole(model, ...roles).filter((shape): shape is RectShape => shape.kind === 'rect')

const textOf = (model: TestCardModel, role: ShapeRole): string => {
  const [shape] = shapesOfRole(model, role)
  return shape?.kind === 'text' ? shape.text : ''
}

/** `#rrggbb` as three 0-255 channels. */
const channels = (fill: string): [number, number, number] => [
  parseInt(fill.slice(1, 3), 16),
  parseInt(fill.slice(3, 5), 16),
  parseInt(fill.slice(5, 7), 16),
]

/** A grey's level, 0-255. Throws the test if the fill is not a neutral grey. */
function greyLevel(fill: string): number {
  const [r, g, b] = channels(fill)
  expect({ fill, neutral: r === g && g === b }).toEqual({ fill, neutral: true })
  return r
}

/** `[left, right, top, bottom]` of a shape's bounding box. */
function extent(shape: Shape): [number, number, number, number] {
  switch (shape.kind) {
    case 'rect':
      return [shape.x, shape.x + shape.width, shape.y, shape.y + shape.height]
    case 'circle':
      return [shape.cx - shape.r, shape.cx + shape.r, shape.cy - shape.r, shape.cy + shape.r]
    case 'line':
      return [
        Math.min(shape.x1, shape.x2),
        Math.max(shape.x1, shape.x2),
        Math.min(shape.y1, shape.y2),
        Math.max(shape.y1, shape.y2),
      ]
    case 'text':
      return [shape.x, shape.x, shape.y, shape.y]
  }
}

const EBU_ORDER = [
  '#ffffff',
  '#ffff00',
  '#00ffff',
  '#00ff00',
  '#ff00ff',
  '#ff0000',
  '#0000ff',
  '#000000',
]

describe('buildBarsCard — the card frame', () => {
  it('defaults to a 4:3 card and reports its geometric centre', () => {
    const model = card()

    expect(model.width).toBe(1024)
    expect(model.height).toBe(768)
    expect(model.centre).toEqual({ x: 512, y: 384 })
  })

  it('honours injected dimensions and recentres on them', () => {
    const model = card({ width: 640, height: 480 })

    expect(model.centre).toEqual({ x: 320, y: 240 })
    expect(model.width).toBe(640)
    expect(model.height).toBe(480)
  })

  it('lays exactly one background over the whole card and reports its colour', () => {
    const model = card()
    const [background, ...rest] = rects(model, 'background')

    expect(rest).toEqual([])
    expect(background).toMatchObject({ x: 0, y: 0, width: 1024, height: 768 })
    expect(model.background).toBe(background.fill)
  })

  it('frames a picture area inset from every edge by the castellated border', () => {
    const model = card()
    const [picture, ...rest] = rects(model, 'picture')

    expect(rest).toEqual([])
    expect(model.picture.x).toBeGreaterThan(0)
    expect(model.picture.y).toBeGreaterThan(0)
    expect(model.picture.x + model.picture.width).toBe(model.width - model.picture.x)
    expect(model.picture.y + model.picture.height).toBe(model.height - model.picture.y)
    expect(picture).toMatchObject(model.picture)
  })

  it('runs castellations along all four edges and mirrors them about the vertical axis', () => {
    const model = card({ castellationsAcross: 17, castellationsDown: 13 })

    expect(shapesOfRole(model, 'castellation')).toHaveLength(2 * 17 + 2 * 13)
    assertMirrorSymmetric(model, shapesOfRole(model, 'castellation'))
  })
})

describe('buildBarsCard — the full-height colour bars', () => {
  it('lays eight bars in EBU order, brightest to darkest', () => {
    expect(rects(card(), 'bar-tall').map((bar) => bar.fill)).toEqual(EBU_ORDER)
  })

  it('divides the picture width evenly and spans it exactly', () => {
    const model = card()
    const bars = rects(model, 'bar-tall')
    const expectedWidth = model.picture.width / 8

    bars.forEach((bar, i) => {
      expect(bar.width).toBeCloseTo(expectedWidth, 9)
      expect(bar.x).toBeCloseTo(model.picture.x + i * expectedWidth, 9)
    })
    expect(bars[0].x).toBe(model.picture.x)
    const last = bars[bars.length - 1]
    expect(last.x + last.width).toBeCloseTo(model.picture.x + model.picture.width, 9)
  })

  it('starts every bar at the top of the picture and gives them all one height', () => {
    const model = card()
    const bars = rects(model, 'bar-tall')

    bars.forEach((bar) => {
      expect(bar.y).toBe(model.picture.y)
      expect(bar.height).toBeCloseTo(bars[0].height, 9)
    })
  })

  it('dominates the picture: the bars are taller than everything under them together', () => {
    const model = card()
    const bars = rects(model, 'bar-tall')
    const under = rects(model, 'colour-bar', 'pluge', 'greyscale-step')

    expect(bars[0].height).toBeGreaterThan(model.picture.height * 0.6)
    under.forEach((shape) => expect(shape.height).toBeLessThan(bars[0].height))
  })

  it('keeps the bars clear of the caption box', () => {
    const model = card()
    const bars = rects(model, 'bar-tall')
    const [caption] = rects(model, 'caption-box')

    expect(bars[0].y + bars[0].height).toBeLessThanOrEqual(caption.y)
  })
})

describe('buildBarsCard — the reversed band beneath', () => {
  it('runs the same eight colours in the opposite order', () => {
    expect(rects(card(), 'colour-bar').map((bar) => bar.fill)).toEqual([...EBU_ORDER].reverse())
  })

  it('puts the complement of each tall bar directly beneath it', () => {
    const model = card()
    const tall = rects(model, 'bar-tall')
    const reversed = rects(model, 'colour-bar')

    expect(reversed).toHaveLength(tall.length)
    reversed.forEach((bar, i) => {
      const [r, g, b] = channels(bar.fill)
      const [tr, tg, tb] = channels(tall[i].fill)
      expect([r + tr, g + tg, b + tb]).toEqual([255, 255, 255])
      expect(bar.x).toBeCloseTo(tall[i].x, 9)
      expect(bar.width).toBeCloseTo(tall[i].width, 9)
    })
  })

  it('is a narrower band, sitting immediately under the tall bars', () => {
    const model = card()
    const tall = rects(model, 'bar-tall')
    const reversed = rects(model, 'colour-bar')

    reversed.forEach((bar) => {
      expect(bar.y).toBeCloseTo(tall[0].y + tall[0].height, 9)
      expect(bar.height).toBeCloseTo(reversed[0].height, 9)
      expect(bar.height).toBeLessThan(tall[0].height / 2)
      expect(bar.height).toBeGreaterThan(0)
    })
  })

  it('spans the picture width exactly, like the bars above it', () => {
    const model = card()
    const reversed = rects(model, 'colour-bar')
    const last = reversed[reversed.length - 1]

    expect(reversed[0].x).toBe(model.picture.x)
    expect(last.x + last.width).toBeCloseTo(model.picture.x + model.picture.width, 9)
  })
})

describe('buildBarsCard — the PLUGE strip', () => {
  it('steps monotonically upward through distinct near-black levels', () => {
    const patches = rects(card(), 'pluge')

    expect(patches.length).toBeGreaterThanOrEqual(4)
    const levels = patches.map((patch) => greyLevel(patch.fill))
    expect(levels[0]).toBe(0)
    levels.forEach((level, i) => {
      if (i > 0) expect(level).toBeGreaterThan(levels[i - 1])
      // Near black throughout: the whole point is that the steps are hard to
      // see, so a display set too bright shows them and a correct one does not.
      expect(level).toBeLessThanOrEqual(0.1 * 255)
    })
    expect(new Set(levels).size).toBe(levels.length)
  })

  it('lays the patches in one contiguous run of equal width', () => {
    const patches = rects(card(), 'pluge')

    patches.forEach((patch, i) => {
      expect(patch.width).toBeCloseTo(patches[0].width, 9)
      expect(patch.height).toBeCloseTo(patches[0].height, 9)
      expect(patch.y).toBeCloseTo(patches[0].y, 9)
      if (i > 0) expect(patch.x).toBeCloseTo(patches[i - 1].x + patches[i - 1].width, 9)
    })
  })

  it('centres the run on the card axis and keeps it well inside the picture', () => {
    const model = card()
    const patches = rects(model, 'pluge')
    const last = patches[patches.length - 1]
    const runWidth = last.x + last.width - patches[0].x

    expect(patches[0].x + runWidth / 2).toBeCloseTo(model.centre.x, 9)
    expect(runWidth).toBeLessThan(model.picture.width)
    expect(patches[0].x).toBeGreaterThan(model.picture.x)
  })

  it('sits below the reversed band and above the caption box', () => {
    const model = card()
    const [patch] = rects(model, 'pluge')
    const reversed = rects(model, 'colour-bar')
    const [caption] = rects(model, 'caption-box')

    expect(patch.y).toBeGreaterThanOrEqual(reversed[0].y + reversed[0].height)
    expect(patch.y + patch.height).toBeLessThanOrEqual(caption.y)
  })
})

describe('buildBarsCard — the white and black reference patches', () => {
  const references = (model: TestCardModel): RectShape[] => rects(model, 'greyscale-step')

  it('shows one peak-white and one full-black patch', () => {
    expect(references(card()).map((patch) => patch.fill).sort()).toEqual(['#000000', '#ffffff'])
  })

  it('keeps both patches small, on the PLUGE row, and matched in size', () => {
    const model = card()
    const [first, second] = references(model)
    const [patch] = rects(model, 'pluge')

    expect(first.width).toBeCloseTo(second.width, 9)
    expect(first.height).toBeCloseTo(second.height, 9)
    expect(first.width).toBeLessThan(model.picture.width * 0.2)
    expect(first.y).toBeCloseTo(patch.y, 9)
    expect(second.y).toBeCloseTo(patch.y, 9)
  })

  it('places them symmetrically, white to the left of the PLUGE run and black to its right', () => {
    const model = card()
    const [first, second] = references(model)
    const patches = rects(model, 'pluge')
    const last = patches[patches.length - 1]
    const left = first.x < second.x ? first : second
    const right = first.x < second.x ? second : first

    expect(left.fill).toBe('#ffffff')
    expect(right.fill).toBe('#000000')
    expect(left.x - model.picture.x).toBeCloseTo(
      model.picture.x + model.picture.width - (right.x + right.width),
      9,
    )
    expect(left.x + left.width).toBeLessThanOrEqual(patches[0].x)
    expect(right.x).toBeGreaterThanOrEqual(last.x + last.width)
  })
})

describe('buildBarsCard — caption box and clock', () => {
  it('captions the injected channel name', () => {
    expect(textOf(card({ channelName: 'CHANNEL TWO' }), 'caption-channel')).toBe('CHANNEL TWO')
  })

  it('captions the injected date and instant, not the real ones', () => {
    const model = card({ now: LONG_AGO })

    expect(textOf(model, 'caption-date')).toBe('SATURDAY 1 JULY 1967')
    expect(textOf(model, 'clock-time')).toBe('11.05.09')
  })

  it('names the injected resume time in the closedown service message', () => {
    expect(textOf(card({ resumesAt: new Date(2026, 8, 9, 6, 15) }), 'caption-message')).toBe(
      'NORMAL SERVICE WILL RESUME AT 06.15',
    )
  })

  it('prefers an explicitly supplied message over the derived one', () => {
    expect(textOf(card({ message: 'WE APOLOGISE FOR THE INTERRUPTION' }), 'caption-message')).toBe(
      'WE APOLOGISE FOR THE INTERRUPTION',
    )
  })

  it('falls back to an open-ended closedown message when no resume time is known', () => {
    expect(textOf(card({ resumesAt: undefined }), 'caption-message')).toBe(
      'NORMAL SERVICE WILL RESUME SHORTLY',
    )
  })

  it('centres the caption box and the clock box on the vertical axis', () => {
    const model = card()
    const boxes = rects(model, 'caption-box', 'clock-box')

    expect(boxes).toHaveLength(2)
    boxes.forEach((box) => expect(box.x + box.width / 2).toBe(model.centre.x))
  })

  it('anchors every caption and clock line on the vertical axis', () => {
    const model = card()
    const lines = shapesOfRole(
      model,
      'caption-channel',
      'caption-date',
      'caption-message',
      'clock-time',
    ).filter((shape) => shape.kind === 'text')

    expect(lines).toHaveLength(4)
    lines.forEach((line) => {
      expect(line.x).toBe(model.centre.x)
      expect(line.anchor).toBe('middle')
    })
  })
})

describe('buildBarsCard — the interlude variant', () => {
  const interlude = (overrides: Partial<TestCardSpec> = {}): TestCardModel =>
    card({ variant: 'interlude', ...overrides })

  it('strips back the test signals: the reversed band, the PLUGE and the references', () => {
    expect(shapesOfRole(interlude(), 'colour-bar', 'pluge', 'greyscale-step')).toEqual([])
  })

  it('keeps the bars, the frame, the caption and the clock', () => {
    const model = interlude()

    expect(rects(model, 'bar-tall').map((bar) => bar.fill)).toEqual(EBU_ORDER)
    expect(shapesOfRole(model, 'castellation').length).toBeGreaterThan(0)
    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'clock-time')).toBe('01.30.05')
  })

  it('lets the bars run the full height of the picture, the rows below being gone', () => {
    const model = interlude()
    const bars = rects(model, 'bar-tall')

    bars.forEach((bar) => {
      expect(bar.y).toBe(model.picture.y)
      expect(bar.height).toBeCloseTo(model.picture.height, 9)
    })
    expect(bars[0].height).toBeGreaterThan(rects(card(), 'bar-tall')[0].height)
  })

  it('carries a continuity message rather than a closedown one', () => {
    expect(textOf(interlude(), 'caption-message')).toBe('PROGRAMMES WILL CONTINUE SHORTLY')
  })

  it('reports its own variant', () => {
    expect(interlude().variant).toBe('interlude')
    expect(card().variant).toBe('closedown')
  })
})

describe('buildBarsCard — invariants', () => {
  const shapes = (model: TestCardModel): Shape[] => model.shapes

  it('keeps every shape inside the bounds of the card, in either variant', () => {
    for (const model of [card(), card({ variant: 'interlude' }), card({ width: 640, height: 480 })]) {
      shapes(model).forEach((shape) => {
        const [left, right, top, bottom] = extent(shape)
        expect({
          id: shape.id,
          inside: left >= 0 && top >= 0 && right <= model.width && bottom <= model.height,
        }).toEqual({ id: shape.id, inside: true })
      })
    }
  })

  it('gives every shape a distinct id, so a renderer can key on it', () => {
    for (const model of [card(), card({ variant: 'interlude' })]) {
      const ids = shapes(model).map((shape) => shape.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('is pure: the same spec twice draws the very same card', () => {
    expect(card()).toEqual(card())
  })

  it('paints in an order that leaves the caption and the clock on top', () => {
    const model = card()
    const at = (id: string): number => model.shapes.findIndex((shape) => shape.id === id)

    expect(at('background')).toBe(0)
    expect(at('picture')).toBeGreaterThan(at('background'))
    expect(at('bar-tall-white')).toBeGreaterThan(at('picture'))
    expect(at('caption-box')).toBeGreaterThan(at('bar-tall-white'))
    expect(at('caption-channel')).toBeGreaterThan(at('caption-box'))
    expect(at('clock-time')).toBeGreaterThan(at('clock-box'))
    expect(at('clock-box')).toBeGreaterThan(at('bar-tall-white'))
  })
})
