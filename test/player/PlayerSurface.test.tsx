import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '../support/render'
import { FakePlayer } from '../support/fakePlayer'
import type { ProgrammeOnAir } from '@/player/player'
import { PlayerSurface } from '@/player/PlayerSurface'

const programme = (
  videoId: string,
  offsetSec: number,
  endsAtSec = 600,
): ProgrammeOnAir => ({
  kind: 'programme',
  videoId,
  title: `Programme ${videoId}`,
  offsetSec,
  endsAt: new Date(2026, 8, 9, 6, 0, endsAtSec),
  daypart: 'breakfast',
})

function mount(onAir: ProgrammeOnAir = programme('vid-1', 90), props = {}) {
  const player = new FakePlayer()
  const onFault = vi.fn()
  const view = render(
    <PlayerSurface onAir={onAir} player={player} onFault={onFault} {...props} />,
  )
  return { ...view, player, onFault }
}

const shim = (): HTMLElement => screen.getByTestId('player-shim')

describe('PlayerSurface', () => {
  it('joins the programme at the offset it was handed, doing no sums of its own', () => {
    const { player } = mount(programme('vid-1', 742))

    expect(player.loads).toEqual([{ videoId: 'vid-1', offsetSec: 742 }])
  })

  // jsdom has no layout, so it cannot see a picture shrink to a postage stamp.
  // What it can see is the rule that prevents it: the host must fill the frame,
  // because the player mounts its iframe *inside* the host and a percentage
  // height against an indefinite one collapses.
  it('makes the host fill the frame it is adopted into', () => {
    const host = document.createElement('div')
    mount(programme('vid-1', 0), { host })

    expect(host.style.position).toBe('absolute')
    expect(host.style.inset).toBe('0px')
  })

  it('does not reload as the offset ticks on within the same programme', () => {
    const { player, rerender } = mount(programme('vid-1', 90))

    rerender(<PlayerSurface onAir={programme('vid-1', 91)} player={player} />)
    rerender(<PlayerSurface onAir={programme('vid-1', 92)} player={player} />)

    expect(player.loads).toEqual([{ videoId: 'vid-1', offsetSec: 90 }])
  })

  it('loads the next programme when the schedule moves on', () => {
    const { player, rerender } = mount(programme('vid-1', 599))

    rerender(<PlayerSurface onAir={programme('vid-2', 0, 1500)} player={player} />)

    expect(player.loads).toEqual([
      { videoId: 'vid-1', offsetSec: 599 },
      { videoId: 'vid-2', offsetSec: 0 },
    ])
  })

  it('loads a repeat again, even though it is the same video', () => {
    const { player, rerender } = mount(programme('vid-1', 90, 600))

    rerender(<PlayerSurface onAir={programme('vid-1', 0, 3000)} player={player} />)

    expect(player.loads).toHaveLength(2)
  })

  it('names the picture for anyone who cannot see it', () => {
    mount()

    expect(screen.getByRole('region', { name: 'Programme vid-1' })).toBeInTheDocument()
  })

  it('puts the injected host inside the stage, under the shim', () => {
    const host = document.createElement('div')
    mount(programme('vid-1', 0), { host })

    expect(screen.getByRole('region', { name: 'Programme vid-1' })).toContainElement(host)
    expect(shim().compareDocumentPosition(host)).toBe(Node.DOCUMENT_POSITION_PRECEDING)
  })

  it('keeps the shim out of the accessibility tree and out of the tab order', async () => {
    const { user } = mount()

    expect(shim()).toHaveAttribute('aria-hidden', 'true')
    expect(shim()).not.toHaveAttribute('tabindex')

    await user.tab()
    expect(shim()).not.toHaveFocus()
  })

  it('leaves the page\'s own controls reachable by keyboard', async () => {
    const player = new FakePlayer()
    const { user } = render(
      <>
        <PlayerSurface onAir={programme('vid-1', 0)} player={player} />
        <button type="button">Sound</button>
      </>,
    )

    await user.tab()

    expect(screen.getByRole('button', { name: 'Sound' })).toHaveFocus()
  })

  it('sets the volume it was given, and follows it when it changes', () => {
    const { player, rerender } = mount(programme('vid-1', 0), { volume: 0.5 })

    rerender(<PlayerSurface onAir={programme('vid-1', 0)} player={player} volume={0.2} />)

    expect(player.volumes).toEqual([0.5, 0.2])
  })

  it('touches the volume at all only when it was told one', () => {
    const { player } = mount()

    expect(player.volumes).toEqual([])
  })

  it('reports a fault upwards rather than trying to recover', () => {
    const { player, onFault } = mount()

    act(() => player.fault({ videoId: 'vid-1', code: 150, reason: 'not embeddable' }))

    expect(onFault).toHaveBeenCalledWith({
      videoId: 'vid-1',
      code: 150,
      reason: 'not embeddable',
    })
    expect(player.stops).toBe(0)
    expect(player.destroys).toBe(0)
  })

  it('stops the picture when the screen goes away, and lets go of the fault line', () => {
    const { player, unmount } = mount()
    expect(player.faultListenerCount).toBe(1)

    unmount()

    expect(player.stops).toBe(1)
    expect(player.faultListenerCount).toBe(0)
  })

  it('does not destroy a player it was merely lent', () => {
    const { player, unmount } = mount()

    unmount()

    expect(player.destroys).toBe(0)
  })
})
