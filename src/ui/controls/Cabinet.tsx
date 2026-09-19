import type { ReactNode } from 'react'
import { useSurfaceIds } from './surfaceIds'
import { WoodSurface } from './surfaces'

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

const CSS = `
/*
  The set's width, defined once and read by the page's layout too: the void
  either side of the cabinet is whatever this leaves, and the guide lives in
  it. Zero specificity, so a page may override it.
*/
:where(:root) { --set-w: min(72rem, calc(137vh - 16rem)); }

.tv-cabinet {
  box-sizing: border-box;
  position: relative;
  /* So the fascia can answer to the cabinet's width rather than the window's:
     the column is a fixed fraction of the cabinet, and on a short window the
     cabinet is much narrower than the screen it sits on. */
  container-type: inline-size;
  container-name: cabinet;
  width: 100%;
  /* The set's height follows from its width (a 4:3 tube in a fixed surround),
     so on a short window it has to be told to stop, otherwise it grows taller
     than the screen and you scroll to see the legs. The carcass is about
     1.375:1 now, hence the 137vh; the 16rem is everything that is not carcass
     and still has to fit under it: legs and the page's own padding. It used
     to include a row of controls under the cabinet too; those moved to the
     corner of the room, out of the flow, and the set got the height back.

     This number is load-bearing and it goes stale: deepening the apron made
     the cabinet taller for a given width, and so did narrowing the control
     column, because a narrower column means a wider 4:3 well. Change either
     and re-measure, or short windows quietly start scrolling. */
  max-width: var(--set-w);
  margin: 0 auto;
  padding-bottom: 1.4rem;
  border-radius: 0.3rem;
  /* Behind the veneer, and all that is left of it if filters are refused. */
  background: #7d5a35;
  box-shadow:
    /* Contact shadow first (tight and dark, where the set meets the floor),
       then the soft ambient one. A single wide shadow reads as a sticker. */
    0 0.14rem 0.3rem rgba(0, 0, 0, 0.55),
    0 1.1rem 2.2rem rgba(0, 0, 0, 0.42),
    /* The veneer wraps the corners: a lit edge one side, a dark one the other. */
    inset 0.06rem 0 0 rgba(255, 228, 186, 0.22),
    inset -0.06rem 0 0 rgba(38, 20, 6, 0.75);
}
.tv-cabinet__veneer {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}
/*
  The cabinet top. Same veneer, grain running front-to-back, and the two lines
  that do most of the work in any photograph of furniture: light caught on the
  top arris, and the dark edge-grain where the sheet turns the corner.
*/
.tv-cabinet__top {
  position: relative;
  z-index: 1;
  height: 0.95rem;
  border-radius: 0.3rem 0.3rem 0 0;
  background: #8a643c;
  box-shadow:
    inset 0 0.06rem 0 rgba(255, 238, 208, 0.5),
    inset 0 -0.07rem 0 rgba(43, 22, 7, 0.9),
    /* The returns: the sheet turns down at each end, and those two short
       edges are the only part of the sides a front elevation ever shows. */
    inset 0.07rem 0 0 rgba(255, 238, 208, 0.28),
    inset -0.07rem 0 0 rgba(43, 22, 7, 0.7),
    0 0.14rem 0.22rem -0.06rem rgba(0, 0, 0, 0.5);
}
.tv-cabinet__top-veneer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}
.tv-cabinet__body {
  position: relative;
  z-index: 1;
  display: grid;
  /* Narrower than instinct: the reference sets carry their controls on a strip
     nearer a tenth of the cabinet than a fifth, and the width was making the
     fascia read as a second cabinet rather than as a panel let into the first. */
  grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 12%);
  gap: 1rem;
  /* A console set is mostly cabinet: the veneer border round the tube is wide,
     and the picture is smaller in it than instinct suggests.

     The apron below the tube is the *deepest* part of that border, not the
     shallowest: the chassis lives under the tube and the carcass needs a base
     rail to stand on. Matching it to the top rail, which is the instinct,
     leaves the picture looking as though it is about to fall out of the
     bottom of the set. */
  padding: 2.2rem 2.2rem 3.3rem;
}
.tv-cabinet__well {
  position: relative;
  /* A CRT is a bulged rectangle, not a rounded-rect: the corners are huge. */
  border-radius: 9% / 11%;
  overflow: hidden;
  background: #07080a;
  padding: 2.2%;
  /*
    The biggest joint on the set: a hole cut clean through the front panel.
    It had a flat dark ring and no light on it anywhere, which is a sticker.
    Four parts, lit from the upper left like everything else:

      the cut edge itself, hard and dark against the opening;
      the arris along the bottom and right of the cut, catching the light;
      the veneer above and left, lying in the opening's own shadow;
      occlusion in the corner where the panel turns into the recess.
  */
  box-shadow:
    inset 0 0 1.6rem rgba(0, 0, 0, 0.7),
    0 0 0 0.25rem #17110c,
    0 0.075rem 0 0.25rem rgba(255, 230, 190, 0.28),
    0.06rem 0 0 0.25rem rgba(255, 230, 190, 0.13),
    0 -0.06rem 0 0.25rem rgba(40, 21, 6, 0.5),
    -0.05rem 0 0 0.25rem rgba(40, 21, 6, 0.3),
    0 0.3rem 0.9rem rgba(0, 0, 0, 0.55),
    0 0.06rem 0.55rem 0.3rem rgba(26, 13, 4, 0.4);
}
.tv-cabinet__well > * { border-radius: 8% / 10%; overflow: hidden; }
/* The bezel draws its own corners and must keep them. */
.tv-cabinet__well > .tv-cabinet__bezel {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  /* Clipped on purpose: both trim strokes straddle the rim and the viewport
     shaves the outer half off, which is what leaves a hairline behind. */
  overflow: hidden;
  pointer-events: none;
}
/* Unlit glass: a broad off-axis sheen, a vignette, and the mask underneath. */
.tv-cabinet__glass {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  /*
    Scanline and shadow-mask, at 1px on a 3px pitch. Subtle on purpose: this
    sits over the picture, and anything you can see on a still frame is far
    too much once something is moving behind it.
  */
  background:
    repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.14) 0 1px, rgba(0, 0, 0, 0) 1px 3px),
    repeating-linear-gradient(to right, rgba(0, 0, 0, 0.07) 0 1px, rgba(0, 0, 0, 0) 1px 3px);
  /* The vignette proper is drawn below; this is only the corner fall-off. */
  box-shadow: inset 0 0 1.6rem rgba(0, 0, 0, 0.3);
}
.tv-cabinet__sheen {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
/* The cream lip along the very bottom edge of the cabinet. */
.tv-cabinet__lip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  height: 0.6rem;
  border-radius: 0 0 0.3rem 0.3rem;
  background: linear-gradient(#efe3cb 0%, #e6d8bd 38%, #c4b295 72%, #a9987c 100%);
  box-shadow:
    inset 0 0.07rem 0 rgba(255, 255, 255, 0.8),
    inset 0 -0.05rem 0.1rem rgba(90, 70, 42, 0.5),
    0 -0.07rem 0.14rem rgba(0, 0, 0, 0.5);
}
.tv-cabinet__legs {
  display: flex;
  justify-content: space-between;
  width: min(100%, 72rem);
  margin: 0 auto;
  /* Set in from the corners, not balanced on them: a console leg is screwed
     to a rail behind the face, and two of them out at the very edges read as
     stilts rather than as something holding a hundredweight of cabinet up. */
  padding: 0 10%;
  box-sizing: border-box;
}
.tv-cabinet__leg {
  position: relative;
  width: 1.45rem;
  height: 3.4rem;
}
/*
  The joint at the top: a leg screws to a rail up inside the carcass, so it
  comes out of shadow rather than starting in daylight. Without this the legs
  read as stuck on afterwards: two shapes that happen to touch the bottom
  edge, rather than two pieces of the same object.
*/
.tv-cabinet__leg::before {
  content: '';
  position: absolute;
  left: -30%;
  right: -30%;
  top: -0.08rem;
  height: 1rem;
  z-index: 2;
  /* Radial from the top centre, so it fades sideways as well as down. A
     straight vertical gradient gave it hard edges either side and the leg
     looked bolted to a little black bracket. */
  background: radial-gradient(
    ellipse 58% 100% at 50% 0%,
    rgba(18, 9, 2, 0.72),
    rgba(18, 9, 2, 0) 72%
  );
  pointer-events: none;
}
/* The shadow the leg drops on the floor, pooled at the foot. */
.tv-cabinet__leg::after {
  content: '';
  position: absolute;
  left: -55%;
  right: -55%;
  bottom: -0.18rem;
  height: 0.5rem;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0));
}
.tv-cabinet__leg-wood {
  position: absolute;
  inset: 0;
  /* Tapered, splayed: 1970 on a matching four-legged stand. */
  clip-path: polygon(0 0, 100% 0, 66% 100%, 24% 100%);
  background: #6b4a2a;
}
.tv-cabinet__leg-veneer { position: absolute; inset: 0; width: 100%; height: 100%; }
/* A turned leg is round: the grain alone will not say so. */
.tv-cabinet__leg-wood::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    92deg,
    rgba(20, 10, 3, 0.55) 0%,
    rgba(20, 10, 3, 0.1) 26%,
    rgba(255, 228, 186, 0.16) 44%,
    rgba(20, 10, 3, 0.18) 68%,
    rgba(16, 8, 2, 0.6) 100%);
}
.tv-cabinet__leg:nth-child(2) .tv-cabinet__leg-wood,
.tv-cabinet__leg:nth-child(4) .tv-cabinet__leg-wood { transform: scaleX(-1); }

@media (max-width: 40rem) {
  .tv-cabinet__body { grid-template-columns: minmax(0, 1fr); }
  .tv-cabinet__legs { padding: 0 8%; }
  .tv-cabinet__leg { height: 2rem; width: 0.8rem; }
}
`

/**
 * The moulded plastic surround. A sheen along the top where the light rolls
 * off the moulding, matte below, and the trim line drawn as a stroke with a
 * metal gradient down it rather than a flat white rule: a brushed edge is
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
 * down the right and a cream lip along the bottom, on four tapered legs.
 * Pure scenery: it holds a picture and a fascia and has no behaviour of its
 * own, which is why none of it appears in the accessibility tree.
 */
export function Cabinet({ children, controls, legs = true }: CabinetProps) {
  return (
    <div>
      <style>{CSS}</style>
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
