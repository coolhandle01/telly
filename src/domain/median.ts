/**
 * The middle of a non-empty list of numbers, or the mean of the middle two
 * when there is an even count. The list is not reordered.
 */
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
