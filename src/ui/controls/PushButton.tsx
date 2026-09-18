import type { ReactNode } from 'react'
import { LEGEND_FONT, NO_SELECT } from './type'
import { useSurfaceIds } from './surfaceIds'

export interface PushButtonProps {
  children: ReactNode
  onClick: () => void
  /** Omit for a momentary button; give it and the button becomes a toggle. */
  pressed?: boolean
}

const CSS = `
.tv-push {
  position: relative;
  display: block;
  width: 100%;
  padding: 0.42rem 0.4rem;
  border: 0;
  border-radius: 0.22rem;
  cursor: pointer;
  font: 700 0.58rem/1.25 ${LEGEND_FONT};
  letter-spacing: 0.16em;
  text-transform: uppercase;
  ${NO_SELECT}
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #2b1d10;
  text-shadow: 0 0.05rem 0 rgba(255, 255, 255, 0.6);
  /* Under the drawn face, and all that is left of it without filters. */
  background: linear-gradient(#f7efdd, #d8c7a3);
  /* The collar is part of the fascia, and the fascia is aluminium now: a
     brown collar under the key read as a wooden surround it no longer has. */
  box-shadow:
    0 0.16rem 0 #7c776e,
    0 0.3rem 0.42rem rgba(0, 0, 0, 0.45);
  transform: translateY(0);
  transition: transform 60ms linear, box-shadow 60ms linear;
}
.tv-push__face {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}
.tv-push__legend { position: relative; }
/*
  The key is a slim rectangle because that is what it was. Rather than draw a
  taller one, the target reaches a little past the moulding top and bottom,
  short of the gap to its neighbours, so no two targets overlap.
*/
.tv-push::after {
  content: '';
  position: absolute;
  inset: -0.3rem 0;
}
/*
  Pressed: the key sits down into its collar, so the body of the shadow goes
  with it and only a short one is left. The highlight moves too, but that is
  the filter's job below: the light does not travel with the button.
*/
.tv-push:active, .tv-push--in {
  transform: translateY(0.13rem);
  box-shadow:
    0 0.03rem 0 #7c776e,
    0 0.07rem 0.16rem rgba(0, 0, 0, 0.5);
}
.tv-push--in { color: #3a2712; }
.tv-push:focus-visible {
  outline: 0.18rem solid #ffe6a8;
  outline-offset: 0.2rem;
}
`

/**
 * A chunky cream-bakelite push button. A real `<button>` underneath (the
 * semantics are the browser's, the moulding is ours) and `pressed` latches
 * it visibly down, because on a set of this age you can see which one is in.
 */
export function PushButton({ children, onClick, pressed }: PushButtonProps) {
  const { id, url } = useSurfaceIds()
  const down = pressed === true

  return (
    <>
      <style>{CSS}</style>
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
    </>
  )
}
