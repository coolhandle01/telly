import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPoolSource, isYouTubeConfigured } from './createPoolSource'
import type { FetchLike } from './http'
import type { AccessTokenProvider } from './tokenProvider'

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
  it('serves the fixture pool, touching no network, until a client id is configured', async () => {
    const { fetch, state } = countingFetch()

    const pool = await createPoolSource({ clientId: '', tokens, fetch }).load()

    expect(state.calls).toBe(0)
    expect(pool.videos.length).toBeGreaterThan(0)
  })

  it('stays on the fixture pool when there is a client id but nothing that can get a token', async () => {
    const { fetch, state } = countingFetch()

    const pool = await createPoolSource({ clientId: '123.apps.googleusercontent.com', fetch }).load()

    expect(state.calls).toBe(0)
    expect(pool.videos.length).toBeGreaterThan(0)
  })

  it('goes to the API once a client id and a token provider are both present', async () => {
    const { fetch, state } = countingFetch()

    const pool = await createPoolSource({ clientId: '123.apps.googleusercontent.com', tokens, fetch }).load()

    expect(state.calls).toBeGreaterThan(0)
    expect(pool.videos).toHaveLength(0)
  })
})
