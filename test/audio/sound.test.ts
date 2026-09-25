import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeAudioContext, type FakeAudioContext } from '../support/fakeAudio'
import { MAX_HISS_GAIN, MAX_TONE_GAIN, WebAudioSound } from '@/audio/sound'

describe('WebAudioSound', () => {
  let context: FakeAudioContext
  let contextsCreated: number
  let sound: WebAudioSound

  beforeEach(() => {
    context = createFakeAudioContext()
    contextsCreated = 0
    sound = new WebAudioSound(() => {
      contextsCreated += 1
      return context as unknown as AudioContext
    })
  })

  it('does not touch the audio hardware until something is played', () => {
    expect(contextsCreated).toBe(0)
  })

  describe('the tone', () => {
    it('starts a sine oscillator at the requested frequency', () => {
      sound.tone(1000)

      expect(context.oscillators).toHaveLength(1)
      expect(context.oscillators[0].type).toBe('sine')
      expect(context.oscillators[0].frequency.value).toBe(1000)
      expect(context.oscillators[0].start).toHaveBeenCalledOnce()
    })

    it('wires the oscillator through a gain node to the destination', () => {
      sound.tone(1000)

      expect(context.oscillators[0].connect).toHaveBeenCalledWith(context.gains[0])
      expect(context.gains[0].connect).toHaveBeenCalledWith(context.destination)
    })

    it('fades up to a civilised level instead of jumping to full volume', () => {
      sound.tone(1000)
      const { gain } = context.gains[0]

      expect(gain.setValueAtTime).toHaveBeenCalledWith(0, context.currentTime)
      const [target] = gain.linearRampToValueAtTime.mock.calls[0]
      expect(target).toBe(MAX_TONE_GAIN)
      expect(MAX_TONE_GAIN).toBeLessThanOrEqual(0.2)
    })

    it('retunes rather than stacking a second oscillator when started again', () => {
      sound.tone(1000)
      sound.tone(440)

      expect(context.oscillators).toHaveLength(1)
      expect(context.oscillators[0].frequency.value).toBe(440)
    })

    it('stops the oscillator and releases the nodes', () => {
      sound.tone(1000)
      sound.stop()

      expect(context.oscillators[0].stop).toHaveBeenCalledOnce()
      expect(context.oscillators[0].disconnect).toHaveBeenCalledOnce()
      expect(context.gains[0].disconnect).toHaveBeenCalledOnce()
    })

    it('is safe to stop a sound that was never started', () => {
      expect(() => sound.stop()).not.toThrow()
      expect(contextsCreated).toBe(0)
    })

    it('can be started again after being stopped', () => {
      sound.tone(1000)
      sound.stop()
      sound.tone(1000)

      expect(context.oscillators).toHaveLength(2)
      expect(context.oscillators[1].start).toHaveBeenCalledOnce()
      expect(contextsCreated).toBe(1)
    })
  })

  describe('the hiss', () => {
    it('loops a buffer of noise, wired through a gain to the destination', () => {
      sound.hiss()

      expect(context.sources).toHaveLength(1)
      expect(context.sources[0].loop).toBe(true)
      expect(context.sources[0].start).toHaveBeenCalledOnce()
      expect(context.sources[0].connect).toHaveBeenCalledWith(context.gains[0])
      expect(context.gains[0].connect).toHaveBeenCalledWith(context.destination)
    })

    // A buffer of silence would loop just as happily and make no sound at all,
    // which is exactly the bug a "did it start?" assertion cannot see.
    it('fills the buffer with noise, at the context rate', () => {
      sound.hiss()
      const buffer = context.sources[0].buffer

      expect(buffer?.sampleRate).toBe(context.sampleRate)
      expect(buffer?.length).toBeGreaterThanOrEqual(context.sampleRate)
      const samples = buffer?.getChannelData(0) ?? new Float32Array()
      expect(samples.some((sample) => sample !== 0)).toBe(true)
      expect(samples.every((sample) => sample >= -1 && sample <= 1)).toBe(true)
    })

    it('is quieter than the tone, because broadband noise is not one frequency', () => {
      sound.hiss()

      const [target] = context.gains[0].gain.linearRampToValueAtTime.mock.calls[0]
      expect(target).toBe(MAX_HISS_GAIN)
      expect(MAX_HISS_GAIN).toBeLessThan(MAX_TONE_GAIN)
    })

    // Restarting a loop that is already running would only make a gap in it.
    it('does not restart a hiss that is already playing', () => {
      sound.hiss()
      sound.hiss()

      expect(context.sources).toHaveLength(1)
    })

    it('generates the noise once and reuses it', () => {
      sound.hiss()
      sound.stop()
      sound.hiss()

      expect(context.createBuffer).toHaveBeenCalledOnce()
      expect(context.sources[1].buffer).toBe(context.sources[0].buffer)
    })

    it('replaces the tone rather than playing over it', () => {
      sound.tone(1000)
      sound.hiss()

      expect(context.oscillators[0].stop).toHaveBeenCalledOnce()
      expect(context.sources).toHaveLength(1)
    })

    it('is replaced by the tone rather than played under it', () => {
      sound.hiss()
      sound.tone(1000)

      expect(context.sources[0].stop).toHaveBeenCalledOnce()
      expect(context.oscillators).toHaveLength(1)
    })
  })

  describe('the volume knob', () => {
    it('scales whatever is playing', () => {
      sound.tone(1000)
      sound.setLevel(0.5)

      const ramps = context.gains[0].gain.linearRampToValueAtTime.mock.calls
      expect(ramps[ramps.length - 1][0]).toBeCloseTo(MAX_TONE_GAIN / 2)
    })

    // Each sound has its own ceiling, so the knob has to be read against the
    // one that is actually playing rather than baked in when it is set.
    it('scales the hiss against the hiss ceiling, not the tone ceiling', () => {
      sound.setLevel(0.5)
      sound.hiss()

      const [target] = context.gains[0].gain.linearRampToValueAtTime.mock.calls[0]
      expect(target).toBeCloseTo(MAX_HISS_GAIN / 2)
    })

    it('turns right down, and does not go below silence', () => {
      sound.tone(1000)
      sound.setLevel(-1)

      const ramps = context.gains[0].gain.linearRampToValueAtTime.mock.calls
      expect(ramps[ramps.length - 1][0]).toBe(0)
    })

    it('is remembered before anything is playing', () => {
      sound.setLevel(0.25)
      sound.tone(1000)

      const [target] = context.gains[0].gain.linearRampToValueAtTime.mock.calls[0]
      expect(target).toBeCloseTo(MAX_TONE_GAIN / 4)
    })
  })

  /*
    A knob and a key make a noise in the room, not through the transmitter.
    Everything about how they are wired follows from that.
  */
  describe('the controls', () => {
    it('shapes a detent out of the same noise the hiss is made of', () => {
      sound.click()

      expect(context.sources).toHaveLength(1)
      expect(context.sources[0].buffer).toBe(context.createBuffer.mock.results[0].value)
      expect(context.filters).toHaveLength(1)
      expect(context.sources[0].start).toHaveBeenCalledOnce()
      expect(context.sources[0].stop).toHaveBeenCalledOnce()
    })

    it('gives a key a body under the snap, which a knob does not have', () => {
      sound.clunk()

      // Two layers, one of them low: that is the difference between a piano-key
      // switch going down and a detent going past.
      expect(context.filters).toHaveLength(2)
      expect(context.filters.some((filter) => filter.type === 'lowpass')).toBe(true)
      expect(Math.min(...context.filters.map((f) => f.frequency.value))).toBeLessThan(500)
    })

    // The volume knob is a control on the set. These are the sound of the set.
    it('goes straight to the speaker, past the volume knob', () => {
      sound.setLevel(0)
      sound.click()

      const [level] = context.gains[0].gain.setValueAtTime.mock.calls[0]
      expect(level).toBeGreaterThan(0)
      expect(context.gains[0].connect).toHaveBeenCalledWith(context.destination)
    })

    it('decays instead of stopping dead', () => {
      sound.click()

      const ramps = context.gains[0].gain.exponentialRampToValueAtTime.mock.calls
      expect(ramps).toHaveLength(1)
      expect(ramps[0][0]).toBeLessThan(0.001)
      expect(ramps[0][1]).toBeGreaterThan(context.currentTime)
    })

    // Two presses that sound identical read as a recording, not a mechanism.
    it('cuts each one from a different slice of the noise', () => {
      sound.click()
      sound.click()

      const [, firstOffset] = context.sources[0].start.mock.calls[0]
      const [, secondOffset] = context.sources[1].start.mock.calls[0]
      expect(firstOffset).not.toBe(secondOffset)
    })

    it('does not disturb what is already playing', () => {
      sound.tone(1000)
      sound.clunk()

      // The tone's own oscillator is untouched: a click during closedown is a
      // click during closedown, not the end of the tone.
      expect(context.oscillators[0].stop).not.toHaveBeenCalled()
    })
  })

  it('opens the context from a gesture, before there is anything to play', () => {
    sound.prepare()

    expect(contextsCreated).toBe(1)
    expect(context.resume).toHaveBeenCalled()
    expect(context.oscillators).toHaveLength(0)
    expect(context.sources).toHaveLength(0)
  })
})
