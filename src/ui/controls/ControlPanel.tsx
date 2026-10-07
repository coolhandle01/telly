import './type.css'
import './ControlPanel.css'
import type { ReactNode } from 'react'
import { Knob } from './Knob'
import { useRotary } from './useRotary'
import { PushButton } from './PushButton'
import { useSurfaceIds } from './surfaceIds'
import { MetalSurface, WoodSurface } from './surfaces'

export interface ControlPanelProps {
  on: boolean
  onToggleOn: () => void
  volume: number
  onVolumeChange: (value: number) => void
  /** Which preset is in. There is always exactly one. */
  channel: number
  onChannelChange: (channel: number) => void
  /**
   * Lights the amber lamp. A 1975 fascia has no words on it — anything that
   * needs explaining belongs outside the cabinet, not stamped into it.
   */
  faulted?: boolean
  /** Lights the green lamp: the set has a source of programmes. */
  signedIn?: boolean
  /**
   * The five trimmers behind the preset flap, by what each one adjusts.
   *
   * A trimmer is live only when it is in this map: give it one and it becomes
   * a real control with a tab stop, leave it out and it stays a drawing. A
   * control a viewer can reach and that adjusts nothing is worse than a
   * picture of one, and the fascia has no way of knowing which of them this
   * particular set has wired up.
   */
  trimmers?: Partial<Record<TrimmerId, TrimmerControl>>
}

export type TrimmerId = 'vertical' | 'horizontal' | 'brightness' | 'colour' | 'tuning'

export interface TrimmerControl {
  /** 0..1, mid-travel as transmitted. */
  value: number
  onChange: (value: number) => void
}

/**
 * The channel presets. Five carry a station each; the sixth was never
 * allocated and shows what an empty preset showed, snow. The second number is
 * how worn each cap is, because nobody ever pressed 6.
 */
const PRESETS: readonly [number, number][] = [
  [1, 0.22],
  [2, 0.18],
  [3, 0.13],
  [4, 0.09],
  [5, 0.06],
  [6, 0.04],
]

/**
 * The tuning adjusters. On a G8-chassis set the six presets hinged open to
 * expose these, and they are not buttons at all: they are small slotted
 * trimmers, set once by the engineer and then left alone. The angle is where
 * each one was left: vertical, horizontal, brightness, colour, tuning. They
 * are all in different places because nobody ever set five trimmers to
 * the same mark.
 */
interface Trimmer {
  readonly legend: string
  readonly id: TrimmerId
  readonly name: string
  /** Where an unwired one was left. A live one takes its angle from its value. */
  readonly deg: number
}

const TRIMMERS: readonly Trimmer[] = [
  { legend: 'V', id: 'vertical', name: 'Vertical hold', deg: -38 },
  { legend: 'H', id: 'horizontal', name: 'Horizontal hold', deg: 14 },
  { legend: 'B', id: 'brightness', name: 'Brightness', deg: -9 },
  { legend: 'C', id: 'colour', name: 'Colour', deg: 61 },
  { legend: 'T', id: 'tuning', name: 'Tuning', deg: 27 },
]

/**
 * A slotted trimmer turns through about three-quarters of a circle between its
 * stops, like every other rotary control on the set. Mid-travel is straight
 * up, which is where both holds lock.
 */
const TRIM_SWEEP_DEG = 270
/** Mid-travel, straight up: where a trimmer sits when it is set. */
const TRIM_CENTRE = 0.5
const trimAngle = (value: number): number => (value - TRIM_CENTRE) * TRIM_SWEEP_DEG

/** The preset cap, in its own units: square, with generous corners. */
const CAP_W = 86
const CAP_H = 100
const CAP_R = 22

/** Flutes milled round a trimmer, and the radius they are cut at. */
const MILL = 14
const MILL_R = 39
/** One light flute and one dark one per period, all the way round. */
const MILL_DASH = (2 * Math.PI * MILL_R) / MILL / 2

