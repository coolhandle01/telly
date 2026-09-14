import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerFault } from './player'
import {
  YouTubeIframePlayer,
  loadYouTubeIframeApi,
  type YouTubeApi,
  type YouTubePlayerHandle,
  type YouTubePlayerOptions,
} from './youtubePlayer'

/**
 * jsdom has no YouTube IFrame API, and a test must never fetch one. The script
 * loader is injected, so this stands in for everything the real API would do —
 * and records what was asked of it. The assertions live in the tests.
 */
class FakeYouTubePlayer implements YouTubePlayerHandle {
  readonly loads: { videoId: string; startSeconds: number }[] = []
  readonly volumes: number[] = []
  plays = 0
  stops = 0
  destroys = 0

  readonly host: HTMLElement
  readonly options: YouTubePlayerOptions
  #ready = false

  constructor(host: HTMLElement, options: YouTubePlayerOptions) {
    this.host = host
    this.options = options
  }

  /**
   * `new YT.Player()` returns an object whose methods **do not exist yet** —
   * the API grafts them on when the frame reports ready. Calling one before
   * that is a TypeError in a real browser, so it is one here. A fake that is
   * more capable than the thing it stands in for is a fake that hides bugs,
   * and this one hid several.
   */
  #beforeReady(method: string): never {
    throw new TypeError(`player.${method} is not a function`)
  }

  loadVideoById(request: { videoId: string; startSeconds: number }): void {
    if (!this.#ready) this.#beforeReady('loadVideoById')
    this.loads.push(request)
  }
  playVideo(): void {
    if (!this.#ready) this.#beforeReady('playVideo')
    this.plays++
  }
  stopVideo(): void {
    if (!this.#ready) this.#beforeReady('stopVideo')
    this.stops++
  }
  setVolume(volume: number): void {
    if (!this.#ready) this.#beforeReady('setVolume')
    this.volumes.push(volume)
  }
  destroy(): void {
    if (!this.#ready) this.#beforeReady('destroy')
    this.destroys++
  }

  ready(): void {
    this.#ready = true
    this.options.events.onReady?.({ target: this })
  }
  fail(code: number): void {
    this.options.events.onError?.({ target: this, data: code })
  }
  state(code: number): void {
    this.options.events.onStateChange?.({ target: this, data: code })
  }
}

function fakeApi() {
  const players: FakeYouTubePlayer[] = []
  const api: YouTubeApi = {
    Player: function (host: HTMLElement, options: YouTubePlayerOptions) {
      const player = new FakeYouTubePlayer(host, options)
      players.push(player)
      return player
    } as unknown as YouTubeApi['Player'],
  }
  const load = vi.fn(() => Promise.resolve(api))
  return { players, load }
}

function fakeApiDriver() {
  const { players, load } = fakeApi()
  const host = document.createElement('div')
  document.body.append(host)
  return { players, load, host }
}

function driver() {
  const { players, load, host } = fakeApiDriver()
  return { players, load, host, player: new YouTubeIframePlayer(load, host) }
}

/** The injected loader resolves at once; there is no reason to poll slowly. */
const POLL = { interval: 1 }

/** The first mounted YouTube player, once the injected loader has resolved. */
const mounted = (players: FakeYouTubePlayer[]): Promise<FakeYouTubePlayer> =>
  vi.waitFor(() => {
    expect(players).toHaveLength(1)
    return players[0]
  }, POLL)

describe('YouTubeIframePlayer', () => {
  // Regression: the API replaces the host with an iframe of its own, so a
  // missing size gave YouTube's 640x390 default marooned in the corner of the
  // stage — which on a television is indistinguishable from nothing on at all.
  it('fills its frame rather than taking the default 640x390', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)

    const youtube = await mounted(players)
    expect(youtube.options.width).toBe('100%')
    expect(youtube.options.height).toBe('100%')
  })

  it('mounts into the injected host, with the controls a viewer cannot reach', async () => {
    const { player, players, host } = driver()

    player.load('vid-1', 0)

    const youtube = await mounted(players)
    // The API replaces whatever it is given, so it gets a fresh target inside
    // the host rather than the host itself.
    expect(host.contains(youtube.host)).toBe(true)
    expect(youtube.options.videoId).toBe('vid-1')
    expect(youtube.options.playerVars).toMatchObject({
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
    })
  })

  it('joins the video in progress, at the offset it was given', async () => {
    const { player, players } = driver()

    player.load('vid-1', 742)

    const youtube = await mounted(players)
    expect(youtube.options.playerVars.start).toBe(742)
    youtube.ready()
    expect(youtube.plays).toBe(1)
  })

  it('rounds a fractional offset down to a whole second', async () => {
    const { player, players } = driver()

    player.load('vid-1', 90.6)

    expect((await mounted(players)).options.playerVars.start).toBe(90)
  })

  it('re-uses the mounted player for the next programme, at its own offset', async () => {
    const { player, players, load } = driver()

    player.load('vid-1', 0)
    ;(await mounted(players)).ready()
    player.load('vid-2', 300)

    await vi.waitFor(() => {
      expect(players[0].loads).toEqual([{ videoId: 'vid-2', startSeconds: 300 }])
    }, POLL)
    expect(players).toHaveLength(1)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('mounts once, on the latest programme, when re-tuned before the API arrives', async () => {
    const { player, players, load } = driver()

    player.load('vid-1', 0)
    player.load('vid-2', 30)

    const youtube = await mounted(players)
    expect(youtube.options.videoId).toBe('vid-2')
    expect(youtube.options.playerVars.start).toBe(30)
    expect(youtube.loads).toEqual([])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('stops the video when asked', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    player.stop()

    expect(youtube.stops).toBe(1)
  })

  it('takes volume as 0..1 and gives YouTube 0..100', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    player.setVolume(0.42)

    expect(youtube.volumes.at(-1)).toBe(42)
  })

  it('clamps a volume outside 0..1', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    player.setVolume(9)
    player.setVolume(-3)

    expect(youtube.volumes.slice(-2)).toEqual([100, 0])
  })

  it('applies a volume set before the player was ready', async () => {
    const { player, players } = driver()

    player.setVolume(0.25)
    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()

    expect(youtube.volumes).toContain(25)
  })

  it('destroys the underlying player and goes inert', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    player.destroy()
    player.load('vid-2', 0)
    player.stop()

    expect(youtube.destroys).toBe(1)
    expect(youtube.stops).toBe(0)
    expect(youtube.loads).toEqual([])
  })

  it('mounts nothing at all if it was destroyed before the API arrived', async () => {
    const { player, players, load } = driver()

    player.load('vid-1', 0)
    player.destroy()

    await vi.waitFor(() => expect(load).toHaveBeenCalled(), POLL)
    await Promise.resolve()
    expect(players).toEqual([])
  })

  it('reports a blocked embed as a fault, naming the video', async () => {
    const { player, players } = driver()
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    youtube.fail(150)

    expect(faults).toEqual([
      { videoId: 'vid-1', code: 150, reason: 'not embeddable' },
    ])
  })

  it('reports a video that has gone', async () => {
    const { player, players } = driver()
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    ;(await mounted(players)).fail(100)

    expect(faults.at(-1)).toMatchObject({ code: 100, reason: 'not found' })
  })

  it('stops reporting faults to a listener that unsubscribed', async () => {
    const { player, players } = driver()
    const faults: PlayerFault[] = []
    const unsubscribe = player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    unsubscribe()
    youtube.fail(150)

    expect(faults).toEqual([])
  })

  it('does not retry the video that failed — recovery is the screen\'s business', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    youtube.fail(101)

    // The dead player is discarded, but nothing tries the same video again:
    // the schedule decides what comes next, not the player.
    expect(youtube.loads).toEqual([])
    expect(players).toHaveLength(1)
  })

  it('fetches nothing when the module is merely imported', () => {
    expect(document.querySelector('script[src*="youtube.com"]')).toBeNull()
  })
})

describe('when a video mounts but no picture ever arrives', () => {
  // The failure mode a real television found: YouTube renders its own
  // "unavailable" page inside the iframe for some bad IDs and never fires
  // onError, so an error-only fault path sees a perfectly healthy player and
  // the viewer sees a blank screen for ever.
  const watchdog = { startTimeoutMs: 20 }

  it('faults, so the card can go up', async () => {
    const { players, load, host } = fakeApiDriver()
    const player = new YouTubeIframePlayer(load, host, watchdog)
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    ;(await mounted(players)).ready()

    await vi.waitFor(() => expect(faults).toHaveLength(1), { interval: 5, timeout: 500 })
    expect(faults[0]).toMatchObject({ videoId: 'vid-1', reason: 'no picture' })
  })

  it('stands down as soon as the picture starts', async () => {
    const { players, load, host } = fakeApiDriver()
    const player = new YouTubeIframePlayer(load, host, watchdog)
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    youtube.state(1) // PLAYING

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(faults).toEqual([])
  })

  it('counts buffering as a picture on its way', async () => {
    const { players, load, host } = fakeApiDriver()
    const player = new YouTubeIframePlayer(load, host, watchdog)
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    ;(await mounted(players)).state(3) // BUFFERING

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(faults).toEqual([])
  })

  it('watches each new programme in its turn', async () => {
    const { players, load, host } = fakeApiDriver()
    const player = new YouTubeIframePlayer(load, host, watchdog)
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.state(1)
    player.load('vid-2', 0) // this one never starts

    await vi.waitFor(() => expect(faults).toHaveLength(1), { interval: 5, timeout: 500 })
    expect(faults[0].videoId).toBe('vid-2')
  })

  it('says nothing once destroyed', async () => {
    const { players, load, host } = fakeApiDriver()
    const player = new YouTubeIframePlayer(load, host, watchdog)
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    await mounted(players)
    player.destroy()

    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(faults).toEqual([])
  })
})

// Found on a real evening: the news slot failed (news channels routinely
// disable embedding), the card went up correctly — and then nothing played
// again until the page was refreshed. A YouTube player that has errored stays
// errored; loadVideoById on it does nothing at all.
// Found by switching the set off and on again: the surface removes the host
// from the document when it unmounts, and an iframe that moves in the DOM
// reloads — severing the player object from its frame.
describe('after the set has been switched off', () => {
  it('builds a fresh player when it comes back on', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const first = await mounted(players)
    first.ready()
    first.state(1)

    player.stop()
    player.load('vid-2', 0)

    await vi.waitFor(() => expect(players).toHaveLength(2), POLL)
    expect(players[1].options.videoId).toBe('vid-2')
  })

  it('reports no picture while it is off', async () => {
    const { player, players } = driver()
    const seen: boolean[] = []
    player.onPicture((has) => seen.push(has))

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    youtube.ready()
    youtube.state(1)
    player.stop()

    expect(seen.at(-1)).toBe(false)
  })
})

