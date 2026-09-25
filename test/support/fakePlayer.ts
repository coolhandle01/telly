import type { Player, PlayerFault } from '@/player/player'

/**
 * A `Player` a test drives by hand: no iframe, no network, no YouTube. It
 * records what was asked of it and can push a fault back the other way; the
 * assertions live in the test, never inside the double.
 */
export class FakePlayer implements Player {
  readonly loads: { videoId: string; offsetSec: number }[] = []
  readonly volumes: number[] = []
  stops = 0
  destroys = 0
  readonly #faultListeners = new Set<(fault: PlayerFault) => void>()
  readonly #pictureListeners = new Set<(hasPicture: boolean) => void>()

  load(videoId: string, offsetSec: number): void {
    this.loads.push({ videoId, offsetSec })
  }

  stop(): void {
    this.stops++
  }

  setVolume(volume: number): void {
    this.volumes.push(volume)
  }

  destroy(): void {
    this.destroys++
  }

  onFault(listener: (fault: PlayerFault) => void): () => void {
    this.#faultListeners.add(listener)
    return () => {
      this.#faultListeners.delete(listener)
    }
  }

  onPicture(listener: (hasPicture: boolean) => void): () => void {
    this.#pictureListeners.add(listener)
    listener(false)
    return () => {
      this.#pictureListeners.delete(listener)
    }
  }

  /** Report a picture arriving, or going. */
  picture(hasPicture: boolean): void {
    for (const listener of [...this.#pictureListeners]) listener(hasPicture)
  }

  /** Push a fault at whoever is listening — the screen's apology path. */
  fault(fault: PlayerFault): void {
    for (const listener of [...this.#faultListeners]) listener(fault)
  }

  get faultListenerCount(): number {
    return this.#faultListeners.size
  }
}
