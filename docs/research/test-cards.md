# Test cards

## Why the card is the default state

A test card is not an error screen. It is what a channel transmits when it is
not transmitting a programme — a *signal*, deliberately radiated, so an engineer
or a viewer could set the set up. Closedown was scheduled, not suffered.

That framing is why the card sits *under* every programme in this app rather
than replacing one that failed. The architectural consequence is in
[architecture/player.md](../architecture/player.md); the idea came from the
research, so it is recorded here too.

## The vocabulary, and who owns it

This is the part worth getting right, because the answer is not the obvious one.

**The engineering vocabulary is free.** Colour bars, castellations, greyscale
wedges, frequency gratings, resolution wedges, convergence crosshatch, a
Siemens star, a PLUGE strip. These are standardised measurement patterns. They
exist because a specific electrical property needs measuring, their proportions
are set by standards bodies, and nobody owns them.

**The specific cards people remember are authored works.** The famous ones are
designed artefacts with authors, owners and marks on them, and they are not in
the public domain merely because they are old and were broadcast for free.

So: **all five designs here are original artwork in the idiom.** None reproduces
an existing card, and none carries a broadcaster's marks. A card built from
standard patterns, laid out to its own design, carrying this channel's own name,
is the honest way to get the look.

What each pattern is actually *for*, since a card whose elements are decorative
reads as a pastiche:

| | |
|---|---|
| Castellations | edge geometry and picture centring |
| Colour bars | hue and saturation, in descending luminance order |
| Greyscale wedge | grey-scale tracking from black to peak white |
| PLUGE strip | setting black level — the bars either side of black |
| Gratings | frequency response, one bar group per MHz |
| Resolution wedges | limiting resolution where the lines converge |
| Convergence target / crosshatch | beam convergence and linearity |
| Clock | that the transmission is live, and how long to closedown |

## The five designs

`src/testcard/designs/`, and the order in that file is the rotation order.

| | |
|---|---|
| `electronic` | the line-up chart: castellations, gratings, colour bars, greyscale wedge, convergence target |
| `bars` | full-height colour bars, a reversed complement band, and a PLUGE strip |
| `monoscope` | monochrome resolution chart with a Siemens star at the centre |
| `crosshatch` | white grid on black, for convergence and geometry |
| `ident` | the station card: concentric colour rings and the channel name |

**One card per day, picked from the date.** `designForDate` derives it rather
than storing it, so every set tuned to the channel shows the same one and there
is no state anywhere to drift.

It is the **broadcast** day's date, not the calendar day's: the card turns over
at six in the morning with everything else, not at midnight in the middle of
late night — which is the one moment nobody would choose. At half one you are
still watching yesterday's television and you should still be looking at
yesterday's card. Adding a design changes which card falls on which day — that is fine,
nobody has a right to Tuesday's card, and it is exactly why the rotation is
derived rather than persisted.

## How a card is built

A card is a **pure function from a spec to a list of shapes** — rects, circles,
lines and text with coordinates and colours (`buildTestCard.ts`, `model.ts`).
A dumb component renders that model into SVG and computes nothing of its own.

Which means almost the whole suite proves the geometry without mounting
anything: you can assert that the greyscale wedge steps ascend in luminance,
or that the gratings sit at 1.5, 2.5, 3.5 and 4.5 MHz, against plain data.

Proportions are held as fractions of the picture (`primitives.ts`), never
pixels, so a card is resolution-independent by construction. `preserveAspectRatio`
keeps it square-on and centred, and any leftover is black around the picture —
exactly as a real set.

## The fault card

A sixth card, and **not a test card**. A test card is a signal a working
station transmits on purpose; this is the station saying it cannot transmit at
all, in the idiom of the announcement that interrupts everything and is not a
programme.

Amber on near-black, which none of the five is anywhere — so it cannot be
mistaken for one at a glance. It reuses the castellated edge of the rotation in
the wrong colour, which says *this family of thing* and *something is wrong* in
one mark. It carries **no clock and no date**: the time is not the point, and a
fault card that quietly ticks along looks like a service.

It lives in `CARD_DESIGNS` so it can be drawn and is deliberately absent from
`DESIGN_ROTATION`, because a station does not take a turn at being broken.

Its first use is a deployed build with no OAuth client ID. The ID is baked in
at build time, so a viewer cannot do anything about its absence and is not
asked to — the card exists to tell whoever deployed it that they deployed it
wrong. In a *development* build the same condition is not a fault at all: it is
the documented way to work on the set with no credentials, on the fixture pool.

## Tone

Closedown carries a tone, and it plays at the set's own volume.

No television has ever had a button for it. The tone came with the card and you
turned it down with the volume knob like everything else on the set, so the
knob drives `setLevel` and 0 is silence.

The catch is the browser's, not the tone's: audio only starts for a page the
viewer has interacted with, and closedown arrives hours after anyone last
touched anything. So the audio context is opened by the **power switch** —
`Sound.prepare()`, called from the click — exactly as Google's script is fetched
on mount rather than on the sign-in click, and for exactly the same reason.

`Sound` is an interface with a WebAudio implementation — jsdom has no Web Audio
at all, so the seam is load-bearing rather than decorative. It carries the hiss
as well, because a set has one speaker: the tone goes with a card, the hiss goes
with an empty preset, and which one is playing is read off what is on the screen
rather than out of the schedule. Two screens that look the same must sound the
same.
