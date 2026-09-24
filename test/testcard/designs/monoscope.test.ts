import { describe, expect, it } from 'vitest'
import {
  RING_RADIUS_FRACTIONS,
  STAR_RADIUS_FRACTION,
  STAR_WEDGES,
  VERTICAL_GRATING_BAND,
  buildMonoscopeCard,
  siemensStarWedges,
} from '@/testcard/designs/monoscope'
import {
  shapesOfRole,
  type Shape,
  type ShapeRole,
  type TestCardModel,
  type TestCardSpec,
} from '@/testcard/model'
import { band } from '@/testcard/primitives'

// Well before the first electronic test card, let alone this one: a date no
// ambient clock could have produced, so a caption carrying it proves injection.
const NOW = new Date(1953, 5, 2, 11, 5, 9)
const RESUMES = new Date(1953, 5, 2, 14, 30, 0)
const TAU = Math.PI * 2

function spec(overrides: Partial<TestCardSpec> = {}): TestCardSpec {
  return {
    variant: 'closedown',
    now: NOW,
    channelName: 'CHANNEL ONE',
    resumesAt: RESUMES,
    ...overrides,
  }
}

const card = (overrides: Partial<TestCardSpec> = {}): TestCardModel =>
  buildMonoscopeCard(spec(overrides))

const round = (n: number): number => Math.round(n * 1e6) / 1e6

const rectsOf = (model: TestCardModel, ...roles: ShapeRole[]) =>
  shapesOfRole(model, ...roles).filter((shape) => shape.kind === 'rect')
const linesOf = (model: TestCardModel, ...roles: ShapeRole[]) =>
  shapesOfRole(model, ...roles).filter((shape) => shape.kind === 'line')
const circlesOf = (model: TestCardModel, ...roles: ShapeRole[]) =>
  shapesOfRole(model, ...roles).filter((shape) => shape.kind === 'circle')

const textOf = (model: TestCardModel, role: ShapeRole): string => {
  const [shape] = shapesOfRole(model, role)
  return shape?.kind === 'text' ? shape.text : ''
}

/** Every shape whose id begins with `prefix` — one drawn group of the card. */
const group = (model: TestCardModel, prefix: string): Shape[] =>
  model.shapes.filter((shape) => shape.id.startsWith(prefix))

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

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

function unionBox(shapes: Shape[]): Box {
  expect(shapes.length).toBeGreaterThan(0)
  return shapes.reduce<Box>(
    (box, shape) => {
      const [left, right, top, bottom] = extent(shape)
      return {
        left: Math.min(box.left, left),
        right: Math.max(box.right, right),
        top: Math.min(box.top, top),
        bottom: Math.max(box.bottom, bottom),
      }
    },
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  )
}

const boxesOverlap = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

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

