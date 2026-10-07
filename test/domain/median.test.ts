import { describe, expect, it } from 'vitest'
import { median } from '@/domain/median'

/*
  Durations, upload gaps and view counts all arrive in whatever order the API
  sent them, so every case here is out of order, and the numbers differ
  whether they are compared as numbers or as strings.
*/
describe('median', () => {
  it('is the value itself for one value', () => {
    expect(median([42])).toBe(42)
  })

  it('is the middle value of an odd count, whatever order they come in', () => {
    expect(median([600, 3000, 1200])).toBe(1200)
  })

  it('is the mean of the middle two for an even count', () => {
    expect(median([3, 1])).toBe(2)
    expect(median([40, 10, 30, 200])).toBe(35)
  })

  it('leaves the list it is given as it was', () => {
    const values = [600, 3000, 1200]

    median(values)

    expect(values).toEqual([600, 3000, 1200])
  })
})