describe('after a video has failed', () => {
  it('builds a fresh player for the next programme', async () => {
    const { player, players } = driver()

    player.load('bad-video', 0)
    const first = await mounted(players)
    first.ready()
    first.fail(150)

    player.load('good-video', 0)

    await vi.waitFor(() => expect(players).toHaveLength(2), POLL)
    expect(players[1].options.videoId).toBe('good-video')
    expect(first.destroys).toBe(1)
  })

  it('leaves nothing of the dead player behind in the host', async () => {
    const { player, players, host } = driver()

    player.load('bad-video', 0)
    ;(await mounted(players)).fail(100)
    player.load('good-video', 0)
    await vi.waitFor(() => expect(players).toHaveLength(2), POLL)

    // One mount point, not a graveyard of them.
    expect(host.children).toHaveLength(1)
  })
})

describe('when the IFrame API cannot be loaded at all', () => {
  // Blocked by a network, an ad-blocker, or YouTube being down. jsdom cannot
  // reach the script either way, so this only ever showed up in a real browser:
  // the picture stayed black for ever and nothing was ever reported.
  const rejectingLoader = () => Promise.reject(new Error('ERR_TUNNEL_CONNECTION_FAILED'))

  it('reports a fault rather than leaving a dead screen', async () => {
    const player = new YouTubeIframePlayer(rejectingLoader, document.createElement('div'))
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 42)
    await vi.waitFor(() => expect(faults).toHaveLength(1))

    expect(faults[0]).toMatchObject({ videoId: 'vid-1', reason: 'player unavailable' })
  })

  it('retries on the next programme rather than wedging itself', async () => {
    const load = vi.fn(rejectingLoader)
    const player = new YouTubeIframePlayer(load, document.createElement('div'))
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    await vi.waitFor(() => expect(faults).toHaveLength(1))
    player.load('vid-2', 0)
    await vi.waitFor(() => expect(faults).toHaveLength(2))

    expect(load).toHaveBeenCalledTimes(2)
    expect(faults[1].videoId).toBe('vid-2')
  })

  it('says nothing once destroyed', async () => {
    const player = new YouTubeIframePlayer(rejectingLoader, document.createElement('div'))
    const faults: PlayerFault[] = []
    player.onFault((fault) => faults.push(fault))

    player.load('vid-1', 0)
    player.destroy()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(faults).toHaveLength(0)
  })
})

