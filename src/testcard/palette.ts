/** The card's ink. Broadcast-ish, but drawn from scratch: no house style copied. */
export const PALETTE = {
  surround: '#0b0b0b',
  castellationLight: '#f2f2f2',
  castellationDark: '#0d0d0d',
  picture: '#7f7f7f',
  frame: '#f2f2f2',
  ink: '#f2f2f2',
  captionBox: '#101010',
  gratingLight: '#f2f2f2',
  gratingDark: '#0d0d0d',
  /*
    The fault card. Amber on near-black, because that is what a warning has
    looked like on every panel since long before television: it reads as
    *wrong* at a glance and it cannot be mistaken for any of the five cards a
    working station transmits, none of which is amber anywhere.
  */
  alertGround: '#0a0704',
  alertInk: '#f6b23c',
  alertInkDim: '#c98d27',
  alertBlock: '#e09a1e',
} as const

/** EBU 100/0/100/0 bar order, brightest to darkest. */
export const COLOUR_BARS = [
  { name: 'white', fill: '#ffffff' },
  { name: 'yellow', fill: '#ffff00' },
  { name: 'cyan', fill: '#00ffff' },
  { name: 'green', fill: '#00ff00' },
  { name: 'magenta', fill: '#ff00ff' },
  { name: 'red', fill: '#ff0000' },
  { name: 'blue', fill: '#0000ff' },
  { name: 'black', fill: '#000000' },
] as const

/** `0` -> `#000000`, `1` -> `#ffffff`, linear in between. */
export function greyLevel(fraction: number): string {
  const value = Math.round(Math.min(1, Math.max(0, fraction)) * 255)
  const hex = value.toString(16).padStart(2, '0')
  return `#${hex}${hex}${hex}`
}
