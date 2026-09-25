import { describe, expect, it } from 'vitest'
import { shapesOfRole, type TestCardSpec, type TextShape } from '@/testcard/model'
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
  })
})
