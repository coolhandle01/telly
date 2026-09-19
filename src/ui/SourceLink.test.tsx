import { describe, expect, it } from 'vitest'
import { render, screen } from '../test/render'
import { SourceLink } from './SourceLink'

/**
 * Brand-compliance tests, in the same spirit as the ones over the Google
 * button. GitHub's mark is the only image in the app we did not draw, so the
 * rules that come with borrowing it are pinned here rather than left to
 * whoever next tidies the corner.
 */
describe('SourceLink', () => {
  it('points at the source and opens it safely', () => {
    render(<SourceLink href="https://github.com/coolhandle01/telly" />)

    const link = screen.getByRole('link', { name: 'Source on GitHub' })
    expect(link).toHaveAttribute('href', 'https://github.com/coolhandle01/telly')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer noopener')
  })

  it('keeps the mark decorative, so the wording alone names the link', () => {
    render(<SourceLink href="https://github.com/coolhandle01/telly" />)

    const link = screen.getByRole('link')
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    // The accessible name has to contain the visible word, or someone saying
    // "Source" to a voice control is naming something the page won't match.
    // Read from the label span, not the anchor: the anchor also holds the
    // component's stylesheet, and `textContent` would hand back the CSS.
    const label = link.querySelector('.source-link__label')?.textContent
    expect(label).toBe('Source')
    expect(link.getAttribute('aria-label')).toContain(label)
  })

  it('draws the mark square and to the canonical viewBox', () => {
    render(<SourceLink href="https://github.com/coolhandle01/telly" />)

    const mark = screen.getByRole('link').querySelector('svg')
    // 0 0 16 16 is the box the 16px octicon is drawn in, and the 16px octicon
    // is its own set of curves rather than a shrunk 24px one. Equal width and
    // height against a square box makes the aspect ratio structural.
    expect(mark).toHaveAttribute('viewBox', '0 0 16 16')
    expect(mark?.getAttribute('width')).toBe(mark?.getAttribute('height'))
  })

  it('fills the mark with a published variant rather than inheriting one', () => {
    render(<SourceLink href="https://github.com/coolhandle01/telly" />)

    const fill = screen.getByRole('link').querySelector('path')?.getAttribute('fill')

    // GitHub publishes the mark in black and in white. currentColor would hand
    // the logo whatever the chip's text colour happens to be (off-white
    // today, a sympathetic teak tomorrow) and neither is a variant GitHub
    // publishes.
    expect(fill).toBe('#ffffff')
  })

  it('reproduces the octicon rather than a drawing of it', () => {
    render(<SourceLink href="https://github.com/coolhandle01/telly" />)

    const d = screen.getByRole('link').querySelector('path')?.getAttribute('d')

    // Verbatim from primer/octicons v19.33.0, icons/mark-github-16.svg. The
    // start and end are enough to catch a re-trace or a stray edit; the whole
    // path lives in the component, where it can be diffed against the package.
    expect(d?.startsWith('M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656')).toBe(true)
    expect(d?.endsWith('s.641-.14 1-.5c.266-.265.47-.5.657-.656')).toBe(true)
  })
})
