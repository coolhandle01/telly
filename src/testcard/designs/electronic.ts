import {
  DEFAULTS,
  captionBox,
  cardFrame,
  castellatedFrame,
  clockBox,
  colourBars,
  convergence,
  gratings,
  greyscaleWedge,
  resolutionWedges,
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
  const frame = cardFrame(spec)
  const { width, height, picture, centre } = frame

  const shapes: Shape[] = [
    ...castellatedFrame(frame, spec, PALETTE.picture),
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
