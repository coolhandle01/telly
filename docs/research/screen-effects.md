# Screen effects

## Raster collapse

The phenomenon: switch off a CRT that has been running and the picture squeezes
to a bright horizontal line, then to a point, which hangs there for a moment and
fades.

The mechanism is worth knowing because it dictates the *order* of the animation:

1. **The deflection circuits die faster than the beam does.** The vertical
   oscillator fails first, so the scan collapses vertically: a full-width,
   one-line-high bar.
2. **Then the horizontal goes**, and the line shortens to a point.
3. **The spot lingers** on stored EHT charge and fading phosphor, long after the
   signal is gone.

**Brightness rises as it collapses**, because the same beam current is landing
on a shrinking area. Getting that backwards, fading out as it shrinks, is what
makes most software imitations look wrong: they read as a fade, not a discharge.

Switching on is the same sequence run backwards and quicker, as the scan comes
up.

## What was built

`src/ui/useCrtPower.ts` and the `crt-*` keyframes in `src/index.css`.

Four states, not two: `off`, `warming`, `on`, `collapsing`. The picture stays
mounted through the collapse: there would be nothing left to collapse
otherwise.

| | |
|---|---|
| `COLLAPSE_MS` | 900 |
| `WARM_MS` | 620 |

Off is slower than on, which matches the physics: a discharge takes its time and
a scan coming up does not.

The collapse keyframes carry the sequence explicitly:

| | transform | filter |
|---|---|---|
| 0% | `scale(1, 1)` | `brightness(1)` |
| 38% | `scale(1, 0.012)` | `brightness(2.6) saturate(0.6)` |
| 62% | `scale(0.22, 0.01)` | `brightness(3.4) saturate(0.2)` |
| 100% | `scale(0.006, 0.006)` | `brightness(4) saturate(0)` |

Note the **desaturation**: by the time it is a spot it is white, because what is
left is raw beam rather than a picture.

The spot is a separate element (`.screen__spot`), a radial gradient that fades
up as the raster reaches its last 40% and fades out after it. It is separate
because it outlives the raster, which is the whole point of it.

## Hold, and losing it

Vertical and horizontal hold set the **free-running frequency of the two
deflection oscillators**. Each is meant to run close enough to the sync pulses
in the signal to be pulled into step with them; set correctly, the picture
stands still. Set wrongly, the oscillator free-runs at the wrong rate and the
picture walks.

Two controls, one idea, at two speeds, which is why `src/ui/deflection.ts` is
one function:

- **Frame oscillator (V).** Runs fast and the next frame is taken early, so the
  picture is carried *up* the screen; runs slow and it falls *down*. What
  sweeps through is the gap between frames: the blanking bar, black, with the
  lit edge of the frame that has just left at its leading edge.
- **Line oscillator (H).** Each line starts a little early or late, and the
  error accumulates down the picture: it shears, and because the accumulation
  keeps going it slips sideways too. Diagonal tearing, not a wobble.

**The pull-in band is the part worth getting right.** An oscillator locks over
a *range* either side of correct, not at a point. Without that band a hold
control could only be set by instrument; with it you can find the lock by hand,
which is how anyone ever did it. `PULL_IN` is 0.09 either side of mid-travel.

Speed is **geometric rather than linear** in the control's travel, because
these are frequencies. A linear ramp spends nearly all its travel in an
unwatchable blur; on a geometric one the slow creep just off lock gets as much
of the control as the fast end does, again so the thing can be found by hand.

## The picture controls

Where V and H are oscillators that either lock or do not, B, C and T are
continuous adjustments with no right answer the set can find for itself. That
is why they were on the front of the cabinet and the hold controls were behind
the flap: these are preferences, those are faults.

**Brightness is a black-level control, not a gain.** This is the detail that
makes it read correctly. Turned down, the beam is biased off and the shadows
crush into black. Turned *up*, the blacks stop being black: the whole picture
lifts towards white and the contrast falls with it, so it goes milky. Making
"up" simply mean brighter is the obvious implementation and it is not the
fault: a brighter picture is not what a mis-set brightness control looks like.

So the two directions are two different operations: `filter: brightness()`
below centre, a white layer composited over the picture above it.

**Colour is saturation**, monochrome at one stop and lurid at the other.
Nothing subtle.