/**
 * The fascia: the tall control column down the right-hand side of a wooden
 * console set — a linished silver plate let into teak veneer, which is what
 * a Philips colour set of 1972–76 actually wore. Everything that works is a
 * real control; the presets are a preset bank, and an unwired trimmer, the
 * badge and the lamps are cabinetry, hidden from the accessibility tree so
 * nobody tabs into furniture.
 */
export function ControlPanel({
  on,
  onToggleOn,
  volume,
  onVolumeChange,
  channel,
  onChannelChange,
  faulted = false,
  signedIn = false,
  trimmers = {},
}: ControlPanelProps) {
  const { id, url } = useSurfaceIds()

  const cap = (
    <>
      <rect
        x="5"
        y="8"
        width="80"
        height="94"
        rx={CAP_R}
        ry={CAP_R}
        fill="#0a0603"
        fillOpacity="0.5"
        filter={url('drop')}
      />
      <rect
        x="1"
        y="1"
        width="84"
        height="94"
        rx={CAP_R}
        ry={CAP_R}
        fill={url('ivory')}
        filter={url('cap')}
      />
      <rect
        x="1"
        y="1"
        width="84"
        height="94"
        rx={CAP_R}
        ry={CAP_R}
        fill="none"
        stroke="#5d4d34"
        strokeOpacity="0.45"
        strokeWidth="1.6"
      />
    </>
  )

  /** One tuning adjuster, left wherever the engineer left it. */
  const trimmer = (deg: number) => (
    <svg className="tv-fascia__trim" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {/* The shadow it drops on the plate, offset with the light. */}
      <ellipse
        cx="52"
        cy="54"
        rx="41"
        ry="40"
        fill="#0a0908"
        fillOpacity="0.45"
        filter={url('drop')}
      />
      {/* The milled collar: light flutes and dark ones, a dash pattern each. */}
      <circle
        cx="50"
        cy="50"
        r={MILL_R}
        fill="none"
        stroke={url('flute')}
        strokeWidth="14"
        strokeDasharray={`${MILL_DASH} ${MILL_DASH}`}
      />
      <circle
        cx="50"
        cy="50"
        r={MILL_R}
        fill="none"
        stroke="#4a4641"
        strokeWidth="14"
        strokeDasharray={`${MILL_DASH} ${MILL_DASH}`}
        strokeDashoffset={MILL_DASH}
      />
      <circle cx="50" cy="50" r="33" fill={url('trim')} filter={url('cap')} />
      <circle
        cx="50"
        cy="50"
        r="33"
        fill="none"
        stroke="#080706"
        strokeOpacity="0.6"
        strokeWidth="1.4"
      />
      {/*
        The slot. A groove is two lines, never one: the cut is dark and the
        far wall of it is lit, and leaving the second line out is what makes a
        drawn screw-slot look like a sticker.
      */}
      <g transform={`rotate(${deg} 50 50)`}>
        <rect x="22" y="45.5" width="56" height="9" rx="4.5" fill="#080706" fillOpacity="0.92" />
        <rect
          x="23"
          y="51.8"
          width="54"
          height="2.2"
          rx="1.1"
          fill="#d8d2c6"
          fillOpacity="0.34"
        />
      </g>
    </svg>
  )

  return (
    <div className="tv-fascia">

      <WoodSurface
        className="tv-fascia__veneer"
        grain="horizontal"
        shade="horizontal"
        seed={23}
        tone="column"
      />

      <svg className="tv-fascia__defs" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={id('ivory')} cx="0.36" cy="0.3" r="0.82">
            <stop offset="0" stopColor="#f7efdc" />
            <stop offset="0.55" stopColor="#ddcfaf" />
            <stop offset="1" stopColor="#9e8b6c" />
          </radialGradient>
          {/* The trimmer body: black plastic, not metal — only its collar is. */}
          <radialGradient id={id('trim')} cx="0.34" cy="0.28" r="0.8">
            <stop offset="0" stopColor="#413c37" />
            <stop offset="0.6" stopColor="#1d1a18" />
            <stop offset="1" stopColor="#0c0b0a" />
          </radialGradient>
          <linearGradient id={id('flute')} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#cbc6bd" />
            <stop offset="0.5" stopColor="#8d8880" />
            <stop offset="1" stopColor="#5c5852" />
          </linearGradient>
          {/*
            One dome for every cap on the fascia: the blur is in the cap's own
            user units, so a preset and a trimmer a third of its size are lit
            identically without a filter each.
          */}
          <filter
            id={id('cap')}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="bump" />
            <feSpecularLighting
              in="bump"
              surfaceScale="6"
              specularConstant="0.55"
              specularExponent="34"
              lightingColor="#fffaf0"
              result="spec"
            >
              <feDistantLight azimuth="235" elevation="52" />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="clipped" />
            <feComposite
              in="SourceGraphic"
              in2="clipped"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
            />
          </filter>
          <filter id={id('drop')} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
          {/* A hundred thumbs: grime in the mottle, worst where they landed. */}
          <filter id={id('wear')} colorInterpolationFilters="sRGB">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.16"
              numOctaves="3"
              seed="17"
              result="grime"
            />
            <feColorMatrix
              in="grime"
              type="matrix"
              values="0 0 0 0 0.31  0 0 0 0 0.27  0 0 0 0 0.2  0 0 0 0.9 -0.3"
              result="ink"
            />
            <feComposite in="ink" in2="SourceAlpha" operator="in" />
          </filter>
        </defs>
      </svg>

      <div className="tv-fascia__plate">
        <MetalSurface className="tv-fascia__linish" grain="vertical" shade="horizontal" seed={5} />

        <span className="tv-fascia__badge" aria-hidden="true">
          Telly
        </span>

        {/*
          A real preset bank is mechanical: pressing one releases the others, and
          there is always exactly one in. Native radios give that for free —
          including arrow-key movement between them — so the caps are labels over
          a hidden input rather than six buttons pretending to interlock.
        */}
        <div className="tv-fascia__presets" role="radiogroup" aria-label="Channel">
          {PRESETS.map(([preset, worn]) => (
            <label className="tv-fascia__preset" key={preset}>
              <input
                className="tv-fascia__radio"
                type="radio"
                // The group name has to be unique per panel for the same
                // reason the filter ids do: two sets in one document would
                // otherwise interlock with each other.
                name={id('channel')}
                value={preset}
                // The digit on the cap is decoration, inside an aria-hidden
                // wrapper, so the input carries the name itself. Within a group
                // labelled "Channel", the bare numeral is what a viewer expects.
                aria-label={String(preset)}
                checked={channel === preset}
                onChange={() => onChannelChange(preset)}
              />
              <span className="tv-fascia__cap-label" aria-hidden="true">
                <svg
                  className="tv-fascia__cap"
                  viewBox={`0 0 ${CAP_W} ${CAP_H}`}
                  focusable="false"
                >
                  {cap}
                  <rect
                    x="4"
                    y="5"
                    width="78"
                    height="88"
                    rx={CAP_R}
                    ry={CAP_R}
                    fill="#000000"
                    opacity={worn}
                    filter={url('wear')}
                  />
                </svg>
                <span className="tv-fascia__digit">{preset}</span>
              </span>
            </label>
          ))}
        </div>

        {/*
          Behind the presets on the real set, and beside them here.

            V, H  the frame and line oscillators. Off lock, the picture rolls
                  or tears, exactly as it did.
            B     black level. Down crushes the shadows; up stops the blacks
                  being black at all.
            C     saturation, from monochrome to lurid.
            T     the tuner. Off station it snows — and it loses the colour
                  long before it loses the picture.

          A trimmer this set has not wired up gets no role, no tab stop and no
          place in the accessibility tree: a control a viewer can reach and
          that does nothing is worse than a drawing of one.
        */}
        <div className="tv-fascia__tuners">
          {TRIMMERS.map((trim) => {
            const wired = trimmers[trim.id]
            return wired ? (
              <LiveTrimmer
                key={trim.legend}
                legend={trim.legend}
                name={trim.name}
                value={wired.value}
                onChange={wired.onChange}
                draw={trimmer}
              />
            ) : (
              <span className="tv-fascia__tuner" key={trim.legend} aria-hidden="true">
                {trimmer(trim.deg)}
                <span className="tv-fascia__legend">{trim.legend}</span>
              </span>
            )
          })}
        </div>

        <div className="tv-fascia__stack">
          {/*
            POWER, which the reference sets of the period do carry. It was
            briefly MAINS here on the reasoning that POWER was a later hi-fi
            import, and the photographs say otherwise.

            The alternative the same references show is a pair of marks, an
            empty circle and a filled one, for the two positions of the
            switch. Not used here because every other legend on this plate is
            a stamped word and a lone symbol would be the odd one out.

            What the research did settle is which symbol *not* to reach for.
            IEC 417 landed in 1973, so the marks existed by 1975, but the one
            everybody now reads as "power" is 5009 — and 5009 means
            *stand-by*, a low-power state that explicitly does not
            disconnect. On a set with a hard mains switch and no standby to
            return from, it would mark the key with the one thing it cannot
            do.

            And a real button does not relabel itself when you press it. The
            legend is stamped into the bakelite and stays put; what changes is
            whether the button is in or out — which is what `pressed` carries,
            to the eye and to a screen reader alike.
          */}
          <PushButton onClick={onToggleOn} pressed={on}>
            Power
          </PushButton>
        </div>

        <div className="tv-fascia__well">
          <Knob label="Volume" value={volume} onChange={onVolumeChange} />
        </div>

        {/*
        The loudspeaker. A console set of this period fired forward through a
        slotted panel under the controls, which is both what the reference
        sets did and what stops the plate reading as a half-empty sheet.
      */}
      <div className="tv-fascia__grille" aria-hidden="true" />

      {/*
        Three lamps, three different things, and none of them labelled —
        a fascia of this period explained nothing and expected you to learn it.

          red     mains. On when the set is on, and on for no other reason.
          amber   trouble. Normally dark: it lights when the set is on and
                  something has failed, which is the one thing you cannot tell
                  by looking at the screen. A card at 3am is closedown; a card
                  at 8pm with the amber lit is a programme that would not play.
          green   a source. Lit once the set has somewhere to get programmes
                  from.

        The amber is the only one that is dark in normal service, which is
        what a warning lamp is for.
      */}
      <div className="tv-fascia__lamps" aria-hidden="true">
          <span className="tv-fascia__lamp tv-fascia__lamp--power" data-lit={String(on)} />
          <span
            className="tv-fascia__lamp tv-fascia__lamp--tune"
            data-lit={String(on && faulted)}
          />
          <span className="tv-fascia__lamp tv-fascia__lamp--signal" data-lit={String(signedIn)} />
        </div>
      </div>

      <div className="tv-fascia__lip" aria-hidden="true" />
    </div>
  )
}

