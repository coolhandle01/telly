import { describe, expect, it } from 'vitest'
import { buildIdentCard } from '@/testcard/designs/ident'
import {
  shapesOfRole,
  type CircleShape,
  type LineShape,
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

const card = (overrides: Partial<TestCardSpec> = {}): TestCardModel => buildIdentCard(spec(overrides))

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

/**
 * A shape's identity for comparison: every field but the id, numbers rounded,
 * and a line's endpoints put in a canonical order so that a line and the same
 * line drawn backwards compare equal.
 */
function key(shape: Shape): string {
  const rounded = Object.fromEntries(
    Object.entries(shape)
      .filter(([field]) => field !== 'id')
      .map(([field, value]) => [field, typeof value === 'number' ? round(value) : value]),
  ) as Record<string, unknown>

  if (shape.kind === 'line') {
    const { x1, y1, x2, y2 } = rounded as Record<'x1' | 'y1' | 'x2' | 'y2', number>
    if (x1 > x2 || (x1 === x2 && y1 > y2)) {
      Object.assign(rounded, { x1: x2, y1: y2, x2: x1, y2: y1 })
    }
  }

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

const circles = (model: TestCardModel, ...roles: ShapeRole[]): CircleShape[] =>
  shapesOfRole(model, ...roles).filter((shape): shape is CircleShape => shape.kind === 'circle')

const lines = (model: TestCardModel, ...roles: ShapeRole[]): LineShape[] =>
  shapesOfRole(model, ...roles).filter((shape): shape is LineShape => shape.kind === 'line')

const textShape = (model: TestCardModel, id: string) => {
  const shape = model.shapes.find((candidate) => candidate.id === id)
  expect(shape?.kind).toBe('text')
  return shape as Extract<Shape, { kind: 'text' }>
}

const textOf = (model: TestCardModel, role: ShapeRole): string => {
  const [shape] = shapesOfRole(model, role)
  return shape?.kind === 'text' ? shape.text : ''
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

const TWO_PI = Math.PI * 2

/** The angle of a point about the card centre, in [0, 2π). */
const angleAt = (model: TestCardModel, x: number, y: number): number =>
  (Math.atan2(y - model.centre.y, x - model.centre.x) + TWO_PI) % TWO_PI

const distanceFromCentre = (model: TestCardModel, x: number, y: number): number =>
  Math.hypot(x - model.centre.x, y - model.centre.y)

describe('buildIdentCard — the card frame', () => {
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

  it('keeps the castellated border idiom, mirrored about the vertical axis', () => {
    const model = card({ castellationsAcross: 17, castellationsDown: 13 })

    expect(shapesOfRole(model, 'castellation')).toHaveLength(2 * 17 + 2 * 13)
    assertMirrorSymmetric(model, shapesOfRole(model, 'castellation'))
  })
})

describe('buildIdentCard — the colour rings', () => {
  it('runs the eight colours outward-in, brightest outermost', () => {
    expect(circles(card(), 'ring').map((ring) => ring.stroke)).toEqual(EBU_ORDER)
  })

  it('centres every ring exactly on the card centre, at any size of card', () => {
    for (const model of [card(), card({ width: 640, height: 480 })]) {
      const rings = circles(model, 'ring')

      expect(rings.length).toBeGreaterThan(1)
      rings.forEach((ring) => {
        expect(ring.cx).toBe(model.centre.x)
        expect(ring.cy).toBe(model.centre.y)
      })
    }
  })

  it('spaces the radii evenly, largest first', () => {
    const rings = circles(card(), 'ring')
    const radii = rings.map((ring) => ring.r)
    const step = radii[0] - radii[1]

    expect(step).toBeGreaterThan(0)
    radii.forEach((r, i) => {
      if (i > 0) {
        expect(r).toBeLessThan(radii[i - 1])
        expect(radii[i - 1] - r).toBeCloseTo(step, 9)
      }
    })
    expect(radii[radii.length - 1]).toBeGreaterThan(0)
  })

  it('draws them as rings, not discs, each band no wider than the spacing', () => {
    const rings = circles(card(), 'ring')
    const step = rings[0].r - rings[1].r

    rings.forEach((ring) => {
      expect(ring.fill).toBe('none')
      expect(ring.strokeWidth ?? 0).toBeGreaterThan(0)
      expect(ring.strokeWidth ?? 0).toBeLessThanOrEqual(step)
    })
  })

  it('fits the wheel and its star inside the picture, on a wide card or a narrow one', () => {
    for (const model of [card(), card({ width: 640, height: 480 }), card({ width: 400, height: 700 })]) {
      const outer = circles(model, 'ring')[0]
      const star = lines(model, 'star-segment')
      const reach = Math.max(
        outer.r + (outer.strokeWidth ?? 0) / 2,
        ...star.flatMap((segment) => [
          distanceFromCentre(model, segment.x1, segment.y1),
          distanceFromCentre(model, segment.x2, segment.y2),
        ]),
      )

      expect(model.centre.x - reach).toBeGreaterThanOrEqual(model.picture.x)
      expect(model.centre.y - reach).toBeGreaterThanOrEqual(model.picture.y)
      expect(model.centre.x + reach).toBeLessThanOrEqual(model.picture.x + model.picture.width)
      expect(model.centre.y + reach).toBeLessThanOrEqual(model.picture.y + model.picture.height)
    }
  })

  it('stops the wheel short of the caption box, at any size of card', () => {
    for (const model of [card(), card({ width: 640, height: 480 })]) {
      const outer = circles(model, 'ring')[0]
      const [caption] = rects(model, 'caption-box')

      expect(model.centre.y + outer.r + (outer.strokeWidth ?? 0) / 2).toBeLessThanOrEqual(caption.y)
      // …without the clearance shrinking the wheel to a badge.
      expect(outer.r).toBeGreaterThan(model.picture.height * 0.2)
    }
  })

  it('is symmetric about the vertical axis', () => {
    const model = card()

    assertMirrorSymmetric(model, shapesOfRole(model, 'ring'))
  })
})

describe('buildIdentCard — the star of segments around the wheel', () => {
  it('radiates an even number of segments, every one pointing at the centre', () => {
    const model = card()
    const star = lines(model, 'star-segment')

    expect(star.length).toBeGreaterThanOrEqual(8)
    expect(star.length % 2).toBe(0)
    star.forEach((segment) => {
      const cross =
        (segment.x1 - model.centre.x) * (segment.y2 - model.centre.y) -
        (segment.y1 - model.centre.y) * (segment.x2 - model.centre.x)
      expect(cross).toBeCloseTo(0, 6)
    })
  })

  it('spaces the segments evenly around the full turn', () => {
    const model = card()
    const star = lines(model, 'star-segment')
    const angles = star
      .map((segment) => angleAt(model, (segment.x1 + segment.x2) / 2, (segment.y1 + segment.y2) / 2))
      .sort((a, b) => a - b)
    const step = TWO_PI / star.length

    angles.forEach((angle, i) => {
      if (i > 0) expect(angle - angles[i - 1]).toBeCloseTo(step, 9)
    })
    expect(TWO_PI - angles[angles.length - 1] + angles[0]).toBeCloseTo(step, 9)
  })

  it('gives every segment the same reach, outside the outermost ring', () => {
    const model = card()
    const star = lines(model, 'star-segment')
    const outer = circles(model, 'ring')[0]
    const near = (segment: LineShape): number =>
      Math.min(
        distanceFromCentre(model, segment.x1, segment.y1),
        distanceFromCentre(model, segment.x2, segment.y2),
      )
    const far = (segment: LineShape): number =>
      Math.max(
        distanceFromCentre(model, segment.x1, segment.y1),
        distanceFromCentre(model, segment.x2, segment.y2),
      )

    star.forEach((segment) => {
      expect(near(segment)).toBeCloseTo(near(star[0]), 6)
      expect(far(segment)).toBeCloseTo(far(star[0]), 6)
      expect(near(segment)).toBeGreaterThan(outer.r + (outer.strokeWidth ?? 0) / 2)
      expect(far(segment)).toBeGreaterThan(near(segment))
      // A hairline is no segment at all — but neither is a band so fat that
      // the twelve of them close up into another ring.
      expect(segment.strokeWidth).toBeGreaterThan((far(segment) - near(segment)) / 2)
      expect(segment.strokeWidth).toBeLessThan((TWO_PI * near(segment)) / star.length)
    })
  })

  it('colours the star from the same palette as the rings', () => {
    const star = lines(card(), 'star-segment')
    const used = new Set(star.map((segment) => segment.stroke))

    expect(used.size).toBeGreaterThan(2)
    used.forEach((stroke) => expect(EBU_ORDER).toContain(stroke))
  })

  it('mirrors the star, colours and all, about the vertical axis', () => {
    const model = card()

    assertMirrorSymmetric(model, shapesOfRole(model, 'star-segment'))
  })
})

describe('buildIdentCard — the station mark', () => {
  it('sets the channel name large, across the middle of the wheel', () => {
    const model = card({ channelName: 'CHANNEL TWO' })
    const name = textShape(model, 'ident-name')

    expect(name.role).toBe('ident-mark')
    expect(name.text).toBe('CHANNEL TWO')
    expect(name.x).toBe(model.centre.x)
    expect(name.y).toBe(model.centre.y)
    expect(name.anchor).toBe('middle')
  })

  it('sets it far larger than the caption line carrying the same name', () => {
    const model = card()
    const name = textShape(model, 'ident-name')
    const caption = textShape(model, 'caption-channel')

    expect(name.fontSize).toBeGreaterThan(caption.fontSize * 1.5)
  })

  it('backs the name with a plate centred on the card, wide enough to hold it', () => {
    const model = card()
    const name = textShape(model, 'ident-name')
    const [plate] = rects(model, 'ident-mark')
    // Courier New advances 0.6em a glyph, which is what lets the card size its
    // own type; the plate has to be wider than the line that sits on it.
    const textWidth = name.text.length * (name.fontSize * 0.6 + (name.letterSpacing ?? 0))

    expect(plate.x + plate.width / 2).toBe(model.centre.x)
    expect(plate.y + plate.height / 2).toBe(model.centre.y)
    expect(textWidth).toBeLessThanOrEqual(plate.width)
    expect(plate.width).toBeLessThanOrEqual(model.picture.width)
  })

  it('shrinks the name to stay on its plate when the channel is long-winded', () => {
    const short = textShape(card({ channelName: 'ONE' }), 'ident-name')
    const long = textShape(
      card({ channelName: 'THE NORTHERN AND MIDLAND TELEVISION SERVICE' }),
      'ident-name',
    )
    const model = card({ channelName: 'THE NORTHERN AND MIDLAND TELEVISION SERVICE' })
    const [plate] = rects(model, 'ident-mark')

    expect(long.fontSize).toBeLessThan(short.fontSize)
    expect(long.text.length * (long.fontSize * 0.6 + (long.letterSpacing ?? 0))).toBeLessThanOrEqual(
      plate.width,
    )
  })

  it('gives the clock a plate of its own, larger than the clock box it sits under', () => {
    const model = card()
    const [clock] = rects(model, 'clock-box')
    const plate = rects(model, 'ident-mark').find((shape) => shape.id !== 'ident-plate')

    expect(plate).toBeDefined()
    if (plate === undefined) return
    expect(plate.x).toBeLessThan(clock.x)
    expect(plate.y).toBeLessThan(clock.y)
    expect(plate.x + plate.width).toBeGreaterThan(clock.x + clock.width)
    expect(plate.y + plate.height).toBeGreaterThan(clock.y + clock.height)
    expect(plate.x + plate.width / 2).toBe(model.centre.x)
  })
})

describe('buildIdentCard — caption box and clock', () => {
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
    const captionLines = shapesOfRole(
      model,
      'caption-channel',
      'caption-date',
      'caption-message',
      'clock-time',
    ).filter((shape) => shape.kind === 'text')

    expect(captionLines).toHaveLength(4)
    captionLines.forEach((line) => {
      expect(line.x).toBe(model.centre.x)
      expect(line.anchor).toBe('middle')
    })
  })
})

describe('buildIdentCard — the interlude variant', () => {
  const interlude = (): TestCardModel => card({ variant: 'interlude' })

  it('takes the star away, leaving the calmer wheel', () => {
    expect(shapesOfRole(interlude(), 'star-segment')).toEqual([])
  })

  it('keeps the rings, the station mark, the caption and the clock', () => {
    const model = interlude()

    expect(circles(model, 'ring').map((ring) => ring.stroke)).toEqual(EBU_ORDER)
    expect(shapesOfRole(model, 'castellation').length).toBeGreaterThan(0)
    expect(textShape(model, 'ident-name').text).toBe('CHANNEL ONE')
    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'clock-time')).toBe('01.30.05')
  })

  it('carries a continuity message rather than a closedown one', () => {
    expect(textOf(interlude(), 'caption-message')).toBe('PROGRAMMES WILL CONTINUE SHORTLY')
  })

  it('reports its own variant', () => {
    expect(interlude().variant).toBe('interlude')
    expect(card().variant).toBe('closedown')
  })
})

describe('buildIdentCard — invariants', () => {
  it('keeps every shape inside the bounds of the card, in either variant', () => {
    for (const model of [card(), card({ variant: 'interlude' }), card({ width: 640, height: 480 })]) {
      model.shapes.forEach((shape) => {
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
      const ids = model.shapes.map((shape) => shape.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('is pure: the same spec twice draws the very same card', () => {
    expect(card()).toEqual(card())
  })

  it('paints in an order that leaves the marks, the caption and the clock on top', () => {
    const model = card()
    const at = (id: string): number => model.shapes.findIndex((shape) => shape.id === id)

    expect(at('background')).toBe(0)
    expect(at('picture')).toBeGreaterThan(at('background'))
    expect(at('ring-white')).toBeGreaterThan(at('picture'))
    expect(at('ident-plate')).toBeGreaterThan(at('ring-white'))
    expect(at('ident-name')).toBeGreaterThan(at('ident-plate'))
    expect(at('clock-box')).toBeGreaterThan(at('ident-clock-plate'))
    expect(at('clock-time')).toBeGreaterThan(at('clock-box'))
  })
})
