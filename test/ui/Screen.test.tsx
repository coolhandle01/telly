import { describe, expect, it } from 'vitest'
import { render, screen } from '../support/render'
import { Screen } from '@/ui/Screen'
import { LOCK, deflection } from '@/ui/deflection'
import { CENTRE, picture } from '@/ui/picture'

const glass = () => screen.getByRole('region', { name: 'CHANNEL ONE — television' })
const raster = () => glass().querySelector('.screen__raster') as HTMLElement
const line = () => glass().querySelector('.screen__line') as HTMLElement

const mount = (vertical = LOCK, horizontal = LOCK) =>
  render(
    <Screen label="CHANNEL ONE — television" deflection={deflection(vertical, horizontal)}>
      <p>on air</p>
    </Screen>,
  )

describe('Screen', () => {
  it('shows what is on air', () => {
    mount()
    expect(screen.getByText('on air')).toBeInTheDocument()
  })

  it('holds the picture still when both trimmers are set', () => {
    mount()

    expect(glass()).toHaveAttribute('data-hold', 'locked')
    expect(raster()).toHaveAttribute('data-rolling', 'false')
    expect(line()).toHaveAttribute('data-tearing', 'false')
  })

  it('holds it still with no deflection given at all', () => {
    // The common case: nothing in the app has an opinion about the
    // oscillators, and a set with no opinion holds.
    render(<Screen label="CHANNEL ONE — television">{null}</Screen>)

    expect(glass()).toHaveAttribute('data-hold', 'locked')
  })

  it('rolls when the frame oscillator is out', () => {
    mount(1)

    expect(raster()).toHaveAttribute('data-rolling', 'true')
    expect(glass()).toHaveAttribute('data-hold', 'lost')
  })

  it('rolls faster the further the trimmer is turned out', () => {
    const period = (vertical: number) => {
      const view = render(
        <Screen label="CHANNEL ONE — television" deflection={deflection(vertical, LOCK)}>
          <p>on air</p>
        </Screen>,
      )
      const seconds = parseFloat(
        (view.container.firstElementChild as HTMLElement).style.getPropertyValue('--roll-period'),
      )
      view.unmount()
      return seconds
    }

    // A shorter period is a faster roll.
    expect(period(1)).toBeLessThan(period(0.66))
  })

  it('carries the direction the oscillator is out in', () => {
    const direction = (vertical: number) => {
      const view = render(
        <Screen label="CHANNEL ONE — television" deflection={deflection(vertical, LOCK)}>
          <p>on air</p>
        </Screen>,
      )
      const dir = (view.container.firstElementChild as HTMLElement).style.getPropertyValue(
        '--roll-dir',
      )
      view.unmount()
      return dir
    }

    // Too fast an oscillator carries the picture up; too slow drops it.
    expect(direction(1)).toBe('1')
    expect(direction(0)).toBe('-1')
  })

  it('tears when the line oscillator is out', () => {
    mount(LOCK, 1)

    expect(line()).toHaveAttribute('data-tearing', 'true')
    expect(glass()).toHaveAttribute('data-hold', 'lost')
    expect(glass().style.getPropertyValue('--shear')).not.toBe('0deg')
  })

  it('keeps the two faults on separate layers', () => {
    // One element cannot be collapsing, rolling and tearing at once — they are
    // three transforms — so losing both locks must not cost either effect.
    mount(1, 1)

    expect(raster()).toHaveAttribute('data-rolling', 'true')
    expect(line()).toHaveAttribute('data-tearing', 'true')
  })

  describe('the picture controls', () => {
    const shown = (brightness = CENTRE, colour = CENTRE, tuning = CENTRE) => {
      const view = render(
        <Screen label="CHANNEL ONE — television" picture={picture(brightness, colour, tuning)}>
          <p>on air</p>
        </Screen>,
      )
      const glass = view.container.firstElementChild as HTMLElement
      const read = (name: string) => glass.style.getPropertyValue(name)
      const result = {
        state: glass.getAttribute('data-picture'),
        gain: parseFloat(read('--gain')),
        lift: parseFloat(read('--lift')),
        saturation: parseFloat(read('--saturation')),
        snow: parseFloat(read('--snow')),
        snowing: glass.querySelector('.screen__snow')?.getAttribute('data-snowing'),
      }
      view.unmount()
      return result
    }

    it('shows it as transmitted with every trimmer at mid-travel', () => {
      const out = shown()

      expect(out.state).toBe('as-transmitted')
      expect(out.gain).toBe(1)
      expect(out.lift).toBe(0)
      expect(out.saturation).toBe(1)
      expect(out.snowing).toBe('false')
    })

    it('crushes the shadows with the beam turned down', () => {
      expect(shown(0).gain).toBeLessThan(1)
    })

    it('greys the blacks out with it turned up, and does not touch the gain', () => {
      const milky = shown(1)

      expect(milky.lift).toBeGreaterThan(0)
      expect(milky.gain).toBe(1)
    })

    it('takes the colour out at the stop', () => {
      expect(shown(CENTRE, 0).saturation).toBe(0)
    })

    it('snows when the tuner comes off station', () => {
      const off = shown(CENTRE, CENTRE, 1)

      expect(off.snowing).toBe('true')
      expect(off.snow).toBeGreaterThan(0)
      expect(off.state).toBe('adjusted')
    })

    it('loses the colour before it loses the picture', () => {
      const slightly = shown(CENTRE, CENTRE, CENTRE + 0.13)

      expect(slightly.saturation).toBe(0)
      expect(slightly.snow).toBeLessThan(0.4)
    })
  })

})
