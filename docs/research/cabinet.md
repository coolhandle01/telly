# The cabinet

A Philips-style teak console colour set, roughly 1975. Drawn entirely in SVG
filters: no image assets, no photographs, no sprites.

> **Provenance.** Most of this was reasoned from written descriptions and
> search summaries, because the environment it was done in blocked
> vintage-set reference sites, so very little of it started from a photograph. A real reference beats every
> inference below, and has already won once: see the mains switch.
>
> Five photographs were later looked at directly, and the section **What the
> photographs actually show** is the only part of this document taken from
> them rather than argued towards. Where the two disagree, the photographs are
> right.

## What the period actually looks like

The mistakes that give a drawn cabinet away, in order of how badly they hurt:

**Teak is brown, not orange.** Every tone in `surfaces.tsx` is far more
desaturated than the colour people reach for when they mean "wood". That single
correction is most of why gradient cabinets look like toffee. The face palette
runs `#8a6038 → #b08553 → #c39a67 → #a87b49 → #845a33`.

**One light source, upper left.** Knob, keys, bezel, legs and cabinet all catch
the light from the same place. Two surfaces lit from two directions reads as
fake instantly, even to someone who cannot say why.

**The brightest band is left of centre, not in the middle.** `STOP_AT` is
`[0, 0.18, 0.38, 0.72, 1]`. A symmetrical gradient reads as a cylinder.

**Furniture is read at its edges.** Two lines do most of the work in any
photograph of a wooden cabinet: light caught on the top arris, and the dark
edge-grain where the veneer turns the corner. Both are `inset` box-shadows on
`.tv-cabinet__top`.

**Contact shadow, then ambient.** A single wide shadow reads as a sticker. The
set gets a tight dark one where it meets the floor and a soft wide one beyond.

**Furniture is read at its joints**, and a joint has four parts, all lit from
the upper left like everything else on the set:

1. the cut edge itself, hard and dark where the two faces meet;
2. the arris below and right of it, catching the light;
3. the face above and left, lying in the joint's own shadow;
4. occlusion in the corner, where one surface turns into the other.

**Miss the two that catch the light and it reads as printed on.** That is the
whole rule, and it applies at every joint rather than only at the obvious one.

### Every joint on this set, and what carries it

| Joint | Where |
|---|---|
| Top ↔ front face | lit arris on the top, dark edge-grain under it, drop shadow onto the face |
| Top ↔ the side returns | the two short edges a front elevation ever shows of the sides |
| Front face ↔ side panels | the veneer wrapping the corner: lit left, dark right |
| **Front face ↔ the tube opening** | all four parts, on `.tv-cabinet__well` |
| Front face ↔ the control board | four inset edges plus a tight contact shadow, on `.tv-fascia` |
| Control board ↔ the metal plate | the rebate, on `.tv-fascia__plate` |
| Front face ↔ the base lip | the applied moulding, casting upward onto the veneer |
| Carcass ↔ legs | a soft radial shadow where the leg comes out from under the cabinet |

The tube opening was the worst of them: a flat dark ring with no light on it
anywhere, which is a sticker rather than a hole cut through a panel. The legs
were the subtlest: a leg screws to a rail up inside the carcass, so it comes
out of *shadow* rather than starting in daylight, and without that they read as
two shapes that happen to touch the bottom edge rather than as part of the same
object. That shadow has to fade sideways as well as down; a straight vertical
gradient gave it hard edges and the leg looked bolted to a little black
bracket.

**A board on a board shows four edges too.** The control column is its own
board laid on the front of the carcass, which the references bear out, the
Marconiphone's slotted grille plainly being a separate insert. It had a lit
left and a dark right and nothing top or bottom, which reads as a stripe of
veneer painted on the front rather than a piece of wood lying on another.

**An inset panel needs an even reveal.** A control plate stopping at 86% of its
column leaves fifty-odd pixels of bare veneer below it against eight above, and
one margin seven times another reads as a mistake rather than as a panel. The
plate fills the opening, and what grows with it is the speaker grille, which is
what a console set had most of.

**The apron below the tube is the deepest part of the border.** The instinct is
to match it to the top rail, and the instinct is wrong: the chassis lives under
the tube and the carcass needs a base rail to stand on. Matched rails leave the
picture looking as though it is about to fall out of the bottom of the set.
Here the apron runs about 1.5× the top rail.

