import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GIS_SCRIPT_URL,
  GoogleTokenProvider,
  loadGoogleIdentityServices,
  YOUTUBE_READONLY_SCOPE,
  type GoogleIdentityServices,
  type TokenResponse,
} from './googleTokenProvider'

/** Stands in for Google's script. No test may reach the real one. */
function fakeGis(respond: (prompt: string) => TokenResponse | 'silent') {
  const prompts: string[] = []
  const configs: { client_id: string; scope: string }[] = []
  const gis: GoogleIdentityServices = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => {
          configs.push({ client_id: config.client_id, scope: config.scope })
          return {
            requestAccessToken: (overrides) => {
              const prompt = overrides?.prompt ?? ''
              prompts.push(prompt)
              const reply = respond(prompt)
              if (reply === 'silent') config.error_callback?.({ type: 'popup_closed' })
              else config.callback(reply)
            },
          }
        },
      },
    },
  }
  return { gis, prompts, configs, load: vi.fn(() => Promise.resolve(gis)) }
}

const granted = (expiresIn = 3600): TokenResponse => ({
  access_token: 'tok-abc',
  expires_in: expiresIn,
})

describe('GoogleTokenProvider', () => {
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

  it('renews silently once the token is near its end', async () => {
    let clock = 0
    const { load, prompts } = fakeGis(() => granted(3600))
    const provider = new GoogleTokenProvider('client-1', { loadGis: load, now: () => clock })

    await provider.signIn()
    clock += 3_600_000 // an hour on

    await expect(provider.getAccessToken()).resolves.toBe('tok-abc')
    // '' is the silent prompt: renew if consent still stands, fail if not.
    expect(prompts).toEqual(['consent', ''])
  })

  it('opens one popup even when two callers ask at once', async () => {
    const { load, prompts } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await Promise.all([provider.getAccessToken(), provider.getAccessToken()])

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
  // #loadGis() has already resolved — so #ready held a fulfilled promise and
  // the only state the retry had to clear was #pending. The refusal that
  // latches is the one that happens *during* the load, and it was unreachable
  // while the fake's loader was hard-wired to `Promise.resolve(gis)`.
  it.each([
    ['the user refuses consent', false],
    ['the script cannot be fetched the first time', true],
  ])('can be retried after a refusal — %s', async (_case, refuseTheLoad) => {
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

  it('never writes the token anywhere it could outlive the page', async () => {
    const { load } = fakeGis(() => granted())
    const provider = new GoogleTokenProvider('client-1', { loadGis: load })

    await provider.signIn()

    const stored = [
      ...Object.values(localStorage),
      ...Object.values(sessionStorage),
      document.cookie,
    ].join(' ')
    expect(stored).not.toContain('tok-abc')
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
    // a tag that has already fired, and appends nothing — no event will ever
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