/**
 * The window between `new YT.Player()` returning and the frame reporting
 * ready. The handle exists throughout it and its methods do not, so every one
 * of these was a console error in a real browser and a green test here.
 */
describe('before the frame reports ready', () => {
  it('holds a volume change until there is a player able to take it', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    player.setVolume(0.42)

    expect(youtube.volumes).toEqual([])

    youtube.ready()
    expect(youtube.volumes.at(-1)).toBe(42)
  })

  it('does not retune a player that is still building', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    player.load('vid-2', 300)

    expect(youtube.loads).toEqual([])
  })

  it('starts the programme that is on air now, not the one it was built for', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    // The frame was constructed for vid-1. By the time it is ready the
    // schedule has moved on, and starting vid-1 would be showing the wrong
    // programme rather than merely a late one.
    player.load('vid-2', 300)
    youtube.ready()

    expect(youtube.loads).toEqual([{ videoId: 'vid-2', startSeconds: 300 }])
    expect(youtube.plays).toBe(1)
  })

  it('does not stop a player that never became ready', async () => {
    const { player, players } = driver()

    player.load('vid-1', 0)
    const youtube = await mounted(players)
    player.stop()

    expect(youtube.stops).toBe(0)
    expect(youtube.destroys).toBe(0)
  })

  it('abandons a mount whose host has left the document', async () => {
    const { player, players, host } = driver()

    player.load('vid-1', 0)
    // The surface unmounted while the API was still being fetched: React's
    // cleanup took the host out of the document. A player built into a
    // detached element can never show anyone a picture.
    host.remove()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(players).toHaveLength(0)
  })

  it('mounts again once the host is back in the document', async () => {
    const { player, players, host } = driver()

    player.load('vid-1', 0)
    host.remove()
    await new Promise((resolve) => setTimeout(resolve, 0))

    document.body.append(host)
    player.load('vid-2', 60)

    expect((await mounted(players)).options.videoId).toBe('vid-2')
  })
})