Deepening it makes the cabinet taller for a given width, which the height cap
has to know about: `max-width: min(72rem, calc(137vh - 16rem))`, where the
16rem is everything that is not carcass and still has to fit under it: the legs
and the page's own padding. It used to include a row of controls under the
cabinet too; those moved to the corner of the room, out of the flow.

**Both numbers go stale, and quietly.** Deepening the apron made the cabinet
taller for a given width; so did narrowing the control column, because a
narrower column leaves a wider 4:3 well. Change either and re-measure, or short
windows start scrolling with nothing in the diff to explain it.

## What the photographs actually show

Five references: a British console in light teak with bi-fold doors, a Philips
in walnut on a stand, a Marconiphone 4714 brochure page, a "spectra" console on
a chrome pedestal, and one stock render (which is synthetic, with a flat teal
screen and a mushy knob, and useful only for the palette of the room around the
set).

**The speaker grille is slatted or slotted, never perforated.** Four of the
four real sets: horizontal wooden louvres on the teak console, a vertically
fluted wood panel on the spectra, and on the Marconiphone what its own brochure
calls "a contrasting **black slotted** speaker grille". A punched-hole panel
reads as a radio, or as a set fifteen years older. The grille here is a slotted
panel.

**The right-hand column is the speaker**, full height, with the controls as a
narrow strip beside or within it, which is the arrangement here.

