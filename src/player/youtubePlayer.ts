import type { Player, PlayerFault } from './player'

/**
 * The strict-telly player vars: no controls, no keyboard, no related videos at
 * the end, and inline on a phone rather than the OS full-screen player. The
 * viewer gets a picture and nothing to press.
 */
const STRICT_TELLY_VARS = {
  controls: 0,
  disablekb: 1,
  modestbranding: 1,
  rel: 0,
  playsinline: 1,
} as const

const API_URL = 'https://www.youtube.com/iframe_api'

/** The YouTube error codes worth telling apart. Anything else is a fault too. */
const FAULT_REASONS: Readonly<Record<number, string>> = {
  2: 'bad request',
  5: 'player error',
  100: 'not found',
  101: 'not embeddable',
  150: 'not embeddable',
}

export interface YouTubePlayerVars extends Record<string, number> {
  start: number
}

export interface YouTubePlayerEvent {
  target: YouTubePlayerHandle
}

export interface YouTubeErrorEvent extends YouTubePlayerEvent {
  data: number
}

export interface YouTubeStateEvent {
  target: YouTubePlayerHandle
  data: number
}

export interface YouTubePlayerOptions {
  width?: string | number
  height?: string | number
  videoId: string
  playerVars: YouTubePlayerVars
  events: {
    onReady?: (event: YouTubePlayerEvent) => void
    onError?: (event: YouTubeErrorEvent) => void
    /** YT.PlayerState: how we learn a picture actually arrived. */
    onStateChange?: (event: YouTubeStateEvent) => void
  }
}

/** Only the slice of the IFrame API this driver actually uses. */
export interface YouTubePlayerHandle {
  loadVideoById(request: { videoId: string; startSeconds: number }): void
  playVideo(): void
  stopVideo(): void
  setVolume(volume: number): void
  destroy(): void
}

export interface YouTubeApi {
  Player: new (host: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerHandle
}

/** Injected, so no test ever reaches the network. */
export type ScriptLoader = () => Promise<YouTubeApi>

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

/**
 * The real loader. Nothing happens until it is *called*: importing this module
 * touches neither the network nor the document, which is what lets the app and
 * its suite run entirely offline.
 */
export function loadYouTubeIframeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)

  return new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT as YouTubeApi)
    }

    if (document.querySelector(`script[src="${API_URL}"]`)) return

    const script = document.createElement('script')
    script.src = API_URL
    // Without this the promise simply never settles when the script is blocked
    // (by an ad-blocker, a firewall, or YouTube being down) and the screen
    // stays black with nothing reported. A rejection is a fault like any other.
    script.onerror = () => {
      script.remove()
      reject(new Error('The YouTube IFrame API could not be loaded'))
    }
    document.head.append(script)
  })
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** What was last asked for, held until there is a player to ask. */
interface Cue {
  videoId: string
  offsetSec: number
}

/** Our own codes. YouTube's own error codes are all positive. */
const API_UNAVAILABLE = 0
const NO_PICTURE = -1

/** YT.PlayerState: a picture is either running or on its way. */
const PLAYING = 1
const BUFFERING = 3

/**
 * How long a programme may mount without producing a picture before we give up
 * on it. YouTube renders its own error page inside the iframe for some
 * failures and never fires `onError`, so waiting on an error event alone
 * leaves a blank screen for ever. Generous enough for a slow connection:
 * buffering counts as progress and stands the watchdog down.
 */
const DEFAULT_START_TIMEOUT_MS = 8000

export interface YouTubeIframePlayerOptions {
  startTimeoutMs?: number
}

