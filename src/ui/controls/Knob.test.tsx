import { useState } from 'react'
import type { UserEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '../../test/render'
import { Knob } from './Knob'

/**
 * The knob is a controlled input, so every test drives it through a holder
 * that feeds the new value straight back — the same way the set does. Reading
 * `aria-valuenow` afterwards therefore proves two things at once: the right
 * number came out, and the dial redrew to it.
 */
function Holder({
  initial = 0.5,
  step,
  onChange,
}: {
  initial?: number
  step?: number
  onChange?: (value: number) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Knob
      label="Volume"
      value={value}
      step={step}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

const knob = () => screen.getByRole('slider', { name: /volume/i })

/** Drag helper: pointer down at `from`, through each `to`, then up. */
async function drag(
  user: UserEvent,
  target: HTMLElement,
  from: number,
  ...to: number[]
) {
  await user.pointer([
    { keys: '[MouseLeft>]', target, coords: { clientX: 40, clientY: from } },
    ...to.map((clientY) => ({ target, coords: { clientX: 40, clientY } })),
    { keys: '[/MouseLeft]', target, coords: { clientX: 40, clientY: to.at(-1) ?? from } },
  ])
}

describe('Knob', () => {
  describe('as a slider', () => {
    it('reports itself as a labelled slider over 0..1, in the tab order', () => {
      render(<Holder initial={0.35} />)

      expect(knob()).toHaveAttribute('aria-valuemin', '0')
      expect(knob()).toHaveAttribute('aria-valuemax', '1')
      expect(knob()).toHaveAttribute('aria-valuenow', '0.35')
      expect(knob()).toHaveAttribute('tabindex', '0')
    })

    it('speaks the value as a percentage, not as a fraction', () => {
      render(<Holder initial={0.35} />)

      expect(knob()).toHaveAttribute('aria-valuetext', '35%')
    })

    it('tracks a value handed to it from outside', () => {
      const { rerender } = render(<Knob label="Volume" value={0.2} onChange={() => {}} />)
      expect(knob()).toHaveAttribute('aria-valuenow', '0.2')

      rerender(<Knob label="Volume" value={0.9} onChange={() => {}} />)

      expect(knob()).toHaveAttribute('aria-valuenow', '0.9')
      expect(knob()).toHaveAttribute('aria-valuetext', '90%')
    })

    it('sits at the stop when it is handed a value beyond one', () => {
      render(<Knob label="Volume" value={1.4} onChange={() => {}} />)

      expect(knob()).toHaveAttribute('aria-valuenow', '1')
      expect(knob()).toHaveAttribute('aria-valuetext', '100%')
    })

    it('sits at the stop when it is handed a value below zero', () => {
      render(<Knob label="Volume" value={-0.2} onChange={() => {}} />)

      expect(knob()).toHaveAttribute('aria-valuenow', '0')
      expect(knob()).toHaveAttribute('aria-valuetext', '0%')
    })

    it('takes its accessible name from the label it is given', () => {
      render(<Knob label="Brightness" value={0.5} onChange={() => {}} />)

      expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
    })
  })

  describe('keyboard', () => {
    it('increments on Right and on Up', async () => {
      const { user } = render(<Holder initial={0.5} />)
      knob().focus()

      await user.keyboard('{ArrowRight}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0.55')

      await user.keyboard('{ArrowUp}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0.6')
    })

    it('decrements on Left and on Down', async () => {
      const { user } = render(<Holder initial={0.5} />)
      knob().focus()

      await user.keyboard('{ArrowLeft}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0.45')

      await user.keyboard('{ArrowDown}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0.4')
    })

    it('moves by the step it was given, not by the default', async () => {
      const { user } = render(<Holder initial={0.5} step={0.1} />)
      knob().focus()

      await user.keyboard('{ArrowRight}')

      expect(knob()).toHaveAttribute('aria-valuenow', '0.6')
    })

    it('moves further on PageUp and PageDown than on an arrow', async () => {
      const { user } = render(<Holder initial={0.5} />)
      knob().focus()

      await user.keyboard('{PageUp}')
      const up = Number(knob().getAttribute('aria-valuenow'))
      expect(up).toBeGreaterThan(0.55)
      expect(up).toBeCloseTo(0.75)

      await user.keyboard('{PageDown}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0.5')
    })

    it('goes to silence on Home and to full on End', async () => {
      const { user } = render(<Holder initial={0.5} />)
      knob().focus()

      await user.keyboard('{Home}')
      expect(knob()).toHaveAttribute('aria-valuetext', '0%')
      expect(knob()).toHaveAttribute('aria-valuenow', '0')

      await user.keyboard('{End}')
      expect(knob()).toHaveAttribute('aria-valuetext', '100%')
      expect(knob()).toHaveAttribute('aria-valuenow', '1')
    })

    it('clamps at the top and stops reporting once it is there', async () => {
      const onChange = vi.fn()
      const { user } = render(<Holder initial={0.97} onChange={onChange} />)
      knob().focus()

      await user.keyboard('{ArrowRight}')
      expect(knob()).toHaveAttribute('aria-valuenow', '1')
      expect(onChange).toHaveBeenCalledExactlyOnceWith(1)

      await user.keyboard('{ArrowRight}{PageUp}{End}')
      expect(knob()).toHaveAttribute('aria-valuenow', '1')
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('clamps at the bottom and stops reporting once it is there', async () => {
      const onChange = vi.fn()
      const { user } = render(<Holder initial={0.03} onChange={onChange} />)
      knob().focus()

      await user.keyboard('{ArrowDown}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0')
      expect(onChange).toHaveBeenCalledExactlyOnceWith(0)

      await user.keyboard('{ArrowDown}{PageDown}{Home}')
      expect(knob()).toHaveAttribute('aria-valuenow', '0')
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('leaves keys it does not use to the page', async () => {
      const prevented: Record<string, boolean> = {}
      const spy = (event: KeyboardEvent) => {
        prevented[event.key] = event.defaultPrevented
      }
      document.addEventListener('keydown', spy)
      try {
        const { user } = render(<Holder initial={0.5} />)
        knob().focus()

        await user.keyboard('{ArrowUp}{Tab}')

        // The arrow is ours: the page must not scroll under the viewer.
        expect(prevented.ArrowUp).toBe(true)
        expect(prevented.Tab).toBe(false)
      } finally {
        document.removeEventListener('keydown', spy)
      }
    })
  })

  describe('pointer', () => {
    it('turns up when the drag goes up', async () => {
      const onChange = vi.fn()
      const { user } = render(<Holder initial={0.5} onChange={onChange} />)

      await drag(user, knob(), 100, 70)

      const value = Number(knob().getAttribute('aria-valuenow'))
      expect(value).toBeGreaterThan(0.5)
      expect(value).toBeCloseTo(0.7)
    })

    it('turns down when the drag goes down', async () => {
      const { user } = render(<Holder initial={0.5} />)

      await drag(user, knob(), 100, 130)

      const value = Number(knob().getAttribute('aria-valuenow'))
      expect(value).toBeLessThan(0.5)
      expect(value).toBeCloseTo(0.3)
    })

    it('follows the pointer through a drag, from where the drag began', async () => {
      const { user } = render(<Holder initial={0.2} />)

      await drag(user, knob(), 100, 85, 70, 55)

      // Measured from the value the drag started at, not accumulated per move.
      expect(Number(knob().getAttribute('aria-valuenow'))).toBeCloseTo(0.5)
    })

    it('clamps a drag that runs past either end', async () => {
      const { user } = render(<Holder initial={0.5} />)

      await drag(user, knob(), 300, -900)
      expect(knob()).toHaveAttribute('aria-valuenow', '1')

      await drag(user, knob(), 100, 900)
      expect(knob()).toHaveAttribute('aria-valuenow', '0')
    })

    it('ignores a press that never moves', async () => {
      const onChange = vi.fn()
      const { user } = render(<Holder initial={0.5} onChange={onChange} />)

      await user.click(knob())

      expect(onChange).not.toHaveBeenCalled()
      expect(knob()).toHaveAttribute('aria-valuenow', '0.5')
    })

    it('captures the pointer so a drag off the knob keeps turning it', async () => {
      const { user } = render(<Holder initial={0.5} />)
      const dial = knob()
      const capture = vi.fn()
      const release = vi.fn()
      // jsdom implements no pointer capture at all, so the calls are recorded
      // rather than obeyed — what matters is that the component makes them.
      Object.assign(dial, { setPointerCapture: capture, releasePointerCapture: release })

      await drag(user, dial, 100, 70)

      expect(capture).toHaveBeenCalledOnce()
      expect(release).toHaveBeenCalledOnce()
    })

    it('does not keep turning after the pointer is lifted', async () => {
      const { user } = render(<Holder initial={0.5} />)
      const dial = knob()

      await drag(user, dial, 100, 70)
      await user.pointer({ target: dial, coords: { clientX: 40, clientY: 10 } })

      expect(Number(dial.getAttribute('aria-valuenow'))).toBeCloseTo(0.7)
    })
  })

  describe('the dial itself', () => {
    it('prints its scale, so the marks do not move with the knob', () => {
      const inks = () =>
        [...document.querySelectorAll('.tv-knob__ticks line')].map((tick) =>
          tick.getAttribute('stroke'),
        )

      const { rerender } = render(<Knob label="Volume" value={0} onChange={() => {}} />)
      expect(inks()).toHaveLength(11)
      const atRest = inks()

      rerender(<Knob label="Volume" value={0.5} onChange={() => {}} />)
      expect(inks()).toEqual(atRest)

      rerender(<Knob label="Volume" value={1} onChange={() => {}} />)
      expect(inks()).toEqual(atRest)

      // Silk-screened onto the plate: one ink, one weight, all the way round.
      expect(new Set(atRest).size).toBe(1)
    })

    it('sweeps the pointer clockwise from bottom-left to bottom-right', () => {
      const angle = (value: number) => {
        const { unmount } = render(<Knob label="Volume" value={value} onChange={() => {}} />)
        const marker = document.querySelector('[data-knob-pointer]')
        const transform = (marker as HTMLElement).style.transform
        const degrees = Number(/rotate\((-?[\d.]+)deg\)/.exec(transform)?.[1])
        unmount()
        return degrees
      }

      // 270 degrees of sweep, centred on straight up: a real knob has a stop.
      expect(angle(0)).toBeCloseTo(-135)
      expect(angle(0.5)).toBeCloseTo(0)
      expect(angle(1)).toBeCloseTo(135)
      expect(angle(1) - angle(0)).toBeCloseTo(270)
    })
  })
})
