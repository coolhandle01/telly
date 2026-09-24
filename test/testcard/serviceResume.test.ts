import { describe, expect, it } from 'vitest'
import { nextServiceResume } from '@/testcard/serviceResume'

describe('nextServiceResume', () => {
  it('finds this morning when service resumes later today', () => {
    expect(nextServiceResume(new Date(2026, 8, 9, 1, 30, 5), 6)).toEqual(new Date(2026, 8, 9, 6, 0, 0))
  })

  it('rolls on to tomorrow once the hour has passed', () => {
    expect(nextServiceResume(new Date(2026, 8, 9, 23, 45, 0), 6)).toEqual(new Date(2026, 8, 10, 6, 0, 0))
  })

  it('rolls on to tomorrow when the hour has arrived exactly', () => {
    expect(nextServiceResume(new Date(2026, 8, 9, 6, 0, 0), 6)).toEqual(new Date(2026, 8, 10, 6, 0, 0))
  })

  it('crosses the month boundary', () => {
    expect(nextServiceResume(new Date(2026, 8, 30, 23, 0, 0), 6)).toEqual(new Date(2026, 9, 1, 6, 0, 0))
  })
})
