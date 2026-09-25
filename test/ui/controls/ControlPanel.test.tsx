import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '../../support/render'
import { ControlPanel, type ControlPanelProps, type TrimmerId } from '@/ui/controls/ControlPanel'

/** Every `url(#…)` anything in here paints with, in document order. */
function referencesIn(root: ParentNode) {
  return [...root.querySelectorAll('[fill], [filter], [stroke]')].flatMap((node) =>
    ['fill', 'filter', 'stroke']
      .map((attribute) => node.getAttribute(attribute))
      .flatMap((value) => /^url\(#(.+)\)$/.exec(value ?? '')?.[1] ?? []),
  )
}

/** A bare panel, for the tests that need two of them side by side. */
function Inert({ channel = 1 }: { channel?: number }) {
  return (
    <ControlPanel
      on
      onToggleOn={() => {}}
      volume={0.5}
      onVolumeChange={() => {}}
      channel={channel}
      onChannelChange={() => {}}
    />
  )
}

function mount(props: Partial<ControlPanelProps> = {}) {
  const onToggleOn = vi.fn()
  const onVolumeChange = vi.fn()
  const onChannelChange = vi.fn()
  const view = render(
    <ControlPanel
      on={false}
      onToggleOn={onToggleOn}
      volume={0.8}
      onVolumeChange={onVolumeChange}
      channel={1}
      onChannelChange={onChannelChange}
      {...props}
    />,
  )
  return { ...view, onToggleOn, onVolumeChange, onChannelChange }
}

describe('ControlPanel', () => {
  describe('the power button', () => {
    // A legend stamped into bakelite does not change when you press it. The
    // button says Power whatever state it is in; what moves is the button.
    it('is called Power whether the set is on or off', () => {
      const { rerender } = mount({ on: false })
      expect(screen.getByRole('button', { name: 'Power' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )

      rerender(
        <ControlPanel
          on
          onToggleOn={() => {}}
          volume={0.8}
          onVolumeChange={() => {}}
          channel={1}
          onChannelChange={() => {}}
        />,
      )

      expect(screen.getByRole('button', { name: 'Power' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('reports the press', async () => {
      const { user, onToggleOn } = mount({ on: false })

      await user.click(screen.getByRole('button', { name: 'Power' }))

      expect(onToggleOn).toHaveBeenCalledOnce()
    })
  })


  it('carries no words and no modern controls at all', () => {
    mount({ on: true })

    // Power and Volume, and nothing else: no listings button, no sign-in, no
    // error text. Anything that needs explaining lives off the cabinet.
    const names = screen.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(['Power'])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  describe('the preset bank', () => {
    it('is a radio group with exactly one preset in', () => {
      mount({ channel: 3 })

      expect(screen.getByRole('radiogroup', { name: /channel/i })).toBeInTheDocument()
      const pressed = screen
        .getAllByRole<HTMLInputElement>('radio')
        .filter((radio) => radio.checked)
      expect(pressed).toHaveLength(1)
      expect(screen.getByRole('radio', { name: '3' })).toBeChecked()
    })

    it('reports the channel that was pressed', async () => {
      const { user, onChannelChange } = mount({ channel: 1 })

      await user.click(screen.getByRole('radio', { name: '5' }))

      expect(onChannelChange).toHaveBeenCalledWith(5)
    })

    it('releases the one that was in, mechanically', async () => {
      function Live() {
        const [channel, setChannel] = useState(1)
        return (
          <ControlPanel
            on
            onToggleOn={() => {}}
            volume={0.8}
            onVolumeChange={() => {}}
            channel={channel}
            onChannelChange={setChannel}
          />
        )
      }
      const { user } = render(<Live />)

      await user.click(screen.getByRole('radio', { name: '4' }))

      expect(screen.getByRole('radio', { name: '4' })).toBeChecked()
      expect(screen.getByRole('radio', { name: '1' })).not.toBeChecked()
      expect(
        screen.getAllByRole<HTMLInputElement>('radio').filter((radio) => radio.checked),
      ).toHaveLength(1)
    })

    it('moves between presets with the arrow keys, as a radio bank does', async () => {
      function Live() {
        const [channel, setChannel] = useState(1)
        return (
          <ControlPanel
            on
            onToggleOn={() => {}}
            volume={0.8}
            onVolumeChange={() => {}}
            channel={channel}
            onChannelChange={setChannel}
          />
        )
      }
      const { user } = render(<Live />)
      screen.getByRole('radio', { name: '1' }).focus()

      await user.keyboard('{ArrowDown}')

      expect(screen.getByRole('radio', { name: '2' })).toBeChecked()
    })
  })

  describe('the volume knob', () => {
    it('is on the fascia as a slider, showing the volume it was handed', () => {
      mount({ volume: 0.8 })

      const knob = screen.getByRole('slider', { name: /volume/i })
      expect(knob).toHaveAttribute('aria-valuenow', '0.8')
      expect(knob).toHaveAttribute('aria-valuetext', '80%')
    })

    it('reports a turn upward', async () => {
      const { user, onVolumeChange } = mount({ volume: 0.8 })
      screen.getByRole('slider', { name: /volume/i }).focus()

      await user.keyboard('{ArrowUp}')

      expect(onVolumeChange).toHaveBeenCalledExactlyOnceWith(0.85)
    })

    it('turns down as far as silence and no further', async () => {
      function Live() {
        const [volume, setVolume] = useState(0.05)
        return (
          <ControlPanel
            on
            onToggleOn={() => {}}
            volume={volume}
            onVolumeChange={setVolume}
            channel={1}
            onChannelChange={() => {}}
          />
        )
      }
      const { user } = render(<Live />)
      screen.getByRole('slider', { name: /volume/i }).focus()

      await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')

      expect(screen.getByRole('slider', { name: /volume/i })).toHaveAttribute('aria-valuenow', '0')
    })
  })



  describe('the cabinetry', () => {
    it('draws only the controls that work as controls', () => {
    mount()

      // Six drawn presets, five drawn tuning buttons, three lamps — and not
      // one of them a button anybody can reach.
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Power'])
      expect(screen.queryByRole('button', { name: '1' })).toBeNull()
    })

    it('stamps the maker on the badge plate, and says it only once', () => {
      const { container } = mount()

      const badge = container.querySelector('.tv-fascia__badge')
      expect(badge).toHaveTextContent('Telly')
      // The card already names the channel; a second name here is just noise.
      expect(badge?.closest('[aria-hidden="true"]')).not.toBeNull()
    })

    it('hides its scenery from a screen reader', () => {
      const { container } = mount()

      // The presets are real controls now, so they are deliberately not here.
      const scenery = container.querySelectorAll(
        '.tv-fascia__tuner, .tv-fascia__lamp, .tv-fascia__badge, .tv-fascia__lip',
      )
      expect(scenery.length).toBeGreaterThan(5)
      for (const piece of scenery) {
        expect(piece.closest('[aria-hidden="true"]')).not.toBeNull()
        expect(piece).not.toHaveAttribute('tabindex')
      }
    })

    it('draws its surfaces as scenery, every one of them', () => {
      const { container } = mount()

      // Veneer, caps, badge plate, the knob's dome: all drawn, none of it
      // reachable and none of it named.
      const drawn = container.querySelectorAll('svg')
      expect(drawn.length).toBeGreaterThan(8)
      for (const surface of drawn) {
        expect(surface.closest('[aria-hidden="true"]')).not.toBeNull()
        expect(surface).toHaveAttribute('focusable', 'false')
      }
    })

    it('lets the tab key straight out of the panel again', async () => {
      const { user } = mount()

      // Power, the preset bank (one tab stop, as a radio group is), and the
      // knob. The fourth press should leave the fascia.
      for (let press = 0; press < 4; press++) await user.tab()

      expect(document.body).toHaveFocus()
    })
  })

  describe('the tuning trimmers', () => {
    // These are the adjusters the presets hinged open to expose on the real
    // chassis: rotary trimmers, set once with a fingernail and then left. They
    // adjust nothing here, so they are drawn and nothing else.
    it('are furniture: no role, no name, nothing in the accessibility tree', () => {
      const { container } = mount()

      const trimmers = container.querySelectorAll('.tv-fascia__tuner')
      expect(trimmers).toHaveLength(5)
      for (const trimmer of trimmers) {
        expect(trimmer.closest('[aria-hidden="true"]')).not.toBeNull()
        // Not a button, not a slider, not anything: an inert adjuster given a
        // role would be a promise the fascia cannot keep.
        expect(trimmer).not.toHaveAttribute('role')
        expect(trimmer).not.toHaveAttribute('tabindex')
        expect(trimmer.querySelectorAll('button, input, [role], [tabindex]')).toHaveLength(0)
      }
      // One slider on the fascia — the volume knob — and no others.
      expect(screen.getAllByRole('slider')).toHaveLength(1)
      expect(screen.queryByRole('button', { name: 'V' })).toBeNull()
    })

    it('cannot be reached with the tab key', async () => {
      const { user, container } = mount()

      // Round the whole fascia and out the other side, twice over.
      for (let press = 0; press < 8; press++) {
        await user.tab()
        expect(document.activeElement?.closest('.tv-fascia__tuners')).toBeNull()
      }
      expect(container.querySelectorAll('.tv-fascia__tuners [tabindex]')).toHaveLength(0)
    })
  })

  describe('two sets in the same room', () => {
    it('gives each panel definitions of its own', () => {
      const { container } = render(
        <>
          <Inert channel={2} />
          <Inert channel={5} />
        </>,
      )

      // Ids are global to the document: a shared one would have the second
      // panel painting itself with the first panel's filters, and the pair
      // would drift apart the moment one of them changed.
      const ids = [...container.querySelectorAll('[id]')].map((node) => node.id)
      expect(ids.length).toBeGreaterThan(8)
      expect(new Set(ids).size).toBe(ids.length)
      for (const reference of referencesIn(container)) {
        expect(container.querySelectorAll(`[id="${reference}"]`)).toHaveLength(1)
      }
    })

    it('keeps each preset bank to itself, one preset in on each', async () => {
      function Pair() {
        const [left, setLeft] = useState(1)
        const [right, setRight] = useState(1)
        return (
          <>
            <ControlPanel
              on
              onToggleOn={() => {}}
              volume={0.5}
              onVolumeChange={() => {}}
              channel={left}
              onChannelChange={setLeft}
            />
            <ControlPanel
              on
              onToggleOn={() => {}}
              volume={0.5}
              onVolumeChange={() => {}}
              channel={right}
              onChannelChange={setRight}
            />
          </>
        )
      }
      const { user, container } = render(<Pair />)
      const [first, second] = [...container.querySelectorAll<HTMLElement>('.tv-fascia')]

      await user.click(within(second!).getByRole('radio', { name: '4' }))

      // Radios interlock by group name, so a name shared across panels would
      // have let this press release the other set's preset as well.
      expect(within(second!).getByRole('radio', { name: '4' })).toBeChecked()
      expect(within(first!).getByRole('radio', { name: '1' })).toBeChecked()
      for (const panel of [first!, second!]) {
        expect(
          within(panel)
            .getAllByRole<HTMLInputElement>('radio')
            .filter((radio) => radio.checked),
        ).toHaveLength(1)
      }
    })
  })

  it('puts the whole fascia in the tab order in the order it is laid out', async () => {
    const { user } = mount()

    // Down the fascia as it is laid out: presets at the top, then power, then
    // the knob. A radio group is a single tab stop — focus lands on the one
    // that is in, and the arrow keys move within it.
    await user.tab()
    expect(screen.getByRole('radio', { name: '1' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Power' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('slider', { name: /volume/i })).toHaveFocus()
  })

  describe('the trimmers', () => {
    const wire = (...ids: TrimmerId[]) => {
      const changes = vi.fn()
      const trimmers = Object.fromEntries(
        ids.map((id) => [id, { value: 0.5, onChange: (value: number) => changes(id, value) }]),
      )
      return { ...mount({ trimmers }), changes }
    }

    const ALL: TrimmerId[] = ['vertical', 'horizontal', 'brightness', 'colour', 'tuning']

    it('become real controls, one for each thing this set can adjust', () => {
      wire(...ALL)

      for (const name of ['Vertical hold', 'Horizontal hold', 'Brightness', 'Colour', 'Tuning']) {
        expect(screen.getByRole('slider', { name })).toBeInTheDocument()
      }
    })

    it('turn with the keyboard, like every other control on the set', async () => {
      const { user, changes } = wire(...ALL)

      screen.getByRole('slider', { name: 'Brightness' }).focus()
      await user.keyboard('{ArrowUp}')

      expect(changes).toHaveBeenCalledWith('brightness', 0.52)
    })

    it('each adjust their own thing and nothing else', async () => {
      const { user, changes } = wire(...ALL)

      screen.getByRole('slider', { name: 'Colour' }).focus()
      await user.keyboard('{ArrowDown}')

      expect(changes).toHaveBeenCalledTimes(1)
      expect(changes).toHaveBeenCalledWith('colour', 0.48)
    })

    it('report where they are set', () => {
      mount({ trimmers: { tuning: { value: 0.75, onChange: () => {} } } })

      const trimmer = screen.getByRole('slider', { name: 'Tuning' })
      expect(trimmer).toHaveAttribute('aria-valuenow', '0.75')
      expect(trimmer).toHaveAttribute('aria-valuetext', '75%')
    })

    it('stay drawings when nothing is listening', () => {
      // A control a viewer can reach and that adjusts nothing is worse than a
      // picture of one, so an unwired trimmer keeps out of the a11y tree.
      mount()

      expect(screen.queryAllByRole('slider')).toHaveLength(1) // the volume knob
    })

    it('wire up only the ones this set has, and leave the rest alone', () => {
      // The fascia has no way of knowing which a given set drives.
      wire('vertical', 'tuning')

      expect(screen.getByRole('slider', { name: 'Vertical hold' })).toBeInTheDocument()
      expect(screen.getByRole('slider', { name: 'Tuning' })).toBeInTheDocument()
      expect(screen.queryByRole('slider', { name: 'Brightness' })).toBeNull()
      expect(screen.getAllByRole('slider')).toHaveLength(3) // and the volume knob
    })
  })

  describe('the lamps', () => {
    const lit = (which: string) =>
      document
        .querySelector(`.tv-fascia__lamp--${which}`)
        ?.getAttribute('data-lit')

    it('lights the red one with the mains, and for nothing else', () => {
      const { rerender } = mount({ on: false, faulted: true, signedIn: true })
      expect(lit('power')).toBe('false')

      rerender(
        <ControlPanel
          on
          onToggleOn={() => {}}
          volume={0.8}
          onVolumeChange={() => {}}
          channel={1}
          onChannelChange={() => {}}
        />,
      )
      expect(lit('power')).toBe('true')
    })

    it('keeps the amber one dark in normal service', () => {
      // A warning lamp that is lit when nothing is wrong warns of nothing.
      mount({ on: true, faulted: false })
      expect(lit('tune')).toBe('false')
    })

    it('lights the amber one when the set is on and something has failed', () => {
      mount({ on: true, faulted: true })
      expect(lit('tune')).toBe('true')
    })

    it('leaves the amber one dark on a set that is switched off', () => {
      // Nothing is failing; nothing is running.
      mount({ on: false, faulted: true })
      expect(lit('tune')).toBe('false')
    })

    it('lights the green one once the set has a source of programmes', () => {
      mount({ signedIn: true })
      expect(lit('signal')).toBe('true')
    })

    it('keeps the green one lit with the set switched off', () => {
      // Signing in is not something the power switch undoes.
      mount({ on: false, signedIn: true })
      expect(lit('signal')).toBe('true')
    })

    it('leaves the green one dark while it runs on what it came with', () => {
      mount({ signedIn: false })
      expect(lit('signal')).toBe('false')
    })
  })

})
