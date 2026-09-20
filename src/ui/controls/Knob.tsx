import { LEGEND_FONT, NO_SELECT } from './type'
import { useSurfaceIds } from './surfaceIds'
import { DEFAULT_STEP, MAX, MIN, clamp, tidy, useRotary } from './useRotary'

export interface KnobProps {
  label: string
  /** 0..1. The knob is controlled: it draws what it is handed. */
  value: number
  onChange: (value: number) => void
  /** How far one arrow key moves it. Default 0.05. */
  step?: number
}

/**
 * The sweep of a real rotary control: 270 degrees with a stop at each end,
 * centred on straight up. 0 sits at bottom-left, 1 at bottom-right.
 */
const SWEEP_DEG = 270
const START_DEG = -SWEEP_DEG / 2

/** Ticks around the dial, ends included. */
const TICKS = 11

/** Flutes milled into the rim, and the radius they are cut at. */
const MILL = 30
const MILL_R = 47
/** One light flute and one dark one per period, all the way round. */
const MILL_DASH = (2 * Math.PI * MILL_R) / MILL / 2

/**
 * The sun-spun cap. A spun finish is a lathe mark, not a belt mark: fine
 * concentric striations spinning out from the centre, broken into short arcs,
 * so the cap catches the light at a different angle everywhere round it.
 * Drawn as rings of dashes rather than as noise, because noise has no centre
 * and this pattern is nothing but its centre.
 */
const SPUN_RINGS = 16
const SPUN_INNER = 4
const SPUN_OUTER = 47
/** One striation and one gap, in user units: a lathe leaves a fine mark. */
const SPUN_DASH = 2.2

/** Where ring `index` sits, and how far round its striations are shifted. */
function spunRing(index: number) {
  const spread = (index / (SPUN_RINGS - 1)) * (SPUN_OUTER - SPUN_INNER)
  // Shifted by an irrational-ish fraction of the dash so no two rings line
  // their arcs up — turning that rows up reads as a printed pattern.
  return { r: SPUN_INNER + spread, offset: index * 1.37 }
}

const angleFor = (value: number) => tidy(START_DEG + clamp(value) * SWEEP_DEG)

/** Where a tick sits on a 100x100 dial, measured clockwise from straight up. */
function tickLine(index: number) {
  const deg = START_DEG + (index / (TICKS - 1)) * SWEEP_DEG
  const rad = (deg * Math.PI) / 180
  const [dx, dy] = [Math.sin(rad), -Math.cos(rad)]
  return { x1: 50 + dx * 43, y1: 50 + dy * 43, x2: 50 + dx * 49, y2: 50 + dy * 49 }
}

