import { describe, expect, it } from 'vitest'
import { buildTestCard } from '@/testcard/buildTestCard'
import type { TestCardModel } from '@/testcard/model'
import { render, screen } from '../support/render'
import { TestCardSvg } from '@/testcard/TestCardSvg'

const MODEL = (): TestCardModel =>
  buildTestCard({
    variant: 'closedown',
    now: new Date(2026, 8, 9, 1, 30, 5),
    channelName: 'CHANNEL ONE',
    resumesAt: new Date(2026, 8, 9, 6, 0),
  })

/** A model small enough to read, so the renderer has nowhere to hide. */
const HAND_MADE: TestCardModel = {
  variant: 'interlude',
  width: 100,
  height: 50,
  centre: { x: 50, y: 25 },
  picture: { x: 5, y: 5, width: 90, height: 40 },
  background: '#0b0b0b',
  shapes: [
    { id: 'r', role: 'colour-bar', kind: 'rect', x: 1, y: 2, width: 3, height: 4, fill: '#ff0000' },
    { id: 'c', role: 'convergence-circle', kind: 'circle', cx: 50, cy: 25, r: 9, fill: 'none', stroke: '#fff', strokeWidth: 2 },
    { id: 'l', role: 'crosshair', kind: 'line', x1: 10, y1: 11, x2: 12, y2: 13, stroke: '#fff', strokeWidth: 2 },
    { id: 't', role: 'caption-channel', kind: 'text', x: 50, y: 40, text: 'HELLO', fill: '#fff', fontSize: 6, anchor: 'middle' },
  ],
}

describe('TestCardSvg', () => {
  it('sizes the canvas from the model and nothing else', () => {
    const { container } = render(<TestCardSvg model={HAND_MADE} />)

    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 100 50')
  })

  it('renders each shape at exactly the coordinates the model gives, doing no arithmetic of its own', () => {
    const { container } = render(<TestCardSvg model={HAND_MADE} />)

    expect(container.querySelector('rect')).toHaveAttribute('x', '1')
    expect(container.querySelector('rect')).toHaveAttribute('width', '3')
    expect(container.querySelector('rect')).toHaveAttribute('fill', '#ff0000')
    expect(container.querySelector('circle')).toHaveAttribute('cx', '50')
    expect(container.querySelector('circle')).toHaveAttribute('r', '9')
    expect(container.querySelector('line')).toHaveAttribute('x1', '10')
    expect(container.querySelector('line')).toHaveAttribute('y2', '13')
    expect(container.querySelector('text')).toHaveAttribute('text-anchor', 'middle')
  })

  it('draws one node per shape in the model', () => {
    const model = MODEL()
    const { container } = render(<TestCardSvg model={model} />)

    expect(container.querySelectorAll('svg > *')).toHaveLength(model.shapes.length)
  })

  it('names the card for assistive technology', () => {
    render(<TestCardSvg model={MODEL()} label="Closedown test card" />)

    expect(screen.getByRole('group', { name: 'Closedown test card' })).toBeInTheDocument()
  })

  it('falls back to a generic accessible name when none is given', () => {
    render(<TestCardSvg model={HAND_MADE} />)

    expect(screen.getByRole('group', { name: 'Test card' })).toBeInTheDocument()
  })

  it('leaves text with no semantic role out of the accessibility tree', () => {
    const model = {
      ...HAND_MADE,
      shapes: [
        { id: 'x', role: 'picture', kind: 'text', x: 1, y: 2, text: '4.5 MHz', fill: '#fff', fontSize: 4, anchor: 'start' },
      ],
    } as TestCardModel
    const { container } = render(<TestCardSvg model={model} />)
    const text = container.querySelector('text')

    expect(text).toHaveTextContent('4.5 MHz')
    expect(text).not.toHaveAttribute('role')
    expect(text).not.toHaveAttribute('aria-label')
  })

  it('exposes the caption by role rather than by test id', () => {
    render(<TestCardSvg model={MODEL()} />)

    expect(screen.getByRole('heading', { level: 1, name: 'CHANNEL ONE' })).toBeInTheDocument()
    expect(screen.getByRole('note', { name: 'WEDNESDAY 9 SEPTEMBER 2026' })).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'NORMAL SERVICE WILL RESUME AT 06.00' }),
    ).toBeInTheDocument()
  })

  it('exposes the clock as a timer with the time as its accessible name', () => {
    render(<TestCardSvg model={MODEL()} />)

    expect(screen.getByRole('timer', { name: '01.30.05' })).toBeInTheDocument()
  })
})