/**
 * A trimmer that adjusts something. The same rotary behaviour as the volume
 * knob — drag it, or focus it and use the keys — at a third of the size, so a
 * trimmer feels like the knob beside it rather than like a slider that
 * happens to be round.
 *
 * It reads out as a percentage of its travel and not as "locked", because the
 * fascia adjusts a circuit and has no idea what that circuit is doing. The
 * viewer finds the lock by looking at the picture, which is how it was done.
 */
function LiveTrimmer({
  legend,
  name,
  value,
  onChange,
  draw,
}: {
  legend: string
  name: string
  value: number
  onChange: (value: number) => void
  draw: (deg: number) => ReactNode
}) {
  const { current, onKeyDown, onPointerDown, onPointerMove, endDrag } = useRotary({
    value,
    onChange,
    step: 0.02,
    // Shorter than the knob's: a trimmer is a fine adjuster turned with a
    // screwdriver, and a full sweep should not need half the screen.
    travelPx: 110,
  })

  return (
    <span className="tv-fascia__tuner">
      <span
        className="tv-fascia__grip"
        role="slider"
        tabIndex={0}
        aria-label={name}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={current}
        aria-valuetext={`${Math.round(current * 100)}%`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {draw(trimAngle(current))}
      </span>
      <span className="tv-fascia__legend">{legend}</span>
    </span>
  )
}
