/**
 * Run `work` over every item, never more than `limit` of them at once.
 *
 * The pool exists because the YouTube API charges by the *call* and not by the
 * second: a channel's uploads is one call whether it is made on its own or
 * alongside seven others, so a subscription list two hundred long costs the
 * same either way and takes an eighth as long. What concurrency must not do is
 * become unbounded — two hundred requests fired at once is a different thing
 * to explain to the far end than eight, and nothing about the quota rewards it.
 *
 * Results come back in the order the items went in, whatever order the work
 * finished in. The scheduler is deterministic from its pool, so a pool whose
 * order depended on which request came back first would make the day depend on
 * the network.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  // Each worker takes the next index and keeps going until there are none
  // left, so a slow item holds up nothing but its own worker.
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next++
      if (index >= items.length) return
      results[index] = await work(items[index], index)
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
