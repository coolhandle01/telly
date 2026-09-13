export interface SourceLinkProps {
  /** Where the source lives. Absent and no link is drawn. */
  href: string
}

/**
 * The way out to the source.
 *
 * Linking back to GitHub is what GitHub's mark is published for, which is the
 * whole of why this one image is a reproduction when nothing else in the app
 * is: the test cards and the station idents are original because the
 * alternative would be copying somebody's work, and this is the one case where
 * copying is the point. So it is copied, not re-traced — the path below is
 * `icons/mark-github-16.svg` from primer/octicons v19.33.0, character for
 * character.
 *
 * The 16px drawing is its own set of curves rather than a scaled 24px one, so
 * this is the file to take at this size. Its `viewBox` stays 0 0 16 16 and
 * width and height stay equal, which makes the aspect ratio structural instead
 * of a thing to remember.
 *
 * The fill is named rather than inherited. GitHub publishes the mark in black
 * and in white, and the chip sits on a near-black ground, so white is the
 * variant; writing it down keeps a later change to the chip's text colour from
 * quietly tinting a logo that is not ours to tint.
 */
export function SourceLink({ href }: SourceLinkProps) {
  return (
    <a
      className="source-link"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Source on GitHub"
    >
      <style>{CSS}</style>
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
        <path
          fill="#ffffff"
          d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"
        />
      </svg>
      <span className="source-link__label">Source</span>
    </a>
  )
}

const CSS = `
.source-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.5rem;
  padding: 0 0.85rem;
  border: 1px solid #3a3f44;
  border-radius: 4px;
  background: #16191c;
  color: #e7e9ea;
  font: 0.85rem/1 ui-monospace, Menlo, monospace;
  letter-spacing: 0.04em;
  text-decoration: none;
}
.source-link:hover { background: #1e2226; }
.source-link:focus-visible {
  outline: 3px solid #ffe6a8;
  outline-offset: 2px;
}
/* The mark alone once there is no room for the word beside it. */
@media (max-width: 30rem) {
  .source-link { padding: 0 0.7rem; }
  .source-link__label { display: none; }
}
`
