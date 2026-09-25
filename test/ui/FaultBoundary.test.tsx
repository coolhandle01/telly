import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '../support/render'
import { FakeClock } from '../support/fakeClock'
import { FaultBoundary } from '@/ui/FaultBoundary'

const CHANNEL = 'CHANNEL ONE'
const AFTERNOON = new Date(2026, 8, 9, 14, 32, 7)

function Throwing(): never {
  throw new Error('the part that draws the picture broke')
}

describe('FaultBoundary', () => {
  // React writes the caught error to the console itself. The write is the
  // library's, and letting it through fills the run with a stack that the
  // assertions below already account for.
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes the set through while nothing has thrown', () => {
    render(
      <FaultBoundary channelName={CHANNEL} clock={new FakeClock(AFTERNOON)}>
        <p>Television</p>
      </FaultBoundary>,
    )

    expect(screen.getByText('Television')).toBeInTheDocument()
  })

  it('puts the fault card up when a child throws in its render', () => {
    render(
      <FaultBoundary channelName={CHANNEL} clock={new FakeClock(AFTERNOON)}>
        <Throwing />
      </FaultBoundary>,
    )

    expect(screen.getByRole('group', { name: /closedown test card/i })).toBeInTheDocument()
    expect(screen.getByText(/receiver fault/i)).toBeInTheDocument()
  })

  // The screen a card is drawn on has to have a size: `.testcard` is
  // positioned absolutely and resolves against `.screen`.
  it('draws the card inside the screen, so it has something to fill', () => {
    const view = render(
      <FaultBoundary channelName={CHANNEL} clock={new FakeClock(AFTERNOON)}>
        <Throwing />
      </FaultBoundary>,
    )

    expect(view.container.querySelector('main.set > div.screen')).not.toBeNull()
  })

  // The cause is still there: a pool of the wrong shape does not right itself,
  // and a boundary that re-rendered the child on every new prop would throw,
  // catch and throw again for as long as the tab was open.
  it('stays on the fault when it is rendered again', () => {
    let renders = 0
    function Counting(): never {
      renders += 1
      throw new Error('still broken')
    }

    const view = render(
      <FaultBoundary channelName={CHANNEL} clock={new FakeClock(AFTERNOON)}>
        <Counting />
      </FaultBoundary>,
    )
    const attempts = renders

    view.rerender(
      <FaultBoundary channelName={CHANNEL} clock={new FakeClock(new Date(2026, 8, 9, 15, 0, 0))}>
        <Counting />
      </FaultBoundary>,
    )

    expect(renders).toBe(attempts)
    expect(screen.getByText(/receiver fault/i)).toBeInTheDocument()
  })
})