/**
 * A player that has been torn down still fires its callbacks — the frame is
 * gone but the API does not know that. They must not land on whatever player
 * exists by the time they arrive.
 */
describe('a superseded player', () => {
  it('cannot raise the picture on the set it no longer drives', async () => {
    const { player, players } = driver()
    const pictures: boolean[] = []
    player.onPicture((has) => pictures.push(has))

    player.load('vid-1', 0)
    const first = await mounted(players)
    first.ready()
    first.fail(100) // errors tear the player down

    first.state(1) // PLAYING, from the dead frame

    expect(pictures.at(-1)).toBe(false)
  })

  it('cannot report a fault after it has been torn down', async () => {
    const { player, players } = driver()
    const faults: PlayerFault[] = []

    player.load('vid-1', 0)
    const first = await mounted(players)
    first.ready()
    first.fail(100)
    player.onFault((fault) => faults.push(fault))

    first.fail(150)

    expect(faults).toHaveLength(0)
  })
})

describe('loadYouTubeIframeApi', () => {
  const API_URL = 'https://www.youtube.com/iframe_api'
  const scriptTag = () => document.querySelector<HTMLScriptElement>(`script[src="${API_URL}"]`)

  afterEach(() => {
    scriptTag()?.remove()
    delete (window as { YT?: unknown }).YT
    delete (window as { onYouTubeIframeAPIReady?: unknown }).onYouTubeIframeAPIReady
  })

  it('rejects when the script cannot be fetched, rather than hanging for ever', async () => {
    const pending = loadYouTubeIframeApi()
    const script = scriptTag()
    expect(script).not.toBeNull()

    script?.dispatchEvent(new Event('error'))

    await expect(pending).rejects.toThrow(/could not be loaded/i)
  })

  it('resolves once the API announces itself', async () => {
    const pending = loadYouTubeIframeApi()
    const api = { Player: vi.fn() }
    ;(window as { YT?: unknown }).YT = api

    window.onYouTubeIframeAPIReady?.()

    await expect(pending).resolves.toBe(api)
  })
})

/*
  The iframe is a real trust boundary — the one place content the viewer did
  not author runs in an origin of its own. The usual way a page gets that
  wrong is to accept `postMessage` from it and forget to check where the
  message came from.

  There is no such listener anywhere, and this is the assertion that keeps it
  that way: no origin check can be got wrong if none is needed. Asserted
  across every shipped module rather than this one, because the next place
  somebody reaches for `window.addEventListener('message')` will not be here.
*/
describe('the cross-origin boundary', () => {
  const SOURCES = import.meta.glob<string>('../**/*.{ts,tsx}', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  it('is never crossed by a window message listener', () => {
    const shipped = Object.entries(SOURCES).filter(([path]) => !/\.test\.tsx?$/.test(path))

    expect(shipped.length).toBeGreaterThan(50) // the glob found the app at all
    for (const [path, source] of shipped) {
      expect(source, `${path} listens for window messages`).not.toMatch(
        /addEventListener\(\s*['"]message['"]/,
      )
    }
  })
})
