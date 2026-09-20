import { useEffect, useState } from 'react'
import type { Clock } from '../clock/clock'
import { buildTestCard } from './buildTestCard'
import type { CardDesignId, TestCardVariant } from './model'
import { TestCardSvg } from './TestCardSvg'

export interface TestCardProps {
  variant: TestCardVariant
  channelName: string
  /** The only source of "now" — nothing here calls `new Date()`. */
  clock: Clock
  resumesAt?: Date
  message?: string
  /** Names a card outright instead of taking the one whose turn it is. */
  design?: CardDesignId
  /** The cards this station rotates through. Defaults to all of them. */
  rotation?: readonly CardDesignId[]
  faultCode?: string
  faultDetail?: readonly string[]
}

/**
 * The card, drawn for whatever instant the clock is reporting.
 *
 * That is all it does. It owns no surface to sit on and no sound: a card is a
 * picture, and where it is shown and what is playing over it are somebody
 * else's business.
 */
export function TestCard({
  variant,
  channelName,
  clock,
  resumesAt,
  message,
  design,
  rotation,
  faultCode,
  faultDetail,
}: TestCardProps) {
  const [now, setNow] = useState(() => clock.now())

  useEffect(() => clock.subscribe(setNow), [clock])

  // Derived during render, not in an effect: there is no intermediate state
  // for a test to catch the card in.
  const model = buildTestCard({
    variant,
    now,
    channelName,
    resumesAt,
    message,
    design,
    rotation,
    faultCode,
    faultDetail,
  })

  return <TestCardSvg model={model} label={`${variant} test card`} />
}
