import {
  BORDER_FRACTION,
  DEFAULTS,
  captionBox,
  castellations,
  clockBox,
  colourBars,
  convergence,
  gratings,
  greyscaleWedge,
  resolutionWedges,
  type Picture,
} from '../primitives'
import { PALETTE } from '../palette'
import type { Shape, TestCardModel, TestCardSpec } from '../model'

/**
 * The electronic line-up chart: castellations, gratings, colour bars, a
 * greyscale wedge, corner resolution wedges and a convergence target. The
 * card most people picture when they picture a test card.
 *
 * Pure: a spec of plain values in, a plain-data model out.
 */
export function buildElectronicCard(spec: TestCardSpec): TestCardModel {
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
    // out: a short gap between programmes does not need a line-up chart.
    ...(spec.variant === 'closedown'
      ? [
          ...gratings(picture, spec.gratingFrequencies ?? [...DEFAULTS.gratingFrequencies]),
          ...colourBars(picture),
          ...greyscaleWedge(picture, spec.greyscaleSteps ?? DEFAULTS.greyscaleSteps),
          ...resolutionWedges(picture, width),
        ]
      : []),
    ...convergence(picture, centre),
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
