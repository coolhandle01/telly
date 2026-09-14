import { describe, expect, it } from 'vitest'
import { buildTestCard } from './buildTestCard'
import { shapesOfRole, type Shape, type TestCardModel, type TestCardSpec, type TextShape } from './model'
import { MAX_CAPTION_CHARS } from './primitives'

const NOW = new Date(2026, 8, 9, 1, 30, 5)
const RESUMES = new Date(2026, 8, 9, 6, 0, 0)

function spec(overrides: Partial<TestCardSpec> = {}): TestCardSpec {
  return {
    variant: 'closedown',
    now: NOW,
    channelName: 'CHANNEL ONE',
    resumesAt: RESUMES,
    // Named, not inherited from the date. These are geometry tests — whether
    // the ninth of September draws the electronic card is the rotation's
    // business and is tested where the rotation is. Leaving it to the date
    // made them fail the moment the card started turning over at six rather
    // than at midnight, which is a true change and not their concern.
    design: 'electronic',
    ...overrides,
  }
}

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

describe('buildTestCard — the card frame', () => {
  it('defaults to a 4:3 card and reports its geometric centre', () => {
    const model = buildTestCard(spec())

    expect(model.width).toBe(1024)
    expect(model.height).toBe(768)
    expect(model.centre).toEqual({ x: 512, y: 384 })
  })

  it('honours injected dimensions and recentres on them', () => {
    const model = buildTestCard(spec({ width: 640, height: 480 }))

    expect(model.centre).toEqual({ x: 320, y: 240 })
  })

  it('lays a background over the whole card', () => {
    const model = buildTestCard(spec())
    const [background, ...rest] = shapesOfRole(model, 'background')

    expect(rest).toEqual([])
    expect(background).toMatchObject({ kind: 'rect', x: 0, y: 0, width: 1024, height: 768 })
  })

  it('frames a picture area inset from every edge by the castellated border', () => {
    const model = buildTestCard(spec())

    expect(model.picture.x).toBeGreaterThan(0)
    expect(model.picture.x + model.picture.width).toBe(model.width - model.picture.x)
    expect(model.picture.y + model.picture.height).toBe(model.height - model.picture.y)
  })
})

describe('buildTestCard — castellations', () => {
  it('runs the requested number of blocks along each of the four edges', () => {
    const model = buildTestCard(spec({ castellationsAcross: 17, castellationsDown: 13 }))

    expect(shapesOfRole(model, 'castellation')).toHaveLength(2 * 17 + 2 * 13)
  })

  it('divides the top edge evenly and alternates block colour', () => {
    const model = buildTestCard(spec({ castellationsAcross: 9 }))
    const top = shapesOfRole(model, 'castellation').filter((s) => s.kind === 'rect' && s.y === 0)

    expect(top).toHaveLength(9)
    top.forEach((block, i) => {
      expect(block).toMatchObject({ kind: 'rect', x: (i * model.width) / 9, width: model.width / 9 })
    })
    const fills = top.map((block) => (block.kind === 'rect' ? block.fill : ''))
    fills.forEach((fill, i) => expect(fill).toBe(i % 2 === 0 ? fills[0] : fills[1]))
    expect(fills[0]).not.toBe(fills[1])
  })

  it('mirrors the castellations about the vertical axis', () => {
    const model = buildTestCard(spec())

    assertMirrorSymmetric(model, shapesOfRole(model, 'castellation'))
  })
})

describe('buildTestCard — colour bars', () => {
  it('lays the eight bars in EBU order, brightest to darkest', () => {
    const model = buildTestCard(spec())
    const fills = shapesOfRole(model, 'colour-bar').map((bar) => (bar.kind === 'rect' ? bar.fill : ''))

    expect(fills).toEqual([
      '#ffffff',
      '#ffff00',
      '#00ffff',
      '#00ff00',
      '#ff00ff',
      '#ff0000',
      '#0000ff',
      '#000000',
    ])
  })

  it('divides the picture width evenly and spans it exactly', () => {
    const model = buildTestCard(spec())
    const bars = shapesOfRole(model, 'colour-bar').filter((bar) => bar.kind === 'rect')
    const expectedWidth = model.picture.width / 8

    bars.forEach((bar, i) => {
      expect(bar.width).toBeCloseTo(expectedWidth, 9)
      expect(bar.x).toBeCloseTo(model.picture.x + i * expectedWidth, 9)
    })
    const last = bars[bars.length - 1]
    expect(bars[0].x).toBe(model.picture.x)
    expect(last.x + last.width).toBeCloseTo(model.picture.x + model.picture.width, 9)
  })
})

