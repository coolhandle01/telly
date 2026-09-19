/**
 * Courier New advances 0.6em for every glyph (the whole point of a monospaced
 * face) so a caption's width is arithmetic rather than guesswork, and the card
 * can size its own text without measuring anything in a DOM.
 */
const MONO_ADVANCE = 0.6

/**
 * The largest font size at which `text` still fits `maxWidth`, never larger
 * than `preferred`.
 *
 * Captions vary: a channel name, a date, a resume time, a fault that runs to
 * forty-odd characters. A line that spills out of its box reads as a mistake
 * rather than as a test card, and the box is a fixed fraction of the picture,
 * so it is the type that has to give.
 */
export function fitFontSize(
  text: string,
  maxWidth: number,
  preferred: number,
  letterSpacing = 0,
): number {
  if (text.length === 0 || maxWidth <= 0) return preferred

  const widthAt = (size: number) => text.length * (size * MONO_ADVANCE + letterSpacing)
  if (widthAt(preferred) <= maxWidth) return preferred

  const fitted = (maxWidth / text.length - letterSpacing) / MONO_ADVANCE
  // A box too narrow for even the letter-spacing would give a negative size.
  return Math.max(1, fitted)
}
