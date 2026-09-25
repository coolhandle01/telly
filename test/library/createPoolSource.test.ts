import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPoolSource, isYouTubeConfigured } from '@/library/createPoolSource'
import type { FetchLike } from '@/library/http'
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
