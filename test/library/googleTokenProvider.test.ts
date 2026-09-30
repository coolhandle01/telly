import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GIS_SCRIPT_URL,
  GoogleTokenProvider,
  TOKEN_KEY,
  loadGoogleIdentityServices,
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
  respond: (prompt: string) => TokenResponse | 'silent' | 'untyped',
  revocation: RevocationResponse | 'nothing' = { successful: true },
) {
  const prompts: string[] = []
  const requests: unknown[] = []
  const configs: { client_id: string; scope: string }[] = []
  // What Google can still call after the request it was answering is over.
  const late = { answer: (_response: TokenResponse) => {}, fail: () => {} }
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
          late.answer = config.callback
          late.fail = () => config.error_callback?.({ type: 'popup_closed' })
          return {
            requestAccessToken: (overrides) => {
              const prompt = overrides?.prompt ?? ''
              prompts.push(prompt)
              requests.push(overrides)
              const reply = respond(prompt)
              if (reply === 'silent') config.error_callback?.({ type: 'popup_closed' })
              else if (reply === 'untyped') config.error_callback?.({})
              else config.callback(reply)
            },
          }
        },
        // Google answers after a round trip, never in the same task.
        revoke: (accessToken, done) => {
          revoked.push(accessToken)
          queueMicrotask(() => done?.((revocation === 'nothing' ? undefined : revocation) as RevocationResponse))
        },
      },
    },
  } as GoogleIdentityServices
  return {
    gis,
    prompts,
    requests,
    configs,
    late,
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
    // As the real one does: whatever it is given is stored as a string.
    setItem: (key, value) => {
      entries.set(key, String(value))
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

  // The scope is written out rather than imported: it is what the consent
  // screen shows and what Google's verification reviewed, so a change to it
  // has to fail here.
  it('asks for consent on sign-in, for read-only YouTube access, naming no account', async () => {
    const { load, requests, configs } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).resolves.toBe('tok-abc')

    expect(requests).toStrictEqual([{ prompt: 'consent' }])
    expect(configs).toEqual([
      { client_id: 'client-1', scope: 'https://www.googleapis.com/auth/youtube.readonly' },
    ])
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

  // Google's callbacks belong to the client, not to one request, so one can
  // arrive when nothing is waiting. It must not throw into Google's script.
  it('takes an answer nobody was waiting for without throwing', async () => {
    const { load, late } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })
    await provider.signIn()

    expect(() => late.answer({ access_token: 'tok-late', expires_in: 3600 })).not.toThrow()
    expect(() => late.fail()).not.toThrow()
    await expect(provider.getAccessToken()).resolves.toBe('tok-late')
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

    await expect(provider.signIn()).rejects.toMatchObject({
      name: 'SignInError',
      reason: 'access_denied',
      message: expect.stringMatching(/access_denied/),
    })
    expect(provider.isSignedIn).toBe(false)
  })

  // The screen chooses its words from the reason, so the reason is the contract.
  it.each([
    ['silent', 'popup_closed'],
    ['untyped', 'dismissed'],
  ] as const)('reports a popup that closed without a token: %s', async (reply, reason) => {
    const { load } = fakeGis(() => reply)
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await expect(provider.signIn()).rejects.toMatchObject({ reason })
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

    // A script that never arrived never reached Google, so it has no reason
    // of Google's to carry.
    await expect(provider.signIn()).rejects.toMatchObject({
      reason: refuseTheLoad ? 'unavailable' : 'access_denied',
    })
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
    const { load } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await provider.signIn()

    // Written out: the key is what an earlier tab left behind for this one.
    expect(JSON.parse(sessionStorage.getItem('telly.google.token') ?? 'null')).toEqual({
      token: 'tok-abc',
      expiresAtMs: expect.any(Number),
    })

    const longerLived = [...Object.values(localStorage), document.cookie].join(' ')
    expect(longerLived).not.toContain('tok-abc')
  })

  // A sandboxed frame or a locked-down browser throws on the storage getter
  // itself. Sign-in still works; only the reload loses it.
  it('signs in on a browser that refuses the tab storage outright', async () => {
    const own = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    try {
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load })

      await expect(provider.signIn()).resolves.toBe('tok-abc')
      await expect(new GoogleTokenProvider('client-1', { loadGis: load }).resume()).resolves.toBe(false)
      await expect(provider.signOut()).resolves.toBeUndefined()
    } finally {
      if (own) Object.defineProperty(window, 'sessionStorage', own)
      else delete (window as { sessionStorage?: Storage }).sessionStorage
    }
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
      const heard: boolean[] = []
      reloaded.subscribe((signedIn) => heard.push(signedIn))

      await expect(reloaded.resume()).resolves.toBe(true)
      expect(reloaded.isSignedIn).toBe(true)
      expect(heard).toEqual([true])
      // Google was asked nothing. The popup a page load cannot open was never
      // needed, which is the whole of the fix.
      expect(prompts).toEqual(['consent'])
    })

    it('drops a token that expired while the tab was away', async () => {
      let clock = 0
      const session = fakeStorage()
      const { load } = fakeGis(() => granted(3600))

      await new GoogleTokenProvider('client-1', {
        loadGis: load,
        session,
        now: () => clock,
      }).signIn()

      // The minute of margin is already spent, to the millisecond.
      clock = 3_600_000 - 60_000
      const reloaded = new GoogleTokenProvider('client-1', {
        loadGis: load,
        session,
        now: () => clock,
      })

      await expect(reloaded.resume()).resolves.toBe(false)
      expect(reloaded.isSignedIn).toBe(false)
      expect(session.getItem(TOKEN_KEY)).toBeNull()
    })

    // Anything that is not the pair this app wrote is nothing: a half-written
    // record, another version's shape, a value some other script put there.
    it.each([
      ['not JSON', '{"token":'],
      ['JSON null', 'null'],
      ['a token that is not a string', '{"token":["tok-abc"],"expiresAtMs":9e15}'],
      ['an empty token', '{"token":"","expiresAtMs":9e15}'],
      ['no expiry', '{"token":"tok-abc"}'],
      ['an expiry that is not a number', '{"token":"tok-abc","expiresAtMs":"soon"}'],
      ['an expiry that is not finite', '{"token":"tok-abc","expiresAtMs":1e999}'],
    ])('starts signed out from a stored record that is %s', async (_case, stored) => {
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', {
        loadGis: load,
        session: fakeStorage({ [TOKEN_KEY]: stored }),
      })

      await expect(provider.resume()).resolves.toBe(false)
      await expect(provider.getAccessToken()).rejects.toThrow()
    })

    // Storage can refuse to be read (a sandboxed frame, a locked-down
    // browser). A tab already signed in has its token in hand, and stays in.
    it('keeps a live session when the tab storage refuses to be read', async () => {
      const refusing = fakeStorage()
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load, session: refusing })
      await provider.signIn()
      refusing.getItem = () => {
        throw new DOMException('denied', 'SecurityError')
      }

      await expect(provider.resume()).resolves.toBe(true)
      await expect(
        new GoogleTokenProvider('client-1', { loadGis: load, session: refusing }).resume(),
      ).resolves.toBe(false)
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
    // false` is Google keeping the grant. The grant is still standing, so the
    // sign-out says so, and the page is signed out all the same.
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

      await expect(provider.signOut()).rejects.toThrow('Google refused the revocation: invalid_token')

      expect(revoked).toEqual(['tok-abc'])
      expect(provider.isSignedIn).toBe(false)
      expect(session.getItem(TOKEN_KEY)).toBeNull()
      expect(seen).toEqual([true, false])
    })

    it('fails when Google answers with nothing at all, and forgets it here anyway', async () => {
      const { load } = fakeGis(() => granted(), 'nothing')
      const provider = new GoogleTokenProvider('client-1', { loadGis: load })
      await provider.signIn()

      await expect(provider.signOut()).rejects.toThrow('Google refused the revocation: no reason given')
      expect(provider.isSignedIn).toBe(false)
    })

    it('asks Google nothing when there is no token to hand back', async () => {
      const { load, revoked } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load })

      await provider.signOut()

      expect(revoked).toEqual([])
      expect(load).not.toHaveBeenCalled()
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

    it('tells nobody who has stopped watching', async () => {
      const { load } = fakeGis(() => granted())
      const provider = new GoogleTokenProvider('client-1', { loadGis: load })
      const seen: boolean[] = []
      const stop = provider.subscribe((signedIn) => seen.push(signedIn))

      await provider.signIn()
      stop()
      await provider.signOut()

      expect(seen).toEqual([true])
    })
  })

  // Read out of the GIS client Google ships: the silent branch of
  // `requestAccessToken` is reached only when the script has turned on an
  // experiment it never turns on, so `prompt: 'none'` falls through to the
  // popup branch like every other prompt. A popup wants a gesture behind it,
  // and a token quietly running out has none. So its expiry ends the
  // session, and the next token comes from a click.
  it('ends the session when the token reaches its end, asking Google nothing', async () => {
    let clock = 0
    const session = fakeStorage()
    const { load, prompts } = fakeGis(() => granted(3600))
    const provider = new GoogleTokenProvider('client-1', { loadGis: load, now: () => clock, session })
    const seen: boolean[] = []
    await provider.signIn()
    provider.subscribe((signedIn) => seen.push(signedIn))

    clock += 3_600_000
    await expect(provider.getAccessToken()).rejects.toMatchObject({ reason: 'expired' })
    // Eight requests are in flight at once; the screen hears it end once.
    await expect(provider.getAccessToken()).rejects.toMatchObject({ reason: 'expired' })

    expect(seen).toEqual([false])
    expect(provider.isSignedIn).toBe(false)
    expect(prompts).toEqual(['consent'])
    // A spent token is no longer worth carrying over a reload.
    expect(session.getItem(TOKEN_KEY)).toBeNull()
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

    it('assumes 3600 seconds when the response gives no lifetime', async () => {
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
    // ends the session rather than sending a token of unknown standing.
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

  const scriptTags = () => document.querySelectorAll('script')
  const oauth2Ready = () => {
    ;(window as { google?: unknown }).google = { accounts: { oauth2: {} } }
  }

  it('uses a Google already on the page, fetching nothing', async () => {
    oauth2Ready()

    await expect(loadGoogleIdentityServices()).resolves.toBe(window.google)
    expect(scriptTags()).toHaveLength(0)
  })

  // Written out: this address is the one the CSP allows scripts from.
  it('adds one async script for Google, however many ask, and resolves once it has loaded', async () => {
    const first = loadGoogleIdentityServices()
    const second = loadGoogleIdentityServices()

    expect(scriptTags()).toHaveLength(1)
    expect(scriptTag()).toMatchObject({ src: 'https://accounts.google.com/gsi/client', async: true })

    oauth2Ready()
    scriptTag()?.dispatchEvent(new Event('load'))
    await expect(first).resolves.toBe(window.google)
    await expect(second).resolves.toBe(window.google)
  })

  it('waits on a script tag somebody else already put there, rather than adding another', async () => {
    const theirs = document.createElement('script')
    theirs.src = GIS_SCRIPT_URL
    const after = document.createElement('meta')
    document.head.append(theirs, after)

    const pending = loadGoogleIdentityServices()
    expect(scriptTags()).toHaveLength(1)
    // Left where it was, not taken up and appended again.
    expect(theirs.nextElementSibling).toBe(after)

    oauth2Ready()
    theirs.dispatchEvent(new Event('load'))
    await expect(pending).resolves.toBe(window.google)
    after.remove()
  })

  it('rejects when the script is blocked, rather than hanging for ever, and tries afresh next time', async () => {
    const pending = loadGoogleIdentityServices()
    const blocked = scriptTag()
    blocked?.dispatchEvent(new Event('error'))
    await expect(pending).rejects.toThrow(/could not be loaded/i)
    expect(blocked?.isConnected).toBe(false)

    void loadGoogleIdentityServices().catch(() => undefined)
    expect(scriptTag()).not.toBe(blocked)
    expect(scriptTags()).toHaveLength(1)
  })

  // Another Google library on the page (Maps, say) defines `window.google`
  // with no `accounts` in it.
  it.each([
    ['nothing', undefined],
    ['only another Google library', { maps: {} }],
  ])('rejects if the script loads but the page has %s, and retries next time', async (_case, google) => {
    ;(window as { google?: unknown }).google = google
    const pending = loadGoogleIdentityServices()
    scriptTag()?.dispatchEvent(new Event('load'))
    await expect(pending).rejects.toThrow(/exposed no oauth2/i)

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
