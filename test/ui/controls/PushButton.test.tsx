import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../support/render'
import { PushButton } from '@/ui/controls/PushButton'

describe('PushButton', () => {
  it('is a real button, named by what is written on it', () => {
    render(<PushButton onClick={() => {}}>What&apos;s on</PushButton>)

    const button = screen.getByRole('button', { name: "What's on" })
    expect(button.tagName).toBe('BUTTON')
    // Inside a form it must not submit it.
    expect(button).toHaveAttribute('type', 'button')
  })

  it('reports a press when clicked', async () => {
    const onClick = vi.fn()
    const { user } = render(<PushButton onClick={onClick}>Switch on</PushButton>)

    await user.click(screen.getByRole('button', { name: 'Switch on' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is operable from the keyboard, as a button is', async () => {
    const onClick = vi.fn()
    const { user } = render(<PushButton onClick={onClick}>Switch on</PushButton>)

    await user.tab()
    expect(screen.getByRole('button', { name: 'Switch on' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('says it is depressed when it is', () => {
    render(
      <PushButton onClick={() => {}} pressed>
        What&apos;s on
      </PushButton>,
    )

    expect(screen.getByRole('button', { name: "What's on" })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('says it is out when it is', () => {
    render(
      <PushButton onClick={() => {}} pressed={false}>
        What&apos;s on
      </PushButton>,
    )

    expect(screen.getByRole('button', { name: "What's on" })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('is not a toggle at all when it was never given a pressed state', () => {
    render(<PushButton onClick={() => {}}>Use my subscriptions</PushButton>)

    expect(screen.getByRole('button', { name: 'Use my subscriptions' })).not.toHaveAttribute(
      'aria-pressed',
    )
  })

  it('shows the press in the picture, not only in the label', () => {
    const { rerender } = render(
      <PushButton onClick={() => {}} pressed={false}>
        Push
      </PushButton>,
    )
    const out = screen.getByRole('button').className

    rerender(
      <PushButton onClick={() => {}} pressed>
        Push
      </PushButton>,
    )

    expect(screen.getByRole('button').className).not.toBe(out)
    expect(screen.getByRole('button')).toHaveAttribute('data-pressed', 'true')
  })
  it('draws the press into the surface, not only into the label', () => {
    const { container, rerender } = render(
      <PushButton onClick={() => {}} pressed={false}>
        Push
      </PushButton>,
    )
    const face = () => container.querySelector('.tv-push__face')
    const out = face()?.outerHTML

    rerender(
      <PushButton onClick={() => {}} pressed>
        Push
      </PushButton>,
    )

    // The moulding is lit differently when the key is down: the highlight
    // moves. Which values move is the look's business, that they move is not.
    expect(out).toBeTruthy()
    expect(face()?.outerHTML).not.toBe(out)
    expect(face()).toHaveAttribute('data-dome', 'in')
  })
})