describe('buildTestCard — greyscale step wedge', () => {
  it('steps monotonically from black to white across the requested number of steps', () => {
    const model = buildTestCard(spec({ greyscaleSteps: 6 }))
    const steps = shapesOfRole(model, 'greyscale-step').filter((step) => step.kind === 'rect')

    expect(steps).toHaveLength(6)
    expect(steps[0].fill).toBe('#000000')
    expect(steps[5].fill).toBe('#ffffff')

    const levels = steps.map((step) => parseInt(step.fill.slice(1, 3), 16))
    levels.forEach((level, i) => {
      if (i > 0) expect(level).toBeGreaterThan(levels[i - 1])
    })
  })

  it('defaults to eight steps and divides the picture width evenly', () => {
    const model = buildTestCard(spec())
    const steps = shapesOfRole(model, 'greyscale-step').filter((step) => step.kind === 'rect')

    expect(steps).toHaveLength(8)
    steps.forEach((step) => expect(step.width).toBeCloseTo(model.picture.width / 8, 9))
  })
})

describe('buildTestCard — frequency gratings', () => {
  it('mirrors the frequency run about the vertical axis, high outside to low inside', () => {
    const model = buildTestCard(spec({ gratingFrequencies: [1.5, 3.5] }))
    const frames = shapesOfRole(model, 'grating-frame')

    expect(frames.map((frame) => frame.id)).toEqual([
      'grating-frame-l3.5',
      'grating-frame-l1.5',
      'grating-frame-r1.5',
      'grating-frame-r3.5',
    ])
  })

  it('puts more bars in a higher-frequency patch', () => {
    const model = buildTestCard(spec({ gratingFrequencies: [1.5, 4.5] }))
    const barsIn = (frameId: string): number =>
      shapesOfRole(model, 'grating-bar').filter((bar) => bar.id.startsWith(`${frameId}-`)).length

    expect(barsIn('grating-frame-r4.5')).toBeGreaterThan(barsIn('grating-frame-r1.5'))
  })

  it('is symmetric about the vertical axis, frames and bars alike', () => {
    const model = buildTestCard(spec())

    assertMirrorSymmetric(model, shapesOfRole(model, 'grating-frame'))
    assertMirrorSymmetric(model, shapesOfRole(model, 'grating-bar'))
  })
})

describe('buildTestCard — corner resolution wedges', () => {
  it('puts one wedge in each corner of the picture area', () => {
    const model = buildTestCard(spec())
    const frames = shapesOfRole(model, 'resolution-wedge-frame').filter((f) => f.kind === 'rect')

    expect(frames).toHaveLength(4)
    const corners = frames.map((f) => [f.x, f.y].join(','))
    const { x, y, width, height } = model.picture
    const size = frames[0].width
    expect(new Set(corners)).toEqual(
      new Set([
        `${x},${y}`,
        `${x + width - size},${y}`,
        `${x},${y + height - size}`,
        `${x + width - size},${y + height - size}`,
      ]),
    )
  })

  it('fans the same number of converging lines into every wedge', () => {
    const model = buildTestCard(spec())
    const lines = shapesOfRole(model, 'resolution-wedge-line')

    expect(lines.length).toBeGreaterThan(0)
    expect(lines.length % 4).toBe(0)
  })

  it('is symmetric about the vertical axis', () => {
    const model = buildTestCard(spec())

    assertMirrorSymmetric(model, shapesOfRole(model, 'resolution-wedge-frame'))
    assertMirrorSymmetric(model, shapesOfRole(model, 'resolution-wedge-line'))
  })
})

describe('buildTestCard — convergence', () => {
  it('centres both convergence circles on the card centre', () => {
    const model = buildTestCard(spec({ width: 640, height: 480 }))
    const circles = shapesOfRole(model, 'convergence-circle', 'convergence-inner-circle').filter(
      (c) => c.kind === 'circle',
    )

    expect(circles).toHaveLength(2)
    circles.forEach((circle) => {
      expect(circle.cx).toBe(model.centre.x)
      expect(circle.cy).toBe(model.centre.y)
    })
    expect(circles[0].r).toBeGreaterThan(circles[1].r)
  })

  it('crosses the crosshair exactly on the card centre', () => {
    const model = buildTestCard(spec())
    const [horizontal, vertical] = shapesOfRole(model, 'crosshair').filter((s) => s.kind === 'line')

    expect(horizontal.y1).toBe(model.centre.y)
    expect(horizontal.y2).toBe(model.centre.y)
    expect((horizontal.x1 + horizontal.x2) / 2).toBe(model.centre.x)

    expect(vertical.x1).toBe(model.centre.x)
    expect(vertical.x2).toBe(model.centre.x)
    expect((vertical.y1 + vertical.y2) / 2).toBe(model.centre.y)
  })
})

const textOf = (model: TestCardModel, role: Parameters<typeof shapesOfRole>[1]): string => {
  const [shape] = shapesOfRole(model, role)
  return shape?.kind === 'text' ? shape.text : ''
}

