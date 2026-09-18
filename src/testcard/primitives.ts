/**
 * The drawing vocabulary every card design is built from: castellations,
 * colour bars, a greyscale wedge, gratings, resolution wedges, a convergence
 * target, the caption and the clock.
 *
 * A design is an arrangement of these, nothing more. Keeping them here is what
 * makes a second card cheap and a fifth one no harder than the second.
 */
import { formatCardDate, formatClockTime, formatResumeMessage } from './format'
import { fitFontSize } from './fitText'
import { COLOUR_BARS, greyLevel, PALETTE } from './palette'
import type {
  CircleShape,
  TextShape,
  LineShape,
  RectShape,
  Shape,

  TestCardSpec,
} from './model'

export const DEFAULTS = {
  width: 1024,
  height: 768,
  castellationsAcross: 17,
  castellationsDown: 13,
  greyscaleSteps: 8,
  gratingFrequencies: [1.5, 2.5, 3.5, 4.5],
} as const

/** Border thickness as a fraction of the card's shorter side. */
export const BORDER_FRACTION = 0.0625

/** Vertical bands within the picture area, as fractions of its height. */
export const BANDS = {
  gratings: [0.2, 0.32],
  colourBars: [0.42, 0.56],
  greyscale: [0.7, 0.78],
  caption: [0.82, 0.96],
  clock: [0.02, 0.1],
} as const

/** Caption and clock boxes, as fractions of the picture width. */
export const CAPTION_WIDTH_FRACTION = 0.62
export const CLOCK_WIDTH_FRACTION = 0.26

const OPEN_ENDED_CLOSEDOWN = 'NORMAL SERVICE WILL RESUME SHORTLY'
const INTERLUDE_MESSAGE = 'PROGRAMMES WILL CONTINUE SHORTLY'

export const WEDGE_SIZE_FRACTION = 0.16
export const WEDGE_LINES = 9
export const CIRCLE_RADIUS_FRACTION = 0.3
export const INNER_CIRCLE_RADIUS_FRACTION = 0.05
export const CROSSHAIR_OVERSHOOT = 1.12
/** Fraction of a grating slot left as gutter, so patches read as separate. */
export const GRATING_GUTTER = 0.15

export interface Picture {
  x: number
  y: number
  width: number
  height: number
}

export function band(picture: Picture, [from, to]: readonly [number, number]): { y: number; height: number } {
  return { y: picture.y + picture.height * from, height: picture.height * (to - from) }
}

/**
 * The castellated border: alternating blocks around all four edges. The counts
 * are odd so each strip is its own palindrome and the border mirrors cleanly
 * about the vertical axis.
 */
export function castellations(
  width: number,
  height: number,
  border: number,
  across: number,
  down: number,
): RectShape[] {
  const fill = (i: number): string =>
    i % 2 === 0 ? PALETTE.castellationLight : PALETTE.castellationDark
  const blocks: RectShape[] = []
  const blockWidth = width / across
  const innerHeight = height - 2 * border
  const blockHeight = innerHeight / down

  for (let i = 0; i < across; i += 1) {
    const x = (i * width) / across
    blocks.push({ id: `castellation-top-${i}`, role: 'castellation', kind: 'rect', x, y: 0, width: blockWidth, height: border, fill: fill(i) })
  }
  for (let i = 0; i < across; i += 1) {
    const x = (i * width) / across
    blocks.push({ id: `castellation-bottom-${i}`, role: 'castellation', kind: 'rect', x, y: height - border, width: blockWidth, height: border, fill: fill(i) })
  }
  for (let j = 0; j < down; j += 1) {
    const y = border + (j * innerHeight) / down
    blocks.push({ id: `castellation-left-${j}`, role: 'castellation', kind: 'rect', x: 0, y, width: border, height: blockHeight, fill: fill(j) })
    blocks.push({ id: `castellation-right-${j}`, role: 'castellation', kind: 'rect', x: width - border, y, width: border, height: blockHeight, fill: fill(j) })
  }
  return blocks
}

/** Eight EBU bars dividing the picture width exactly. */
export function colourBars(picture: Picture): RectShape[] {
  const { y, height } = band(picture, BANDS.colourBars)
  const barWidth = picture.width / COLOUR_BARS.length
  return COLOUR_BARS.map((bar, i) => ({
    id: `colour-bar-${bar.name}`,
    role: 'colour-bar' as const,
    kind: 'rect' as const,
    x: picture.x + i * barWidth,
    y,
    width: barWidth,
    height,
    fill: bar.fill,
  }))
}

/** A step wedge running black to white, both ends inclusive. */
export function greyscaleWedge(picture: Picture, steps: number): RectShape[] {
  const { y, height } = band(picture, BANDS.greyscale)
  const stepWidth = picture.width / steps
  return Array.from({ length: steps }, (_, i) => ({
    id: `greyscale-step-${i}`,
    role: 'greyscale-step' as const,
    kind: 'rect' as const,
    x: picture.x + i * stepWidth,
    y,
    width: stepWidth,
    height,
    fill: greyLevel(i / (steps - 1)),
  }))
}

