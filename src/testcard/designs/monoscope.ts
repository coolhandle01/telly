import {
  BORDER_FRACTION,
  DEFAULTS,
  GRATING_GUTTER,
  band,
  barsForFrequency,
  captionBox,
  castellations,
  clockBox,
  gratings,
  greyscaleWedge,
  type Picture,
} from '../primitives'
import { PALETTE } from '../palette'
import type {
  CircleShape,
  LineShape,
  RectShape,
  Shape,
  TestCardModel,
  TestCardSpec,
} from '../model'

/**
 * The monoscope: a resolution chart in the 405-line idiom, and monochrome on
 * purpose. A Siemens star on the centre for resolving power, concentric
 * circles for geometry, gratings of rising frequency across and down for
 * horizontal and vertical resolution, and a greyscale wedge for the transfer
 * characteristic. No colour anywhere — a monoscope that needed a colour set to
 * read would not be a monoscope.
 *
 * Pure: a spec of plain values in, a plain-data model out.
 */

const TAU = Math.PI * 2

/**
 * Wedges in the star. Even, so light and dark still alternate where the last
 * wedge meets the first.
 *
 * Half of it is odd (`N % 4 === 2`) for a second reason: reflection in the
 * vertical axis maps wedge `i` onto wedge `N / 2 - 1 - i`, and only when
 * `N / 2` is odd do those two share a parity — that is, the same ink. At
 * `N = 24` the star would be symmetric in geometry but not in colour.
 */
export const STAR_WEDGES = 22

/** Star radius, as a fraction of the picture height. */
export const STAR_RADIUS_FRACTION = 0.14

/**
 * The concentric circles, as fractions of the picture height. The first is the
 * hub that caps the star's convergence point; the second is the star's own rim.
 */
export const RING_RADIUS_FRACTIONS = [0.02, STAR_RADIUS_FRACTION, 0.225, 0.31] as const

/** The band the flanking vertical-resolution columns are stacked in. */
export const VERTICAL_GRATING_BAND = [0.34, 0.62] as const

/** A flank column's width, and its centre line, as fractions of picture width. */
export const VERTICAL_GRATING_WIDTH_FRACTION = 0.12
export const VERTICAL_GRATING_CENTRE_FRACTION = 0.126

export interface StarWedge {
  index: number
  /** Angles in radians, clockwise from three o'clock in screen coordinates. */
  start: number
  end: number
  bisector: number
  /** Wedges alternate; the even-indexed ones are the dark half. */
  dark: boolean
}

/**
 * The angles of a Siemens star: `count` wedges of equal angle tiling the whole
 * turn, alternating dark and light.
 *
 * The star is the one piece of real geometry on the card, so it is arithmetic
 * in its own function rather than a loop buried in a builder — the wedges can
 * then be proved equal, gapless and alternating without drawing anything.
 */
export function siemensStarWedges(count: number): StarWedge[] {
  if (!Number.isInteger(count) || count < 4 || count % 2 !== 0) {
    throw new RangeError(
      `a Siemens star needs an even, whole number of wedges, at least four; got ${count}`,
    )
  }

  const span = TAU / count
  return Array.from({ length: count }, (_, index) => ({
    index,
    start: index * span,
    end: (index + 1) * span,
    bisector: (index + 0.5) * span,
    dark: index % 2 === 0,
  }))
}

/**
 * The star itself: one stroke per wedge, laid along the wedge's bisector and
 * weighted so that neighbouring wedges meet at the rim. Inside that the strokes
 * overprint, which is the point of the thing — the radius at which the wedges
 * stop resolving is the measurement.
 */
function siemensStar(centre: { x: number; y: number }, radius: number): LineShape[] {
  const strokeWidth = (Math.PI * radius) / STAR_WEDGES

  return siemensStarWedges(STAR_WEDGES).map((wedge) => ({
    id: `star-wedge-${wedge.index}`,
    role: 'star-segment',
    kind: 'line',
    x1: centre.x,
    y1: centre.y,
    x2: centre.x + radius * Math.cos(wedge.bisector),
    y2: centre.y + radius * Math.sin(wedge.bisector),
    stroke: wedge.dark ? PALETTE.gratingDark : PALETTE.ink,
    strokeWidth,
  }))
}

/** Concentric circles on the centre: geometry, and the star's own rim. */
function concentricRings(picture: Picture, centre: { x: number; y: number }): CircleShape[] {
  return RING_RADIUS_FRACTIONS.map((fraction, i) => ({
    id: `ring-${i}`,
    role: 'ring',
    kind: 'circle',
    cx: centre.x,
    cy: centre.y,
    r: picture.height * fraction,
    // The hub is filled, to cap the point where the wedges overprint.
    fill: i === 0 ? PALETTE.gratingDark : 'none',
    stroke: PALETTE.ink,
    strokeWidth: i === 0 ? 2 : 3,
  }))
}

/**
 * The vertical-resolution gratings: patches of horizontal bars, stacked low
 * frequency to high, in a column on each flank of the star.
 *
 * The columns are identical and placed by reflection about the card's vertical
 * axis, so their symmetry is a property of the construction rather than of two
 * hand-written copies that can drift.
 */
function verticalGratings(
  picture: Picture,
  centre: { x: number; y: number },
  frequencies: number[],
): Shape[] {
  const { y, height } = band(picture, VERTICAL_GRATING_BAND)
  const patchWidth = picture.width * VERTICAL_GRATING_WIDTH_FRACTION
  const slot = height / frequencies.length
  const gutter = slot * GRATING_GUTTER
  const patchHeight = slot - gutter
  const leftX = picture.x + picture.width * VERTICAL_GRATING_CENTRE_FRACTION - patchWidth / 2

  const column = (side: 'l' | 'r', x: number): Shape[] =>
    frequencies.flatMap((frequency, i): Shape[] => {
      const frameId = `vgrating-frame-${side}${frequency}`
      const patchY = y + i * slot + gutter / 2
      const frame: RectShape = {
        id: frameId,
        role: 'grating-frame',
        kind: 'rect',
        x,
        y: patchY,
        width: patchWidth,
        height: patchHeight,
        fill: PALETTE.gratingDark,
        stroke: PALETTE.frame,
        strokeWidth: 1,
      }
      const count = barsForFrequency(frequency)
      const barHeight = patchHeight / count
      const bars: RectShape[] = Array.from({ length: count }, (_, j) => ({
        id: `${frameId}-${j}`,
        role: 'grating-bar' as const,
        kind: 'rect' as const,
        x,
        y: patchY + j * barHeight,
        width: patchWidth,
        height: barHeight,
        fill: j % 2 === 0 ? PALETTE.gratingLight : PALETTE.gratingDark,
      }))
      return [frame, ...bars]
    })

  return [
    ...column('l', leftX),
    ...column('r', 2 * centre.x - leftX - patchWidth),
  ]
}

export function buildMonoscopeCard(spec: TestCardSpec): TestCardModel {
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
  const frequencies = spec.gratingFrequencies ?? [...DEFAULTS.gratingFrequencies]

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
    // out: the star and its circles stay, because they are the card.
    ...(spec.variant === 'closedown'
      ? [
          ...gratings(picture, frequencies),
          ...verticalGratings(picture, centre, frequencies),
          ...greyscaleWedge(picture, spec.greyscaleSteps ?? DEFAULTS.greyscaleSteps),
        ]
      : []),
    // Star and circles last of the furniture, so the geometry circles read
    // continuously over any band they cross.
    ...siemensStar(centre, picture.height * STAR_RADIUS_FRACTION),
    ...concentricRings(picture, centre),
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
