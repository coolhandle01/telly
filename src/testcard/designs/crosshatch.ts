import {
  DEFAULTS,
  captionBox,
  clockBox,
  type Picture,
} from '../primitives'
import { PALETTE, greyLevel } from '../palette'
import type { CircleShape, LineShape, Shape, TestCardModel, TestCardSpec } from '../model'

/**
 * The crosshatch: white lines on black, a regular grid of squares over the
 * whole picture, a circle inscribed in it, and a dot at every crossing. The
 * card for lining up convergence and for seeing at a glance whether the
 * picture is stretched, which is why it carries nothing else.
 *
 * Pure: a spec of plain values in, a plain-data model out.
 */

/** Cells across the picture on the full card, and on the calmer interlude. */
export const CROSSHATCH_COLUMNS = 16
export const INTERLUDE_COLUMNS = CROSSHATCH_COLUMNS / 2

/** A thin surround, so the picture reads as a framed raster rather than a page. */
export const BORDER_FRACTION = 0.015

/** Dot radius, as a fraction of a cell's width. */
export const DOT_RADIUS_FRACTION = 0.06

export const GRID_STROKE_WIDTH = 2
export const CIRCLE_STROKE_WIDTH = 3

export interface Grid {
  columns: number
  rows: number
  cellWidth: number
  cellHeight: number
}

/**
 * The grid for a picture: `columns` cells across, and as many rows as it takes
 * to come out square.
 *
 * Two properties are wanted and only one of them can be exact on an arbitrary
 * picture: that the grid spans the picture exactly, and that a cell is square.
 * Spanning wins (a grid that stops short of the edge is visibly wrong, where a
 * cell a fraction of a per cent off square is not) so the row count is chosen
 * to make the cell as square as the picture allows and the cell height then
 * divides what is actually there. On a 4:3 picture at sixteen columns both come
 * out exact.
 */
export function crosshatchGrid(picture: Picture, columns: number): Grid {
  if (!Number.isInteger(columns) || columns < 2) {
    throw new RangeError(`a crosshatch needs at least two whole columns; got ${columns}`)
  }

  const cellWidth = picture.width / columns
  const rows = Math.max(1, Math.round(picture.height / cellWidth))
  return { columns, rows, cellWidth, cellHeight: picture.height / rows }
}

/** The grid itself: every line spans the picture edge to edge. */
function gridLines(picture: Picture, grid: Grid): LineShape[] {
  const columns: LineShape[] = Array.from({ length: grid.columns + 1 }, (_, i) => ({
    id: `grid-column-${i}`,
    role: 'grid-line',
    kind: 'line',
    x1: picture.x + i * grid.cellWidth,
    y1: picture.y,
    x2: picture.x + i * grid.cellWidth,
    y2: picture.y + picture.height,
    stroke: PALETTE.ink,
    strokeWidth: GRID_STROKE_WIDTH,
  }))
  const rows: LineShape[] = Array.from({ length: grid.rows + 1 }, (_, j) => ({
    id: `grid-row-${j}`,
    role: 'grid-line',
    kind: 'line',
    x1: picture.x,
    y1: picture.y + j * grid.cellHeight,
    x2: picture.x + picture.width,
    y2: picture.y + j * grid.cellHeight,
    stroke: PALETTE.ink,
    strokeWidth: GRID_STROKE_WIDTH,
  }))
  return [...columns, ...rows]
}

/**
 * A dot at every crossing, which means the interior ones. On the picture edge
 * two lines meet but do not cross, and a dot there would be half off the
 * raster anyway.
 */
function intersectionDots(picture: Picture, grid: Grid): CircleShape[] {
  const radius = grid.cellWidth * DOT_RADIUS_FRACTION

  return Array.from({ length: grid.columns - 1 }, (_, i) =>
    Array.from({ length: grid.rows - 1 }, (_, j): CircleShape => ({
      id: `grid-dot-${i + 1}-${j + 1}`,
      role: 'convergence-inner-circle',
      kind: 'circle',
      cx: picture.x + (i + 1) * grid.cellWidth,
      cy: picture.y + (j + 1) * grid.cellHeight,
      r: radius,
      fill: PALETTE.ink,
    })),
  ).flat()
}

/** The geometry circle, inscribed in the picture: it touches the nearer edges. */
function geometryCircle(picture: Picture, centre: { x: number; y: number }): CircleShape {
  return {
    id: 'geometry-circle',
    role: 'convergence-circle',
    kind: 'circle',
    cx: centre.x,
    cy: centre.y,
    r: Math.min(picture.width, picture.height) / 2,
    fill: 'none',
    stroke: PALETTE.ink,
    strokeWidth: CIRCLE_STROKE_WIDTH,
  }
}

export function buildCrosshatchCard(spec: TestCardSpec): TestCardModel {
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
  // The interlude is the same grid at half the density: a convergence pattern
  // under a programme junction should be legible, not busy.
  const grid = crosshatchGrid(
    picture,
    spec.variant === 'closedown' ? CROSSHATCH_COLUMNS : INTERLUDE_COLUMNS,
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
    {
      id: 'picture',
      role: 'picture',
      kind: 'rect',
      ...picture,
      // Truly black: every other ink on this card is judged against it.
      fill: greyLevel(0),
      stroke: PALETTE.frame,
      strokeWidth: Math.max(1, Math.round(border / 8)),
    },
    ...gridLines(picture, grid),
    ...(spec.variant === 'closedown' ? intersectionDots(picture, grid) : []),
    geometryCircle(picture, centre),
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
