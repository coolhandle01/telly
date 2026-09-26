import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPoolSource, isYouTubeConfigured } from '@/library/createPoolSource'
import type { FetchLike } from '@/library/http'
import type { PoolStore } from '@/library/poolStore'
import type { AccessTokenProvider } from '@/library/tokenProvider'

const tokens: AccessTokenProvider = { getAccessToken: async () => 'test-access-token' }

function countingFetch(): { fetch: FetchLike; state: { calls: number } } {
  const state = { calls: 0 }
  const fetch: FetchLike = async () => {
    state.calls += 1
    return { ok: true, status: 200, json: async () => ({ items: [] }) }
  }
  return { fetch, state }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isYouTubeConfigured', () => {
  it('is false with no client id, and false for a blank one', () => {
    expect(isYouTubeConfigured(undefined)).toBe(false)
    expect(isYouTubeConfigured('')).toBe(false)
    expect(isYouTubeConfigured('   ')).toBe(false)
  })

  it('is true once a client id is set', () => {
    expect(isYouTubeConfigured('123.apps.googleusercontent.com')).toBe(true)
  })

  it('reads the build-time client id when not given one', () => {
    vi.stubEnv('VITE_YOUTUBE_CLIENT_ID', '123.apps.googleusercontent.com')

    expect(isYouTubeConfigured()).toBe(true)
  })
})

describe('createPoolSource', () => {
  it('makes no source until a client id is configured', () => {
    const { fetch, state } = countingFetch()

    expect(createPoolSource({ clientId: '', tokens, fetch })).toBeUndefined()
    expect(state.calls).toBe(0)
  })

  it('makes no source when there is a client id but nothing that can get a token', () => {
    const { fetch, state } = countingFetch()

    expect(createPoolSource({ clientId: '123.apps.googleusercontent.com', fetch })).toBeUndefined()
    expect(state.calls).toBe(0)
  })

  it('goes to the API once a client id and a token provider are both present', async () => {
    const { fetch, state } = countingFetch()

    const pool = await createPoolSource({ clientId: '123.apps.googleusercontent.com', tokens, fetch })!.load()

    expect(state.calls).toBeGreaterThan(0)
    expect(pool.videos).toHaveLength(0)
  })
})

// T36: a session can end without Sign out, on expiry or a 401, and another
// account can then sign in on the same page.
describe('whose record a load is filed under', () => {
  function twoAccounts() {
    let owner = 'UC-alice'
    const listeners: ((signedIn: boolean) => void)[] = []
    const provider: AccessTokenProvider = {
      getAccessToken: async () => `token-for-${owner}`,
      subscribe: (listener) => {
        listeners.push(listener)
        return () => undefined
      },
    }
    const ownerLookups: string[] = []
    const fetch: FetchLike = async (url) => {
      const mine = url.includes('/channels?') && url.includes('mine=true')
      if (mine) ownerLookups.push(owner)
      return { ok: true, status: 200, json: async () => ({ items: mine ? [{ id: owner }] : [] }) }
    }
    const written: string[] = []
    const removed: string[] = []
    const store: PoolStore = {
      read: async () => undefined,
      write: async (key) => {
        written.push(key)
      },
      remove: async (key) => {
        removed.push(key)
      },
    }
    const source = createPoolSource({ clientId: '123.apps.googleusercontent.com', tokens: provider, fetch, store })!
    return {
      source,
      written,
      removed,
      ownerLookups,
      switchTo: (next: string) => {
        owner = next
      },
      announce: (signedIn: boolean) => listeners.forEach((listener) => listener(signedIn)),
    }
  }

  it('files the next account under its own id when the session ends without a sign-out', async () => {
    const accounts = twoAccounts()
    await accounts.source.load()

    accounts.announce(false)
    accounts.switchTo('UC-bob')
    await accounts.source.load()

    expect(accounts.written).toEqual(['pool:UC-alice', 'pool:UC-bob'])
  })

  it('asks whose it is once while the session lasts', async () => {
    const accounts = twoAccounts()
    await accounts.source.load()

    accounts.announce(true)
    await accounts.source.load()

    expect(accounts.ownerLookups).toEqual(['UC-alice'])
  })

  it("signs the next account out of its own record, not the last account's", async () => {
    const accounts = twoAccounts()
    await accounts.source.load()

    accounts.announce(false)
    accounts.switchTo('UC-bob')
    await accounts.source.forget!()

    expect(accounts.removed).toEqual(['pool:UC-bob'])
  })

  // Signing out must not need the network: the token is being revoked in the
  // same breath, and the account was established when the pool was loaded.
  it('signs out without asking whose it is again', async () => {
    const accounts = twoAccounts()
    await accounts.source.load()

    await accounts.source.forget!()

    expect(accounts.ownerLookups).toEqual(['UC-alice'])
    expect(accounts.removed).toEqual(['pool:UC-alice'])
  })
})
