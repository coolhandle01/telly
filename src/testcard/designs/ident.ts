import {
  BANDS,
  BORDER_FRACTION,
  CLOCK_WIDTH_FRACTION,
  DEFAULTS,
  band,
  captionBox,
  castellations,
  clockBox,
  type Picture,
} from '../primitives'
import { fitFontSize } from '../fitText'
import { COLOUR_BARS, PALETTE } from '../palette'
import type { CircleShape, LineShape, RectShape, Shape, TestCardModel, TestCardSpec } from '../model'

/**
 * The station ident: a colour wheel of concentric rings on a dark field, a
 * star of segments radiating past its edge, and the channel's name large on a
 * plate straight across the middle.
 *
 * The least technical card of the set. Nobody lined a set up against this one
 * — it went out between programmes to look smart — so it carries no line-up
 * signals at all, only the marks that say *which* channel you are watching,
 * inside the same castellated border as the rest of the rotation.
 *
 * Pure: a spec of plain values in, a plain-data model out.
 */

/** The wheel, as a fraction of the picture's shorter side. */
const WHEEL_RADIUS_FRACTION = 0.4
/** How much of the room above the caption box the wheel may take. */
const WHEEL_CLEAR_RATIO = 0.92
/** Where the innermost ring sits, as a fraction of the outermost. */
const WHEEL_INNER_RATIO = 0.45
/** How much of the gap between two radii a ring's band fills. */
const RING_BAND_RATIO = 0.82

/** Segments in the star. Even, so the star mirrors about the vertical axis. */
const STAR_SEGMENTS = 12
/** The star's reach, as multiples of the outer ring's radius. */
const STAR_INNER_RATIO = 1.06
const STAR_OUTER_RATIO = 1.24
const STAR_WIDTH_RATIO = 0.12

/** The name plate, as fractions of the picture. */
const PLATE_WIDTH_FRACTION = 0.52
const PLATE_HEIGHT_FRACTION = 0.15
const PLATE_TEXT_FRACTION = 0.9
const NAME_SCALE = 0.62

/** How much bigger than the clock box its backing plate is. */
const CLOCK_PLATE_WIDTH_RATIO = 1.16
const CLOCK_PLATE_HEIGHT_RATIO = 1.34

export function buildIdentCard(spec: TestCardSpec): TestCardModel {
  const width = spec.width ?? DEFAULTS.width
  const height = spec.height ?? DEFAULTS.height
  const border = Math.round(Math.min(width, height) * BORDER_FRACTION)
  const picture: Picture = {
    x: border,
    y: border,
    width: width - 2 * border,
    height: height - 2 * border,
  }
  const centre = { x: width / 2, y: height / 2 }
  // The wheel is sized to stop short of the caption box, the way the line-up
  // chart sizes its convergence circle; only the star oversteps it, the way
  // that card's crosshair does.
  const radius = Math.min(
    Math.min(picture.width, picture.height) * WHEEL_RADIUS_FRACTION,
    (band(picture, BANDS.caption).y - centre.y) * WHEEL_CLEAR_RATIO,
  )

  const shapes: Shape[] = [
    {
      id: 'background',
      role: 'background',
      kind: 'rect',
      x: 0,
      y: 0,
      width,
      height,
      fill: PALETTE.surround,
    },
    ...castellations(
      width,
      height,
      border,
      spec.castellationsAcross ?? DEFAULTS.castellationsAcross,
      spec.castellationsDown ?? DEFAULTS.castellationsDown,
    ),
    {
      id: 'picture',
      role: 'picture',
      kind: 'rect',
      ...picture,
      // A dark field rather than the line-up chart's mid grey: this card is
      // meant to be looked at, and the colour reads off black.
      fill: PALETTE.captionBox,
      stroke: PALETTE.frame,
      strokeWidth: Math.max(1, Math.round(border / 16)),
    },
    ...rings(centre, radius),
    // The interlude card is the same card with the busier signal taken out:
    // the wheel and the name stay, the star goes.
    ...(spec.variant === 'closedown' ? star(centre, radius) : []),
    ...nameplate(picture, centre, spec.channelName),
    clockPlate(picture, centre),
    ...captionBox(picture, centre, spec),
    ...clockBox(picture, centre, spec.now),
  ]

  return {
    variant: spec.variant,
    width,
    height,
    centre,
    picture,
    background: PALETTE.surround,
    shapes,
  }
}