**Tuning loses the colour long before it loses the picture.** The chroma
subcarrier sits at the top of the channel and is the first thing to go, so a
slightly mistuned set is perfectly watchable in black and white, and the
colour control has nothing left to turn up, because there is no subcarrier to
decode. Push further and the snow rises until the signal is swamped. That
ordering is what makes it read as *tuning* rather than as a broken saturation
slider, and it costs one line.

T is the tuner rather than a tone control, for two reasons. A PAL set has no
tint control (that was NTSC's problem and the source of the joke), and an
audio tone control could not reach YouTube's sound, which is inside a
cross-origin iframe this app cannot touch. A fine-tuner is period-correct, it
is the natural partner to the six preset buttons above it, and it is visible.

### Drawing snow

Two attempts, both instructive.

`mix-blend-mode: screen` can only lighten, so the noise greyed the picture up
uniformly and left it perfectly readable underneath: a veil, not static.
Straight alpha compositing lets the dark speckles through too.

Then the noise itself: `feTurbulence` clusters around mid-grey, which reads as
*film grain*. A steep `feComponentTransfer` throws the values to the ends of
the scale, and the alpha is forced opaque so the layer's own opacity does all
the mixing. That is the difference between grain and static.

The tile is baked into a data URI rather than filtered live (a full-screen
turbulence animating at 20fps is a fan coming on) and jumped between
positions on a stepped animation, which is what makes a static tile move.

### Snow is drawn by the beam

The snow layer began outside `.screen__tube`, hung over the glass with the
lift. That is wrong twice, and switching the set off shows both: the raster
collapsed to a line underneath a sheet of static that stayed at full size, and
then the static vanished all at once when the phase finally changed.

Snow is not an overlay on the picture. It is the *same beam* drawing noise
instead of a signal, so it lives inside the tube, and the collapse takes it
down with everything else. One move of two elements in the JSX; no CSS changed,
because the phase rules were already written as descendants of the tube.

### A preset with nothing on it

Coming off station is not the same thing as having no station. The tuner can
always be brought back, and there is a carrier behind the noise the whole time,
which is why the colour goes first and the picture last.

An empty preset has no carrier at all. Full snow, no colour in it, and nothing
on the front of the cabinet that changes either: brightness, colour and the
tuner all work on a signal, and there is not one. That is `NO_SIGNAL` rather
than a call to `picture()`, and it is the difference between *mistuned* and
*nobody is broadcasting*.

## Where the effects live

**On the screen, not on the video and not on the card.** `Screen.tsx` owns the
glass, so a card, a picture and a caption all get the same vignette and the same
collapse: they are all behind the same piece of glass. Applying it to the video
would mean the card was somehow in front of the tube.

## Reduced motion

A rolling picture is genuinely nauseating, and a viewer who has asked for less
movement has asked not to be handed one. Under `prefers-reduced-motion: reduce`
the fault is still *shown* (the picture sits offset, the blanking bar lies
across the screen, the shear holds its angle); it simply stands still. A set
caught mid-roll rather than one that is holding, which reads correctly and
moves nothing.

For the power phases, derived during render rather than animated into:

```ts
return reduced ? (on ? 'on' : 'off') : phase
```

A viewer who has asked for less movement gets the two settled states and no
intermediate phase at all. Reaching the same place by *skipping* the animation
leaves a window where the set can be caught mid-collapse; deriving it means that
window does not exist.

The hook also starts settled at whatever the set was doing when it mounted:
nobody watched it get there, so there is nothing to animate.

## What was deliberately not built

- **Scanlines.** At the sizes this renders, they alias into moiré and look like
  a dirty screen rather than a tube.
- **Rolling as an ambient effect.** Fun once, unwatchable twice, so the roll
  exists only where a viewer has *asked* for it by turning the trimmer, and the
  set holds until they do. A fault you chose is a toy; a fault you did not is a
  broken television.
- **Colour fringing and convergence error.** The test cards already carry a
  convergence target; adding real misconvergence on top would be reproducing the
  fault the card exists to diagnose.
- **Phosphor persistence on moving picture.** Would need a frame buffer, and the
  set is drawn in CSS.

The general principle: reproduce the things a person *notices about a
television*, not every artefact a television has.
