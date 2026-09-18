/**
 * What the set's speaker is doing, behind an interface. jsdom has no Web Audio,
 * so this seam is what makes anything that makes a noise testable at all:
 * production gets `WebAudioSound`, tests get a double and assert on the calls.
 *
 * Two sounds, because a set with nothing to show made two different noises. A
 * station transmitting the card sent the line-up tone with it. A preset with no
 * station on it sent nothing at all, and what you heard was the noise that was
 * always underneath, the same noise the snow is made of, which is why the two
 * always arrived together.
 */
export interface Sound {
  /**
   * Build and resume the audio context, from inside a user gesture.
   *
   * The same rule as Google's popup, and for the same reason: a browser will
   * only start audio for a page the viewer has interacted with, and closedown
   * arrives hours after anyone last touched anything. Switching the set on is
   * the gesture, so that is when the context has to be opened: by the time
   * the tone is wanted there is nothing left to ask permission with.
   */
  prepare(): void
  /** The line-up tone that goes out with the test card. */
  tone(hz: number): void
  /** No carrier. The noise between stations, under the snow. */
  hiss(): void
  /**
   * A detent on a knob, and a key going down on the fascia.
   *
   * These are not broadcast, they are the cabinet: the noise a control makes
   * in the room, which is why neither of them is touched by the volume knob.
   * Turning the sound right down does not stop a switch clicking.
   */
  click(): void
  clunk(): void
  /** 0..1, scaled into the sound's own ceiling. The volume knob drives this. */
  setLevel(fraction: number): void
  stop(): void
}

/** The line-up tone that went out with the card. 1 kHz, as it was. */
export const DEFAULT_TONE_HZ = 1000

/** Deliberately quiet. A test card is a signal, not an alarm. */
export const MAX_TONE_GAIN = 0.06

/**
 * Quieter still. A tone is one frequency and hiss is all of them at once, so
 * matching them by number would not match them by ear: broadband noise at the
 * tone's level is a hairdryer.
 */
export const MAX_HISS_GAIN = 0.022

/** Seconds spent fading in or out, so nothing ever clicks or blares. */
const FADE_SECONDS = 0.08

/**
 * The mechanical noises, as filtered bursts of the same noise the hiss is made
 * of. A detent is a small bright tick; a key is a bright snap over a low body,
 * which is the difference between a knob and a piano-key switch.
 */
interface Knock {
  /** Shaping the noise: a detent is narrow and high, a body is low and dull. */
  readonly filter: BiquadFilterType
  readonly hz: number
  readonly q: number
  readonly level: number
  readonly decaySeconds: number
}

const DETENT: readonly Knock[] = [
  { filter: 'bandpass', hz: 3200, q: 1.4, level: 0.05, decaySeconds: 0.022 },
]

const KEY: readonly Knock[] = [
  { filter: 'bandpass', hz: 2100, q: 0.9, level: 0.055, decaySeconds: 0.03 },
  { filter: 'lowpass', hz: 220, q: 0.7, level: 0.13, decaySeconds: 0.085 },
]

/** Silence, as a gain an exponential ramp can legally reach. */
const NEARLY_SILENT = 0.0001

/** How much noise to generate before looping it. Long enough not to buzz. */
const NOISE_SECONDS = 2

type Playing = 'tone' | 'hiss'

export class WebAudioSound implements Sound {
  readonly #createContext: () => AudioContext
  readonly #toneLevel: number
  readonly #hissLevel: number
  #context: AudioContext | undefined
  #source: AudioScheduledSourceNode | undefined
  #playing: Playing | undefined
  #gain: GainNode | undefined
  /** The tone's pitch, kept so it can be retuned without a new oscillator. */
  #frequency: AudioParam | undefined
  /** Cached: filling a couple of seconds of noise is not free. */
  #noise: AudioBuffer | undefined
  /** Where the volume knob is, 0..1. */
  #fraction = 1
  /**
   * Which slice of the noise the next knock is cut from. A counter rather than
   * a random draw: two presses in a row must not sound identical, and nothing
   * in this app is allowed to be unrepeatable.
   */
  #knocks = 0

  /**
   * The context is created lazily, on the first sound: constructing one before
   * the viewer has asked for sound is what browsers block anyway.
   */
  constructor(
    createContext: () => AudioContext,
    toneLevel: number = MAX_TONE_GAIN,
    hissLevel: number = MAX_HISS_GAIN,
  ) {
    this.#createContext = createContext
    this.#toneLevel = toneLevel
    this.#hissLevel = hissLevel
  }

