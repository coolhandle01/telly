import { Component, type ReactNode } from 'react'
import type { Clock } from '../clock/clock'
import { TestCard } from '../testcard/TestCard'

/**
 * What the set says when the part that says things is the part that broke.
 *
 * Deliberately vague where the others are specific: at this point nothing
 * inside the receiver can be trusted to describe itself accurately.
 */
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
 * The last thing standing when a render throws.
 *
 * There is no boundary above this one — `main.tsx` renders `App` straight into
 * the root — so without it a single throw anywhere in the tree unmounts the
 * whole root and leaves an empty document. That is the one failure the set
 * cannot report in its usual way, because the caption under the cabinet and
 * the card on the screen have both gone with it.
 *
 * It shows the card instead of re-rendering what threw. Whatever caused the
 * throw is still there — a pool of the wrong shape does not fix itself — and a
 * boundary that retries only throws again. A set with a fault on it stays on
 * that fault until someone does something about it, which is also how a real
 * one behaves.
 */
export class FaultBoundary extends Component<FaultBoundaryProps, FaultBoundaryState> {
  override state: FaultBoundaryState = { failed: false }

  static getDerivedStateFromError(): FaultBoundaryState {
    return { failed: true }
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children

    // The card is absolutely positioned against `.screen`, and `.screen` is
    // black, so the fallback needs both: a bare card has no box to fill and
    // nothing behind it.
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
