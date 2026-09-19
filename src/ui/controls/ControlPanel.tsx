import type { ReactNode } from 'react'
import { Knob } from './Knob'
import { useRotary } from './useRotary'
import { BADGE_FONT, LEGEND_FONT, NO_SELECT } from './type'
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
   * Lights the amber lamp. A 1975 fascia has no words on it: anything that
   * needs explaining belongs outside the cabinet, not stamped into it.
   */
  faulted?: boolean
  /**
   * Lights the green lamp: the set has a source of programmes. Off means it
   * is running on whatever it came with.
   */
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
 * The channel presets. One station broadcasts; the other five are tuned in and
 * empty, and show what an empty preset showed: snow. The second number is how
 * worn each cap is, because nobody ever pressed 6.
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
 * each one was left (vertical, horizontal, brightness, colour, tone) and
 * they are all in different places because nobody ever set five trimmers to
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

const CSS = `
.tv-fascia {
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0.5rem 0.42rem 0;
  color: #2b1a0c;
  /* Under the veneer, and all that is left of it without filters. */
  background: #7d5a35;
  /*
    The control column is its own board, laid on the front of the carcass,
    which the reference sets bear out: the Marconiphone's slotted grille is
    plainly a separate insert. A board on a board shows four edges, and it had
    only two. Lit along the top and left where the light reaches the arris,
    dark along the bottom and right, with a tight contact shadow under it
    before the soft one. Two edges alone read as a stripe of veneer painted on
    the front; four read as a piece of wood lying on another.
  */
  box-shadow:
    inset 0.07rem 0 0 rgba(255, 231, 190, 0.3),
    inset 0 0.06rem 0 rgba(255, 231, 190, 0.22),
    inset -0.07rem 0 0 rgba(46, 24, 7, 0.75),
    inset 0 -0.06rem 0 rgba(46, 24, 7, 0.6),
    0 0.06rem 0.1rem rgba(20, 10, 3, 0.5),
    0 0.4rem 1rem rgba(0, 0, 0, 0.4);
}
.tv-fascia > * { position: relative; z-index: 1; }
.tv-fascia > .tv-fascia__veneer {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
}
/* The routed grooves that separate the column from the rest of the cabinet. */
.tv-fascia::before,
.tv-fascia::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  width: 0.2rem;
  pointer-events: none;
  background: linear-gradient(90deg,
    rgba(30, 14, 3, 0.75) 0 35%,
    rgba(20, 9, 2, 0.55) 35% 65%,
    rgba(255, 226, 178, 0.32) 65% 100%);
}
.tv-fascia::before { left: 0.12rem; }
.tv-fascia::after { right: 0.12rem; transform: scaleX(-1); }
/* The shared surfaces: one set of definitions for every cap on the fascia. */
.tv-fascia__defs { position: absolute; width: 0; height: 0; overflow: hidden; }

/*
  The fascia proper: a linished silver plate let into the teak, not a panel of
  teak with controls on it. It is a separate pressing dropped into a routed
  rebate, so the veneer shows all the way round it and runs on below it to the
  lip, and the rebate is what the shadows describe. Light from the upper left,
  as everywhere else on this set: the wood shades the top and left of the
  plate, and the plate's own lower edge is what catches.

  It is as tall as what is mounted on it and no taller; the floor below keeps
  a little bare metal round the controls on a tall cabinet, which is right,
  where a column of it would not be.
*/
.tv-fascia__plate {
  position: relative;
  z-index: 1;
  /* The plate fills the opening cut for it. It used to stop at 86% of the
     column, which left fifty-odd pixels of bare veneer under it against eight
     above, and an inset panel with one margin seven times another reads as a
     mistake rather than as a panel. Even reveal all round; the controls space
     out to fill, and what grows is the speaker grille, which is what a console
     set had most of. */
  flex: 1 1 auto;
  margin-bottom: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.55rem;
  padding: 0.85rem 0.38rem 0.9rem;
  border-radius: 0.08rem;
  /* Under the linishing, and all that is left of it without filters. */
  background: #bab6af;
  /*
    The rebate. A metal panel let into a wooden carcass is read entirely at its
    edge, and the edge has four parts, all of them lit from the upper left,
    like everything else on this set:

      the cut edge of the veneer, hard against the plate;
      the arris below and right of the opening, catching the light;
      the walls of the recess above and left, throwing shadow onto the plate;
      the walls below and right, which the light reaches.

    Miss the pair that catch the light and the panel reads as printed on.
  */
  box-shadow:
    0 0 0 0.055rem rgba(38, 20, 6, 0.85),
    0 0.1rem 0 rgba(255, 231, 190, 0.26),
    0.06rem 0 0 rgba(255, 231, 190, 0.14),
    inset 0 0.13rem 0.2rem rgba(26, 13, 4, 0.55),
    inset 0.1rem 0 0.18rem rgba(26, 13, 4, 0.4),
    inset 0 -0.085rem 0.14rem rgba(255, 255, 255, 0.45),
    inset -0.07rem 0 0.12rem rgba(255, 255, 255, 0.26),
    0 0.2rem 0.42rem rgba(0, 0, 0, 0.42);
}
.tv-fascia__plate > * { position: relative; z-index: 1; }
.tv-fascia__plate > .tv-fascia__linish {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

/* Engraved into the plate, not a badge screwed onto it: the cut is dark and
   the burr under it catches, which is the whole of why lettering reads as
   cut metal rather than printed on. */
.tv-fascia__badge {
  align-self: center;
  font: 600 0.6rem/1 ${BADGE_FONT};
  letter-spacing: -0.01em;
  ${NO_SELECT}
  color: #4a4640;
  text-shadow: 0 0.045rem 0 rgba(255, 255, 255, 0.62);
}

/*
  The preset bank sits in an aperture cut through the plate: dark inside,
  with the bright cut edge of the aluminium showing along the bottom of it.
*/
.tv-fascia__presets {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.26rem 0.3rem;
  width: min(100%, 4.3rem);
  margin: 0 auto;
  padding: 0.3rem 0.28rem;
  border-radius: 0.1rem;
  background: linear-gradient(#23211e, #131211);
  box-shadow:
    inset 0 0.09rem 0.24rem rgba(0, 0, 0, 0.85),
    0 0.05rem 0 rgba(255, 255, 255, 0.42);
}
/*
  Small, square, generously cornered: the 1970s preset key is a soft-cornered
  rectangle a fingertip wide, not the big round dome a kitchen appliance got.
*/
.tv-fascia__preset {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: ${CAP_W} / ${CAP_H};
  border-radius: ${(100 * CAP_R) / CAP_W}% / ${(100 * CAP_R) / CAP_H}%;
  cursor: pointer;
  font: 600 0.46rem/1 ${LEGEND_FONT};
  letter-spacing: 0.04em;
  ${NO_SELECT}
  color: #6d5c44;
  /* Under the drawn cap, for a browser that refuses filters. */
  background: linear-gradient(#f5eddb, #cdbc9a);
}
/* The input is the control; the cap is its face. Kept in the layout rather
   than display:none so it stays focusable and announceable. */
.tv-fascia__radio {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
/* The cap is a face, not a target: it must not intercept the click meant for
   the input beneath it, which is the thing that actually carries the state. */
.tv-fascia__cap-label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
/* Pressed in: the cap sits lower, its shadow shortens, the digit dims. */
.tv-fascia__radio:checked ~ .tv-fascia__cap-label {
  transform: translateY(7%) scale(0.97);
  filter: brightness(0.9) saturate(0.95);
}
.tv-fascia__radio:focus-visible ~ .tv-fascia__cap-label {
  outline: 0.1rem solid #9ecbff;
  outline-offset: 0.08rem;
  border-radius: 0.18rem;
}
/* Overflowing, because each cap drops a shadow into the aperture behind it. */
.tv-fascia__cap { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* The legend is moulded in, so the shadow under it moves with the light. */
.tv-fascia__digit {
  position: relative;
  text-shadow: 0 0.04rem 0 rgba(255, 252, 240, 0.6);
}

.tv-fascia__well { display: grid; justify-items: center; padding: 0.15rem 0 0.1rem; }

.tv-fascia__stack { display: grid; gap: 0.45rem; }

/*
  The tuning adjusters, in a row under the presets they used to hide behind.
  Bare aluminium collars on black bodies, and their legends engraved into the
  plate beneath them rather than printed on the knobs: a trimmer is too small
  to carry a letter.
*/
/*
  The row is wider than the trimmers in it, on purpose. A slotted trimmer is
  the size of a screwdriver head and drawing it any bigger would be drawing a
  different control, so the *target* grows instead of the ink: each cell is
  comfortably over the 24px minimum and the drawing sits in the middle of it.
*/
.tv-fascia__tuners {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  gap: 0.14rem;
  width: min(100%, 8.4rem);
  margin: 0 auto;
}
/*
  Each cell keeps its 24px whatever the column does, and the row wraps to two
  when there is not room for five. Which is period anyway: the reference
  Philips carries its small controls in two rows, not one.
*/
.tv-fascia__tuner { min-width: 1.62rem; }
.tv-fascia__tuner {
  flex: 1 1 auto;
  display: grid;
  justify-items: center;
  gap: 0.08rem;
  font: 600 0.34rem/1 ${LEGEND_FONT};
  letter-spacing: 0.04em;
  ${NO_SELECT}
  color: #4e4a45;
}
.tv-fascia__trim {
  width: 100%;
  max-width: 0.92rem;
  aspect-ratio: 1;
  /* Overflowing, because the trimmer drops its shadow onto the plate. */
  overflow: visible;
}
.tv-fascia__legend {
  text-shadow: 0 0.04rem 0 rgba(255, 255, 255, 0.55);
}
/* A trimmer you can actually turn. Small, so it gets a generous focus ring. */
.tv-fascia__grip {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: 1.6rem;
  cursor: ns-resize;
  touch-action: none;
  border-radius: 0.2rem;
}
.tv-fascia__grip:focus-visible {
  outline: 0.14rem solid #ffe6a8;
  outline-offset: 0.14rem;
}

.tv-fascia__grille {
  flex: 1 1 auto;
  min-height: 2.5rem;
  margin: 0.15rem 0.1rem;
  border-radius: 0.06rem;
  /*
    Slotted, not punched. Every reference set has a slatted or slotted speaker
    panel: horizontal wooden louvres, vertical fluting, or what the
    Marconiphone brochure calls "a contrasting black slotted speaker grille".
    A drilled panel of round holes reads as a wireless, or as a set fifteen
    years older than this one.

    Each period is one slot and one rib, and the rib is where the drawing is:
    lit on its left face and shadowed on its right, because the light comes
    from the upper left like everything else on this set. Without those two
    faces it is a barcode.
  */
  background-color: #14161a;
  background-image: repeating-linear-gradient(
    90deg,
    #0b0d0f 0 0.17rem,
    #16191c 0.17rem 0.2rem,
    rgba(255, 244, 224, 0.34) 0.2rem 0.225rem,
    #4b4d50 0.225rem 0.265rem,
    #26282b 0.265rem 0.3rem
  );
  box-shadow:
    inset 0 0.07rem 0.16rem rgba(0, 0, 0, 0.75),
    inset 0 -0.04rem 0.08rem rgba(255, 255, 255, 0.14),
    0 0 0 0.04rem rgba(28, 18, 8, 0.6);
}

.tv-fascia__lamps {
  display: flex;
  gap: 0.28rem;
  align-self: center;
  justify-content: center;
  /* Pushed to the foot of the plate: the space this leaves between the knob
     and the lamps is the point: a fascia is mostly empty metal. */
  margin-top: auto;
  padding: 0.26rem 0.3rem;
  border-radius: 0.1rem;
  background: linear-gradient(#201e1b, #0e0d0c);
  box-shadow:
    inset 0 0.08rem 0.2rem rgba(0, 0, 0, 0.85),
    0 0.05rem 0 rgba(255, 255, 255, 0.42);
}
.tv-fascia__lamp {
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  opacity: 0.35;
  /* A lens, not a dot: the light catches the top of the moulding. */
  background-image: radial-gradient(circle at 34% 28%,
    rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0) 52%);
  box-shadow: inset 0 -0.04rem 0.06rem rgba(0, 0, 0, 0.55);
}
.tv-fascia__lamp[data-lit='true'] { opacity: 1; }
.tv-fascia__lamp--power { background-color: #e8492a; }
.tv-fascia__lamp--power[data-lit='true'] { box-shadow: 0 0 0.4rem #ff5b3a; }
.tv-fascia__lamp--tune { background-color: #e0a21f; }
.tv-fascia__lamp--tune[data-lit='true'] { box-shadow: 0 0 0.4rem #ffc23d; }
.tv-fascia__lamp--signal { background-color: #57c163; }
.tv-fascia__lamp--signal[data-lit='true'] { box-shadow: 0 0 0.4rem #6fe07a; }

/* The cream lip along the very bottom edge of the cabinet. */
.tv-fascia__lip {
  margin: auto -0.42rem 0;
  height: 0.5rem;
  background: linear-gradient(#efe3cb 0%, #e6d8bd 38%, #c4b295 72%, #a9987c 100%);
  box-shadow:
    inset 0 0.06rem 0 rgba(255, 255, 255, 0.75),
    0 -0.06rem 0.12rem rgba(0, 0, 0, 0.45);
}

/* A portable on the kitchen table: the column goes under the screen, so the
   plate stops being a column and becomes a strip. */
/*
  A small set, tightened.

  The fascia's controls are sized in rem, so below a certain cabinet width they
  stop shrinking and the cabinet stops obeying its own aspect ratio: it gets
  taller than the height cap expects and a short window scrolls. This is the
  floor, lowered: the same controls, the same 24px targets, less air between
  them and a shallower speaker.
*/
@container cabinet (max-width: 58rem) {
  .tv-fascia { padding: 0.35rem 0.3rem 0; }
  .tv-fascia__plate { gap: 0.3rem; padding: 0.5rem 0.28rem 0.5rem; }
  .tv-fascia__tuners { gap: 0.08rem; }
  .tv-fascia__grille { min-height: 1.5rem; margin: 0.1rem 0.06rem; }
  .tv-fascia__badge { font-size: 0.52rem; }
  .tv-fascia__well { padding-bottom: 0; }
  /* The knob is sized against the viewport, which on a short window is much
     wider than the cabinet, so on a small set it was 72px of a 90px column,
     and the single biggest thing holding the fascia's height up. */
  .tv-knob__stack { width: 3.2rem; }
}

/* Smaller again. Same controls, same targets, no air left to give. */
@container cabinet (max-width: 46rem) {
  .tv-fascia { padding: 0.25rem 0.24rem 0; }
  .tv-fascia__plate { gap: 0.18rem; padding: 0.34rem 0.22rem 0.34rem; }
  .tv-fascia__presets { gap: 0.16rem 0.2rem; padding: 0.2rem 0.18rem; }
  .tv-fascia__grille { min-height: 0.5rem; margin: 0.05rem 0.04rem; }
  .tv-fascia__lamps { gap: 0.2rem; padding: 0.12rem 0.2rem; }
  .tv-knob__stack { width: 2.8rem; }
}

@media (max-width: 40rem) {
  .tv-fascia { height: auto; padding: 0.55rem 0.55rem 0; }
  .tv-fascia__plate {
    min-height: 0;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.45rem 0.7rem;
    padding: 0.5rem 0.55rem 0.55rem;
  }
  .tv-fascia__plate > * { flex: 0 1 auto; }
  .tv-fascia__badge { flex-basis: 100%; text-align: center; }
  .tv-fascia__presets { width: auto; grid-template-columns: repeat(6, 1fr); }
  .tv-fascia__preset { width: 1.7rem; }
  .tv-fascia__stack { flex: 0 1 7rem; min-width: 5rem; }
  .tv-fascia__well { padding: 0; }
  /* Trimmers and lamps drop to the end: on a strip they are what you look
     past, not what you reach through. */
  .tv-fascia__tuners { order: 1; flex: 1 1 100%; width: auto; justify-content: center; gap: 0.55rem; }
  .tv-fascia__tuner { flex: 0 0 1.7rem; }
  .tv-fascia__grille {
  flex: 1 1 auto;
  min-height: 2.5rem;
  margin: 0.15rem 0.1rem;
  border-radius: 0.06rem;
  /*
    Slotted, not punched. Every reference set has a slatted or slotted speaker
    panel: horizontal wooden louvres, vertical fluting, or what the
    Marconiphone brochure calls "a contrasting black slotted speaker grille".
    A drilled panel of round holes reads as a wireless, or as a set fifteen
    years older than this one.

    Each period is one slot and one rib, and the rib is where the drawing is:
    lit on its left face and shadowed on its right, because the light comes
    from the upper left like everything else on this set. Without those two
    faces it is a barcode.
  */
  background-color: #14161a;
  background-image: repeating-linear-gradient(
    90deg,
    #0b0d0f 0 0.17rem,
    #16191c 0.17rem 0.2rem,
    rgba(255, 244, 224, 0.34) 0.2rem 0.225rem,
    #4b4d50 0.225rem 0.265rem,
    #26282b 0.265rem 0.3rem
  );
  box-shadow:
    inset 0 0.07rem 0.16rem rgba(0, 0, 0, 0.75),
    inset 0 -0.04rem 0.08rem rgba(255, 255, 255, 0.14),
    0 0 0 0.04rem rgba(28, 18, 8, 0.6);
}

.tv-fascia__lamps { order: 2; margin-top: 0; }
  .tv-fascia__lip { margin: 0.5rem -0.55rem 0; }
}
`

