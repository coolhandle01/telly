# Programming a channel

What a schedule is for, and how one is actually put together. This is the
reference material behind `src/programming/`; the rules the code follows are
restated in [architecture/stations.md](../architecture/stations.md), which is
the authoritative copy.

## A schedule is a shape, not a playlist

The thing a controller is arranging is not a list of programmes. It is a day,
with a shape people already know, and the programmes are what fills it. Anyone
switching on at half past eight in the morning expects something short and
brisk; at nine at night they expect the best thing the station has.

That is why the model here is two-dimensional. A slot says what a time of day
wants; a station says what it will carry. Multiply them and you get an
afternoon that is not an evening, on a channel that is not the one next to it.

## The parts of the day

The vocabulary is standard British scheduling.

**Breakfast** is a strip: short items, briskly, because nobody sits down to it.
People are in and out of the room and the set is on for company.

**Daytime** is the house: cookery, property, factual, whatever can be followed
with your back to the screen. Repeats live here without embarrassment.

**Children's television** is after school, and it stops. The boundary is the
point, not the content: a children's strand that ran into the evening would be
the wrong programme in the right slot.

**Early evening** is the junction that pulls the audience in for the night. In
practice that is the news, which is why the news is the one thing allowed to
start on time.

**Peak** is 20.00 to 22.30 in the trade and nine o'clock in the public mind,
and the two meanings overlap because the watershed sits inside it. Peak gets
the best thing available, and "best" is a judgement about the audience rather
than about the programme.

**Late night** is long and loose: films, music, talk. Nobody minds an hour and
forty minutes.

**Closedown** is not an absence. A station that has finished for the night is
still transmitting, and what it transmits is the card and the tone. A station
that runs twenty-four hours has to fill the small hours with something, which
is how overnight strands of very cheap material came to exist at all.

## The watershed

Nine o'clock, in the UK, and it is a floor rather than a switch: material
unsuitable for children goes after it, and what goes immediately after it is
still expected to be milder than what goes at midnight.

The API gives two fields that make this decidable without judgement.
`contentDetails.contentRating.ytRating` of `ytAgeRestricted` is YouTube's own
18+ marking. `status.madeForKids` is the uploader's own declaration under
COPPA. Both are taken at face value: an app guessing at this would be worse
than one that does not try.

The rule runs both ways. Rated material may only go out after nine; declared
children's material may not go out after six.

## Strips and strands

A **strip** is the same thing at the same time every weekday. It is what a
schedule does with a supply it can rely on: a daily news bulletin, a cookery
programme, a magazine. Strips make a schedule feel inhabited, because the
viewer learns them without trying.

A **strand** is one night a week, one slot, and it is an event. The weekly
hour-long documentary, the Thursday comedy, the Sunday film. A strand only
works if it is in the same place every week: a series nobody can find twice is
not a series, it is a sequence of programmes that happen to share a name.

Upload cadence maps onto this directly. A channel that posts most days is a
strip; a channel that posts weekly is a strand; anything rarer fills in. The
distinction costs nothing to observe and decides how the material is used.

## Slots, not durations

A half-hour slot has never held thirty minutes of programme, and an hour holds
about fifty. Schedulers think in slots because slots tile: two half-hours make
an hour and an hour makes a third of an evening, and a programme is cut or
padded to fit rather than the schedule bending round it.

So the length bands here sit where a scheduler would put them, not where the
arithmetic would: a thirty-four minute programme is a half-hour, and a
seventy-minute one has stopped being an hour and become a feature.

Anything under about a minute is not a programme at all. What a channel does
with forty-second items is put a great many of them together and call it a clip
show, which is a real overnight format and belongs nowhere else in the day.

## Junctions

A junction is a point the schedule is guaranteed to reach on time. Everything
between junctions may drift; the junction absorbs the drift by cutting whatever
is running.

In practice the news is the junction, and being taken off part-way through
something to go over to it is the single most recognisable thing a schedule
does. Note the asymmetry: a junction is only guaranteed to *start* on time. It
may overrun into what follows, which is exactly what news does.

## Themed nights

A station with a habit is a station people can plan around. Thursday comedy,
Saturday variety, Sunday film: the specific pairings vary by broadcaster and
by decade, but the principle does not.

A themed night only reads as one if the rest of the night gives way. A Thursday
that lifts comedy and still shows whatever else came to hand is a Thursday with
a slight preference, which nobody notices. The theme has to push the other
genres down as well as pull comedy up.

## Repeats

A repeat is not a failure of the schedule. It is the schedule. A channel with a
finite library and nineteen hours a day to fill shows things again, and the
afternoon repeat of last night's documentary was a fixed feature of British
television for decades.

What makes a repeat acceptable is distance: far enough apart that the audiences
do not overlap, and marked, so nobody feels tricked. The listings printed (R)
and so does this.

## Exclusivity

Real broadcasters buy programmes, and a programme bought by one is not on
another. That is what makes tuning around mean anything: five channels drawing
on one pool would be one channel wearing five hats.

The cost is real and worth paying. Divide thirty subscriptions five ways and
each station has six, so there will be gaps, and gaps are what the card is
for.