/**
 * The wheel: one ring per EBU colour, brightest outermost, evenly spaced and
 * all concentric on the card's centre. The bands nearly meet, so the run reads
 * as a single wheel rather than as eight separate circles.
 */
function rings(centre: { x: number; y: number }, radius: number): CircleShape[] {
  const inner = radius * WHEEL_INNER_RATIO
  const step = (radius - inner) / (COLOUR_BARS.length - 1)

  return COLOUR_BARS.map((colour, i) => ({
    id: `ring-${colour.name}`,
    role: 'ring' as const,
    kind: 'circle' as const,
    cx: centre.x,
    cy: centre.y,
    r: radius - i * step,
    fill: 'none',
    stroke: colour.fill,
    strokeWidth: step * RING_BAND_RATIO,
  }))
}

/**
 * The star: equally spaced segments pointing out of the wheel. The right-hand
 * half is computed and the left-hand half is its exact reflection, so the
 * star's symmetry — colours included — is a property of the construction
 * rather than of two hand-written halves that can drift apart.
 */
function star(centre: { x: number; y: number }, radius: number): LineShape[] {
  const inner = radius * STAR_INNER_RATIO
  const outer = radius * STAR_OUTER_RATIO
  const half = STAR_SEGMENTS / 2

  return Array.from({ length: STAR_SEGMENTS }, (_, k) => {
    // Segment k and segment STAR_SEGMENTS - k are a mirrored pair: the same
    // angle off the vertical, the same colour, opposite sides of the axis.
    const index = k <= half ? k : STAR_SEGMENTS - k
    const side = k <= half ? 1 : -1
    const angle = (index * 2 * Math.PI) / STAR_SEGMENTS
    // The two segments lying on the axis get an exact zero rather than a
    // sine's last-bit residue, so they mirror onto themselves.
    const unitX = index === 0 || index === half ? 0 : Math.sin(angle) * side
    const unitY = -Math.cos(angle)
    const colour = COLOUR_BARS[index % (COLOUR_BARS.length - 1)]

    return {
      id: `star-segment-${k}`,
      role: 'star-segment' as const,
      kind: 'line' as const,
      x1: centre.x + unitX * inner,
      y1: centre.y + unitY * inner,
      x2: centre.x + unitX * outer,
      y2: centre.y + unitY * outer,
      stroke: colour.fill,
      strokeWidth: radius * STAR_WIDTH_RATIO,
    }
  })
}

/**
 * The name, set as large as its plate will take, straight across the middle of
 * the wheel. A long channel name shrinks to fit rather than running off the
 * plate — the same bargain the caption box strikes.
 */
function nameplate(
  picture: Picture,
  centre: { x: number; y: number },
  channelName: string,
): Shape[] {
  const plateWidth = picture.width * PLATE_WIDTH_FRACTION
  const plateHeight = picture.height * PLATE_HEIGHT_FRACTION
  const letterSpacing = plateHeight * 0.05

  const plate: RectShape = {
    id: 'ident-plate',
    role: 'ident-mark',
    kind: 'rect',
    x: centre.x - plateWidth / 2,
    y: centre.y - plateHeight / 2,
    width: plateWidth,
    height: plateHeight,
    fill: PALETTE.captionBox,
    stroke: PALETTE.frame,
    strokeWidth: 3,
  }

  return [
    plate,
    {
      id: 'ident-name',
      role: 'ident-mark',
      kind: 'text',
      x: centre.x,
      y: centre.y,
      text: channelName,
      fill: PALETTE.ink,
      fontSize: fitFontSize(
        channelName,
        plateWidth * PLATE_TEXT_FRACTION,
        plateHeight * NAME_SCALE,
        letterSpacing,
      ),
      anchor: 'middle',
      letterSpacing,
    },
  ]
}

/** A plate under the clock box, so the time reads as part of the ident. */
function clockPlate(picture: Picture, centre: { x: number; y: number }): RectShape {
  const { y, height } = band(picture, BANDS.clock)
  const plateWidth = picture.width * CLOCK_WIDTH_FRACTION * CLOCK_PLATE_WIDTH_RATIO
  const plateHeight = height * CLOCK_PLATE_HEIGHT_RATIO

  return {
    id: 'ident-clock-plate',
    role: 'ident-mark',
    kind: 'rect',
    x: centre.x - plateWidth / 2,
    y: y + height / 2 - plateHeight / 2,
    width: plateWidth,
    height: plateHeight,
    fill: PALETTE.frame,
    stroke: PALETTE.frame,
    strokeWidth: 2,
  }
}