/** Odd, so the light/dark run inside a patch is its own palindrome. */
export function barsForFrequency(frequency: number): number {
  return 2 * Math.round(frequency * 2) + 1
}

/**
 * The frequency gratings, laid out `[...reversed, ...frequencies]` so the row
 * reads high-outside to low-inside and mirrors about the vertical axis.
 */
export function gratings(picture: Picture, frequencies: number[]): Shape[] {
  const { y, height } = band(picture, BANDS.gratings)
  const labelled = [
    ...[...frequencies].reverse().map((frequency) => ({ frequency, side: 'l' })),
    ...frequencies.map((frequency) => ({ frequency, side: 'r' })),
  ]
  const slot = picture.width / labelled.length
  const gutter = slot * GRATING_GUTTER
  const patchWidth = slot - gutter

  return labelled.flatMap(({ frequency, side }, i): Shape[] => {
    const frameId = `grating-frame-${side}${frequency}`
    const x = picture.x + i * slot + gutter / 2
    const frame: RectShape = {
      id: frameId,
      role: 'grating-frame',
      kind: 'rect',
      x,
      y,
      width: patchWidth,
      height,
      fill: PALETTE.gratingDark,
      stroke: PALETTE.frame,
      strokeWidth: 1,
    }
    const count = barsForFrequency(frequency)
    const barWidth = patchWidth / count
    const bars: RectShape[] = Array.from({ length: count }, (_, j) => ({
      id: `${frameId}-${j}`,
      role: 'grating-bar' as const,
      kind: 'rect' as const,
      x: x + j * barWidth,
      y,
      width: barWidth,
      height,
      fill: j % 2 === 0 ? PALETTE.gratingLight : PALETTE.gratingDark,
    }))
    return [frame, ...bars]
  })
}

/**
 * Four corner wedges of converging lines. The top-left one is drawn, then
 * reflected into the other three corners, so symmetry is a property of the
 * construction rather than three hand-written copies that can drift.
 */
export function resolutionWedges(picture: Picture, cardWidth: number): Shape[] {
  const size = picture.height * WEDGE_SIZE_FRACTION
  const apex = { x: picture.x + size, y: picture.y + size }
  const cardBottom = picture.y * 2 + picture.height

  const frame: RectShape = {
    id: 'wedge-frame-tl',
    role: 'resolution-wedge-frame',
    kind: 'rect',
    x: picture.x,
    y: picture.y,
    width: size,
    height: size,
    fill: PALETTE.castellationDark,
  }

  const lines: LineShape[] = Array.from({ length: WEDGE_LINES }, (_, t) => {
    const distance = (t / (WEDGE_LINES - 1)) * 2 * size
    const end =
      distance <= size
        ? { x: picture.x + size - distance, y: picture.y }
        : { x: picture.x, y: picture.y + (distance - size) }
    return {
      id: `wedge-line-tl-${t}`,
      role: 'resolution-wedge-line' as const,
      kind: 'line' as const,
      x1: apex.x,
      y1: apex.y,
      x2: end.x,
      y2: end.y,
      stroke: PALETTE.ink,
      strokeWidth: 2,
    }
  })

  const topLeft: Array<RectShape | LineShape> = [frame, ...lines]
  return [
    ...topLeft,
    ...topLeft.map((shape) => reflect(shape, 'tr', { cardWidth })),
    ...topLeft.map((shape) => reflect(shape, 'bl', { cardBottom })),
    ...topLeft.map((shape) => reflect(shape, 'br', { cardWidth, cardBottom })),
  ]
}

/** Reflects a wedge shape into another corner, renaming it for that corner. */
export function reflect(
  shape: RectShape | LineShape,
  corner: 'tr' | 'bl' | 'br',
  axes: { cardWidth?: number; cardBottom?: number },
): RectShape | LineShape {
  const id = shape.id.replace('tl', corner)
  const flipX = (x: number): number => (axes.cardWidth === undefined ? x : axes.cardWidth - x)
  const flipY = (y: number): number => (axes.cardBottom === undefined ? y : axes.cardBottom - y)

  if (shape.kind === 'rect') {
    return {
      ...shape,
      id,
      x: axes.cardWidth === undefined ? shape.x : flipX(shape.x) - shape.width,
      y: axes.cardBottom === undefined ? shape.y : flipY(shape.y) - shape.height,
    }
  }
  return { ...shape, id, x1: flipX(shape.x1), x2: flipX(shape.x2), y1: flipY(shape.y1), y2: flipY(shape.y2) }
}

