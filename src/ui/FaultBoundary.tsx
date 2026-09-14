import { Component, type ErrorInfo, type ReactNode } from 'react'
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

const EPOCH = new Date(0)

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
      // The fault card draws no clock and no date, so this is never read.
      now: EPOCH,
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
