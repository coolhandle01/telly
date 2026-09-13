import { BORDER_FRACTION, DEFAULTS, type Picture } from '../primitives'
import { PALETTE } from '../palette'
import type { RectShape, Shape, TestCardModel, TestCardSpec, TextShape } from '../model'

/**
 * The fault card.
 *
 * Not a test card, and deliberately not in the rotation. A test card is a
 * signal a working station transmits on purpose; this is the station saying it
 * cannot transmit at all, in the idiom of the announcement that interrupts
 * everything and is not a programme.
 *
 * Amber on near-black. That is what a warning has looked like on every panel
 * since long before television, and it cannot be mistaken for any of the five
 * cards in the rotation, none of which is amber anywhere.
 *
 * It carries no clock and no date. The time is not the point, and a fault card
 * that quietly ticks along looks like a service.
 */

/** Blocks along the top and bottom edges. Odd, so the run mirrors. */
const BLOCKS_ACROSS = 17
const BLOCK_HEIGHT_FRACTION = 0.045

/** Where each line sits, as a fraction of the picture's height. */
const HEADING_Y = 0.3
const DETAIL_TOP_Y = 0.47
const DETAIL_LINE_Y = 0.082
const CODE_Y = 0.9

const HEADING_SIZE = 0.105
const DETAIL_SIZE = 0.05
const CODE_SIZE = 0.034
const STATION_SIZE = 0.04

export const DEFAULT_FAULT_HEADING = 'SERVICE FAULT'

export function buildFaultCard(spec: TestCardSpec): TestCardModel {
  const width = spec.width ?? DEFAULTS.width
  const height = spec.height ?? DEFAULTS.height
  const border = Math.round(Math.min(width, height) * BORDER_FRACTION)
  const picture: Picture = {
    x: border,
    y: border,
    width: width - border * 2,
    height: height - border * 2,
  }
  const centre = { x: picture.x + picture.width / 2, y: picture.y + picture.height / 2 }
  const shapes: Shape[] = []

  shapes.push({
    id: 'background',
    role: 'background',
    kind: 'rect',
    x: 0,
    y: 0,
    width,
    height,
    fill: PALETTE.alertGround,
  })

  // A run of blocks top and bottom: the same castellated edge the rotation
  // uses, in the wrong colour, which is the point. It says "this is that
  // family of thing" and "something is wrong" in one mark.
  const blockHeight = Math.round(height * BLOCK_HEIGHT_FRACTION)
  const blockWidth = width / BLOCKS_ACROSS
  for (let i = 0; i < BLOCKS_ACROSS; i++) {
    for (const [edge, y] of [
      ['top', 0],
      ['bottom', height - blockHeight],
    ] as const) {
      shapes.push({
        id: `alert-${edge}-${i}`,
        role: 'alert-block',
        kind: 'rect',
        x: i * blockWidth,
        y,
        width: blockWidth,
        height: blockHeight,
        fill: i % 2 === 0 ? PALETTE.alertBlock : PALETTE.alertGround,
      })
    }
  }

  const rule = (id: string, y: number): RectShape => ({
    id,
    role: 'alert-rule',
    kind: 'rect',
    x: picture.x,
    y,
    width: picture.width,
    height: Math.max(2, Math.round(height * 0.006)),
    fill: PALETTE.alertInkDim,
  })

  const text = (
    id: string,
    role: TextShape['role'],
    content: string,
    y: number,
    size: number,
    fill: string,
  ): TextShape => ({
    id,
    role,
    kind: 'text',
    x: centre.x,
    y,
    text: content,
    fill,
    fontSize: Math.round(height * size),
    anchor: 'middle',
    letterSpacing: Math.round(height * size * 0.1),
  })

  shapes.push(
    text(
      'alert-station',
      'alert-detail',
      spec.channelName.toUpperCase(),
      picture.y + picture.height * 0.13,
      STATION_SIZE,
      PALETTE.alertInkDim,
    ),
  )
  shapes.push(rule('alert-rule-top', picture.y + picture.height * 0.18))

  shapes.push(
    text(
      'alert-heading',
      'alert-heading',
      (spec.message ?? DEFAULT_FAULT_HEADING).toUpperCase(),
      picture.y + picture.height * HEADING_Y,
      HEADING_SIZE,
      PALETTE.alertInk,
    ),
  )

  const detail = spec.faultDetail ?? []
  detail.forEach((line, index) => {
    shapes.push(
      text(
        `alert-detail-${index}`,
        'alert-detail',
        line.toUpperCase(),
        picture.y + picture.height * (DETAIL_TOP_Y + index * DETAIL_LINE_Y),
        DETAIL_SIZE,
        PALETTE.alertInk,
      ),
    )
  })

  shapes.push(rule('alert-rule-bottom', picture.y + picture.height * 0.82))

  if (spec.faultCode) {
    shapes.push(
      text(
        'alert-code',
        'alert-code',
        spec.faultCode.toUpperCase(),
        picture.y + picture.height * CODE_Y,
        CODE_SIZE,
        PALETTE.alertInkDim,
      ),
    )
  }

  return {
    variant: spec.variant,
    width,
    height,
    centre,
    picture,
    background: PALETTE.alertGround,
    shapes,
  }
}
