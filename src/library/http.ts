/**
 * The transport seam. Everything that talks to YouTube takes one of these, so a
 * test can hand it canned payloads and no test can ever reach a real network.
 * The real `globalThis.fetch` satisfies it as-is — nothing here is a wrapper you
 * have to remember to use.
 */
export interface HttpResponseLike {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

export interface HttpRequestInit {
  readonly method: string
  readonly headers: Record<string, string>
}

export type FetchLike = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>
