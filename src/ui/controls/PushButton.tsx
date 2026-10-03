import type { ReactNode } from 'react'
import { useSurfaceIds } from './surfaceIds'
import './type.css'
import './PushButton.css'

export interface PushButtonProps {
  children: ReactNode
  onClick: () => void
  /** Omit for a momentary button; give it and the button becomes a toggle. */
  pressed?: boolean
}

/**
 * A chunky cream-bakelite push button. A real `<button>` underneath — the
 * semantics are the browser's, the moulding is ours — and `pressed` latches
 * it visibly down, because on a set of this age you can see which one is in.
 */
export function PushButton({ children, onClick, pressed }: PushButtonProps) {
  const { id, url } = useSurfaceIds()
  const down = pressed === true

  return (
    <button
      type="button"
      className={pressed ? 'tv-push tv-push--in' : 'tv-push'}
      onClick={onClick}
      aria-pressed={pressed}
      data-pressed={pressed === undefined ? undefined : String(pressed)}
    >
      <svg
        className="tv-push__face"
        data-dome={down ? 'in' : 'out'}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={id('cream')} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={down ? '#e9dcc0' : '#fbf4e4'} />
            <stop offset="0.55" stopColor={down ? '#dccfb2' : '#eadec4'} />
            <stop offset="1" stopColor={down ? '#bfae8c' : '#cdbb98'} />
          </linearGradient>
          {/*
            The dome is real: a blurred alpha stands in for the moulding's
            curvature and the light is allowed to find it. Press the key and
            the same light meets it at a shallower angle, so the highlight
            slides down the crown instead of merely dimming.
          */}
          <filter
            id={id('dome')}
            x="-10%"
            y="-25%"
            width="120%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="bump" />
            <feSpecularLighting
              in="bump"
              surfaceScale={down ? 3 : 4}
              specularConstant={down ? 0.42 : 0.62}
              specularExponent={down ? 16 : 22}
              lightingColor="#fffaf0"
              result="spec"
            >
              <feDistantLight azimuth="235" elevation={down ? 32 : 52} />
            </feSpecularLighting>
            <feComposite in="spec" in2="SourceAlpha" operator="in" result="clipped" />
            <feComposite
              in="SourceGraphic"
              in2="clipped"
              operator="arithmetic"
              k1="0"
              k2="1"
              k3="1"
              k4="0"
            />
          </filter>
        </defs>
        <rect
          width="100%"
          height="100%"
          rx="4.5"
          ry="4.5"
          fill={url('cream')}
          filter={url('dome')}
        />
        {/* The seating line where the moulding meets its collar. */}
        <rect
          width="100%"
          height="100%"
          rx="4.5"
          ry="4.5"
          fill="none"
          stroke="#6a645b"
          strokeOpacity={down ? '0.55' : '0.35'}
          strokeWidth="1.6"
        />
      </svg>
      <span className="tv-push__legend">{children}</span>
    </button>
  )
}
