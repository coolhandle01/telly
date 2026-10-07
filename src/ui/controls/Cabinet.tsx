import type { ReactNode } from 'react'
import { useSurfaceIds } from './surfaceIds'
import { WoodSurface } from './surfaces'
import './Cabinet.css'

export interface CabinetProps {
  /** The picture: a 4:3 screen. It is rounded off into the bezel for you. */
  children: ReactNode
  /** The fascia, normally a `<ControlPanel />`. */
  controls: ReactNode
  /** Four tapered legs, as the console set came on. Default true. */
  legs?: boolean
}

/*
  Two, because the set is drawn as a flat elevation and nothing else in it has
  perspective. Head-on, the back pair stand directly behind the front pair and
  cannot be seen. Four in a row at the same size is a child's drawing of a
  horse: it says "this object has four legs" rather than showing what is there.
*/
const LEGS = ['near-left', 'near-right']

/**
 * The moulded plastic surround. A sheen along the top where the light rolls
 * off the moulding, matte below, and the trim line drawn as a stroke with a
 * metal gradient down it rather than a flat white rule — a brushed edge is
 * never one value.
 */
function Bezel() {
  const { id, url } = useSurfaceIds()
  return (
    <svg className="tv-cabinet__bezel" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id('mould')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#23262a" />
          <stop offset="0.12" stopColor="#14161a" />
          <stop offset="0.6" stopColor="#0a0b0d" />
          <stop offset="1" stopColor="#101114" />
        </linearGradient>
        <linearGradient id={id('gloss')} x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0" stopColor="#c8d3de" stopOpacity="0.26" />
          <stop offset="0.05" stopColor="#c8d3de" stopOpacity="0.08" />
          <stop offset="0.14" stopColor="#c8d3de" stopOpacity="0" />
        </linearGradient>
        {/* Brushed aluminium: bright, dull, bright again down its length. */}
        <linearGradient id={id('trim')} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#f1f0ea" />
          <stop offset="0.16" stopColor="#b5b3ac" />
          <stop offset="0.33" stopColor="#e9e8e2" />
          <stop offset="0.52" stopColor="#8b8983" />
          <stop offset="0.74" stopColor="#d4d2cb" />
          <stop offset="1" stopColor="#77756f" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" rx="9%" ry="11%" fill={url('mould')} />
      <rect width="100%" height="100%" rx="9%" ry="11%" fill={url('gloss')} />
      {/*
        Both strokes straddle the edge, so the outer half of each is clipped
        away by the viewport and what is left is a hairline hugging the rim:
        the dark seating line first, the metal over it.
      */}
      <rect
        width="100%"
        height="100%"
        rx="9%"
        ry="11%"
        fill="none"
        stroke="#000"
        strokeOpacity="0.8"
        strokeWidth="7"
      />
      <rect
        width="100%"
        height="100%"
        rx="9%"
        ry="11%"
        fill="none"
        stroke={url('trim')}
        strokeWidth="2.4"
      />
    </svg>
  )
}

/** The curved glass over the tube: one off-axis sheen and a soft vignette. */
function Glass() {
  const { id, url } = useSurfaceIds()
  return (
    <svg
      className="tv-cabinet__sheen"
      viewBox="0 0 100 75"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={id('vignette')} cx="0.5" cy="0.42" r="0.78">
          <stop offset="0.5" stopColor="#000000" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id={id('window')} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#d5e3f2" stopOpacity="0.16" />
          <stop offset="1" stopColor="#d5e3f2" stopOpacity="0.02" />
        </linearGradient>
        <filter id={id('soften')} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      <rect width="100" height="75" fill={url('vignette')} />
      {/* The window reflected off-axis, falling across the top-left corner. */}
      <path d="M0 0 L41 0 L12 75 L0 75 Z" fill={url('window')} filter={url('soften')} />
    </svg>
  )
}

/**
 * The cabinet the set is built into: teak veneer with the grain turned to
 * suit each face, a bulged CRT well in a moulded surround, the control column
 * down the right and a cream lip along the bottom — on four tapered legs.
 * Pure scenery: it holds a picture and a fascia and has no behaviour of its
 * own, which is why none of it appears in the accessibility tree.
 */
export function Cabinet({ children, controls, legs = true }: CabinetProps) {
  return (
    <div>
      <div className="tv-cabinet">
        <WoodSurface
          className="tv-cabinet__veneer"
          grain="horizontal"
          shade="horizontal"
          seed={19}
        />
        <div className="tv-cabinet__top" aria-hidden="true">
          <WoodSurface
            className="tv-cabinet__top-veneer"
            grain="vertical"
            shade="vertical"
            seed={41}
            tone="top"
          />
        </div>
        <div className="tv-cabinet__body">
          <div className="tv-cabinet__well">
            <Bezel />
            {children}
            <div className="tv-cabinet__glass" aria-hidden="true">
              <Glass />
            </div>
          </div>
          {controls}
        </div>
        <div className="tv-cabinet__lip" aria-hidden="true" />
      </div>
      {legs ? (
        <div className="tv-cabinet__legs" aria-hidden="true">
          {LEGS.map((leg, index) => (
            <span className="tv-cabinet__leg" key={leg}>
              <span className="tv-cabinet__leg-wood">
                <WoodSurface
                  className="tv-cabinet__leg-veneer"
                  grain="vertical"
                  shade="horizontal"
                  seed={61 + index * 5}
                  tone="leg"
                />
              </span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
