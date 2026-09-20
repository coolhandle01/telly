import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../test/render'
import { GoogleSignInButton } from './GoogleSignInButton'

/**
 * These are brand-compliance tests as much as UI tests. Each one pins a rule
 * from Google's sign-in branding guidelines that a well-meaning edit would
 * otherwise quietly break — and breaking one costs a rejected verification
 * submission weeks later, far from the commit that did it.
 */
describe('GoogleSignInButton', () => {
  it('is named with permitted wording', () => {
    render(<GoogleSignInButton onClick={() => {}} />)

    // The label set is closed. "Use my subscriptions", which this replaced,
    // was not on it.
    const button = screen.getByRole('button', { name: 'Sign in with Google' })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
  })

  it('reports the click, so the caller can open the popup from the gesture', async () => {
    const onClick = vi.fn()
    const { user } = render(<GoogleSignInButton onClick={onClick} />)

    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('keeps the mark decorative, so the label alone names the button', () => {
    render(<GoogleSignInButton onClick={() => {}} />)

    const mark = screen.getByRole('button').querySelector('svg')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    // Named by its text and nothing else: a screen reader that also announced
    // the logo would read the brand twice.
    expect(screen.getByRole('button').textContent).toBe('Sign in with Google')
  })

  it('draws the mark square and to the canonical viewBox', () => {
    render(<GoogleSignInButton onClick={() => {}} />)

    const mark = screen.getByRole('button').querySelector('svg')
    // The guidelines forbid altering the logo's aspect ratio. Equal width and
    // height against a square viewBox makes that impossible rather than
    // merely discouraged.
    expect(mark).toHaveAttribute('viewBox', '0 0 48 48')
    expect(mark?.getAttribute('width')).toBe(mark?.getAttribute('height'))
  })

  it('uses the four brand colours, unmodified', () => {
    render(<GoogleSignInButton onClick={() => {}} />)

    const fills = Array.from(screen.getByRole('button').querySelectorAll('path')).map((p) =>
      p.getAttribute('fill'),
    )

    // Recolouring the G — to match a cabinet, say — is exactly the kind of
    // sympathetic change brand review rejects.
    expect(fills).toEqual(['#EA4335', '#4285F4', '#FBBC05', '#34A853'])
  })
})
