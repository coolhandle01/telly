import { describe, expect, it } from 'vitest'
import { CENTRE, NO_SIGNAL, STATION, isAsTransmitted, offStation, picture } from '@/ui/picture'

const asSet = (brightness = CENTRE, colour = CENTRE, tuning = CENTRE, stationAt = CENTRE) =>
  picture(brightness, colour, tuning, stationAt)

describe('picture', () => {
  it('shows it as transmitted with everything at mid-travel', () => {
    expect(isAsTransmitted(asSet())).toBe(true)
  })

  describe('brightness', () => {
    it('crushes the shadows when the beam is turned down', () => {
      const dim = asSet(0)
      expect(dim.gain).toBeLessThan(1)
      // Still glowing: a CRT turned down is not a CRT switched off.
      expect(dim.gain).toBeGreaterThan(0)
      expect(dim.lift).toBe(0)
    })

    it('greys the blacks out when it is turned up, rather than merely brightening', () => {
      const milky = asSet(1)
      // The fault is a lifted black level, not more gain — a picture that is
      // simply brighter is not what a mis-set brightness control looks like.
      expect(milky.lift).toBeGreaterThan(0)
      expect(milky.gain).toBe(1)
    })

    it('does the two things either side of centre and never both at once', () => {
      for (const at of [0, 0.25, CENTRE, 0.75, 1]) {
        const shown = asSet(at)
        expect(shown.gain === 1 || shown.lift === 0).toBe(true)
      }
    })
  })

  describe('colour', () => {
    it('takes the colour out altogether at the stop', () => {
      expect(asSet(CENTRE, 0).saturation).toBe(0)
    })

    it('overdoes it at the other stop', () => {
      expect(asSet(CENTRE, 1).saturation).toBeGreaterThan(1)
    })
  })

  describe('tuning', () => {
    it('holds the station over a band, not at a point', () => {
      expect(offStation(CENTRE + STATION)).toBe(0)
      expect(offStation(CENTRE - STATION)).toBe(0)
      expect(asSet(CENTRE, CENTRE, CENTRE + STATION).snow).toBe(0)
    })

    it('brings up snow once it is off station', () => {
      expect(asSet(CENTRE, CENTRE, 1).snow).toBeGreaterThan(0)
      expect(asSet(CENTRE, CENTRE, 1).snow).toBeGreaterThan(
        asSet(CENTRE, CENTRE, CENTRE + STATION + 0.05).snow,
      )
    })

    it('loses the colour long before it loses the picture', () => {
      // The chroma subcarrier sits at the top of the channel and goes first:
      // a slightly mistuned set is watchable in black and white.
      const slightly = asSet(CENTRE, CENTRE, CENTRE + STATION + 0.06)

      expect(slightly.saturation).toBe(0)
      expect(slightly.snow).toBeLessThan(0.4)
    })

    // A tuner is not a fade. A station holds over its band and then goes.
    it('swamps the picture within a short turn of losing the colour', () => {
      const gone = asSet(CENTRE, CENTRE, CENTRE + STATION + 0.16)

      expect(gone.snow).toBeGreaterThan(0.8)
    })

    /*
      Each preset had its own tuning slug behind the flap. A station whose slug
      was set carelessly is not at mid-travel, and mid-travel then gives snow.
    */
    it('holds a station that sits somewhere else in the travel', () => {
      expect(asSet(CENTRE, CENTRE, 0.28, 0.28).snow).toBe(0)
      expect(asSet(CENTRE, CENTRE, 0.28 + STATION, 0.28).snow).toBe(0)
      expect(asSet(CENTRE, CENTRE, CENTRE, 0.28).snow).toBeGreaterThan(0.7)
    })

    it('leaves the colour control nothing to turn up once the subcarrier is gone', () => {
      expect(asSet(CENTRE, 1, 1).saturation).toBe(0)
    })
  })

  describe('no signal at all', () => {
    // The far end of the tuner still has a station somewhere behind the noise.
    // An empty preset has nothing behind it, so it is snowier than any setting
    // of the tuner can make a real channel.
    it('is snowier than the worst the tuner can do to a station', () => {
      expect(NO_SIGNAL.snow).toBe(1)
      expect(NO_SIGNAL.snow).toBeGreaterThan(asSet(CENTRE, CENTRE, 1).snow)
    })

    it('has no colour in it, because there is no subcarrier to decode', () => {
      expect(NO_SIGNAL.saturation).toBe(0)
    })

    // Nothing on the front of the cabinet can bring a picture out of it.
    it('is not something the set considers a normal picture', () => {
      expect(isAsTransmitted(NO_SIGNAL)).toBe(false)
    })
  })
})
