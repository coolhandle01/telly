import { describe, expect, it } from 'vitest'
import {
  shapesOfRole,
  type RectShape,
  type TestCardSpec,
  type TextShape,
} from '@/testcard/model'
import { buildTestCard } from '@/testcard/buildTestCard'
import { DESIGN_ROTATION } from '@/testcard/designs/index'
import { PALETTE } from '@/testcard/palette'

const spec = (overrides: Partial<TestCardSpec> = {}): TestCardSpec => ({
  design: 'fault',
  variant: 'closedown',
  now: new Date(2026, 8, 13, 20, 10, 0),
  channelName: 'CHANNEL ONE',
  faultCode: 'Fault 01 · no service configuration',
  faultDetail: ['This receiver has not been', 'configured for a service.'],
  ...overrides,
})

const textOf = (roles: Parameters<typeof shapesOfRole>[1][]) => (model: ReturnType<typeof buildTestCard>) =>
  (shapesOfRole(model, ...roles) as TextShape[]).map((shape) => shape.text)

describe('the fault card', () => {
  it('never takes a turn in the rotation', () => {
    // A station does not have a day of being broken.
    expect(DESIGN_ROTATION).not.toContain('fault')
  })

  it('says what is wrong, in the words it was given', () => {
    const model = buildTestCard(spec())

    expect(textOf(['alert-detail'])(model)).toContain('THIS RECEIVER HAS NOT BEEN')
    expect(textOf(['alert-detail'])(model)).toContain('CONFIGURED FOR A SERVICE.')
  })

  it('names the station, so it is clear which set is broken', () => {
    expect(textOf(['alert-detail'])(buildTestCard(spec()))).toContain('CHANNEL ONE')
  })

  it('prints the fault code', () => {
    expect(textOf(['alert-code'])(buildTestCard(spec()))).toEqual([
      'FAULT 01 · NO SERVICE CONFIGURATION',
    ])
  })

  it('carries no clock and no date', () => {
    // A fault card that quietly ticks along looks like a service.
    const model = buildTestCard(spec())

    expect(shapesOfRole(model, 'clock-box', 'clock-time')).toEqual([])
    expect(shapesOfRole(model, 'caption-date')).toEqual([])
  })

  it('is amber on near-black, which none of the real cards is', () => {
    const model = buildTestCard(spec())

    expect(model.background).toBe(PALETTE.alertGround)
    const blocks = shapesOfRole(model, 'alert-block')
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks.some((block) => 'fill' in block && block.fill === PALETTE.alertBlock)).toBe(true)
  })

  it('fills the frame it is given, whatever size that is', () => {
    const model = buildTestCard(spec({ width: 640, height: 480 }))

    expect(model.width).toBe(640)
    expect(model.height).toBe(480)
    const background = shapesOfRole(model, 'background')[0]
    expect(background).toMatchObject({ width: 640, height: 480 })
  })

  it('draws without any detail lines at all', () => {
    // The code path a caller takes when it knows something is wrong and has
    // nothing useful to say about it.
    const model = buildTestCard(spec({ faultDetail: undefined, faultCode: undefined }))

    expect(model.shapes.length).toBeGreaterThan(0)
    expect(shapesOfRole(model, 'alert-code')).toEqual([])
    expect(textOf(['alert-detail'])(model)).toEqual(['CHANNEL ONE'])
  })

  it('shouts the heading it is given, and says SERVICE FAULT without one', () => {
    expect(textOf(['alert-heading'])(buildTestCard(spec({ message: 'no signal' })))).toEqual([
      'NO SIGNAL',
    ])
    expect(textOf(['alert-heading'])(buildTestCard(spec()))).toEqual(['SERVICE FAULT'])
  })

  it('centres every line on the card', () => {
    const model = buildTestCard(spec({ width: 640, height: 480 }))
    const lines = model.shapes.filter((shape): shape is TextShape => shape.kind === 'text')

    expect(model.centre).toEqual({ x: 320, y: 240 })
    expect(lines.length).toBeGreaterThan(0)
    lines.forEach((line) => expect(line).toMatchObject({ x: 320, anchor: 'middle' }))
  })

  // Station, rule, heading, the detail in its order, rule, code.
  it('reads top to bottom in order, all of it inside the picture', () => {
    const model = buildTestCard(spec())
    const { y, height } = model.picture
    const marks = shapesOfRole(
      model,
      'alert-detail',
      'alert-rule',
      'alert-heading',
      'alert-code',
    ) as (RectShape | TextShape)[]
    const tops = marks.map((mark) => mark.y)
    const bottoms = marks.map((mark) => (mark.kind === 'rect' ? mark.y + mark.height : mark.y))

    expect(marks.map((mark) => mark.id)).toEqual([
      'alert-station',
      'alert-rule-top',
      'alert-heading',
      'alert-detail-0',
      'alert-detail-1',
      'alert-rule-bottom',
      'alert-code',
    ])
    tops.forEach((top, i) => {
      if (i > 0) expect(top).toBeGreaterThan(tops[i - 1])
    })
    expect(tops[0]).toBeGreaterThanOrEqual(y)
    expect(Math.max(...bottoms)).toBeLessThanOrEqual(y + height)
  })

  it('runs the rules across the picture, edge to edge', () => {
    const model = buildTestCard(spec())

    shapesOfRole(model, 'alert-rule').forEach((rule) =>
      expect(rule).toMatchObject({ kind: 'rect', x: model.picture.x, width: model.picture.width }),
    )
  })

  it('sets the heading largest and the code smallest, each spaced less than a glyph', () => {
    const model = buildTestCard(spec())
    const size = (id: string) =>
      (model.shapes.find((shape) => shape.id === id) as TextShape).fontSize

    expect(size('alert-heading')).toBeGreaterThan(size('alert-detail-0'))
    expect(size('alert-detail-0')).toBeGreaterThan(size('alert-code'))
    model.shapes
      .filter((shape): shape is TextShape => shape.kind === 'text')
      .forEach((line) => expect(line.letterSpacing).toBeLessThan(line.fontSize))
  })

  // An odd run that starts amber ends amber, so it mirrors about the axis.
  it('edges the card top and bottom with a run of blocks, amber at both ends', () => {
    const model = buildTestCard(spec())
    const blocks = shapesOfRole(model, 'alert-block') as RectShape[]

    for (const edge of ['top', 'bottom']) {
      const run = blocks.filter((block) => block.id.startsWith(`alert-${edge}-`))
      expect(run.length % 2).toBe(1)
      expect(run[0].x).toBe(0)
      expect(run[run.length - 1].x + run[run.length - 1].width).toBeCloseTo(model.width, 9)
      run.forEach((block, i) => {
        if (i > 0) expect(block.x).toBeCloseTo(run[i - 1].x + run[i - 1].width, 9)
        expect(block.fill).toBe(i % 2 === 0 ? PALETTE.alertBlock : PALETTE.alertGround)
        expect(block.kind).toBe('rect')
      })
    }
  })

  it('keeps the blocks in the border, clear of the picture', () => {
    const model = buildTestCard(spec())
    const { y, height } = model.picture

    ;(shapesOfRole(model, 'alert-block') as RectShape[]).forEach((block) => {
      const clear = block.y + block.height <= y || block.y >= y + height
      expect({ id: block.id, clear }).toEqual({ id: block.id, clear: true })
    })
  })

  it('gives every shape a distinct id, and a kind the renderer draws', () => {
    const model = buildTestCard(spec())
    const ids = model.shapes.map((shape) => shape.id)

    expect(new Set(ids).size).toBe(ids.length)
    model.shapes.forEach((shape) => expect(['rect', 'circle', 'line', 'text']).toContain(shape.kind))
  })
})
