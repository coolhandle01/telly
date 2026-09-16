import { Component, type ReactNode } from 'react'
import type { Clock } from '../clock/clock'
import { TestCard } from '../testcard/TestCard'

/** What the set says when the part that says things is the part that broke. */
const RENDER_FAULT = {
  code: 'Fault 02 · receiver fault',
  detail: ['Something has gone wrong', 'inside this receiver.'],
} as const

export interface FaultBoundaryProps {
  channelName: string
  /** The card's only source of "now". Nothing here calls `new Date()`. */
  clock: Clock
  children: ReactNode
}

interface FaultBoundaryState {
  failed: boolean
}

/**
 * The root boundary: `main.tsx` renders `App` straight into the root, so a
 * render-time throw arrives here and the set puts a fault card up.
 *
 * It shows the card rather than re-rendering what threw. The cause is still
 * there — a pool of the wrong shape does not fix itself — so it stays on the
 * fault, as a real set does.
 */
export class FaultBoundary extends Component<FaultBoundaryProps, FaultBoundaryState> {
  override state: FaultBoundaryState = { failed: false }

  static getDerivedStateFromError(): FaultBoundaryState {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    // `.testcard` is absolutely positioned and `.screen` is the black box it
    // resolves against, so the card needs that wrapper to have a size.
    return (
      <main className="set">
        <div className="screen">
          <TestCard
            variant="closedown"
            design="fault"
            channelName={this.props.channelName}
            clock={this.props.clock}
            faultCode={RENDER_FAULT.code}
            faultDetail={RENDER_FAULT.detail}
          />
        </div>
      </main>
    )
  }
}
