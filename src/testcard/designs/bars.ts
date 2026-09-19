import {
  BORDER_FRACTION,
  DEFAULTS,
  band,
  captionBox,
  castellations,
  clockBox,
  type Picture,
} from '../primitives'
import { COLOUR_BARS, PALETTE, greyLevel } from '../palette'
import type { RectShape, Shape, TestCardModel, TestCardSpec } from '../model'

/**
 * The colour bars card: eight full-height EBU bars down the whole picture, a
 * shallow band of their complements beneath, then the engineer's row: a PLUGE
 * run of near-black steps with a peak-white and a full-black reference either
 * side of it.
 *
 * The loud one. Where the electronic chart is a grey lattice of line-up
 * signals, this is the card a set is *judged* by: colour, then black level,
 * then the two ends of the scale, and nothing else.
 *
 * Pure: a spec of plain values in, a plain-data model out.
 */

/** Vertical bands within the picture, as fractions of its height. */
const BARS_BAND = [0, 0.66] as const
const REVERSE_BAND = [0.66, 0.74] as const
const REFERENCE_BAND = [0.75, 0.805] as const

/** Near-black steps, and the gap between them as a fraction of full scale. */
const PLUGE_STEPS = 5
const PLUGE_RISE = 0.02

/** The PLUGE run and the reference patches, as fractions of the picture width. */
const PLUGE_RUN_FRACTION = 0.44
const REFERENCE_WIDTH_FRACTION = 0.1
const REFERENCE_INSET_FRACTION = 0.05

export function buildBarsCard(spec: TestCardSpec): TestCardModel {
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
  const closedown = spec.variant === 'closedown'

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
      fill: PALETTE.picture,
      stroke: PALETTE.frame,
      strokeWidth: Math.max(1, Math.round(border / 16)),
    },
    // The interlude card is the closedown card with the test signals taken
    // out: the bars are the card, so they stay, and with the rows beneath
    // gone they simply run the full height of the picture.
    ...tallBars(picture, closedown),
    ...(closedown
      ? [...reversedBars(picture), ...plugeRun(picture, centre), ...referencePatches(picture)]
      : []),
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

/** The eight EBU bars, brightest to darkest, dividing the picture width exactly. */
function tallBars(picture: Picture, closedown: boolean): RectShape[] {
  const { y, height } = closedown
    ? band(picture, BARS_BAND)
    : { y: picture.y, height: picture.height }
  const barWidth = picture.width / COLOUR_BARS.length

  return COLOUR_BARS.map((bar, i) => ({
    id: `bar-tall-${bar.name}`,
    role: 'bar-tall' as const,
    kind: 'rect' as const,
    x: picture.x + i * barWidth,
    y,
    width: barWidth,
    height,
    fill: bar.fill,
  }))
}

/**
 * The same eight colours in the opposite order, which (the EBU order being
 * symmetric in luminance) puts each bar's exact complement underneath it.
 * White meets black, yellow meets blue, cyan meets red, green meets magenta.
 */
function reversedBars(picture: Picture): RectShape[] {
  const { y, height } = band(picture, REVERSE_BAND)
  const barWidth = picture.width / COLOUR_BARS.length

  return COLOUR_BARS.map((_, i) => {
    const bar = COLOUR_BARS[COLOUR_BARS.length - 1 - i]
    return {
      id: `colour-bar-${bar.name}`,
      role: 'colour-bar' as const,
      kind: 'rect' as const,
      x: picture.x + i * barWidth,
      y,
      width: barWidth,
      height,
      fill: bar.fill,
    }
  })
}

/**
 * PLUGE: a run of patches a couple of percent apart at the bottom of the
 * scale, centred on the axis. Set the black level so the first pair vanish
 * into the surround and the rest stay just visible, and the picture is right.
 */
function plugeRun(picture: Picture, centre: { x: number; y: number }): RectShape[] {
  const { y, height } = band(picture, REFERENCE_BAND)
  const runWidth = picture.width * PLUGE_RUN_FRACTION
  const patchWidth = runWidth / PLUGE_STEPS
  const left = centre.x - runWidth / 2

  return Array.from({ length: PLUGE_STEPS }, (_, i) => ({
    id: `pluge-${i}`,
    role: 'pluge' as const,
    kind: 'rect' as const,
    x: left + i * patchWidth,
    y,
    width: patchWidth,
    height,
    fill: greyLevel(i * PLUGE_RISE),
  }))
}

/** Peak white and full black, one either side of the PLUGE, for the two ends of the scale. */
function referencePatches(picture: Picture): RectShape[] {
  const { y, height } = band(picture, REFERENCE_BAND)
  const patchWidth = picture.width * REFERENCE_WIDTH_FRACTION
  const inset = picture.width * REFERENCE_INSET_FRACTION
  const right = picture.x + picture.width - inset - patchWidth

  return [
    {
      id: 'reference-white',
      role: 'greyscale-step',
      kind: 'rect',
      x: picture.x + inset,
      y,
      width: patchWidth,
      height,
      fill: greyLevel(1),
    },
    {
      id: 'reference-black',
      role: 'greyscale-step',
      kind: 'rect',
      x: right,
      y,
      width: patchWidth,
      height,
      fill: greyLevel(0),
    },
  ]
}
