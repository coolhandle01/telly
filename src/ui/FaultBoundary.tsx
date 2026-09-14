import { Component, type ErrorInfo, type ReactNode } from 'react'
import { SystemClock } from '../clock/clock'
import { buildTestCard } from '../testcard/buildTestCard'
import { TestCardSvg } from '../testcard/TestCardSvg'

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
 * Its own clock, rather than the one the set was running on, and read once
 * rather than subscribed to.
 *
 * The card is built here instead of through `TestCard` for that second half:
 * `TestCard` subscribes to the clock so its own card can tick, and the fault
 * card has nothing that ticks — it draws neither a clock nor a date, which is
 * the point of it, since a fault card quietly keeping time looks like a
 * service. Drawing it once means the last-resort path holds no subscription
 * and no state, which is the right amount of machinery for the screen you
 * reach when everything else has already gone wrong.
 *
 * The instant is still injected rather than fetched: `TestCardSpec` is plain
 * that nothing calls `new Date()` itself, and a fallback is no place to be
 * the exception. It is its *own* clock because a fallback reading anything
 * from the tree that just failed can fail the same way, and the clock is
 * among the things that can cause a fault in the first place.
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

    const card = buildTestCard({
      variant: 'closedown',
      design: 'fault',
      now: ownClock.now(),
      channelName: this.props.channelName ?? 'TELEVISION',
      faultCode: UNEXPECTED_FAULT.code,
      faultDetail: UNEXPECTED_FAULT.detail,
    })

    return (
      <div style={screenStyle} role="alert">
        <TestCardSvg model={card} label="fault card" />
      </div>
    )
  }
}
