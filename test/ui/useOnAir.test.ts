import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { Schedule, ScheduleItem } from '@/domain'
import { useOnAir } from '@/ui/useOnAir'
import { FakeClock } from '../support/fakeClock'

const DAY_START = new Date(2026, 8, 9, 6, 0, 0)

/** The instant `sec` seconds into the broadcast day. */
const at = (sec: number): Date => new Date(DAY_START.getTime() + sec * 1000)

const programme = (startSec: number, endSec: number, videoId: string): ScheduleItem => ({
  startSec,
  endSec,
  daypart: 'breakfast',
  content: {
    kind: 'programme',
    videoId,
    title: `Programme ${videoId}`,
    channelId: 'chan-1',
    videoStartSec: 0,
  },
})

const DAY: Schedule = {
  startsAt: DAY_START,
  items: [programme(0, 600, 'one'), programme(600, 1200, 'two')],
}

describe('useOnAir', () => {
  it('moves on to the next programme as the clock passes the end of the last', () => {
    const clock = new FakeClock(at(30))
    const { result } = renderHook(() => useOnAir(DAY, clock))
    expect(result.current).toMatchObject({ videoId: 'one' })

    act(() => clock.set(at(630)))

    expect(result.current).toMatchObject({ videoId: 'two' })
  })
})
