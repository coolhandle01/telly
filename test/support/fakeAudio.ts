import { vi } from 'vitest'

/**
 * jsdom has no Web Audio at all, so the only way to test the sound driver is to
 * substitute the context. These fakes record what was asked of them; the
 * assertions live in the test, never inside the double.
 */
export interface FakeParam {
  setValueAtTime: ReturnType<typeof vi.fn>
  linearRampToValueAtTime: ReturnType<typeof vi.fn>
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
  value: number
}

const fakeParam = (): FakeParam => ({
  setValueAtTime: vi.fn(),
  linearRampToValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
  value: 0,
})

export interface FakeOscillator {
  type: string
  frequency: FakeParam
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

export interface FakeBuffer {
  length: number
  sampleRate: number
  channels: Float32Array[]
  getChannelData: (channel: number) => Float32Array
}

export interface FakeBufferSource {
  buffer: FakeBuffer | undefined
  loop: boolean
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

export interface FakeFilter {
  type: string
  frequency: FakeParam
  Q: FakeParam
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

export interface FakeGain {
  gain: FakeParam
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}

export interface FakeAudioContext {
  currentTime: number
  sampleRate: number
  destination: object
  oscillators: FakeOscillator[]
  sources: FakeBufferSource[]
  filters: FakeFilter[]
  gains: FakeGain[]
  createOscillator: ReturnType<typeof vi.fn>
  createBuffer: ReturnType<typeof vi.fn>
  createBufferSource: ReturnType<typeof vi.fn>
  createBiquadFilter: ReturnType<typeof vi.fn>
  createGain: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

export function createFakeAudioContext(): FakeAudioContext {
  const context: FakeAudioContext = {
    currentTime: 10,
    // Not a round number, and not the 44.1k anyone would assume: a driver that
    // works out how much noise to generate must read it rather than guess.
    sampleRate: 48000,
    destination: { id: 'destination' },
    oscillators: [],
    sources: [],
    filters: [],
    gains: [],
    createOscillator: vi.fn(),
    createBuffer: vi.fn(),
    createBufferSource: vi.fn(),
    createBiquadFilter: vi.fn(),
    createGain: vi.fn(),
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  }

  context.createOscillator.mockImplementation(() => {
    const oscillator: FakeOscillator = {
      type: '',
      frequency: fakeParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    context.oscillators.push(oscillator)
    return oscillator
  })

  context.createBuffer.mockImplementation((channels: number, length: number, sampleRate: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    const buffer: FakeBuffer = {
      length,
      sampleRate,
      channels: data,
      getChannelData: (channel: number) => data[channel],
    }
    return buffer
  })

  context.createBufferSource.mockImplementation(() => {
    const source: FakeBufferSource = {
      buffer: undefined,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    context.sources.push(source)
    return source
  })

  context.createBiquadFilter.mockImplementation(() => {
    const filter: FakeFilter = {
      type: '',
      frequency: fakeParam(),
      Q: fakeParam(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    context.filters.push(filter)
    return filter
  })

  context.createGain.mockImplementation(() => {
    const gain: FakeGain = { gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() }
    context.gains.push(gain)
    return gain
  })

  return context
}

/**
 * A `Sound` double for tests that care only about what the set was asked to
 * play. The assertions live in the test, never inside the double.
 */
export function createFakeSound() {
  return {
    prepare: vi.fn(),
    tone: vi.fn<(hz: number) => void>(),
    hiss: vi.fn(),
    click: vi.fn(),
    clunk: vi.fn(),
    setLevel: vi.fn<(fraction: number) => void>(),
    stop: vi.fn(),
  }
}
