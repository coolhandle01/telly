import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GIS_SCRIPT_URL,
  GoogleTokenProvider,
  TOKEN_KEY,
  loadGoogleIdentityServices,
  YOUTUBE_READONLY_SCOPE,
  type GoogleIdentityServices,
  type RevocationResponse,
  type TokenResponse,
} from '@/library/googleTokenProvider'

/** An ID token shaped like Google's: header, claims, signature. */
function idToken(sub: string): string {
  const claims = btoa(JSON.stringify({ sub, iss: 'https://accounts.google.com' }))
  return `${btoa(JSON.stringify({ alg: 'RS256' }))}.${claims}.signature-not-checked`
}

/**
 * Stands in for Google's script. No test may reach the real one.
 *
 * `revocation` is what Google answers a revocation with.
 */
function fakeGis(
  respond: (prompt: string) => TokenResponse | 'silent',
  revocation: RevocationResponse = { successful: true },
) {
  const prompts: string[] = []
  const requests: unknown[] = []
  const configs: { client_id: string; scope: string }[] = []
  const revoked: string[] = []
  const idCalls: string[] = []
  const gis = {
    accounts: {
      id: {
        initialize: (config: { callback: (response: { credential?: string }) => void }) => {
          idCalls.push('initialize')
          config.callback({ credential: idToken('sub-alice') })
        },
        prompt: () => {
          idCalls.push('prompt')
        },
        disableAutoSelect: () => {
          idCalls.push('disableAutoSelect')
        },
      },
      oauth2: {
        initTokenClient: (config) => {
          configs.push({ client_id: config.client_id, scope: config.scope })
          return {
            requestAccessToken: (overrides) => {
              const prompt = overrides?.prompt ?? ''
              prompts.push(prompt)
              requests.push(overrides)
              const reply = respond(prompt)
              if (reply === 'silent') config.error_callback?.({ type: 'popup_closed' })
              else config.callback(reply)
            },
          }
        },
        revoke: (accessToken, done) => {
          revoked.push(accessToken)
          done?.(revocation)
        },
      },
    },
  } as GoogleIdentityServices
  return {
    gis,
    prompts,
    requests,
    configs,
    revoked,
    idCalls,
    load: vi.fn(() => Promise.resolve(gis)),
  }
}

