import { describe, expect, it } from 'vitest'
import { render, screen } from '../support/render'
import { STATIONS } from '@/programming'
import { Ident } from '@/ui/Ident'

const one = STATIONS[0]

describe('Ident', () => {
  it('names the station under its mark', () => {
    render(<Ident ident={one.ident} name="CHANNEL ONE" number={1} />)

    expect(screen.getByRole('img', { name: /channel one ident/i })).toBeInTheDocument()
    expect(screen.getByText('CHANNEL ONE')).toBeInTheDocument()
  })

  it("takes the station's own colours", () => {
    const { container } = render(<Ident ident={one.ident} name="CHANNEL ONE" number={1} />)

    expect(container.querySelector('.ident')).toHaveStyle({ background: one.ident.ground })
  })

  // Each mark is a different mechanism, not a different colour of the same
  // one: that is what made an ident recognisable before the name appeared.
  it('draws a different mark for every station', () => {
    const marks = STATIONS.map((station) => {
      const { container, unmount } = render(
        <Ident ident={station.ident} name={station.name} number={station.id} />,
      )
      const drawing = container.querySelector('.ident__mark')?.innerHTML ?? ''
      unmount()
      return drawing
    })

    expect(new Set(marks).size).toBe(STATIONS.length)
  })

  it('draws something for each of them', () => {
    for (const station of STATIONS) {
      const { container, unmount } = render(
        <Ident ident={station.ident} name={station.name} number={station.id} />,
      )
      expect(container.querySelector('.ident__mark')?.children.length).toBeGreaterThan(0)
      unmount()
    }
  })
})