describe('siemensStarWedges — the arithmetic of the star', () => {
  it('refuses a count that cannot alternate: odd, too few, or not a whole number', () => {
    expect(() => siemensStarWedges(23)).toThrow(RangeError)
    expect(() => siemensStarWedges(2)).toThrow(RangeError)
    expect(() => siemensStarWedges(0)).toThrow(RangeError)
    expect(() => siemensStarWedges(-8)).toThrow(RangeError)
    expect(() => siemensStarWedges(12.5)).toThrow(RangeError)
  })

  it('returns one wedge per count, indexed in order', () => {
    const wedges = siemensStarWedges(8)

    expect(wedges).toHaveLength(8)
    expect(wedges.map((wedge) => wedge.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('gives every wedge the same angle', () => {
    siemensStarWedges(12).forEach((wedge) => {
      expect(wedge.end - wedge.start).toBeCloseTo(TAU / 12, 12)
    })
  })

  it('tiles the full turn with no gap and no overlap', () => {
    const wedges = siemensStarWedges(10)

    expect(wedges[0].start).toBe(0)
    wedges.forEach((wedge, i) => {
      if (i > 0) expect(wedge.start).toBe(wedges[i - 1].end)
    })
    expect(wedges[wedges.length - 1].end).toBeCloseTo(TAU, 12)
    const total = wedges.reduce((sum, wedge) => sum + (wedge.end - wedge.start), 0)
    expect(total).toBeCloseTo(TAU, 12)
  })

  it('bisects each wedge halfway between its edges', () => {
    siemensStarWedges(6).forEach((wedge) => {
      expect(wedge.bisector).toBeCloseTo((wedge.start + wedge.end) / 2, 12)
    })
  })

  it('alternates dark and light, and closes the alternation at the wrap', () => {
    const wedges = siemensStarWedges(14)

    wedges.forEach((wedge, i) => expect(wedge.dark).toBe(i % 2 === 0))
    expect(wedges[0].dark).not.toBe(wedges[wedges.length - 1].dark)
  })

  it('scales the wedge angle with the count', () => {
    expect(siemensStarWedges(4)[0].end).toBeCloseTo(TAU / 4, 12)
    expect(siemensStarWedges(36)[0].end).toBeCloseTo(TAU / 36, 12)
  })
})

describe('buildMonoscopeCard — the card frame', () => {
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

  it('lays a background over the whole card and reports its colour', () => {
    const model = card()
    const [background, ...rest] = shapesOfRole(model, 'background')

    expect(rest).toEqual([])
    expect(background).toMatchObject({ kind: 'rect', x: 0, y: 0, width: 1024, height: 768 })
    expect(background.kind === 'rect' ? background.fill : '').toBe(model.background)
  })

  it('frames a picture area inset from every edge by the castellated border', () => {
    const model = card()

    expect(model.picture.x).toBeGreaterThan(0)
    expect(model.picture.y).toBeGreaterThan(0)
    expect(model.picture.x + model.picture.width).toBe(model.width - model.picture.x)
    expect(model.picture.y + model.picture.height).toBe(model.height - model.picture.y)
  })

  it('draws a picture shape on exactly the picture area it reports', () => {
    const model = card()
    const [picture, ...rest] = rectsOf(model, 'picture')

    expect(rest).toEqual([])
    expect(picture).toMatchObject(model.picture)
  })

  it('castellates all four edges to the counts it is given, not to the defaults', () => {
    const model = card({ castellationsAcross: 9, castellationsDown: 7 })

    expect(shapesOfRole(model, 'castellation')).toHaveLength(2 * 9 + 2 * 7)
    assertMirrorSymmetric(model, shapesOfRole(model, 'castellation'))
  })
})

describe('buildMonoscopeCard — the Siemens star', () => {
  it('radiates an even number of wedges, so the alternation closes at the wrap', () => {
    expect(STAR_WEDGES % 2).toBe(0)
    expect(linesOf(card(), 'star-segment')).toHaveLength(STAR_WEDGES)
  })

  it('halves to an odd number of pairs, which is what lets the star mirror', () => {
    // With N/2 even, reflection maps a dark wedge onto a light one and the star
    // is symmetric in geometry but not in ink. N % 4 === 2 keeps both.
    expect(STAR_WEDGES % 4).toBe(2)
  })

  it('starts every spoke exactly on the centre and runs it to the star radius', () => {
    const model = card({ width: 640, height: 480 })
    const radius = model.picture.height * STAR_RADIUS_FRACTION
    const spokes = linesOf(model, 'star-segment')

    expect(spokes.length).toBeGreaterThan(0)
    spokes.forEach((spoke) => {
      expect(spoke.x1).toBe(model.centre.x)
      expect(spoke.y1).toBe(model.centre.y)
      expect(Math.hypot(spoke.x2 - model.centre.x, spoke.y2 - model.centre.y)).toBeCloseTo(radius, 9)
    })
  })

  it('pitches the spokes evenly right the way round, with no gap at the wrap', () => {
    const model = card()
    const pitch = TAU / STAR_WEDGES
    const angles = linesOf(model, 'star-segment')
      .map((spoke) => Math.atan2(spoke.y2 - model.centre.y, spoke.x2 - model.centre.x))
      .map((angle) => (angle + TAU) % TAU)
      .sort((a, b) => a - b)

    angles.forEach((angle, i) => {
      if (i > 0) expect(angle - angles[i - 1]).toBeCloseTo(pitch, 9)
    })
    expect(TAU - angles[angles.length - 1] + angles[0]).toBeCloseTo(pitch, 9)
  })

  it('sets each spoke on its own wedge bisector', () => {
    const model = card()
    const expected = siemensStarWedges(STAR_WEDGES)
      .map((wedge) => round((wedge.bisector + TAU) % TAU))
      .sort((a, b) => a - b)
    const drawn = linesOf(model, 'star-segment')
      .map((spoke) => Math.atan2(spoke.y2 - model.centre.y, spoke.x2 - model.centre.x))
      .map((angle) => round((angle + TAU) % TAU))
      .sort((a, b) => a - b)

    expect(drawn).toEqual(expected)
  })

  it('alternates the spokes between exactly two inks, dark and light', () => {
    const strokes = linesOf(card(), 'star-segment').map((spoke) => spoke.stroke)
    const [dark, light] = strokes

    expect(dark).not.toBe(light)
    expect(new Set(strokes).size).toBe(2)
    strokes.forEach((stroke, i) => expect(stroke).toBe(i % 2 === 0 ? dark : light))
  })

  it('gives every spoke the same weight, so no wedge reads wider than another', () => {
    const widths = linesOf(card(), 'star-segment').map((spoke) => spoke.strokeWidth)

    expect(new Set(widths).size).toBe(1)
    expect(widths[0]).toBeGreaterThan(0)
  })

  it('weights the spokes so the wedges fuse exactly halfway out', () => {
    // A spoke of width w subtends w / r at radius r, and the wedges are pitched
    // TAU / N apart, so they touch where w / r === TAU / N. That radius is the
    // whole measurement — inside it the star is a smudge, outside it resolves —
    // and it is put at half the rim so the reader has plenty of both.
    const model = card({ width: 800, height: 600 })
    const radius = model.picture.height * STAR_RADIUS_FRACTION
    const [spoke] = linesOf(model, 'star-segment')

    const fuses = (spoke.strokeWidth * STAR_WEDGES) / TAU
    expect(fuses).toBeCloseTo(radius / 2, 9)
  })

  it('is symmetric about the vertical axis, ink and all', () => {
    const model = card()

    assertMirrorSymmetric(model, linesOf(model, 'star-segment'))
  })

  it('sits the star on the centre of the card, not merely near it', () => {
    const model = card({ width: 800, height: 600 })
    const box = unionBox(linesOf(model, 'star-segment'))

    expect((box.left + box.right) / 2).toBeCloseTo(model.centre.x, 9)
    expect((box.top + box.bottom) / 2).toBeCloseTo(model.centre.y, 9)
  })
})

describe('buildMonoscopeCard — the concentric circles', () => {
  it('draws one circle per declared radius, all on the card centre', () => {
    const model = card({ width: 640, height: 480 })
    const rings = circlesOf(model, 'ring')

    expect(rings).toHaveLength(RING_RADIUS_FRACTIONS.length)
    rings.forEach((ring) => {
      expect(ring.cx).toBe(model.centre.x)
      expect(ring.cy).toBe(model.centre.y)
    })
  })

  it('grows the radii strictly, so no two circles coincide', () => {
    const radii = circlesOf(card(), 'ring').map((ring) => ring.r)

    radii.forEach((radius, i) => {
      if (i > 0) expect(radius).toBeGreaterThan(radii[i - 1])
    })
  })

  it('scales the radii with the picture, not with the card', () => {
    const model = card({ width: 640, height: 480 })
    const radii = circlesOf(model, 'ring').map((ring) => round(ring.r))

    expect(radii).toEqual(RING_RADIUS_FRACTIONS.map((f) => round(model.picture.height * f)))
  })

  it('rims the star with one of the circles', () => {
    const model = card()
    const radii = circlesOf(model, 'ring').map((ring) => round(ring.r))

    expect(radii).toContain(round(model.picture.height * STAR_RADIUS_FRACTION))
  })

  it('fills the hub alone, capping the point where the wedges overprint', () => {
    const model = card()
    const rings = circlesOf(model, 'ring')
    const filled = rings.filter((ring) => ring.fill !== 'none')

    expect(filled).toHaveLength(1)
    expect(filled[0].r).toBe(Math.min(...rings.map((ring) => ring.r)))
    expect(filled[0].r).toBeLessThan(model.picture.height * STAR_RADIUS_FRACTION)
  })

  it('keeps every circle inside the picture area', () => {
    const model = card()
    const { x, y, width, height } = model.picture

    circlesOf(model, 'ring').forEach((ring) => {
      expect(ring.cx - ring.r).toBeGreaterThanOrEqual(x)
      expect(ring.cx + ring.r).toBeLessThanOrEqual(x + width)
      expect(ring.cy - ring.r).toBeGreaterThanOrEqual(y)
      expect(ring.cy + ring.r).toBeLessThanOrEqual(y + height)
    })
  })

  it('keeps the circles clear of the caption and the clock', () => {
    const model = card()
    const rings = unionBox(circlesOf(model, 'ring'))

    expect(boxesOverlap(rings, unionBox(group(model, 'caption-box')))).toBe(false)
    expect(boxesOverlap(rings, unionBox(group(model, 'clock-box')))).toBe(false)
  })
})

describe('buildMonoscopeCard — resolution gratings', () => {
  it('runs a horizontal-resolution row mirrored about the vertical axis', () => {
    const model = card({ gratingFrequencies: [1.5, 3.5] })
    const frames = shapesOfRole(model, 'grating-frame').filter((f) => f.id.startsWith('grating-'))

    expect(frames.map((frame) => frame.id)).toEqual([
      'grating-frame-l3.5',
      'grating-frame-l1.5',
      'grating-frame-r1.5',
      'grating-frame-r3.5',
    ])
    assertMirrorSymmetric(model, group(model, 'grating-'))
  })

  it('stacks a vertical-resolution column on each flank, one patch per frequency', () => {
    const model = card({ gratingFrequencies: [1.5, 2.5, 3.5] })
    const left = rectsOf(model, 'grating-frame').filter((f) => f.id.startsWith('vgrating-frame-l'))
    const right = rectsOf(model, 'grating-frame').filter((f) => f.id.startsWith('vgrating-frame-r'))

    expect(left.map((frame) => frame.id)).toEqual([
      'vgrating-frame-l1.5',
      'vgrating-frame-l2.5',
      'vgrating-frame-l3.5',
    ])
    expect(right).toHaveLength(3)
  })

  it('pitches the stacked patches evenly and centres the run in its band', () => {
    const model = card({ gratingFrequencies: [1.5, 2.5, 3.5, 4.5] })
    const { y, height } = band(model.picture, VERTICAL_GRATING_BAND)
    const left = rectsOf(model, 'grating-frame').filter((f) => f.id.startsWith('vgrating-frame-l'))
    const pitch = height / left.length

    left.forEach((frame, i) => {
      if (i > 0) expect(frame.y - left[i - 1].y).toBeCloseTo(pitch, 9)
      expect(frame.height).toBeLessThan(pitch)
    })
    const last = left[left.length - 1]
    expect(left[0].y - y).toBeCloseTo(y + height - (last.y + last.height), 9)
    expect(left[0].y).toBeGreaterThan(y)
  })

  it('lines the two columns up in the same rows, mirrored across the axis', () => {
    const model = card()

    assertMirrorSymmetric(model, group(model, 'vgrating-'))
  })

  it('bars a vertical patch horizontally, filling it exactly and alternating ink', () => {
    const model = card({ gratingFrequencies: [3.5] })
    const [frame] = rectsOf(model, 'grating-frame').filter((f) => f.id === 'vgrating-frame-l3.5')
    const bars = rectsOf(model, 'grating-bar').filter((bar) =>
      bar.id.startsWith('vgrating-frame-l3.5-'),
    )

    expect(bars.length % 2).toBe(1) // odd, so the patch is its own palindrome
    expect(bars[0].y).toBe(frame.y)
    const last = bars[bars.length - 1]
    expect(last.y + last.height).toBeCloseTo(frame.y + frame.height, 9)
    bars.forEach((bar, i) => {
      expect(bar.x).toBe(frame.x)
      expect(bar.width).toBe(frame.width)
      expect(bar.height).toBeCloseTo(frame.height / bars.length, 9)
      if (i > 0) expect(bar.y - bars[i - 1].y).toBeCloseTo(frame.height / bars.length, 9)
      expect(bar.fill).toBe(i % 2 === 0 ? bars[0].fill : bars[1].fill)
    })
    expect(bars[0].fill).not.toBe(bars[1].fill)
  })

  it('puts more bars in a higher-frequency patch, in both directions', () => {
    const model = card({ gratingFrequencies: [1.5, 4.5] })
    const barsIn = (frameId: string): number =>
      shapesOfRole(model, 'grating-bar').filter((bar) => bar.id.startsWith(`${frameId}-`)).length

    expect(barsIn('grating-frame-r4.5')).toBeGreaterThan(barsIn('grating-frame-r1.5'))
    expect(barsIn('vgrating-frame-l4.5')).toBeGreaterThan(barsIn('vgrating-frame-l1.5'))
  })

  it('keeps the two flank columns clear of the circles', () => {
    const model = card()
    const rings = unionBox(circlesOf(model, 'ring'))

    expect(boxesOverlap(rings, unionBox(group(model, 'vgrating-frame-l')))).toBe(false)
    expect(boxesOverlap(rings, unionBox(group(model, 'vgrating-frame-r')))).toBe(false)
  })
})

describe('buildMonoscopeCard — the greyscale step wedge', () => {
  it('steps monotonically from black to white across the requested number of steps', () => {
    const model = card({ greyscaleSteps: 6 })
    const steps = rectsOf(model, 'greyscale-step')

    expect(steps).toHaveLength(6)
    expect(steps[0].fill).toBe('#000000')
    expect(steps[5].fill).toBe('#ffffff')
    const levels = steps.map((step) => parseInt(step.fill.slice(1, 3), 16))
    levels.forEach((level, i) => {
      if (i > 0) expect(level).toBeGreaterThan(levels[i - 1])
    })
  })

  it('defaults to eight steps and spans the picture width exactly', () => {
    const model = card()
    const steps = rectsOf(model, 'greyscale-step')

    expect(steps).toHaveLength(8)
    steps.forEach((step, i) => {
      expect(step.width).toBeCloseTo(model.picture.width / 8, 9)
      expect(step.x).toBeCloseTo(model.picture.x + (i * model.picture.width) / 8, 9)
    })
    const last = steps[steps.length - 1]
    expect(steps[0].x).toBe(model.picture.x)
    expect(last.x + last.width).toBeCloseTo(model.picture.x + model.picture.width, 9)
  })
})

describe('buildMonoscopeCard — monochrome, and proud of it', () => {
  it('uses no colour anywhere: every ink is a neutral grey', () => {
    const model = card()
    const grey = /^#([0-9a-f]{2})\1\1$/i
    const inks = model.shapes.flatMap((shape) => [
      shape.kind === 'line' ? shape.stroke : shape.fill,
      shape.kind === 'line' ? undefined : shape.kind === 'text' ? undefined : shape.stroke,
    ])

    inks.forEach((ink) => {
      if (ink === undefined || ink === 'none') return
      expect({ ink, neutral: grey.test(ink) }).toEqual({ ink, neutral: true })
    })
    expect(model.background).toMatch(grey)
  })

  it('carries no colour bars at all — that is the other card', () => {
    expect(shapesOfRole(card(), 'colour-bar')).toEqual([])
  })
})

describe('buildMonoscopeCard — caption box and clock', () => {
  it('captions the injected channel, date and resume time, not the ambient ones', () => {
    const model = card()

    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'caption-date')).toBe('TUESDAY 2 JUNE 1953')
    expect(textOf(model, 'caption-message')).toBe('NORMAL SERVICE WILL RESUME AT 14.30')
    expect(textOf(model, 'clock-time')).toBe('11.05.09')
  })

  it('prefers an explicitly supplied message over the derived one', () => {
    expect(textOf(card({ message: 'TRANSMITTER MAINTENANCE' }), 'caption-message')).toBe(
      'TRANSMITTER MAINTENANCE',
    )
  })

  it('falls back to an open-ended closedown message when no resume time is known', () => {
    expect(textOf(card({ resumesAt: undefined }), 'caption-message')).toBe(
      'NORMAL SERVICE WILL RESUME SHORTLY',
    )
  })

  it('centres the caption box and the clock box on the vertical axis', () => {
    const model = card()
    const boxes = rectsOf(model, 'caption-box', 'clock-box')

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

describe('buildMonoscopeCard — the interlude variant', () => {
  const interlude = (): TestCardModel => card({ variant: 'interlude' })

  it('drops the test signals a short gap does not need', () => {
    expect(
      shapesOfRole(interlude(), 'grating-frame', 'grating-bar', 'greyscale-step'),
    ).toEqual([])
  })

  it('keeps the star, the circles, the frame, the caption and the clock', () => {
    const model = interlude()

    expect(linesOf(model, 'star-segment')).toHaveLength(STAR_WEDGES)
    expect(circlesOf(model, 'ring')).toHaveLength(RING_RADIUS_FRACTIONS.length)
    expect(shapesOfRole(model, 'castellation').length).toBeGreaterThan(0)
    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'clock-time')).toBe('11.05.09')
  })

  it('carries a continuity message rather than a closedown one', () => {
    expect(textOf(interlude(), 'caption-message')).toBe('PROGRAMMES WILL CONTINUE SHORTLY')
  })

  it('reports its own variant', () => {
    expect(interlude().variant).toBe('interlude')
    expect(card().variant).toBe('closedown')
  })
})

describe('buildMonoscopeCard — invariants', () => {
  it('keeps every shape inside the bounds of the card', () => {
    const model = card()

    model.shapes.forEach((shape) => {
      const [left, right, top, bottom] = extent(shape)
      expect({
        id: shape.id,
        inside: left >= 0 && top >= 0 && right <= model.width && bottom <= model.height,
      }).toEqual({ id: shape.id, inside: true })
    })
  })

  it('keeps everything but the background and the border inside the picture', () => {
    const model = card()
    const { x, y, width, height } = model.picture

    model.shapes
      .filter((shape) => shape.role !== 'background' && shape.role !== 'castellation')
      .forEach((shape) => {
        const [left, right, top, bottom] = extent(shape)
        expect({
          id: shape.id,
          inside: left >= x && top >= y && right <= x + width && bottom <= y + height,
        }).toEqual({ id: shape.id, inside: true })
      })
  })

  it('keeps the star clear of every band and box around it', () => {
    const model = card()
    const star = unionBox(linesOf(model, 'star-segment'))

    ;['grating-', 'vgrating-frame-l', 'vgrating-frame-r', 'greyscale-step-', 'caption-box', 'clock-box'].forEach(
      (prefix) => {
        expect({ prefix, clash: boxesOverlap(star, unionBox(group(model, prefix))) }).toEqual({
          prefix,
          clash: false,
        })
      },
    )
  })

  it('gives every shape a distinct id, so a renderer can key on it', () => {
    const ids = card().shapes.map((shape) => shape.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is pure: the same spec twice gives the same card', () => {
    expect(card()).toEqual(card())
  })
})