**The control strip is narrower than instinct suggests**, and bright: gold
anodised aluminium on the Philips, chromium on the Marconiphone ("the control
knobs are chromium plated", says the brochure). It was a linished silver plate
at 17% of the cabinet width; it is 11% now, which reads as a panel let into the
cabinet rather than as a second cabinet. Still silver: a Philips would be
**gold anodised**, and that change is outstanding.

**Knobs come in a vertical row of several small equal ones** (four on the
Philips, about six on the Marconiphone) rather than one large one. A single
big volume knob is a radiogram's arrangement.

**Legends are tiny or absent.** At photograph resolution most of these fascias
carry no readable text at all; where there is any it is minute, light on a dark
plate, above the control rather than below it.

**Preset keys vary more than expected.** A horizontal row of six piano keys
with indicator marks under them on the teak console; three large illuminated
rectangles on the spectra; a four-button UHF tuner on the Marconiphone. A 2×3
grid, as here, is within the range rather than canonical.

**Screen bezels are either black or bright chrome.** The Philips has a bright
ring round the tube; the other two are black with generous corner radii.

**Legs.** Four tapered legs in a row at the same size is a child's drawing of a
horse: it says "this object has four legs" rather than showing what is there.
The set is drawn as a flat elevation and nothing else in it has perspective, so
head-on the back pair stand directly behind the front pair and cannot be seen.
Two, set in from the corners rather than balanced on them, because a console leg
screws to a rail behind the face.

**Cabinets stand on more than legs.** Castors on the teak console, a stand with
castors on the Marconiphone, a single chrome tulip pedestal on the spectra.
Tapered legs are period, but they are one option of several.

## How the materials are drawn

**Teak veneer.** `feTurbulence` stretched hard along one axis, plus a slower
turbulence beneath for the figure and a fine one over the top for the pores.
Frequencies are in CSS pixels: roughly one veneer line every 6px, running
unbroken for about 100px.

The critical step is the **gamma transfer** after the turbulence. Turbulence at a
single frequency gives an even hairy field that reads as brushed metal; the
gamma is what separates it into lines with clear wood between them. Same noise,
entirely different material.

The surface carries **no `viewBox`**, so the grain stays the same size in pixels
however large the cabinet gets. Veneer does not scale with the furniture.

Different faces get different seeds (boards cut from different parts of the
log), and the control column uses a darker palette because it is the far end of
the same board, in its own shadow.

**Linished aluminium.** The same turbulence with the gamma transfer *omitted*.
The even hairy field that was wrong for wood is exactly right for a brushed
plate.

**Bakelite keys.** `feSpecularLighting` over a blurred alpha: the blur stands in
for the moulding's curvature and the light is allowed to find it. Pressing the
key lowers `surfaceScale` and `elevation`, so the highlight **slides down the
crown** rather than merely dimming: the light does not travel with the button.

## The fascia, and what a real one does

Living-room testing produced most of these, which is a good argument for living
rooms:

- **A real button's legend never changes.** POWER says POWER whether the set is
  on or off. State is a key sitting down in its collar.
- **POWER is attested; the reasoning against it was not.** This said MAINS for
  one commit, on the argument that POWER was a later hi-fi import and that
  British service literature calls the thing a mains switch. Reference
  photographs of period sets show POWER, so POWER it is. The other marking the
  same references show is a pair (an empty circle and a filled one, for the
  two positions of the switch), which would also be correct here. It is not
  used because every other legend on this plate is a stamped word, and a lone
  symbol would be the odd one out.

  Worth keeping from that detour is which symbol **not** to reach for. IEC 417
  was published in **1973**, so the marks did exist by 1975, but the one
  everybody now reads as "power" is **5009**, and 5009 means *stand-by*: a
  low-power state that explicitly does **not** disconnect. On a set with a hard
  mains switch and no standby to return from, it marks the key with the one
  thing it cannot do. The symbols that would be correct, `|` and `○`, are
  switch *positions* and suit a rocker rather than a single push-push key.

  A lesson about this document as much as about the switch: a confident
  inference from dates and terminology lost to a photograph, and it should
  have been held loosely until someone had looked at one.
- **A period set had no listings button.** Listings came in the paper, which is
  why the Telly Guide is in the corner of the room and not on the fascia.
- **Presets are a mechanical radio bank.** Exactly one is always in. Native
  `<input type="radio">` gives that for free, arrow keys included.
- **V, H, B, C, T are trimmers, not buttons.** Vertical hold, horizontal hold,
  brightness, colour, tuning.
- **Legends are not set in a code font.** They were stamped or silk-screened in a
  condensed grotesque (Helvetica, Univers, DIN), in caps, small, widely
  tracked, so they read at arm's length across a lit room without drawing
  attention. `type.ts` uses a system stack, so the set draws instantly and works
  offline.
- **Nothing on the fascia is selectable.** Dragging a knob should never leave
  half the set highlighted in blue.
- **A printed scale does not know where the knob is pointing.** The ticks round
  the volume dial are silk-screened onto the plate the spindle comes through,
  so every mark is the same ink at the same weight. Lighting the marks the
  pointer has swept past is a *meter's* behaviour (an illuminated bargraph),
  and this is a fascia.

## The lamps

Three, and none of them labelled, because a fascia of this period explained
nothing and expected you to learn it.

| | |
|---|---|
| **red** | Mains. On when the set is on, and on for no other reason. |
| **amber** | Trouble. Normally dark; lights when the set is on and something has failed. |
| **green** | A source. Lit once the set has somewhere to get programmes from. |

The amber is the only one dark in normal service, which is what a warning lamp
is for, and it carries the one thing you cannot tell by looking at the screen.
A test card at 3am is closedown. A test card at 8pm with the amber lit means the
programmes could not be fetched, or signing in or out did not finish: the lamp
follows the same failures the message under the cabinet reports.

## Known imperfect

- Below about 900x640 the set still scrolls; see the note on the fascia's
  height floor below.
- The knob cap reads more chrome than sun-spun aluminium.
- The badge is tidy rather than a real wordmark.
## The fascia's height floor

The cabinet stops obeying its own aspect ratio below a certain width, because
the fascia's controls are sized in rem and stop shrinking. Past that point the
cabinet's height is pinned by its fascia, and capping the *width* does nothing
at all, which is why shrinking it further never fixed anything.

The fascia now answers to the cabinet rather than the window, through a
container query on `.tv-cabinet`, with two tighter tiers below 58rem and 46rem:
less air between the controls, a shallower speaker, and a volume knob that
stops being 72px of a 90px column. Six of eight test viewports fit now, against
three of eight before.

The two that still scroll are short-and-wide (900x640) and short phones, and
they stay that way on purpose. **At small sizes you cannot have both a
correctly-proportioned cabinet and 24x24 touch targets**: something has to
give, and a few pixels of scroll is recoverable where a target nobody can hit
is not.

## Not yet built

An aerial on top of the set.