export class YouTubeIframePlayer implements Player {
  readonly #loadApi: ScriptLoader
  readonly #host: HTMLElement
  readonly #faultListeners = new Set<(fault: PlayerFault) => void>()
  readonly #pictureListeners = new Set<(hasPicture: boolean) => void>()
  #hasPicture = false
  #handle: YouTubePlayerHandle | undefined
  /**
   * `new YT.Player()` hands back an object immediately, but the API grafts its
   * methods on only when the frame reports ready. Until then the handle exists
   * and `setVolume`, `playVideo`, `loadVideoById`, `stopVideo` and `destroy`
   * are all `undefined`, so calling one is a TypeError in the console and a
   * programme that never starts.
   */
  #ready = false
  /**
   * Which mount the callbacks belong to. A player that has been torn down
   * still fires events (the API has no idea its frame is gone) and without
   * this they land on whatever player exists by the time they arrive.
   */
  #generation = 0
  /** The cue the current frame was constructed for, as opposed to the latest. */
  #mountedCue: Cue | undefined
  #loading = false
  #destroyed = false
  #cue: Cue | undefined
  #volume = 1
  readonly #startTimeoutMs: number
  #startTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * The API is fetched lazily, on the first `load`: like an `AudioContext`,
   * there is no reason to reach for the network before the viewer has switched
   * the set on.
   */
  constructor(
    loadApi: ScriptLoader,
    host: HTMLElement,
    { startTimeoutMs = DEFAULT_START_TIMEOUT_MS }: YouTubeIframePlayerOptions = {},
  ) {
    this.#loadApi = loadApi
    this.#host = host
    this.#startTimeoutMs = startTimeoutMs
  }

