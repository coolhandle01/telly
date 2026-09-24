import { describe, expect, it } from 'vitest'
import { render, screen } from '../../support/render'
import { ChannelOverlay } from '@/ui/controls/ChannelOverlay'

const display = () => screen.getByRole('img', { name: /^CH/ })

describe('ChannelOverlay', () => {
  it('shows the preset that is in', () => {
    render(<ChannelOverlay channel={3} />)

    expect(display()).toHaveTextContent('CH')
    expect(display()).toHaveTextContent('3')
    expect(display()).toHaveAccessibleName('CH 3')
  })

  // The volume sits bottom-left. Two generators in the same corner would have
  // drawn over each other, so the set put them in different ones.
  it('sits in the other corner from the volume', () => {
    const { container } = render(<ChannelOverlay channel={1} />)

    expect(container.querySelector('.tv-osd')).toHaveAttribute('data-corner', 'top-left')
  })
})
