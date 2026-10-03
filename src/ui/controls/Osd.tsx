import type { ReactNode } from 'react'
import './Osd.css'

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
 * designer put it. Presentational only — whoever renders it has already
 * decided it should be seen.
 */
export function Osd({ word, label, corner = 'bottom-left', children }: OsdProps) {
  return (
    <div className="tv-osd" data-corner={corner}>
      <div className="tv-osd__box" role="img" aria-label={label}>
        <span className="tv-osd__word" aria-hidden="true">
          {word}
        </span>
        {children}
      </div>
    </div>
  )
}