  load(videoId: string, offsetSec: number): void {
    if (this.#destroyed) return

    const cue: Cue = { videoId, offsetSec: Math.max(0, Math.floor(offsetSec)) }
    this.#cue = cue
    this.#setPicture(false)
    this.#armWatchdog()

    if (this.#handle) {
      // Still building: leave it alone. `#onReady` picks up whatever the
      // latest cue turns out to be, so a programme change during the mount is
      // not lost; it simply arrives with the picture.
      if (this.#ready) {
        this.#handle.loadVideoById({ videoId: cue.videoId, startSeconds: cue.offsetSec })
      }
      return
    }

    if (this.#loading) return // The pending mount will pick up the latest cue.
    this.#loading = true
    void this.#loadApi().then(
      (api) => this.#mount(api),
      // The script never arrived: blocked, offline, or YouTube is down. That
      // is a fault like any other: report it so the screen can apologise
      // instead of showing black for ever, and let go of the loading latch so
      // the next programme tries again.
      () => {
        this.#loading = false
        this.#fault(API_UNAVAILABLE, 'player unavailable')
      },
    )
  }

  stop(): void {
    this.#clearWatchdog()
    this.#setPicture(false)
    if (this.#ready) this.#handle?.stopVideo()
    // And let it go. The surface above removes the host from the document when
    // it unmounts, and moving an iframe in the DOM reloads it, which severs
    // the player object from the frame it thinks it is driving, so every later
    // loadVideoById is swallowed and the set never shows a picture again.
    // Rebuilding on the next load costs a fresh frame and is always correct.
    this.#teardown()
  }

  setVolume(volume: number): void {
    this.#volume = clamp01(volume)
    // Held rather than dropped: `#onReady` applies whatever it has landed on.
    if (this.#ready) this.#handle?.setVolume(Math.round(this.#volume * 100))
  }

  destroy(): void {
    this.#destroyed = true
    this.#clearWatchdog()
    this.#setPicture(false)
    this.#pictureListeners.clear()
    this.#cue = undefined
    this.#faultListeners.clear()
    this.#teardown()
  }

  onFault(listener: (fault: PlayerFault) => void): () => void {
    this.#faultListeners.add(listener)
    return () => this.#faultListeners.delete(listener)
  }

  onPicture(listener: (hasPicture: boolean) => void): () => void {
    this.#pictureListeners.add(listener)
    listener(this.#hasPicture)
    return () => this.#pictureListeners.delete(listener)
  }

  #setPicture(hasPicture: boolean): void {
    if (this.#hasPicture === hasPicture) return
    this.#hasPicture = hasPicture
    for (const listener of [...this.#pictureListeners]) listener(hasPicture)
  }

  #mount(api: YouTubeApi): void {
    this.#loading = false
    const cue = this.#cue
    if (this.#destroyed || !cue) return

    // The surface can unmount while the API is still being fetched, and its
    // cleanup takes the host out of the document. A player built into a
    // detached element can never show anyone a picture (it would sit there
    // buffering audio nobody asked for) so abandon this mount and let the
    // next `load` build one somewhere real.
    if (!this.#host.isConnected) return

    // The API *replaces* the element it is given with an iframe, so it cannot
    // be handed the host twice. Each mount gets a fresh target inside the host,
    // which is also what makes rebuilding after a failure possible at all.
    const target = document.createElement('div')
    target.style.position = 'absolute'
    target.style.inset = '0'
    this.#host.replaceChildren(target)

    // Everything from here belongs to this mount and no other.
    const generation = ++this.#generation
    const current = () => generation === this.#generation

    const handle = new api.Player(target, {
      // The API *replaces* the host element with an iframe of its own, so
      // styling the host achieves nothing: the size has to be passed in here.
      // Without it you get YouTube's 640x390 default sitting in the corner of
      // the stage, which on a television reads as nothing showing at all.
      width: '100%',
      height: '100%',
      videoId: cue.videoId,
      // `start` is how you join in progress on the very first video; every
      // later one arrives through `loadVideoById`'s `startSeconds`.
      playerVars: { ...STRICT_TELLY_VARS, start: cue.offsetSec },
      events: {
        onReady: () => current() && this.#onReady(),
        onError: (event) => current() && this.#onError(event.data),
        onStateChange: (event) => current() && this.#onStateChange(event.data),
      },
    })

    this.#handle = handle
    this.#mountedCue = cue
    this.#ready = false
  }

  #onReady(): void {
    const handle = this.#handle
    if (!handle) return
    this.#ready = true

    handle.setVolume(Math.round(this.#volume * 100))

    // The frame was built for one programme and the schedule may have moved on
    // while it was building. Starting the one it was built for would be showing
    // the wrong programme, not merely a late one.
    const cue = this.#cue
    if (cue && cue !== this.#mountedCue) {
      handle.loadVideoById({ videoId: cue.videoId, startSeconds: cue.offsetSec })
      this.#mountedCue = cue
    }

    handle.playVideo()
  }

  #onError(code: number): void {
    this.#clearWatchdog()
    this.#setPicture(false)
    this.#fault(code, FAULT_REASONS[code] ?? 'unavailable')
    // A YouTube player that has errored stays errored: loadVideoById on it
    // does nothing, so the next programme would never appear and the set would
    // sit on a test card until someone refreshed the page. Tear it down and
    // let the next load build a fresh one.
    this.#teardown()
  }

  /** Drop the player and clear the host, leaving somewhere to mount again. */
  #teardown(): void {
    // Orphan the callbacks first: a frame being destroyed still fires events,
    // and they must not reach the player that replaces this one.
    this.#generation++
    // `destroy` is one of the methods the API grafts on at ready, so a frame
    // torn down before then cannot be asked to destroy itself. Clearing the
    // host takes the element out of the document either way, which is what
    // actually stops it.
    if (this.#ready) this.#handle?.destroy()
    this.#handle = undefined
    this.#ready = false
    this.#mountedCue = undefined
    this.#loading = false
    this.#host.replaceChildren()
  }

  #onStateChange(state: number): void {
    if (state === PLAYING || state === BUFFERING) this.#clearWatchdog()
    // Buffering is a picture on its way, not a picture. Only PLAYING pulls the
    // card down.
    this.#setPicture(state === PLAYING)
  }

  /** There should be a picture shortly. If there isn't, say so. */
  #armWatchdog(): void {
    this.#clearWatchdog()
    if (this.#destroyed) return
    this.#startTimer = setTimeout(() => {
      this.#startTimer = undefined
      this.#fault(NO_PICTURE, 'no picture')
    }, this.#startTimeoutMs)
  }

  #clearWatchdog(): void {
    if (this.#startTimer === undefined) return
    clearTimeout(this.#startTimer)
    this.#startTimer = undefined
  }

  #fault(code: number, reason: string): void {
    if (this.#destroyed) return
    const fault: PlayerFault = { videoId: this.#cue?.videoId ?? '', code, reason }
    // Reported, not recovered from: the screen above decides what to do next.
    for (const listener of [...this.#faultListeners]) listener(fault)
  }
}
