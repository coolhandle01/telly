import { describe, expect, it } from 'vitest'
import {
  CROSSHATCH_COLUMNS,
  INTERLUDE_COLUMNS,
  buildCrosshatchCard,
  crosshatchGrid,
} from '@/testcard/designs/crosshatch'
import {
  shapesOfRole,
  type Shape,
  type ShapeRole,
  type TestCardModel,
  type TestCardSpec,
} from '@/testcard/model'
import type { Picture } from '@/testcard/primitives'

// Well before any of this: a date no ambient clock could have produced, so a
// caption carrying it proves the instant was injected.
const NOW = new Date(1953, 5, 2, 11, 5, 9)
const RESUMES = new Date(1953, 5, 2, 14, 30, 0)

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
  buildCrosshatchCard(spec(overrides))

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

const columnsOf = (model: TestCardModel) =>
  linesOf(model, 'grid-line')
    .filter((line) => line.x1 === line.x2)
    .sort((a, b) => a.x1 - b.x1)
const rowsOf = (model: TestCardModel) =>
  linesOf(model, 'grid-line')
    .filter((line) => line.y1 === line.y2)
    .sort((a, b) => a.y1 - b.y1)
const dotsOf = (model: TestCardModel) => circlesOf(model, 'convergence-inner-circle')

const picture = (width: number, height: number): Picture => ({ x: 0, y: 0, width, height })

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

