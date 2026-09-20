/**
 * The set's typography, in one place.
 *
 * A 1970s fascia was not set in a code font. Legends were stamped or
 * silk-screened in a condensed grotesque (Helvetica, Univers, DIN) in caps,
 * small, and widely tracked, because the letters had to read at arm's length
 * across a lit room without drawing attention to themselves.
 *
 * No web fonts: everything here is a system stack, so the set draws instantly
 * and works offline.
 */

/** Stamped legends: POWER, VOLUME, the preset numerals. */
export const LEGEND_FONT = `'Helvetica Neue', 'Arial Narrow', Helvetica, Arial, sans-serif`

/** The maker's badge. The same family, given room to be a wordmark. */
export const BADGE_FONT = `'Helvetica Neue', Helvetica, Arial, sans-serif`

/**
 * Controls are furniture, not prose. Dragging a knob or double-tapping a
 * button should never leave half the fascia highlighted in blue.
 */
export const NO_SELECT = `
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
`
