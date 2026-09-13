import { describe, expect, it } from 'vitest'
import { render } from '../../test/render'
import { WoodSurface } from './surfaces'

/** Every `url(#…)` a surface paints with, in document order. */
function referencesIn(root: ParentNode) {
  return [...root.querySelectorAll('[fill], [filter], [stroke]')].flatMap((node) =>
    ['fill', 'filter', 'stroke']
      .map((attribute) => node.getAttribute(attribute))
      .flatMap((value) => /^url\(#(.+)\)$/.exec(value ?? '')?.[1] ?? []),
  )
}

describe('WoodSurface', () => {
  it('is scenery: out of the accessibility tree and out of the tab order', () => {
    const { container } = render(<WoodSurface grain="horizontal" shade="horizontal" seed={1} />)

    const surface = container.querySelector('svg')
    expect(surface).toHaveAttribute('aria-hidden', 'true')
    expect(surface).toHaveAttribute('focusable', 'false')
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it('paints only with definitions of its own', () => {
    const { container } = render(<WoodSurface grain="vertical" shade="horizontal" seed={2} />)
    const surface = container.querySelector('svg')

    const references = referencesIn(container)
    expect(references.length).toBeGreaterThan(0)
    // A reference that resolves outside this `<svg>` is the bug this guards:
    // it would silently paint with a neighbour's filter.
    for (const id of references) expect(surface?.querySelector(`#${id}`)).not.toBeNull()
  })

  it('gives two surfaces on the same page separate definitions', () => {
    const { container } = render(
      <>
        <WoodSurface grain="horizontal" shade="horizontal" seed={3} />
        <WoodSurface grain="horizontal" shade="horizontal" seed={3} />
      </>,
    )

    const [first, second] = [...container.querySelectorAll('svg')]
    const ids = (root: Element) => [...root.querySelectorAll('[id]')].map((node) => node.id)

    expect(ids(first)).not.toHaveLength(0)
    expect(ids(first)).toEqual(ids(second).map(() => expect.any(String)))
    // Same shape of definitions, no id in common: the second surface's
    // `url(#…)` must not resolve to the first one's filter.
    expect(ids(first).filter((id) => ids(second).includes(id))).toEqual([])
    for (const id of referencesIn(second)) expect(second.querySelector(`#${id}`)).not.toBeNull()
  })
})