const CSS = `
.tv-knob { display: grid; justify-items: center; gap: 0.4rem; }
.tv-knob__stack {
  position: relative;
  width: clamp(3.25rem, 13vw, 4.5rem);
  aspect-ratio: 1;
}
/* Overflowing, because the shadow the knob throws lands outside the dial. */
.tv-knob__ticks { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.tv-knob__dial {
  position: absolute;
  inset: 11%;
  border-radius: 50%;
  cursor: ns-resize;
  touch-action: none;
  /* All that is left of the knob if filters are refused. */
  background: radial-gradient(circle at 36% 30%, #3b352f, #0b0907 78%);
}
.tv-knob__body { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.tv-knob__dial:focus-visible {
  outline: 0.18rem solid #ffe6a8;
  outline-offset: 0.22rem;
}
/*
  The pointer runs from the milling in to the edge of the cap and stops:
  it is marked on the black skirt, and a line drawn across a spun cap would
  read as a scratch. The origin is still the centre of the dial, which is why
  it is past the bottom of the mark itself.
*/
.tv-knob__pointer {
  position: absolute;
  left: 50%;
  top: 6%;
  width: 0.17rem;
  height: 26%;
  margin-left: -0.085rem;
  border-radius: 0.085rem;
  transform-origin: 50% 169.2%;
  /* Ivory against near-black, with a hard shadow under it: a pointer only
     reads as crisp if the edge either side of it is dark. */
  background: linear-gradient(#fffaf1, #ead9b6 58%, #b09a74);
  box-shadow:
    0 0.05rem 0.11rem rgba(0, 0, 0, 0.8),
    inset -0.03rem 0 0 rgba(92, 74, 46, 0.45);
}
.tv-knob__cap {
  position: absolute;
  inset: 34%;
  border-radius: 50%;
  /* Under the spun cap, and all that is left of it without filters. */
  background: radial-gradient(circle at 34% 28%, #dbd7d0, #9f9b93 78%);
  box-shadow:
    inset 0 -0.04rem 0.08rem rgba(0, 0, 0, 0.4),
    0 0.05rem 0.14rem rgba(0, 0, 0, 0.7);
}
.tv-knob__spun { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; }
.tv-knob__label {
  font: 600 0.6rem/1 ${LEGEND_FONT};
  letter-spacing: 0.18em;
  text-transform: uppercase;
  ${NO_SELECT}
  letter-spacing: 0.18em;
  text-transform: uppercase;
  /* Engraved into the plate the spindle comes through, so it is cut dark
     with the burr under it catching the light — not printed on in cream. */
  color: #4a4640;
  text-shadow: 0 0.045rem 0 rgba(255, 255, 255, 0.6);
}
`

/**
 * A bakelite volume control, drawn in CSS. It stands in for an
 * `<input type="range">` and so has to be at least as good as one: the same
 * role, the same keys, the same announcement — plus a drag, because a knob
 * that cannot be turned by hand is a picture of a knob.
 */
