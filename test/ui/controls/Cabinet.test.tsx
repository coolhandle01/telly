import { describe, expect, it } from 'vitest'
import { render, screen } from '../../support/render'
import { Cabinet } from '@/ui/controls/Cabinet'

const screenish = <div data-testid="picture">picture</div>
const fascia = <button type="button">Switch on</button>

describe('Cabinet', () => {
  it('puts the picture and the controls in the same box', () => {
    render(<Cabinet controls={fascia}>{screenish}</Cabinet>)

    expect(screen.getByTestId('picture')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch on' })).toBeInTheDocument()
  })

  it('reads out as furniture and nothing else', () => {
    const { container } = render(<Cabinet controls={fascia}>{screenish}</Cabinet>)

    // Every drawn part of the cabinet is scenery: the only things in the
    // accessibility tree are what was handed in.
    for (const piece of container.querySelectorAll(
      '.tv-cabinet__top, .tv-cabinet__glass, .tv-cabinet__lip, .tv-cabinet__leg',
    )) {
      expect(piece.closest('[aria-hidden="true"]')).not.toBeNull()
    }
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('stands on the two legs you could actually see', () => {
    // The set is drawn as a flat elevation. Head-on, the back pair stand
    // directly behind the front pair — four in a row at the same size is a
    // child's drawing of a horse.
    const { container } = render(<Cabinet controls={fascia}>{screenish}</Cabinet>)

    expect(container.querySelectorAll('.tv-cabinet__leg')).toHaveLength(2)
  })

  it('can be stood on the sideboard instead', () => {
    const { container } = render(
      <Cabinet controls={fascia} legs={false}>
        {screenish}
      </Cabinet>,
    )

    expect(container.querySelectorAll('.tv-cabinet__leg')).toHaveLength(0)
  })

  it('keeps the picture in its own well, under the glass', () => {
    render(<Cabinet controls={fascia}>{screenish}</Cabinet>)

    const well = screen.getByTestId('picture').parentElement
    expect(well).toHaveClass('tv-cabinet__well')
    expect(well?.querySelector('.tv-cabinet__glass')).not.toBeNull()
  })
  it('keeps every drawn surface out of the accessibility tree', () => {
    const { container } = render(<Cabinet controls={fascia}>{screenish}</Cabinet>)

    // The veneers, the bezel and the glass are all drawn in SVG now, and none
    // of them is anything a reader or the tab key should ever meet.
    const drawn = container.querySelectorAll('svg')
    expect(drawn.length).toBeGreaterThan(4)
    for (const surface of drawn) {
      expect(surface.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(surface).toHaveAttribute('focusable', 'false')
    }
  })

  it('puts two sets in the room without their filters colliding', () => {
    const { container } = render(
      <>
        <Cabinet controls={fascia}>{screenish}</Cabinet>
        <Cabinet controls={fascia}>{screenish}</Cabinet>
      </>,
    )

    // Ids are global to the document: a shared one would have the second set
    // painting itself with the first set's definitions.
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id)
    expect(ids.length).toBeGreaterThan(8)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
