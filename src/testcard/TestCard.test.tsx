import { describe, expect, it } from 'vitest'
import { act, render, screen } from '../test/render'
import { FakeClock } from '../test/fakeClock'
import { TestCard } from './TestCard'

const AT = new Date(2026, 8, 12, 3, 14, 2)

const mount = (clock: FakeClock) =>
  render(<TestCard variant="closedown" channelName="CHANNEL ONE" clock={clock} />)

describe('TestCard', () => {
  it('draws the card for the instant the injected clock reports', () => {
    mount(new FakeClock(AT))
    expect(screen.getByRole('timer')).toHaveTextContent('03.14.02')
  })

  it('follows the clock as it ticks', () => {
    const clock = new FakeClock(AT)
    mount(clock)

    act(() => clock.set(new Date(2026, 8, 12, 3, 14, 3)))

    expect(screen.getByRole('timer')).toHaveTextContent('03.14.03')
  })

  it('lets go of the clock when it goes away', () => {
    const clock = new FakeClock(AT)
    const { unmount } = mount(clock)
    expect(clock.subscriberCount).toBe(1)

    unmount()

    expect(clock.subscriberCount).toBe(0)
  })

  it('carries the message it is given', () => {
    render(
      <TestCard
        variant="interlude"
        channelName="CHANNEL ONE"
        clock={new FakeClock(AT)}
        message="PROGRAMMES WILL CONTINUE SHORTLY"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/continue shortly/i)
  })
})
