import { useSurfaceIds } from './surfaceIds'

/** Which way the grain runs, or the light falls. */
export type Axis = 'horizontal' | 'vertical'

/**
 * Teak as it photographs: brown, not orange. Every one of these is far more
 * desaturated than the colour people reach for when they mean "wood", which
 * is most of why gradient cabinets look like toffee.
 */
const TONES = {
  face: ['#8a6038', '#b08553', '#c39a67', '#a87b49', '#845a33'],
  /* The control column is the far end of the same board, and in its shadow. */
  column: ['#7d5632', '#a3794b', '#b58c5e', '#9a7043', '#77502e'],
  top: ['#96693d', '#bd9059', '#cfa370', '#b2854f', '#8e6339'],
  leg: ['#7a5430', '#a07648', '#b1885a', '#946c40', '#734d2c'],
} as const

export type WoodTone = keyof typeof TONES

/*
  The brightest band sits left of centre, not in the middle: the light in this
  room comes from the upper left, and every highlight on the set — knob, keys,
  bezel, legs — is lit from the same place. Nothing gives a render away faster
  than two surfaces lit from two directions.
*/
const STOP_AT = [0, 0.18, 0.38, 0.72, 1]

/**
 * Grain frequencies, in CSS pixels. Fine across the grain, coarse along it:
 * one veneer line every ~6px, running unbroken for ~100px. Turbulence at a
 * single frequency gives an even hairy field that reads as brushed metal; the
 * gamma transfer below is what separates it into lines with clear wood
 * between them.
 */
const ALONG = 0.01
const ACROSS = 0.16
const FIGURE_ALONG = 0.0035
const FIGURE_ACROSS = 0.02
const PORE_ALONG = 0.02
const PORE_ACROSS = 0.9

/** `baseFrequency`, written along-then-across for the axis the grain runs on. */
const byAxis = (axis: Axis, along: number, across: number) =>
  axis === 'horizontal' ? `${along} ${across}` : `${across} ${along}`

export interface WoodSurfaceProps {
  className?: string
  /** Which way the grain runs on this face. */
  grain: Axis
  /** Which way the light falls across it. */
  shade: Axis
  /** Boards cut from different parts of the log. */
  seed: number
  tone?: WoodTone
}

/**
 * A sheet of teak veneer, drawn rather than faked: turbulence stretched hard
 * along one axis for the grain, a slower turbulence under it for the figure,
 * and a fine one over the top for the pores. It fills whatever box it is
 * given, and because it carries no `viewBox` the grain stays the same size in
 * pixels however big that box is — veneer does not scale with the cabinet.
 */
