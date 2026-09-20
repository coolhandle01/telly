import type { ReactNode } from 'react'

export interface OsdProps {
  /** The word burnt in beside the value: `VOL`, `CH`. */
  word: string
  /** What a screen-reader hears instead of the drawing. */
  label: string
  /** Which corner it sits in. A set used both, for different things. */
  corner?: 'top-left' | 'bottom-left'
  children: ReactNode
}

/**
 * The on-screen display: a word and a value burnt over the picture, the way a
 * set with no menus told you what it was doing.
 *
 * One component for both displays because they were one generator: the same
 * box, the same lettering, the same glow, in whichever corner that set's
 * designer put it. Presentational only: whoever renders it has already
 * decided it should be seen.
 */
export function Osd({ word, label, corner = 'bottom-left', children }: OsdProps) {
  return (
    <div className="tv-osd" data-corner={corner}>
      <style>{OSD_CSS}</style>
      <div className="tv-osd__box" role="img" aria-label={label}>
        <span className="tv-osd__word" aria-hidden="true">
          {word}
        </span>
        {children}
      </div>
    </div>
  )
}

export const OSD_CSS = `
.tv-osd {
  position: absolute;
  inset: 0;
  display: flex;
  padding: clamp(0.75rem, 4%, 2rem);
  pointer-events: none;
}
.tv-osd[data-corner='bottom-left'] { align-items: flex-end; justify-content: flex-start; }
.tv-osd[data-corner='top-left'] { align-items: flex-start; justify-content: flex-start; }
.tv-osd__box {
  display: flex;
  align-items: center;
  gap: clamp(0.4rem, 2%, 0.9rem);
  padding: 0.45rem 0.7rem;
  background: rgba(0, 0, 0, 0.42);
  box-shadow: 0 0 0 0.12rem rgba(255, 255, 255, 0.22), 0 0.2rem 1rem rgba(0, 0, 0, 0.5);
}
.tv-osd__word {
  font: 700 clamp(0.75rem, 2.6vw, 1.15rem)/1 ui-monospace, Menlo, monospace;
  letter-spacing: 0.22em;
  color: #fff;
  text-shadow: 0 0 0.5rem rgba(255, 255, 255, 0.8);
}
/*
  The numeral is the display, so it is set larger than its label and without
  the tracking: a channel number was the one big thing these generators drew.
*/
.tv-osd__value {
  font: 700 clamp(1.1rem, 4.4vw, 2rem)/1 ui-monospace, Menlo, monospace;
  color: #fff;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 0.6rem rgba(255, 255, 255, 0.85);
}
.tv-osd__bars { display: flex; gap: clamp(0.12rem, 0.5vw, 0.28rem); }
.tv-osd__seg {
  width: clamp(0.25rem, 1.1vw, 0.5rem);
  height: clamp(0.8rem, 3vw, 1.4rem);
}
.tv-osd__seg[data-lit='true'] {
  background: #fff;
  box-shadow: 0 0 0.45rem rgba(255, 255, 255, 0.85);
}
.tv-osd__seg[data-lit='false'] {
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 0.08rem rgba(255, 255, 255, 0.35);
}
`
