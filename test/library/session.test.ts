import { describe, expect, it } from 'vitest'
import type { Pool } from '@/domain'
import {
  GoogleTokenProvider,
  type GoogleIdentityServices,
  type TokenResponse,
} from '@/library/googleTokenProvider'
import type { PoolSource } from '@/library/poolSource'
import { googleSession, SignOutError } from '@/library/session'

const EMPTY_POOL: Pool = { videos: [], channels: new Map() }

/** Stands in for Google's script. No test may reach the real one. */
function fakeGis(options: { revokeThrows?: boolean } = {}) {
  const revoked: string[] = []
  const gis: GoogleIdentityServices = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => ({
          requestAccessToken: () => {
            const response: TokenResponse = { access_token: 'tok-abc', expires_in: 3600 }
            config.callback(response)
          },
        }),
        revoke: (accessToken, done) => {
          if (options.revokeThrows) throw new Error('revocation was refused')
          revoked.push(accessToken)
          done?.({ successful: true })
        },
      },
    },
  }
  return { revoked, load: () => Promise.resolve(gis) }
}

/** A `Storage` this test owns, so it inherits no other test's grant flag. */
function fakeStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key)
    },
    setItem: (key, value) => {
      entries.set(key, value)
    },
  }
}

function countingSource(options: { forgetFails?: boolean } = {}) {
  const calls = { load: 0, forget: 0 }
  const source: PoolSource = {
    load: async () => {
      calls.load += 1
      return EMPTY_POOL
    },
    forget: async () => {
      calls.forget += 1
      if (options.forgetFails) {
        throw new DOMException('the database is not open', 'InvalidStateError')
      }
    },
  }
  return { source, calls }
}

function build(options: { revokeThrows?: boolean; forgetFails?: boolean } = {}) {
  const { revoked, load } = fakeGis({ revokeThrows: options.revokeThrows })
  const tokens = new GoogleTokenProvider('client-1', { loadGis: load, storage: fakeStorage() })
  const { source, calls } = countingSource({ forgetFails: options.forgetFails })
  return { tokens, source, calls, revoked, session: googleSession(tokens, source) }
}

describe('googleSession', () => {
  it('signs in through the provider', async () => {
    const { session, tokens } = build()

    await expect(session.signIn()).resolves.toBeUndefined()

    expect(tokens.isSignedIn).toBe(true)
  })

  it('resumes through the provider', async () => {
    const { session } = build()

    // Nothing was granted in this browser yet, so there is nothing to take up.
    await expect(session.resume()).resolves.toBe(false)

    await session.signIn()
    await expect(session.resume()).resolves.toBe(true)
  })

  it('hands the provider a listener, and takes it back again', async () => {
    const { session } = build()
    const seen: boolean[] = []

    const unsubscribe = session.subscribe((signedIn) => seen.push(signedIn))
    await session.signIn()
    unsubscribe()
    await session.signOut()

    expect(seen).toEqual([true])
  })

  /*
    Signing out is the half of this the privacy policy makes a claim about, so
    each half is asserted on its own as well as together.
  */
  describe('signing out', () => {
    it('hands the grant back to Google and empties the machine', async () => {
      const { session, tokens, calls, revoked } = build()
      await session.signIn()

      await session.signOut()

      expect(revoked).toEqual(['tok-abc'])
      expect(calls.forget).toBe(1)
      expect(tokens.isSignedIn).toBe(false)
    })

    // Found by mutation testing, which scored this file at zero. The two halves
    // ran in sequence, so a revocation that threw took the clearing with it and
    // left the subscriptions in the database. A blocked Google script is enough
    // to do it, which is a state a real browser reaches.
    it('still empties the machine when the grant cannot be handed back', async () => {
      const { session, calls } = build({ revokeThrows: true })
      await session.signIn()

      const refused = await session.signOut().catch((error: unknown) => error)

      expect(refused).toBeInstanceOf(SignOutError)
      expect(refused).toMatchObject({ revoked: false, cleared: true })
      expect((refused as SignOutError).cause).toMatchObject({ message: 'revocation was refused' })
      expect(calls.forget).toBe(1)
    })

    it('reports a machine that would not empty, having still gone to Google', async () => {
      const { session, tokens, calls, revoked } = build({ forgetFails: true })
      await session.signIn()

      const refused = await session.signOut().catch((error: unknown) => error)

      expect(refused).toBeInstanceOf(SignOutError)
      expect(refused).toMatchObject({ revoked: true, cleared: false })
      expect(revoked).toEqual(['tok-abc'])
      expect(calls.forget).toBe(1)
      expect(tokens.isSignedIn).toBe(false)
    })

    it('finishes over a source that keeps nothing of its own', async () => {
      const { load } = fakeGis()
      const tokens = new GoogleTokenProvider('client-1', { loadGis: load, storage: fakeStorage() })
      const session = googleSession(tokens, { load: async () => EMPTY_POOL })
      await session.signIn()

      await expect(session.signOut()).resolves.toBeUndefined()
    })
  })
})