/** A `Storage` each test owns, so none inherits another's token. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(seed))
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

const granted = (expiresIn = 3600): TokenResponse => ({
  access_token: 'tok-abc',
  expires_in: expiresIn,
})

describe('GoogleTokenProvider', () => {
  // The token now crosses a reload in the tab's own storage, so a test that
  // signs in leaves one behind. Each test starts on a tab that holds nothing.
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('asks for consent on sign-in, with the read-only scope', async () => {
    const { load, prompts, configs } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).resolves.toBe('tok-abc')

    expect(prompts).toEqual(['consent'])
    expect(configs[0]).toEqual({ client_id: 'client-1', scope: YOUTUBE_READONLY_SCOPE })
  })

  // The bug a real browser found: fetching Google's script inside the click
  // handler ends the activating task, so the popup is refused with
  // popup_failed_to_open. Prepared ahead, the request goes out synchronously.
  it('opens the popup in the click\'s own task once prepared', async () => {
    const { load, prompts } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })
    await provider.prepare()

    const pending = provider.signIn()

    // Asked for before this test ever yields — no await stands between the
    // click and the popup.
    expect(prompts).toEqual(['consent'])
    await expect(pending).resolves.toBe('tok-abc')
  })

  it('fetches the script once however often it is prepared', async () => {
    const { load } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await Promise.all([provider.prepare(), provider.prepare()])
    await provider.prepare()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('still signs in when nobody prepared it, popup permitting', async () => {
    const { load, prompts } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).resolves.toBe('tok-abc')
    expect(prompts).toEqual(['consent'])
  })

  it('hands back the held token without asking Google again', async () => {
    const { load, prompts } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await provider.signIn()
    await expect(provider.getAccessToken()).resolves.toBe('tok-abc')

    expect(prompts).toEqual(['consent'])
  })

  // Read out of the GIS client Google ships: the silent branch of
  // `requestAccessToken` is reached only when the script has turned on an
  // experiment it never turns on, so `prompt: 'none'` falls through to the
  // popup branch like every other prompt. A popup wants a gesture behind it,
  // and an hour quietly running out has none. So the hour ending ends the
  // session, and the next token comes from a click.
  it('ends the session when the token reaches its end, asking Google nothing', async () => {
    let clock = 0
    const { load, prompts } = fakeGis(() => granted(3600))
    const provider = new GoogleTokenProvider('client-1', { loadGis: load, now: () => clock })

    await provider.signIn()
    clock += 3_600_000 // an hour on

    await expect(provider.getAccessToken()).rejects.toThrow(/expired/)
    expect(prompts).toEqual(['consent'])
    expect(provider.isSignedIn).toBe(false)
  })

  it('opens one popup even when two callers ask at once', async () => {
    const { load, prompts } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await Promise.all([provider.signIn(), provider.signIn()])

    expect(prompts).toHaveLength(1)
  })

  it('reports a refusal rather than resolving with nothing', async () => {
    const { load } = fakeGis(() => ({ error: 'access_denied' }))
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).rejects.toThrow(/access_denied/)
    expect(provider.isSignedIn).toBe(false)
  })

  it('reports a dismissed popup', async () => {
    const { load } = fakeGis(() => 'silent')
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).rejects.toThrow(/popup_closed/)
  })

  // Widened: the original only ever refused *consent*, which happens after
  // #loadGis() has already resolved, so #ready held a fulfilled promise and
  // the only state the retry had to clear was #pending. The refusal that
  // latches is the one that happens *during* the load, and it was unreachable
  // while the fake's loader was hard-wired to `Promise.resolve(gis)`.
  it.each([
    ['the user refuses consent', false],
    ['the script cannot be fetched the first time', true],
  ])('can be retried after a refusal: %s', async (_case, refuseTheLoad) => {
    let allow = refuseTheLoad
    const { gis, prompts } = fakeGis(() => (allow ? granted() : { error: 'access_denied' }))
    let loads = 0
    const load = vi.fn(() => {
      loads += 1
      return refuseTheLoad && loads === 1
        ? Promise.reject(new Error('Google Identity Services could not be loaded'))
        : Promise.resolve(gis)
    })
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).rejects.toThrow()
    allow = true
    await expect(provider.signIn()).resolves.toBe('tok-abc')

    // A transient load failure must not disable sign-in for the life of the
    // page: the second attempt has to reach the popup at all.
    expect(prompts).toEqual(refuseTheLoad ? ['consent'] : ['consent', 'consent'])
  })

  // The token is what crosses a reload, because nothing else can: a page load
  // has no gesture to open a popup with. It crosses in the tab's own storage,
  // so it goes when the tab goes, and it is written nowhere that outlasts it.
  it('keeps the token in the tab, and nowhere longer-lived than the tab', async () => {
    const session = fakeStorage()
    const { load } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load, session })

    await provider.signIn()

    expect(session.getItem(TOKEN_KEY)).toContain('tok-abc')

    const longerLived = [...Object.values(localStorage), document.cookie].join(' ')
    expect(longerLived).not.toContain('tok-abc')
  })

  it('calls nothing in the id namespace across a sign-in, a reload and a sign-out', async () => {
    const session = fakeStorage()
    const { load, idCalls } = fakeGis(() => granted())

    await new GoogleTokenProvider('client-1', { loadGis: load, session }).signIn()
    const reloaded = new GoogleTokenProvider('client-1', { loadGis: load, session })
    await reloaded.resume()
    await reloaded.signOut()

    expect(idCalls).toEqual([])
  })

  it('asks for consent and names no account, whatever an earlier version stored', async () => {
    localStorage.setItem('telly.google.account', 'sub-alice')
    const { load, requests } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await provider.signIn()

    expect(requests).toStrictEqual([{ prompt: 'consent' }])
  })

  it('writes nothing to localStorage across a sign-in, a reload and a sign-out', async () => {
    const session = fakeStorage()
    const { load } = fakeGis(() => granted())
    const stored: string[][] = [Object.keys(localStorage)]

    await new GoogleTokenProvider('client-1', { loadGis: load, session }).signIn()
    stored.push(Object.keys(localStorage))
    const reloaded = new GoogleTokenProvider('client-1', { loadGis: load, session })
    await reloaded.resume()
    stored.push(Object.keys(localStorage))
    await reloaded.signOut()
    stored.push(Object.keys(localStorage))

    expect(stored).toEqual([[], [], [], []])
  })

  describe('resume', () => {
    // Every one of these paths puts the same sign-in button on the screen, so
    // without this the reason is gone at the moment it is known.
    it('says why it stayed signed out', async () => {
      const said: string[] = []
      const diagnose = (event: string, detail?: string) => said.push(detail ? `${event}: ${detail}` : event)
      const { load } = fakeGis(() => granted())

      // A tab that was holding nothing.
      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: fakeStorage(),
        diagnose,
      }).resume()

      // A tab whose token went past its hour while it was away.
      let clock = 0
      const stale = fakeStorage()
      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: stale,
        now: () => clock,
      }).signIn()
      clock += 3_600_000
      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: stale,
        now: () => clock,
        diagnose,
      }).resume()

      // A tab whose token still has its hour to run.
      const good = fakeStorage()
      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: good,
      }).signIn()
      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: good,
        diagnose,
      }).resume()

      expect(said).toEqual([
        'resume: this tab held no token, so it starts at the button',
        'resume: the held token was past its time',
        'resume: took up the token this tab held',
      ])
    })

    it('asks Google nothing on a browser that has never granted', async () => {
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: fakeStorage(),
      })

      await expect(provider.resume()).resolves.toBe(false)
      expect(load).not.toHaveBeenCalled()
    })

    // The reload this class exists to survive. A second provider reading the
    // same tab storage is what a refresh is.
    it('takes up the token this tab was holding before the reload', async () => {
      const session = fakeStorage()
      const { load, prompts } = fakeGis(() => granted())

      await new GoogleTokenProvider('client-1', { loadGis: load, session }).signIn()

      const reloaded = new GoogleTokenProvider('client-1', { loadGis: load, session })

      await expect(reloaded.resume()).resolves.toBe(true)
      expect(reloaded.isSignedIn).toBe(true)
      // Google was asked nothing. The popup a page load cannot open was never
      // needed, which is the whole of the fix.
      expect(prompts).toEqual(['consent'])
    })

    it('drops a token whose hour ran out while the tab was away', async () => {
      let clock = 0
      const session = fakeStorage()
      const { load } = fakeGis(() => granted(3600))

      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session,
        now: () => clock,
      }).signIn()

      clock += 3_600_000
      const reloaded = new GoogleTokenProvider('client-1', {
        loadGis: load,
        session,
        now: () => clock,
      })

      await expect(reloaded.resume()).resolves.toBe(false)
      expect(reloaded.isSignedIn).toBe(false)
      expect(session.getItem(TOKEN_KEY)).toBeNull()
    })
  })

  // A grant revoked from the Google account's own settings leaves this tab
  // holding a token the API answers 401 to. Until it is dropped, every load
  // fails with an error instead of putting the sign-in button back.
  describe('a token the API refused', () => {
    it('drops it, clears it from the tab and tells whoever is watching', async () => {
      const session = fakeStorage()
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load, session })
      await provider.signIn()
      const heard: boolean[] = []
      provider.subscribe((signedIn) => heard.push(signedIn))

      provider.reject('tok-abc')

      expect(provider.isSignedIn).toBe(false)
      expect(heard).toEqual([false])
      expect(session.getItem(TOKEN_KEY)).toBeNull()
      await expect(provider.getAccessToken()).rejects.toThrow()
    })

    // A load that started before a fresh sign-in can come back with a 401 for
    // the token it was sent with. That answer is about the old token only.
    it('keeps the token it holds when the refusal was for a different one', async () => {
      const session = fakeStorage()
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load, session })
      await provider.signIn()

      provider.reject('tok-from-before')

      expect(provider.isSignedIn).toBe(true)
      expect(session.getItem(TOKEN_KEY)).toContain('tok-abc')
      await expect(provider.getAccessToken()).resolves.toBe('tok-abc')
    })
  })

  describe('signOut', () => {
    it('hands the token back to Google and forgets it here', async () => {
      const { load, revoked } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load })
      await provider.signIn()

      await provider.signOut()

      expect(revoked).toEqual(['tok-abc'])
      expect(provider.isSignedIn).toBe(false)
    })

    // Google answers a revocation through its callback, and `successful:
    // false` is Google keeping the grant: it refuses a token past its hour,
    // for one. The grant is still standing, so the sign-out says so, and the
    // page is signed out all the same.
    it('fails when Google refuses to take the grant back, and forgets it here anyway', async () => {
      const session = fakeStorage()
      const { load, revoked } = fakeGis(() => granted(), {
        successful: false,
        error: 'invalid_token',
      })
      const provider = new GoogleTokenProvider('client-1', { loadGis: load, session })
      const seen: boolean[] = []
      provider.subscribe((signedIn) => seen.push(signedIn))
      await provider.signIn()

      await expect(provider.signOut()).rejects.toThrow()

      expect(revoked).toEqual(['tok-abc'])
      expect(provider.isSignedIn).toBe(false)
      expect(session.getItem(TOKEN_KEY)).toBeNull()
      expect(seen).toEqual([true, false])
    })

    it('tells whoever is watching, so the screen follows', async () => {
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
      })
      const seen: boolean[] = []
      provider.subscribe((signedIn) => seen.push(signedIn))

      await provider.signIn()
      await provider.signOut()

      expect(seen).toEqual([true, false])
    })
  })

  describe('an expired token', () => {
    it('is not handed out, and is not quietly replaced either', async () => {
      let clock = 0
      let issued = 0
      const { load } = fakeGis(() => ({ access_token: `tok-${++issued}`, expires_in: 3600 }))
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
        now: () => clock,
        session: fakeStorage(),
      })

      await expect(provider.signIn()).resolves.toBe('tok-1')
      clock += 3600 * 1000
      await expect(provider.getAccessToken()).rejects.toThrow(/expired/)
    })

    it('puts the screen back to signed out, and the token beyond reach', async () => {
      let clock = 0
      const session = fakeStorage()
      const { load } = fakeGis(
        () => ({ access_token: 'tok-1', expires_in: 3600 }),
      )
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
        now: () => clock,
        session,
      })
      const seen: boolean[] = []
      await provider.signIn()
      provider.subscribe((signedIn) => seen.push(signedIn))

      clock += 3600 * 1000
      await expect(provider.getAccessToken()).rejects.toThrow(/expired/)

      expect(seen).toEqual([false])
      expect(provider.isSignedIn).toBe(false)
      // A spent token is no longer worth carrying over a reload.
      expect(session.getItem(TOKEN_KEY)).toBeNull()
    })
  })

  /*
    Mutation-testing survivors: each of these guards was written from reasoning
    about what Google can send, and none of them was ever observed.
  */
  describe('what the token response says about its life', () => {
    const lifetimeOf = async (expires_in: unknown) => {
      let clock = 0
      const { load } = fakeGis(() => ({ access_token: 'tok-abc', expires_in } as TokenResponse))
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
        now: () => clock,
      })
      await provider.signIn()
      return {
        at: (ms: number) => {
          clock = ms
          return provider.isSignedIn
        },
      }
    }

    it('takes the hour GIS issues when the response says nothing', async () => {
      const token = await lifetimeOf(undefined)

      expect(token.at(0)).toBe(true)
      expect(token.at(3_600_000)).toBe(false)
    })

    it('reads the seconds GIS sends as a string, which is how it sends them', async () => {
      const token = await lifetimeOf('1800')

      expect(token.at(0)).toBe(true)
      expect(token.at(1_800_000)).toBe(false)
    })

    // A life that cannot be read is treated as already over, so the next call
    // renews rather than sending a token of unknown standing.
    it('treats a life it cannot read as spent', async () => {
      const token = await lifetimeOf('not a number')

      expect(token.at(0)).toBe(false)
    })

    // The margin exists so a request never goes out on a token that expires
    // while it is in flight.
    it('gives the token up a minute before Google would', async () => {
      const token = await lifetimeOf(3600)

      expect(token.at(3_600_000 - 60_001)).toBe(true)
      expect(token.at(3_600_000 - 60_000)).toBe(false)
    })
  })

  it('takes up nothing twice over: a live session resumes as itself', async () => {
    const { load, prompts } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })
    await provider.signIn()

    await expect(provider.resume()).resolves.toBe(true)

    // The held token answered it. Nothing was asked of Google a second time.
    expect(prompts).toEqual(['consent'])
  })

  /*
    A response that carries neither an error nor a token. Survived mutation on
    both halves of the guard, which means nothing proved either half was load
    bearing.
  */
  describe('a response with nothing in it', () => {
    it('is a failure, not a token of undefined', async () => {
      const { load } = fakeGis(() => ({}) as TokenResponse)
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
      })

      await expect(provider.signIn()).rejects.toThrow(/no token returned/)
      expect(provider.isSignedIn).toBe(false)
    })

    it('is a failure even when it names an error and a token at once', async () => {
      const { load } = fakeGis(() => ({ error: 'access_denied', access_token: 'tok-abc' }))
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
      })

      // Google said no. A token beside the refusal is not consent.
      await expect(provider.signIn()).rejects.toThrow(/access_denied/)
      expect(provider.isSignedIn).toBe(false)
    })
  })
})

