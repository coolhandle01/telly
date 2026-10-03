import type { Ident as IdentSpec, IdentMotif } from '../programming'
import './Ident.css'

export interface IdentProps {
  ident: IdentSpec
  /** The station's name, set beneath the symbol. */
  name: string
  /** The figure on the preset key, which is what most idents were built round. */
  number: number
}

/**
 * A station ident: a flat ground, a moving mark, and the name.
 *
 * Held for a minute or two between programmes, to bring the next one up onto
 * the hour or the quarter. Each station's mark is a different mechanism rather
 * than a different colour of the same one, because that is what made an ident
 * recognisable in the second before the name appeared.
 *
 * Drawn rather than reproduced: none of these is any broadcaster's mark.
 */
export function Ident({ ident, name, number }: IdentProps) {
  return (
    <div className="ident" style={{ background: ident.ground, color: ident.ink }}>
      <svg
        className="ident__mark"
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${name} ident`}
        focusable="false"
      >
        <Motif motif={ident.motif} number={number} />
      </svg>
      <p className="ident__name">{name}</p>
    </div>
  )
}

function Motif({ motif, number }: { motif: IdentMotif; number: number }) {
  switch (motif) {
    case 'globe':
      /*
        A wireframe sphere. The limb and the equator hold still and the
        meridians sweep across them, which is what a turning globe looks like
        from outside it — turning the whole drawing instead would take the
        sphere edge-on twice a revolution and leave nothing on the screen.
      */
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="50" cy="50" r="30" />
          <ellipse cx="50" cy="50" rx="30" ry="12" />
          <line x1="20" y1="50" x2="80" y2="50" />
          <g className="ident__sweep">
            {[30, 18, 7].map((rx) => (
              <ellipse key={rx} cx="50" cy="50" rx={rx} ry="30" />
            ))}
          </g>
        </g>
      )
    case 'numeral':
      // The figure, rotated into place inside its own rule.
      return (
        <g className="ident__turn">
          <rect x="22" y="22" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="2" />
          <text
            x="50"
            y="50"
            fill="currentColor"
            fontSize="42"
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="700"
            textAnchor="middle"
            dominantBaseline="central"
          >
            {number}
          </text>
        </g>
      )
    case 'chevron':
      // Three bars sliding together into a wedge.
      return (
        <g fill="currentColor">
          {[0, 1, 2].map((row) => (
            <polygon
              key={row}
              className="ident__slide"
              style={{ animationDelay: `${row * 0.12}s` }}
              points={`${18 + row * 6},${34 + row * 11} ${72 - row * 6},${34 + row * 11} ${60 - row * 6},${44 + row * 11} ${30 + row * 6},${44 + row * 11}`}
            />
          ))}
        </g>
      )
    case 'blocks':
      // Four parallelograms arriving from four directions.
      return (
        <g fill="currentColor">
          {[
            { points: '26,22 48,22 40,48 26,48', from: '-40px, -40px' },
            { points: '52,22 74,22 74,48 60,48', from: '40px, -40px' },
            { points: '26,52 40,52 48,78 26,78', from: '-40px, 40px' },
            { points: '60,52 74,52 74,78 52,78', from: '40px, 40px' },
          ].map((block) => (
            <polygon
              key={block.points}
              className="ident__gather"
              style={{ '--from': block.from } as React.CSSProperties}
              points={block.points}
            />
          ))}
        </g>
      )
    case 'ring':
      // Dots on an orbit, one to a station, turning.
      return (
        <g className="ident__spin" fill="currentColor">
          {[0, 1, 2, 3, 4].map((index) => {
            const angle = (index / 5) * Math.PI * 2 - Math.PI / 2
            return (
              <circle
                key={index}
                cx={50 + Math.cos(angle) * 28}
                cy={50 + Math.sin(angle) * 28}
                r={index === 0 ? 8 : 5}
              />
            )
          })}
        </g>
      )
  }
}