  prepare(): void {
    const context = (this.#context ??= this.#createContext())
    void context.resume()
  }

  setLevel(fraction: number): void {
    this.#fraction = Math.min(1, Math.max(0, fraction))
    this.#ramp()
  }

  get #target(): number {
    const level = this.#playing === 'hiss' ? this.#hissLevel : this.#toneLevel
    return level * this.#fraction
  }

  #ramp(): void {
    const gain = this.#gain
    const context = this.#context
    if (!gain || !context) return
    // Ramped, not set: a gain that jumps clicks, and a click is the one sound
    // a line-up tone must never make.
    gain.gain.linearRampToValueAtTime(this.#target, context.currentTime + FADE_SECONDS)
  }

  tone(hz: number): void {
    const context = this.#open()

    // Already toning: retune rather than stack a second oscillator.
    if (this.#frequency) {
      this.#frequency.value = hz
      return
    }

    const oscillator = context.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.value = hz
    this.#play(oscillator, 'tone')
    this.#frequency = oscillator.frequency
  }

  hiss(): void {
    const context = this.#open()

    // Already hissing. Restarting it would only produce a gap and a click.
    if (this.#playing === 'hiss') return

    const source = context.createBufferSource()
    source.buffer = (this.#noise ??= makeNoise(context))
    source.loop = true
    this.#play(source, 'hiss')
  }

  click(): void {
    this.#knock(DETENT)
  }

  clunk(): void {
    this.#knock(KEY)
  }

  /**
   * One mechanical noise: a burst of the hiss's own noise, shaped and let
   * decay. Wired straight to the destination rather than through the sound's
   * gain, because the volume knob is a control on the set and these are the
   * sound of the set itself.
   */
  #knock(layers: readonly Knock[]): void {
    // A knock only ever happens because somebody touched something, so this is
    // always inside a gesture and always allowed to open the context.
    const context = this.#open()
    const noise = (this.#noise ??= makeNoise(context))
    const now = context.currentTime
    // Walked forward in an odd fraction of a second so successive knocks never
    // repeat a slice, and never line up with the loop either.
    const offset = ((this.#knocks++ * 0.137) % (NOISE_SECONDS - 0.2)) + 0.05

    for (const layer of layers) {
      const source = context.createBufferSource()
      source.buffer = noise

      const filter = context.createBiquadFilter()
      filter.type = layer.filter
      filter.frequency.value = layer.hz
      filter.Q.value = layer.q

      const gain = context.createGain()
      gain.gain.setValueAtTime(layer.level, now)
      gain.gain.exponentialRampToValueAtTime(NEARLY_SILENT, now + layer.decaySeconds)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(context.destination)

      source.start(now, offset, layer.decaySeconds)
      source.stop(now + layer.decaySeconds)
    }
  }

  #open(): AudioContext {
    const context = (this.#context ??= this.#createContext())
    void context.resume()
    return context
  }

  /** Swap whatever is playing for this, fading up from silence. */
  #play(source: AudioScheduledSourceNode, playing: Playing): void {
    this.stop()
    const context = this.#context
    if (!context) return

    const gain = context.createGain()
    source.connect(gain)
    gain.connect(context.destination)

    this.#source = source
    this.#gain = gain
    this.#playing = playing

    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(this.#target, context.currentTime + FADE_SECONDS)
    source.start()
  }

  stop(): void {
    if (!this.#source || !this.#gain || !this.#context) return

    this.#gain.gain.linearRampToValueAtTime(0, this.#context.currentTime + FADE_SECONDS)
    this.#source.stop()
    this.#source.disconnect()
    this.#gain.disconnect()
    this.#source = undefined
    this.#gain = undefined
    this.#frequency = undefined
    this.#playing = undefined
  }
}

/**
 * White noise, generated once and looped. Uniform rather than Gaussian: the
 * difference is inaudible under a speaker grille and this is one multiply per
 * sample instead of a Box–Muller transform for every one of them.
 */
function makeNoise(context: AudioContext): AudioBuffer {
  const frames = Math.floor(context.sampleRate * NOISE_SECONDS)
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) samples[i] = Math.random() * 2 - 1
  return buffer
}
