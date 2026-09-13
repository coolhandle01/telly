// A plain-data description of the card. No DOM, no SVG strings, no React —
// just numbers and colours, so the whole of the card's geometry is provable in
// a test that mounts nothing.

/** What a shape is *for*. Tests and the renderer both select on this. */
export type ShapeRole =
  | 'background'
  | 'picture'
  | 'castellation'
  | 'colour-bar'
  | 'greyscale-step'
  | 'grating-frame'
  | 'grating-bar'
  | 'resolution-wedge-frame'
  | 'resolution-wedge-line'
  | 'convergence-circle'
  | 'convergence-inner-circle'
  | 'crosshair'
  | 'caption-box'
  | 'caption-channel'
  | 'caption-date'
  | 'caption-message'
  | 'clock-box'
  | 'clock-time'
  // Vocabulary for the other designs in the rotation. Kept here so a new card
  // is a new file rather than an edit to the shared model.
  | 'pluge'
  | 'bar-tall'
  | 'grid-line'
  | 'ring'
  | 'star-segment'
  | 'ident-mark'
  // The fault card. Not a test card: a test card is a signal a working
  // station transmits on purpose, and this is the station saying it cannot.
  | 'alert-block'
  | 'alert-rule'
  | 'alert-heading'
  | 'alert-detail'
  | 'alert-code'

export interface ShapeBase {
  id: string
  role: ShapeRole
}

export interface RectShape extends ShapeBase {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke?: string
  strokeWidth?: number
}

export interface CircleShape extends ShapeBase {
  kind: 'circle'
  cx: number
  cy: number
  r: number
  fill: string
  stroke?: string
  strokeWidth?: number
}

export interface LineShape extends ShapeBase {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
}

export interface TextShape extends ShapeBase {
  kind: 'text'
  x: number
  y: number
  text: string
  fill: string
  fontSize: number
  anchor: 'start' | 'middle' | 'end'
  letterSpacing?: number
}

export type Shape = RectShape | CircleShape | LineShape | TextShape

export type TestCardVariant = 'closedown' | 'interlude'

/**
 * Which card. The channel rotates through them a day at a time; a spec may
 * also name one outright, which is what the tests do.
 */
export type CardDesignId =
  | 'electronic'
  | 'bars'
  | 'monoscope'
  | 'crosshatch'
  | 'ident'
  /** Never in the rotation. Shown when the set cannot provide a service. */
  | 'fault'

export interface TestCardSpec {
  design?: CardDesignId
  /**
   * The cards this station puts up, in rotation order. Each station has its
   * own few, so tuning around looks different as well as sounding different.
   */
  rotation?: readonly CardDesignId[]
  variant: TestCardVariant
  /** The instant the card is drawn for. Injected — nothing calls `new Date()`. */
  now: Date
  /** Channel name for the caption box. */
  channelName: string
  /** Closedown only: the time service resumes, used for the service message. */
  resumesAt?: Date
  /** Overrides the derived service message. */
  message?: string
  /** Fault card only: the short code printed at the foot of it. */
  faultCode?: string
  /** Fault card only: the lines of the announcement, one per line. */
  faultDetail?: readonly string[]
  width?: number
  height?: number
  /** Blocks along the top and bottom castellated edges. Odd, for mirror symmetry. */
  castellationsAcross?: number
  /** Blocks down the left and right castellated edges. Odd, for mirror symmetry. */
  castellationsDown?: number
  /** Steps in the greyscale wedge, black through white inclusive. */
  greyscaleSteps?: number
  /**
   * Grating frequencies, low to high. Mirrored about the vertical axis, so the
   * rendered row is `[...reversed, ...frequencies]`.
   */
  gratingFrequencies?: number[]
}

export interface TestCardModel {
  variant: TestCardVariant
  width: number
  height: number
  /** The geometric centre — what the convergence circle and crosshair sit on. */
  centre: { x: number; y: number }
  /** The framed area inside the castellated border. */
  picture: { x: number; y: number; width: number; height: number }
  background: string
  shapes: Shape[]
}

/** Every shape carrying one of the given roles, in draw order. */
export function shapesOfRole(model: TestCardModel, ...roles: ShapeRole[]): Shape[] {
  return model.shapes.filter((shape) => roles.includes(shape.role))
}