describe('loadGoogleIdentityServices', () => {
  const scriptTag = () => document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`)

  afterEach(() => {
    scriptTag()?.remove()
    delete (window as { google?: unknown }).google
  })

  it('rejects when the script is blocked, rather than hanging for ever', async () => {
    const pending = loadGoogleIdentityServices()
    scriptTag()?.dispatchEvent(new Event('error'))
    await expect(pending).rejects.toThrow(/could not be loaded/i)
  })

  it('rejects if the script loads but exposes nothing usable', async () => {
    const pending = loadGoogleIdentityServices()
    scriptTag()?.dispatchEvent(new Event('load'))
    await expect(pending).rejects.toThrow(/exposed no oauth2/i)

    // Widened: one call can never see the hang. This path leaves its <script>
    // in the document (only the error path removes it), so a second call takes
    // the `existing` branch at googleTokenProvider.ts:56, attaches listeners to
    // a tag that has already fired, and appends nothing: no event will ever
    // come. The docstring at :48-50 says a blocked script must not hang; the
    // narrow test only proved that of the very first call.
    const second = loadGoogleIdentityServices()
    const outcome = await Promise.race([
      second.then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise((resolve) => setTimeout(() => resolve('still pending'), 50)),
    ])
    expect(outcome).toBe('rejected')
  })
})