export function Knob({ label, value, onChange, step = DEFAULT_STEP }: KnobProps) {
  const { id, url } = useSurfaceIds()
  /** Where this drag started, in pixels and in value. Null between drags. */
  const { current, onKeyDown, onPointerDown, onPointerMove, endDrag } = useRotary({
    value,
    onChange,
    step,
  })

  return (
    <div className="tv-knob">
      <style>{CSS}</style>
      <div className="tv-knob__stack">
        <svg className="tv-knob__ticks" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <defs>
            <filter id={id('cast')} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>
          {/* The shadow the knob drops on the fascia, offset with the light. */}
          <ellipse
            cx="51.5"
            cy="54"
            rx="39"
            ry="38"
            fill="#0a0603"
            fillOpacity="0.55"
            filter={url('cast')}
          />
          {/*
            The scale is silk-screened onto the plate the spindle comes
            through. Printing does not know where the knob is pointing, so
            every mark is the same ink at the same weight. The ticks the
            pointer has passed used to fade up, which is a meter's behaviour
            and not a fascia's.
          */}
          {Array.from({ length: TICKS }, (_, index) => {
            const line = tickLine(index)
            return (
              <line
                key={index}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                stroke="#2e2a25"
                strokeWidth={2}
                strokeLinecap="round"
              />
            )
          })}
        </svg>
        <div
          className="tv-knob__dial"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-orientation="vertical"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={tidy(current)}
          aria-valuetext={`${Math.round(current * 100)}%`}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <svg className="tv-knob__body" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
              <radialGradient id={id('bakelite')} cx="0.36" cy="0.29" r="0.78">
                <stop offset="0" stopColor="#3d3830" />
                <stop offset="0.55" stopColor="#1a1613" />
                <stop offset="1" stopColor="#0a0806" />
              </radialGradient>
              <linearGradient id={id('flute')} x1="0.1" y1="0" x2="0.9" y2="1">
                <stop offset="0" stopColor="#8b857c" />
                <stop offset="0.45" stopColor="#443f3a" />
                <stop offset="1" stopColor="#171513" />
              </linearGradient>
              {/*
                The highlight has to travel round the dome as the surface
                turns, which is the one thing a radial gradient cannot do: a
                blurred alpha gives the filter a bump to shade, and the light
                lands where the curvature actually points it.
              */}
              <filter
                id={id('dome')}
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
                  specularConstant="1.05"
                  specularExponent="35"
                  lightingColor="#fff6e6"
                  result="spec"
                >
                  <feDistantLight azimuth="235" elevation="50" />
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
            </defs>
            {/* Milling: light flutes and dark ones, one dash pattern each. */}
            <circle
              cx="50"
              cy="50"
              r={MILL_R}
              fill="none"
              stroke={url('flute')}
              strokeWidth="6"
              strokeDasharray={`${MILL_DASH} ${MILL_DASH}`}
            />
            <circle
              cx="50"
              cy="50"
              r={MILL_R}
              fill="none"
              stroke="#080706"
              strokeWidth="6"
              strokeDasharray={`${MILL_DASH} ${MILL_DASH}`}
              strokeDashoffset={MILL_DASH}
            />
            <circle cx="50" cy="50" r="44.5" fill={url('bakelite')} filter={url('dome')} />
            <circle
              cx="50"
              cy="50"
              r="44.5"
              fill="none"
              stroke="#000000"
              strokeOpacity="0.55"
              strokeWidth="1"
            />
          </svg>
          <div
            className="tv-knob__pointer"
            data-knob-pointer=""
            style={{ transform: `rotate(${angleFor(current)}deg)` }}
          />
          <div className="tv-knob__cap">
            <svg
              className="tv-knob__spun"
              viewBox="0 0 100 100"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <radialGradient id={id('spun')} cx="0.36" cy="0.3" r="0.8">
                  <stop offset="0" stopColor="#e3e0d9" />
                  <stop offset="0.6" stopColor="#c2beb6" />
                  <stop offset="1" stopColor="#9c9890" />
                </radialGradient>
                {/*
                  Where the turning catches and where it goes flat. Without
                  this the rings read as an even grey disc: a spun cap is only
                  legible because one side of it is bright and the other is not.
                */}
                <linearGradient id={id('sweep')} x1="0.12" y1="0" x2="0.88" y2="1">
                  <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
                  <stop offset="0.42" stopColor="#ffffff" stopOpacity="0" />
                  <stop offset="0.72" stopColor="#000000" stopOpacity="0.05" />
                  <stop offset="1" stopColor="#000000" stopOpacity="0.2" />
                </linearGradient>
                <linearGradient id={id('chamfer')} x1="0.15" y1="0" x2="0.85" y2="1">
                  <stop offset="0" stopColor="#f6f3ee" />
                  <stop offset="0.5" stopColor="#8d8982" />
                  <stop offset="1" stopColor="#4a4743" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="49" fill={url('spun')} />
              {Array.from({ length: SPUN_RINGS }, (_, index) => {
                const ring = spunRing(index)
                const lit = index % 2 === 0
                return (
                  <circle
                    key={index}
                    cx="50"
                    cy="50"
                    r={ring.r}
                    fill="none"
                    stroke={lit ? '#ffffff' : '#232019'}
                    strokeOpacity={lit ? 0.26 : 0.2}
                    strokeWidth="1.6"
                    strokeDasharray={`${SPUN_DASH} ${SPUN_DASH}`}
                    strokeDashoffset={ring.offset}
                  />
                )
              })}
              <circle cx="50" cy="50" r="49" fill={url('sweep')} />
              {/* The chamfer round the rim, which is where a flat cap keeps
                  the one narrow highlight it has. */}
              <circle
                cx="50"
                cy="50"
                r="46.5"
                fill="none"
                stroke={url('chamfer')}
                strokeWidth="5"
              />
              <circle
                cx="50"
                cy="50"
                r="49"
                fill="none"
                stroke="#0d0b09"
                strokeOpacity="0.55"
                strokeWidth="1.4"
              />
            </svg>
          </div>
        </div>
      </div>
      <span className="tv-knob__label">{label}</span>
    </div>
  )
}