describe('buildTestCard — caption box and clock', () => {
  it('captions the injected channel name', () => {
    expect(textOf(buildTestCard(spec({ channelName: 'CHANNEL TWO' })), 'caption-channel')).toBe(
      'CHANNEL TWO',
    )
  })

  it('captions the injected date, not the real one', () => {
    const model = buildTestCard(spec({ now: new Date(1967, 6, 1, 11, 5, 9) }))

    expect(textOf(model, 'caption-date')).toBe('SATURDAY 1 JULY 1967')
    expect(textOf(model, 'clock-time')).toBe('11.05.09')
  })

  it('names the injected resume time in the closedown service message', () => {
    const model = buildTestCard(spec({ resumesAt: new Date(2026, 8, 9, 6, 15) }))

    expect(textOf(model, 'caption-message')).toBe('NORMAL SERVICE WILL RESUME AT 06.15')
  })

  it('prefers an explicitly supplied message over the derived one', () => {
    const model = buildTestCard(spec({ message: 'WE APOLOGISE FOR THE INTERRUPTION' }))

    expect(textOf(model, 'caption-message')).toBe('WE APOLOGISE FOR THE INTERRUPTION')
  })

  it('falls back to an open-ended closedown message when no resume time is known', () => {
    const model = buildTestCard(spec({ resumesAt: undefined }))

    expect(textOf(model, 'caption-message')).toBe('NORMAL SERVICE WILL RESUME SHORTLY')
  })

  it('centres the caption box and the clock box on the vertical axis', () => {
    const model = buildTestCard(spec())
    const boxes = shapesOfRole(model, 'caption-box', 'clock-box').filter((s) => s.kind === 'rect')

    expect(boxes).toHaveLength(2)
    boxes.forEach((box) => expect(box.x + box.width / 2).toBe(model.centre.x))
  })

  it('anchors every caption and clock line on the vertical axis', () => {
    const model = buildTestCard(spec())
    const lines = shapesOfRole(
      model,
      'caption-channel',
      'caption-date',
      'caption-message',
      'clock-time',
    ).filter((s) => s.kind === 'text')

    expect(lines).toHaveLength(4)
    lines.forEach((line) => {
      expect(line.x).toBe(model.centre.x)
      expect(line.anchor).toBe('middle')
    })
  })
})

describe('buildTestCard — the interlude variant', () => {
  const interlude = (): TestCardModel => buildTestCard(spec({ variant: 'interlude' }))

  it('drops the test signals a short gap does not need', () => {
    const model = interlude()

    expect(
      shapesOfRole(
        model,
        'colour-bar',
        'greyscale-step',
        'grating-frame',
        'grating-bar',
        'resolution-wedge-frame',
        'resolution-wedge-line',
      ),
    ).toEqual([])
  })

  it('keeps the frame, the convergence target, the caption and the clock', () => {
    const model = interlude()

    expect(shapesOfRole(model, 'castellation').length).toBeGreaterThan(0)
    expect(shapesOfRole(model, 'convergence-circle', 'crosshair').length).toBeGreaterThan(0)
    expect(textOf(model, 'caption-channel')).toBe('CHANNEL ONE')
    expect(textOf(model, 'clock-time')).toBe('01.30.05')
  })

  it('carries a continuity message rather than a closedown one', () => {
    expect(textOf(interlude(), 'caption-message')).toBe('PROGRAMMES WILL CONTINUE SHORTLY')
  })

  it('reports its own variant', () => {
    expect(interlude().variant).toBe('interlude')
    expect(buildTestCard(spec()).variant).toBe('closedown')
  })
})

describe('buildTestCard — invariants', () => {
  it('keeps every shape inside the bounds of the card', () => {
    const model = buildTestCard(spec())

    model.shapes.forEach((shape) => {
      const [left, right, top, bottom] = extent(shape)
      expect({ id: shape.id, inside: left >= 0 && top >= 0 && right <= model.width && bottom <= model.height }).toEqual({
        id: shape.id,
        inside: true,
      })
    })
  })

  it('gives every shape a distinct id, so a renderer can key on it', () => {
    const model = buildTestCard(spec())
    const ids = model.shapes.map((shape) => shape.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

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

/*
  A title is written by whoever uploaded the video, and the card puts it up as
  the caption, so how long a caption may be is a question about untrusted
  input. `fitFontSize` is closed-form, so an enormous one is not a hang — it
  shrinks the type to the 1px floor and hands the browser one very long text
  run. The card stops being a card.
*/
describe('a caption built from a title nobody would write', () => {
  const caption = (message: string): string => {
    const model = buildTestCard(spec({ design: 'crosshatch', message }))
    const [drawn, ...rest] = shapesOfRole(model, 'caption-message') as TextShape[]
    expect(rest).toEqual([])
    return drawn.text
  }

  it('leaves an ordinary title exactly as it was written', () => {
    const title = "THE NINE O'CLOCK NEWS"
    expect(caption(title)).toBe(title)
  })

  it('cuts one no card could hold down to something one can', () => {
    const drawn = caption('X'.repeat(200_000))

    expect(drawn.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS)
    // Cut, and saying so, rather than silently ending mid-word.
    expect(drawn.endsWith('…')).toBe(true)
  })

  it('cuts on a word when the title has one to cut on', () => {
    const drawn = caption(`${'WORD '.repeat(100)}END`)

    expect(drawn.length).toBeLessThanOrEqual(MAX_CAPTION_CHARS)
    expect(drawn).toMatch(/WORD…$/)
  })
})