/**
 * The fascia: the tall control column down the right-hand side of a wooden
 * console set, a linished silver plate let into teak veneer, which is what
 * a Philips colour set of 1972–76 actually wore. Everything that works is a
 * real control; the presets are a preset bank, and the trimmer row, the badge
 * and the lamps are cabinetry, hidden from the accessibility tree so nobody
 * tabs into furniture.
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
      <style>{CSS}</style>

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
          {/* The trimmer body: black plastic, not metal; only its collar is. */}
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
          there is always exactly one in. Native radios give that for free
          (including arrow-key movement between them) so the caps are labels over
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
            T     the tuner. Off station it snows, and it loses the colour
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
            everybody now reads as "power" is 5009, and 5009 means
            *stand-by*, a low-power state that explicitly does not
            disconnect. On a set with a hard mains switch and no standby to
            return from, it would mark the key with the one thing it cannot
            do.

            And a real button does not relabel itself when you press it. The
            legend is stamped into the bakelite and stays put; what changes is
            whether the button is in or out, which is what `pressed` carries,
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
        perforated panel under the controls, which is both what the reference
        sets did and what stops the plate reading as a half-empty sheet.
      */}
      <div className="tv-fascia__grille" aria-hidden="true" />

      {/*
        Three lamps, three different things, and none of them labelled:
        a fascia of this period explained nothing and expected you to learn it.

          red     mains. On when the set is on, and on for no other reason.
          amber   trouble. Normally dark: it lights when the set is on and
                  something has failed, which is the one thing you cannot tell
                  by looking at the screen. A card at 3am is closedown; a card
                  at 8pm with the amber lit is a programme that would not play.
          green   a source. Lit once the set has somewhere to get programmes
                  from, dark while it is running on what it came with.

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
 * knob (drag it, or focus it and use the keys) at a third of the size, so a
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
