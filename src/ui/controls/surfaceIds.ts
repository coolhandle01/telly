import { useState } from 'react'

/**
 * Two sets on one page must not share filter ids: the second one's
 * `url(#…)` would resolve to the first one's filter and the pair would drift
 * out of step the moment one of them changed. A module counter is enough:
 * it is read once per mount and nothing about it has to survive a reload.
 */
let sequence = 0

export interface SurfaceIds {
  /** An id unique to this mounted instance. */
  id: (name: string) => string
  /** The same id, written as a paint or filter reference. */
  url: (name: string) => string
}

/** A private namespace for one component's `<defs>`, stable across renders. */
export function useSurfaceIds(): SurfaceIds {
  const [ids] = useState<SurfaceIds>(() => {
    const namespace = `tv${++sequence}`
    return {
      id: (name) => `${namespace}-${name}`,
      url: (name) => `url(#${namespace}-${name})`,
    }
  })
  return ids
}