export function WoodSurface({ className, grain, shade, seed, tone = 'face' }: WoodSurfaceProps) {
  const { id, url } = useSurfaceIds()
  const stops = TONES[tone]
  const across =
    shade === 'horizontal'
      ? { x1: '0', y1: '0', x2: '1', y2: '0' }
      : { x1: '0', y1: '0', x2: '0', y2: '1' }

  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id('face')} {...across}>
          {stops.map((colour, index) => (
            <stop key={colour} offset={STOP_AT[index]} stopColor={colour} />
          ))}
        </linearGradient>

        <filter
          id={id('grain')}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {/*
            Every layer takes its opacity from the turbulence's *alpha*
            channel, never from R. Alpha survives the premultiplied round trip
            a colour matrix does on its input; a colour channel read out of a
            nearly transparent pixel does not.
          */}

          {/* Figure: the broad darker flame where the cut crossed the grain. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={byAxis(grain, FIGURE_ALONG, FIGURE_ACROSS)}
            numOctaves={2}
            seed={seed + 7}
            result="figure"
          />
          <feColorMatrix
            in="figure"
            type="matrix"
            values="0 0 0 0 0.5  0 0 0 0 0.34  0 0 0 0 0.17  0 0 0 1.7 -0.85"
            result="figureInk"
          />
          <feComponentTransfer in="figureInk" result="figureSoft">
            <feFuncA type="linear" slope="0.55" />
          </feComponentTransfer>
          <feBlend in="figureSoft" in2="SourceGraphic" mode="multiply" result="figured" />

          {/* The grain itself. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={byAxis(grain, ALONG, ACROSS)}
            numOctaves={2}
            seed={seed}
            result="lines"
          />
          {/*
            A gamma of 4 is the whole trick: it crushes the middle of the
            noise to nothing and leaves only its peaks, so the panel gets
            separated dark lines over clear wood instead of an even fur.
          */}
          <feColorMatrix
            in="lines"
            type="matrix"
            values="0 0 0 0 0.42  0 0 0 0 0.26  0 0 0 0 0.12  0 0 0 1 0"
            result="linesInk"
          />
          <feComponentTransfer in="linesInk" result="linesDark">
            <feFuncA type="gamma" exponent="4" amplitude="1" offset="0" />
          </feComponentTransfer>
          <feBlend in="linesDark" in2="figured" mode="multiply" result="grained" />

          {/* The pale side of the same grain, from the same field inverted. */}
          <feColorMatrix
            in="lines"
            type="matrix"
            values="0 0 0 0 0.81  0 0 0 0 0.66  0 0 0 0 0.48  0 0 0 -1 1"
            result="highInk"
          />
          <feComponentTransfer in="highInk" result="linesLight">
            <feFuncA type="gamma" exponent="4" amplitude="0.55" offset="0" />
          </feComponentTransfer>
          <feBlend in="linesLight" in2="grained" mode="screen" result="lit" />

          {/* Pores: the open texture teak keeps even under lacquer. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={byAxis(grain, PORE_ALONG, PORE_ACROSS)}
            numOctaves={2}
            seed={seed + 3}
            result="pore"
          />
          <feColorMatrix
            in="pore"
            type="matrix"
            values="0 0 0 0 0.45  0 0 0 0 0.45  0 0 0 0 0.45  0 0 0 1 -0.45"
            result="poreInk"
          />
          <feComponentTransfer in="poreInk" result="poreSoft">
            <feFuncA type="linear" slope="0.1" />
          </feComponentTransfer>
          <feBlend in="poreSoft" in2="lit" mode="multiply" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill={url('face')} filter={url('grain')} />
    </svg>
  )
}

/**
 * Linishing frequencies, in CSS pixels. The belt leaves a far finer and far
 * straighter mark than a saw leaves in timber: a striation every pixel or so,
 * running unbroken for several hundred. That ratio — roughly 200:1, against
 * the veneer's 16:1 — is most of what separates satin metal from brushed wood
 * at a glance.
 */
const LINISH_ALONG = 0.0045
const LINISH_ACROSS = 1.1
/** The belt does not bear evenly: a slow cloudiness under the striations. */
const BELT_ALONG = 0.0015
const BELT_ACROSS = 0.05

/**
 * Aluminium, as a fascia plate photographs under room light: a narrow spread
 * of warm greys. Chrome is the temptation here and it is always wrong —
 * chrome is a mirror, so it reflects the room and runs near-white to
 * near-black; linished aluminium scatters, so it never leaves the middle.
 */
const PLATE = ['#d2cfc8', '#c3bfb8', '#b2aea6', '#a5a199'] as const
const PLATE_AT = [0, 0.3, 0.72, 1]

export interface MetalSurfaceProps {
  className?: string
  /** Which way the belt ran. */
  grain: Axis
  /** Which way the sheen falls across it. */
  shade: Axis
  /** Two plates off the same sheet still differ. */
  seed: number
}

/**
 * A linished silver plate, drawn the same way the veneer is: turbulence
 * stretched hard along one axis, over a shallow gradient for the sheen. It
 * carries no `viewBox`, so the striations stay the same size in pixels
 * whatever the plate is asked to fill — linishing does not scale with the
 * panel any more than veneer does.
 */
export function MetalSurface({ className, grain, shade, seed }: MetalSurfaceProps) {
  const { id, url } = useSurfaceIds()
  const across =
    shade === 'horizontal'
      ? { x1: '0', y1: '0', x2: '1', y2: '0' }
      : { x1: '0', y1: '0', x2: '0', y2: '1' }

  return (
    <svg className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id('sheen')} {...across}>
          {PLATE.map((colour, index) => (
            <stop key={colour} offset={PLATE_AT[index]} stopColor={colour} />
          ))}
        </linearGradient>

        <filter
          id={id('linish')}
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          {/*
            Alpha, not R, for the same reason the veneer uses it: a colour
            channel read back out of a nearly transparent pixel has already
            been through a premultiplied round trip and is not what was
            written into it.
          */}

          {/* The striations: the bright side, screened on. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={byAxis(grain, LINISH_ALONG, LINISH_ACROSS)}
            numOctaves={1}
            seed={seed}
            result="linish"
          />
          <feColorMatrix
            in="linish"
            type="matrix"
            values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 0.99  0 0 0 0.4 -0.2"
            result="bright"
          />
          <feBlend in="bright" in2="SourceGraphic" mode="screen" result="lit" />

          {/*
            And the dull side, from the same field inverted, so a striation
            that catches the light has its own shadow beside it. No gamma
            here: the point of a satin finish is that it has no peaks.
          */}
          <feColorMatrix
            in="linish"
            type="matrix"
            values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.51  0 0 0 -0.4 0.2"
            result="dull"
          />
          <feBlend in="dull" in2="lit" mode="multiply" result="brushed" />

          {/* The slow unevenness of the belt, across the striations. */}
          <feTurbulence
            type="fractalNoise"
            baseFrequency={byAxis(grain, BELT_ALONG, BELT_ACROSS)}
            numOctaves={2}
            seed={seed + 5}
            result="belt"
          />
          <feColorMatrix
            in="belt"
            type="matrix"
            values="0 0 0 0 0.55  0 0 0 0 0.55  0 0 0 0 0.56  0 0 0 1 -0.5"
            result="beltInk"
          />
          <feComponentTransfer in="beltInk" result="beltSoft">
            <feFuncA type="linear" slope="0.22" />
          </feComponentTransfer>
          <feBlend in="beltSoft" in2="brushed" mode="multiply" />
        </filter>
      </defs>
      <rect width="100%" height="100%" fill={url('sheen')} filter={url('linish')} />
    </svg>
  )
}
