import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SystemClock } from '../clock/clock'
import { TestCard } from '../testcard/TestCard'

/**
 * What the set does when something in it throws.
 *
 * A television that develops a fault does not go blank and silent — blank is
 * what a set does when it is *off*, and the two are not the same thing to
 * anyone watching. It puts a caption up. React's own answer to a throw during
 * render is to unmount the tree, which is exactly the blank screen, so this is
 * the piece that turns one into the other.
 *
 * A class, because `getDerivedStateFromError` has no hook: React offers no
 * other way to catch a render error. It is the only class component here and
 * it is not a style to copy.
 *
 * Deliberately last-resort. Anything a component can foresee it should handle
 * itself — `Channel` already has a caption for a pool that will not load and a
 * card for a programme that will not play. This is for what nobody foresaw,
 * and reaching it at all is a bug worth fixing at its source.
 */

/** Fault 01 is a receiver with no service configured — see `App`. */
const UNEXPECTED_FAULT = {
  code: 'Fault 02 · receiver fault',
  detail: ['This receiver has developed', 'a fault. Please switch off.'],
} as const

/**
 * Its own clock, rather than the one the set was running on.
 *
 * The fault card is the one design that draws neither a clock nor a date, so
 * today this changes nothing you can see — hand it a stopped clock and the
 * card is identical. It is here for the rule rather than the symptom: a
 * fallback that reads anything from the tree that just failed can fail the
 * same way, and the clock is squarely among the things that can cause the
 * fault in the first place. A card that reads no clock is a property of the
 * card, and it is not this component's to rely on.
 */
const ownClock = new SystemClock()

const screenStyle = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: '#07090b',
} as const

export interface FaultBoundaryProps {
  children: ReactNode
  /** Notified with whatever was thrown, so a host can report it. */
  onFault?: (error: Error, info: ErrorInfo) => void
  /** The name the card is captioned with. */
  channelName?: string
}

interface FaultBoundaryState {
  faulted: boolean
}

export class FaultBoundary extends Component<FaultBoundaryProps, FaultBoundaryState> {
  override state: FaultBoundaryState = { faulted: false }

  static getDerivedStateFromError(): FaultBoundaryState {
    return { faulted: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Never swallowed. A card the viewer can read is the right screen; a fault
    // nobody can find afterwards is not the right log.
    console.error('the set faulted:', error, info.componentStack)
    this.props.onFault?.(error, info)
  }

  override render(): ReactNode {
    if (!this.state.faulted) return this.props.children

    return (
      <div style={screenStyle} role="alert">
        <TestCard
          variant="closedown"
          design="fault"
          channelName={this.props.channelName ?? 'TELEVISION'}
          clock={ownClock}
          faultCode={UNEXPECTED_FAULT.code}
          faultDetail={UNEXPECTED_FAULT.detail}
        />
      </div>
    )
  }
}