/** The same shape reflected in the card's vertical axis. */
function mirrorX(shape: Shape, width: number): Shape {
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

/** The same shape reflected in the card's horizontal axis. */
function mirrorY(shape: Shape, height: number): Shape {
  switch (shape.kind) {
    case 'rect':
      return { ...shape, y: height - shape.y - shape.height }
    case 'circle':
      return { ...shape, cy: height - shape.cy }
    case 'line':
      return { ...shape, y1: height - shape.y1, y2: height - shape.y2 }
    case 'text':
      return { ...shape, y: height - shape.y }
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

function assertSymmetric(shapes: Shape[], reflect: (shape: Shape) => Shape): void {
  expect(shapes.length).toBeGreaterThan(0)
  const present = shapes.map((shape) => key(shape)).sort()
  const reflected = shapes.map((shape) => key(reflect(shape))).sort()
  expect(reflected).toEqual(present)
}

describe('crosshatchGrid — the arithmetic of the grid', () => {
  it('squares a square picture exactly', () => {
    const grid = crosshatchGrid(picture(600, 600), 12)

    expect(grid.rows).toBe(12)
    expect(grid.cellWidth).toBe(grid.cellHeight)
  })

  it('squares a 4:3 picture exactly at sixteen columns', () => {
    const grid = crosshatchGrid(picture(1200, 900), 16)

    expect(grid).toEqual({ columns: 16, rows: 12, cellWidth: 75, cellHeight: 75 })
  })

  it('spans the picture exactly in both directions, whatever the aspect', () => {
    const aspects: Array<[number, number]> = [
      [1024, 768],
      [1000, 744],
      [1920, 1080],
      [800, 800],
      [640, 900],
    ]

    aspects.forEach(([width, height]) => {
      const grid = crosshatchGrid(picture(width, height), 16)
      expect(round(grid.columns * grid.cellWidth)).toBe(width)
      expect(round(grid.rows * grid.cellHeight)).toBe(height)
    })
  })

  it('keeps a cell square to within half a cell — all the rounding can cost', () => {
    const aspects: Array<[number, number]> = [
      [1000, 744],
      [1024, 768],
      [1920, 1080],
      [640, 900],
      [1366, 500],
    ]

    aspects.forEach(([width, height]) => {
      const grid = crosshatchGrid(picture(width, height), 16)
      const slip = Math.abs(grid.cellWidth / grid.cellHeight - 1)
      const bound = (0.5 * grid.cellWidth) / height // half a row, as a fraction
      expect({ width, height, square: slip <= bound + 1e-12 }).toEqual({
        width,
        height,
        square: true,
      })
    })
  })

  it('is square enough to see on the pictures the card actually uses', () => {
    const grid = crosshatchGrid(picture(1000, 744), 16)

    expect(Math.abs(grid.cellWidth / grid.cellHeight - 1)).toBeLessThan(0.02)
  })

  it('never falls below a single row, however wide the picture', () => {
    expect(crosshatchGrid(picture(4000, 100), 16).rows).toBe(1)
  })

  it('refuses a column count it cannot draw a grid from', () => {
    expect(() => crosshatchGrid(picture(1024, 768), 1)).toThrow(RangeError)
    expect(() => crosshatchGrid(picture(1024, 768), 0)).toThrow(RangeError)
    expect(() => crosshatchGrid(picture(1024, 768), -4)).toThrow(RangeError)
    expect(() => crosshatchGrid(picture(1024, 768), 12.5)).toThrow(RangeError)
  })
})

describe('buildCrosshatchCard — the card frame', () => {
  it('defaults to a 4:3 card and reports its geometric centre', () => {
    const model = card()

    expect(model.width).toBe(1024)
    expect(model.height).toBe(768)
    expect(model.centre).toEqual({ x: 512, y: 384 })
  })

  it('honours injected dimensions and recentres on them', () => {
    const model = card({ width: 640, height: 480 })

    expect(model.centre).toEqual({ x: 320, y: 240 })
    expect(model.picture.width).toBeLessThan(640)
  })

  it('lays a background over the whole card and reports its colour', () => {
    const model = card()
    const [background, ...rest] = shapesOfRole(model, 'background')

    expect(rest).toEqual([])
    expect(background).toMatchObject({ kind: 'rect', x: 0, y: 0, width: 1024, height: 768 })
    expect(background.kind === 'rect' ? background.fill : '').toBe(model.background)
  })

  it('frames a picture inset evenly from every edge, and paints it black', () => {
    const model = card()
    const [shape, ...rest] = rectsOf(model, 'picture')

    expect(model.picture.x).toBeGreaterThan(0)
    expect(model.picture.x + model.picture.width).toBe(model.width - model.picture.x)
    expect(model.picture.y + model.picture.height).toBe(model.height - model.picture.y)
    expect(rest).toEqual([])
    expect(shape).toMatchObject({ ...model.picture, fill: '#000000' })
  })

  it('wears no castellations, no bars and no wedges — the grid is the card', () => {
    const model = card()

    expect(
      shapesOfRole(
        model,
        'castellation',
        'colour-bar',
        'greyscale-step',
        'grating-frame',
        'grating-bar',
        'resolution-wedge-frame',
        'resolution-wedge-line',
      ),
    ).toEqual([])
  })
})

describe('buildCrosshatchCard — the grid', () => {
  it('draws one more line than there are cells, in each direction', () => {
    const model = card()
    const grid = crosshatchGrid(model.picture, CROSSHATCH_COLUMNS)

    expect(columnsOf(model)).toHaveLength(grid.columns + 1)
    expect(rowsOf(model)).toHaveLength(grid.rows + 1)
  })

  it('spaces the columns evenly and runs each the full height of the picture', () => {
    const model = card()
    const { x, y, width, height } = model.picture
    const columns = columnsOf(model)
    const spacing = width / CROSSHATCH_COLUMNS

    columns.forEach((column, i) => {
      expect(column.x1).toBeCloseTo(x + i * spacing, 9)
      expect(column.y1).toBe(y)
      expect(column.y2).toBe(y + height)
    })
    expect(columns[0].x1).toBe(x)
    expect(columns[columns.length - 1].x1).toBeCloseTo(x + width, 9)
  })

  it('spaces the rows evenly and runs each the full width of the picture', () => {
    const model = card()
    const { x, y, width, height } = model.picture
    const rows = rowsOf(model)
    const spacing = height / (rows.length - 1)

    rows.forEach((row, i) => {
      expect(row.y1).toBeCloseTo(y + i * spacing, 9)
      expect(row.x1).toBe(x)
      expect(row.x2).toBe(x + width)
    })
    expect(rows[0].y1).toBe(y)
    expect(rows[rows.length - 1].y1).toBeCloseTo(y + height, 9)
  })

  it('holds one spacing throughout: no gap wider or narrower than its neighbours', () => {
    const model = card()
    const gaps = (values: number[]): number[] =>
      values.slice(1).map((value, i) => round(value - values[i]))

    expect(new Set(gaps(columnsOf(model).map((column) => column.x1))).size).toBe(1)
    expect(new Set(gaps(rowsOf(model).map((row) => row.y1))).size).toBe(1)
  })

  it('draws every line in the same white ink at the same weight', () => {
    const lines = linesOf(card(), 'grid-line')

    expect(new Set(lines.map((line) => line.stroke)).size).toBe(1)
    expect(new Set(lines.map((line) => line.strokeWidth)).size).toBe(1)
    expect(lines[0].stroke).toMatch(/^#(f|e)/i)
  })

  it('cuts cells that are square to the eye', () => {
    const model = card()
    const cellWidth = model.picture.width / CROSSHATCH_COLUMNS
    const cellHeight = model.picture.height / (rowsOf(model).length - 1)

    expect(Math.abs(cellWidth / cellHeight - 1)).toBeLessThan(0.02)
  })
})

describe('buildCrosshatchCard — the intersection dots', () => {
  it('puts a dot on every crossing of two lines, and nowhere else', () => {
    const model = card()
    const inner = <T,>(values: T[]): T[] => values.slice(1, -1)
    const crossings = inner(columnsOf(model).map((column) => round(column.x1)))
      .flatMap((x) => inner(rowsOf(model).map((row) => round(row.y1))).map((y) => `${x},${y}`))
      .sort()
    const dots = dotsOf(model)
      .map((dot) => `${round(dot.cx)},${round(dot.cy)}`)
      .sort()

    expect(dots).toEqual(crossings)
    expect(dots.length).toBeGreaterThan(100)
  })

  it('draws every dot the same size, and small against a cell', () => {
    const model = card()
    const dots = dotsOf(model)
    const cellWidth = model.picture.width / CROSSHATCH_COLUMNS

    expect(new Set(dots.map((dot) => dot.r)).size).toBe(1)
    expect(dots[0].r).toBeGreaterThan(0)
    expect(dots[0].r).toBeLessThan(cellWidth / 4)
    expect(new Set(dots.map((dot) => dot.fill)).size).toBe(1)
  })
})

describe('buildCrosshatchCard — the geometry circle', () => {
  it('centres one circle on the centre of the card', () => {
    const model = card({ width: 800, height: 600 })
    const [circle, ...rest] = circlesOf(model, 'convergence-circle')

    expect(rest).toEqual([])
    expect(circle.cx).toBe(model.centre.x)
    expect(circle.cy).toBe(model.centre.y)
  })

  it('inscribes it in the picture, touching the two nearer edges exactly', () => {
    const model = card()
    const [circle] = circlesOf(model, 'convergence-circle')
    const { x, y, width, height } = model.picture

    expect(circle.r).toBeCloseTo(Math.min(width, height) / 2, 9)
    expect(circle.cy - circle.r).toBeCloseTo(y, 9)
    expect(circle.cy + circle.r).toBeCloseTo(y + height, 9)
    expect(circle.cx - circle.r).toBeGreaterThanOrEqual(x)
    expect(circle.cx + circle.r).toBeLessThanOrEqual(x + width)
  })

  it('leaves it unfilled, so the grid reads through it', () => {
    const [circle] = circlesOf(card(), 'convergence-circle')

    expect(circle.fill).toBe('none')
    expect(circle.stroke).toBeDefined()
  })
})

describe('buildCrosshatchCard — regularity', () => {
  it('mirrors the grid, the dots and the circle about the vertical axis', () => {
    const model = card()
    const reflect = (shape: Shape): Shape => mirrorX(shape, model.width)

    assertSymmetric(linesOf(model, 'grid-line'), reflect)
    assertSymmetric(dotsOf(model), reflect)
    assertSymmetric(circlesOf(model, 'convergence-circle'), reflect)
  })

  it('mirrors them about the horizontal axis too — a stretched picture shows up', () => {
    const model = card()
    const reflect = (shape: Shape): Shape => mirrorY(shape, model.height)

    assertSymmetric(linesOf(model, 'grid-line'), reflect)
    assertSymmetric(dotsOf(model), reflect)
    assertSymmetric(circlesOf(model, 'convergence-circle'), reflect)
  })
})

describe('buildCrosshatchCard — caption box and clock', () => {
  it('captions the injected channel, date and resume time, not the ambient ones', () => {
    const model = card()

    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'caption-date')).toBe('TUESDAY 2 JUNE 1953')
    expect(textOf(model, 'caption-message')).toBe('NORMAL SERVICE WILL RESUME AT 14.30')
    expect(textOf(model, 'clock-time')).toBe('11.05.09')
  })

  it('prefers an explicitly supplied message over the derived one', () => {
    expect(textOf(card({ message: 'AERIAL TESTING IN PROGRESS' }), 'caption-message')).toBe(
      'AERIAL TESTING IN PROGRESS',
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

  it('draws the caption and the clock over the grid, not under it', () => {
    const model = card()
    const lastGrid = model.shapes.findLastIndex((shape) => shape.role === 'grid-line')
    const caption = model.shapes.findIndex((shape) => shape.role === 'caption-box')

    expect(caption).toBeGreaterThan(lastGrid)
  })
})

describe('buildCrosshatchCard — the interlude variant', () => {
  const interlude = (): TestCardModel => card({ variant: 'interlude' })

  it('halves the grid: the same card, at half the density', () => {
    const model = interlude()

    expect(INTERLUDE_COLUMNS * 2).toBe(CROSSHATCH_COLUMNS)
    expect(columnsOf(model)).toHaveLength(INTERLUDE_COLUMNS + 1)
  })

  it('doubles the spacing exactly, in both directions', () => {
    const closedown = card()
    const calm = interlude()
    const pitch = (lines: Array<{ x1: number; y1: number }>, axis: 'x1' | 'y1'): number =>
      lines[1][axis] - lines[0][axis]

    expect(pitch(columnsOf(calm), 'x1')).toBeCloseTo(2 * pitch(columnsOf(closedown), 'x1'), 9)
    expect(pitch(rowsOf(calm), 'y1')).toBeCloseTo(2 * pitch(rowsOf(closedown), 'y1'), 9)
  })

  it('drops the intersection dots', () => {
    expect(dotsOf(interlude())).toEqual([])
    expect(dotsOf(card()).length).toBeGreaterThan(0)
  })

  it('keeps the grid, the circle, the caption and the clock', () => {
    const model = interlude()

    expect(linesOf(model, 'grid-line').length).toBeGreaterThan(0)
    expect(circlesOf(model, 'convergence-circle')).toHaveLength(1)
    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'clock-time')).toBe('11.05.09')
  })

  it('still spans the picture exactly at the coarser pitch', () => {
    const model = interlude()
    const columns = columnsOf(model)
    const rows = rowsOf(model)

    expect(columns[0].x1).toBe(model.picture.x)
    expect(columns[columns.length - 1].x1).toBeCloseTo(model.picture.x + model.picture.width, 9)
    expect(rows[0].y1).toBe(model.picture.y)
    expect(rows[rows.length - 1].y1).toBeCloseTo(model.picture.y + model.picture.height, 9)
  })

  it('carries a continuity message rather than a closedown one', () => {
    expect(textOf(interlude(), 'caption-message')).toBe('PROGRAMMES WILL CONTINUE SHORTLY')
  })

  it('reports its own variant', () => {
    expect(interlude().variant).toBe('interlude')
    expect(card().variant).toBe('closedown')
  })
})

describe('buildCrosshatchCard — invariants', () => {
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

  it('keeps everything but the background inside the picture', () => {
    const model = card()
    const { x, y, width, height } = model.picture

    model.shapes
      .filter((shape) => shape.role !== 'background')
      .forEach((shape) => {
        const [left, right, top, bottom] = extent(shape)
        expect({
          id: shape.id,
          inside: left >= x && top >= y && right <= x + width && bottom <= y + height,
        }).toEqual({ id: shape.id, inside: true })
      })
  })

  it('is white on black: every ink is neutral, and the picture is truly black', () => {
    const model = card()
    const grey = /^#([0-9a-f]{2})\1\1$/i
    const inks = model.shapes.flatMap((shape) => [
      shape.kind === 'line' ? shape.stroke : shape.fill,
      shape.kind === 'line' || shape.kind === 'text' ? undefined : shape.stroke,
    ])

    inks.forEach((ink) => {
      if (ink === undefined || ink === 'none') return
      expect({ ink, neutral: grey.test(ink) }).toEqual({ ink, neutral: true })
    })
    expect(rectsOf(model, 'picture')[0].fill).toBe('#000000')
  })

  it('gives every shape a distinct id, so a renderer can key on it', () => {
    const ids = card().shapes.map((shape) => shape.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is pure: the same spec twice gives the same card', () => {
    expect(card()).toEqual(card())
  })
})