/** The convergence target: two concentric circles and a crosshair on the centre. */
export function convergence(picture: Picture, centre: { x: number; y: number }): Shape[] {
  const radius = picture.height * CIRCLE_RADIUS_FRACTION
  const reach = radius * CROSSHAIR_OVERSHOOT

  const outer: CircleShape = {
    id: 'convergence-circle',
    role: 'convergence-circle',
    kind: 'circle',
    cx: centre.x,
    cy: centre.y,
    r: radius,
    fill: 'none',
    stroke: PALETTE.ink,
    strokeWidth: 3,
  }
  const inner: CircleShape = {
    id: 'convergence-inner-circle',
    role: 'convergence-inner-circle',
    kind: 'circle',
    cx: centre.x,
    cy: centre.y,
    r: picture.height * INNER_CIRCLE_RADIUS_FRACTION,
    fill: 'none',
    stroke: PALETTE.ink,
    strokeWidth: 2,
  }
  const horizontal: LineShape = {
    id: 'crosshair-horizontal',
    role: 'crosshair',
    kind: 'line',
    x1: centre.x - reach,
    y1: centre.y,
    x2: centre.x + reach,
    y2: centre.y,
    stroke: PALETTE.ink,
    strokeWidth: 2,
  }
  const vertical: LineShape = {
    id: 'crosshair-vertical',
    role: 'crosshair',
    kind: 'line',
    x1: centre.x,
    y1: centre.y - reach,
    x2: centre.x,
    y2: centre.y + reach,
    stroke: PALETTE.ink,
    strokeWidth: 2,
  }
  return [outer, inner, horizontal, vertical]
}

/** The service message: explicit, else derived from the variant and resume time. */
export function serviceMessage(spec: TestCardSpec): string {
  if (spec.message !== undefined) return spec.message
  if (spec.variant === 'interlude') return INTERLUDE_MESSAGE
  return spec.resumesAt ? formatResumeMessage(spec.resumesAt) : OPEN_ENDED_CLOSEDOWN
}

/** Channel, date and service message, stacked and centred on the vertical axis. */
/** How much of the caption box the text may occupy, leaving a margin. */
export const CAPTION_TEXT_FRACTION = 0.94

export function captionBox(picture: Picture, centre: { x: number; y: number }, spec: TestCardSpec): Shape[] {
  const { y, height } = band(picture, BANDS.caption)
  const width = picture.width * CAPTION_WIDTH_FRACTION
  const box: RectShape = {
    id: 'caption-box',
    role: 'caption-box',
    kind: 'rect',
    x: centre.x - width / 2,
    y,
    width,
    height,
    fill: PALETTE.captionBox,
    stroke: PALETTE.frame,
    strokeWidth: 2,
  }

  const lines: Array<{ id: string; role: 'caption-channel' | 'caption-date' | 'caption-message'; text: string; scale: number }> = [
    { id: 'caption-channel', role: 'caption-channel', text: spec.channelName, scale: 0.34 },
    { id: 'caption-date', role: 'caption-date', text: formatCardDate(spec.now), scale: 0.22 },
    { id: 'caption-message', role: 'caption-message', text: serviceMessage(spec), scale: 0.22 },
  ]

  // Captions vary in length (a fault message runs to forty-odd characters
  // where a resume time is twenty) so each line is shrunk to fit the box
  // rather than allowed to spill out of it.
  const letterSpacing = height * 0.03
  const maxTextWidth = width * CAPTION_TEXT_FRACTION

  const texts: TextShape[] = lines.map((line, i) => ({
    id: line.id,
    role: line.role,
    kind: 'text',
    x: centre.x,
    y: y + (height * (i + 1)) / (lines.length + 1),
    text: line.text,
    fill: PALETTE.ink,
    fontSize: fitFontSize(line.text, maxTextWidth, height * line.scale, letterSpacing),
    anchor: 'middle',
    letterSpacing,
  }))

  return [box, ...texts]
}

/** The live clock. The instant is injected; nothing here reads the ambient one. */
export function clockBox(picture: Picture, centre: { x: number; y: number }, now: Date): Shape[] {
  const { y, height } = band(picture, BANDS.clock)
  const width = picture.width * CLOCK_WIDTH_FRACTION
  const box: RectShape = {
    id: 'clock-box',
    role: 'clock-box',
    kind: 'rect',
    x: centre.x - width / 2,
    y,
    width,
    height,
    fill: PALETTE.captionBox,
    stroke: PALETTE.frame,
    strokeWidth: 2,
  }
  const text: TextShape = {
    id: 'clock-time',
    role: 'clock-time',
    kind: 'text',
    x: centre.x,
    y: y + height * 0.72,
    text: formatClockTime(now),
    fill: PALETTE.ink,
    fontSize: height * 0.62,
    anchor: 'middle',
    letterSpacing: height * 0.06,
  }
  return [box, text]
}

