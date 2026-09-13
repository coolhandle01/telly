import { describe, expect, it } from 'vitest'
import { mapLimit } from './mapLimit'

/** A promise plus the handle to settle it, so a test can hold work open. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('mapLimit', () => {
  it('returns results in the order the items went in', async () => {
    // Reversed durations, so the last item settles first.
    const results = await mapLimit([3, 2, 1], 3, async (n) => {
      await new Promise((r) => setTimeout(r, n))
      return n * 10
    })

    expect(results).toEqual([30, 20, 10])
  })

  it('never has more than the limit in flight', async () => {
    let inFlight = 0
    let peak = 0

    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async (n) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight -= 1
      return n
    })

    expect(peak).toBe(4)
  })

  it('starts the next item as soon as a worker is free, not in lockstep', async () => {
    // Three items, two workers, and the first item held open. Lockstep would
    // stall the third behind it; a worker pool gives it to whoever is free.
    const held = deferred<number>()
    const started: number[] = []

    const all = mapLimit([0, 1, 2], 2, async (n) => {
      started.push(n)
      return n === 0 ? held.promise : n
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual([0, 1, 2])

    held.resolve(0)
    expect(await all).toEqual([0, 1, 2])
  })

  it('does nothing at all with nothing to do', async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([])
  })

  it('still runs one at a time when told to run none at a time', async () => {
    // A limit of zero is a caller's bug, and hanging for ever is the worst
    // possible way to report it.
    expect(await mapLimit([1, 2], 0, async (n) => n)).toEqual([1, 2])
  })
})
