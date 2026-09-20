import type { Shape, ShapeRole, TestCardModel } from './model'

/**
 * How a shape's domain role surfaces in the accessibility tree. SVG elements
 * carry no implicit ARIA role worth having, so the caption and the clock are
 * given one explicitly — which is what lets a component test query by role
 * instead of by test id, and a screen reader read the card at all.
 */
const ARIA: Partial<Record<ShapeRole, { role: string; level?: number }>> = {
  'caption-channel': { role: 'heading', level: 1 },
  'caption-date': { role: 'note' },
  'caption-message': { role: 'status' },
  'clock-time': { role: 'timer' },
}

/**
 * A dumb renderer: it maps model shapes onto SVG nodes and computes nothing.
 * Every coordinate on screen was decided by `buildTestCard`, where a test can
 * reach it without a DOM.
 */
export function TestCardSvg({ model, label }: { model: TestCardModel; label?: string }) {
  return (
    <svg
      className="testcard"
      role="group"
      aria-label={label ?? 'Test card'}
      viewBox={`0 0 ${model.width} ${model.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {model.shapes.map((shape) => (
        <ShapeNode key={shape.id} shape={shape} />
      ))}
    </svg>
  )
}

function ShapeNode({ shape }: { shape: Shape }) {
  switch (shape.kind) {
    case 'rect':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      )
    case 'circle':
      return (
        <circle
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      )
    case 'line':
      return (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      )
    case 'text': {
      const aria = ARIA[shape.role]
      return (
        <text
          x={shape.x}
          y={shape.y}
          fill={shape.fill}
          fontSize={shape.fontSize}
          fontFamily="'Courier New', ui-monospace, monospace"
          fontWeight="bold"
          letterSpacing={shape.letterSpacing}
          textAnchor={shape.anchor}
          dominantBaseline="middle"
          role={aria?.role}
          aria-level={aria?.level}
          aria-label={aria ? shape.text : undefined}
        >
          {shape.text}
        </text>
      )
    }
  }
}
