import { memo, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { secondsIntoDay, type Schedule } from '../domain'
import type { Station } from '../programming'
import { entryAt, listing, type Entry } from './listing'

export interface GuidePage {
  station: Station
  schedule: Schedule
  /** What the set calls this station, which for preset one is not its own name. */
  name: string
}

export interface GuideProps {
  /** One per station. Empty while the schedules are still being worked out. */
  pages: readonly GuidePage[]
  /** The broadcast day this page is for. Printed whether or not there are pages. */
  day: Date
  /**
   * Now, so what is on in each column can be ringed.
   *
   * Read to the minute. The set's clock ticks every second and the ring moves
   * a few times an hour, so a page that re-read it every tick would re-lay two
   * hundred lines of newsprint sixty times for each time the answer changed.
   */
  now: Date
  /** Which station the set is tuned to, if any. Its column is the one you want. */
  tunedTo?: number
  /** Why there are no pages, when there are none and it is not simply slow. */
  notice?: string
  onClose: () => void
}

/**
 * The television page, as it came in the paper.
 *
 * A set of this period had no on-screen guide and no way to get one: you
 * looked it up, on the arm of the chair. So this is not part of the set and
 * does not pretend to be — it is a sheet of newsprint held up in front of it,
 * and it is the one thing on this screen allowed to be bright.
 *
 * A column to a channel, times down each one, which is how a paper set it: an
 * hour-by-hour grid across all five is a modern electronic guide and would be
 * an anachronism twice over — nobody printed one, and no television could have
 * drawn one.
 *
 * Times are printed the way British listings printed them, with a point rather
 * than a colon: 6.00, not 06:00.
 */

/**
 * What the clock on the wall says at `startSec` into the day.
 *
 * Read off a real instant rather than counted from the anchor: six hours plus
 * the offset is the right answer on 363 days a year, and an hour out for the
 * back half of the two when the clocks move.
 */
function clockOf(dayStart: Date, startSec: number): string {
  const at = new Date(dayStart.getTime() + startSec * 1000)
  return `${at.getHours()}.${String(at.getMinutes()).padStart(2, '0')}`
}

const CSS = `
/*
  The scrim is the scroller, and the sheet inside it is one piece of paper.

  A newspaper has no fixed masthead with the columns sliding underneath it —
  you move the whole page. So nothing here scrolls on its own: the scrim
  scrolls, and the masthead, the columns and the footer all go up together.

  The sheet is centred with auto margins rather than by the scrim, because a
  centred item taller than its scroll container has its top clipped with no way
  to scroll back to it. Auto margins centre and give way.
*/
.guide-scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: clamp(0.5rem, 2vw, 2rem);
  background: rgba(8, 7, 5, 0.72);
}
.guide {
  --ink: #22201c;
  --paper: #ded7c6;
  --rule: rgba(34, 32, 28, 0.45);
  /* Half of it on each column, so the gutter is even and the edges are not. */
  --gutter: clamp(0.5rem, 1.2vw, 1rem);
  box-sizing: border-box;
  width: min(74rem, 100%);
  margin: auto;
  /* Newsprint: not white, and not cream either — a warm grey that has been
     stacked in a shop all morning. */
  background:
    linear-gradient(rgba(255, 252, 244, 0.55), rgba(160, 148, 124, 0.22)),
    var(--paper);
  color: var(--ink);
  font-family: 'Times New Roman', Times, Georgia, serif;
  padding: clamp(0.7rem, 1.6vw, 1.3rem);
  border-radius: 1px;
  /* Paper sits on a surface; it does not float. A tight contact shadow along
     the top edge where it lifts, a soft one under the body of the sheet. */
  box-shadow:
    0 0.06rem 0.14rem rgba(0, 0, 0, 0.55),
    0 0.9rem 2.4rem rgba(0, 0, 0, 0.6);
}
.guide__masthead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
  border-bottom: 3px double var(--ink);
  padding-bottom: 0.3rem;
  /* Room for the close button, which floats over this corner. */
  padding-right: 5.5rem;
}
.guide__title {
  margin: 0;
  font: 700 clamp(1.1rem, 2.6vw, 1.6rem)/1 'Times New Roman', Times, serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.guide__date {
  font-size: 0.68rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}
/*
  Putting the paper down is not something printed on the paper, so the button
  is not set in the paper's own type and does not travel with it: fixed to the
  corner of the screen, where it is still reachable three thousand pixels into
  the listings.
*/
.guide__close {
  position: fixed;
  top: clamp(0.5rem, 2vw, 2rem);
  right: clamp(0.5rem, 2vw, 2rem);
  z-index: 1;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 0.3rem;
  background: rgba(12, 11, 9, 0.88);
  color: #e9e2d2;
  font: 700 0.68rem/1 ui-monospace, Menlo, monospace;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  /* A target you can hit, on a page you are holding at arm's length. */
  min-height: 2.75rem;
  padding: 0 1rem;
  cursor: pointer;
}
.guide__close:hover { background: rgba(34, 32, 28, 0.95); }

.guide__columns {
  display: grid;
  grid-template-columns: repeat(var(--columns, 5), minmax(0, 1fr));
  padding-top: 0.5rem;
}
/*
  Every column carries the same rule and the same padding, and only the colour
  of the rule changes. Putting the border and the padding on the adjacent
  sibling alone makes the first column's content box wider than the rest by
  exactly that much — the tracks stay equal and the headings inside them do
  not, which shows as one bar being longer than its neighbours.
*/
.guide__column {
  box-sizing: border-box;
  border-left: 1px solid transparent;
  padding-inline: calc(var(--gutter) / 2);
}
.guide__column + .guide__column { border-left-color: var(--rule); }
/*
  The channel the set is tuned to, marked down the whole column rather than
  round its heading. An outer ring on the heading draws two pixels on every
  side and contributes nothing to layout, so the bar measures the same as its
  neighbours and looks four pixels bigger in both directions — and there is no
  way to reserve that space on the others, because a transparent ring paints
  nothing. Anything that marks one column has to sit inside the box every
  column already has.
*/
.guide__column[data-tuned='true'] { background: rgba(34, 32, 28, 0.075); }
.guide__station {
  margin: 0 0 0.35rem;
  padding: 0.22rem 0.3rem;
  background: var(--ink);
  color: var(--paper);
  font: 700 0.62rem/1.3 Helvetica, Arial, sans-serif;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: center;
}
.guide__billing {
  margin: 0 0 0.4rem;
  font-size: 0.6rem;
  font-style: italic;
  text-align: center;
  opacity: 0.75;
}
.guide__row {
  display: grid;
  grid-template-columns: 2.3rem minmax(0, 1fr);
  gap: 0 0.35rem;
  padding: 0.1rem 0;
  font-size: 0.72rem;
  line-height: 1.28;
}
.guide__time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.guide__what { margin: 0; overflow-wrap: anywhere; }
.guide__repeat { font-size: 0.86em; opacity: 0.7; }
/* Off air is set in italics, the way a paper set anything that is not a
   programme — it is a listing, not an absence of one. */
.guide__row[data-kind='closedown'] .guide__what,
.guide__row[data-kind='interlude'] .guide__what { font-style: italic; opacity: 0.72; }
/*
  On air now. A paper cannot know, so this is the one liberty the page takes:
  the reader's own pencil, ringing what is on.
*/
.guide__row[data-on='true'] {
  font-weight: 700;
  background: rgba(34, 32, 28, 0.09);
  box-shadow: inset 2px 0 0 var(--ink);
}
.guide__row[data-on='true'] .guide__what { font-style: normal; opacity: 1; }
.guide__late {
  flex: 1;
  display: grid;
  place-content: center;
  margin: 0;
  padding: clamp(2rem, 8vh, 5rem) 1rem;
  max-width: 28rem;
  align-self: center;
  text-align: center;
  font-size: 0.86rem;
  font-style: italic;
  line-height: 1.5;
  text-wrap: balance;
}
.guide__foot {
  margin: 0.7rem 0 0;
  border-top: 1px solid var(--rule);
  padding-top: 0.3rem;
  font-size: 0.58rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* A broadsheet does not fit on a phone. Fewer columns, then one. */
@media (max-width: 62rem) { .guide__columns { --columns: 3; } }
@media (max-width: 40rem) {
  .guide__columns { --columns: 1; }
  .guide__column + .guide__column {
    border-left-color: transparent;
    border-top: 1px solid var(--rule);
    padding-top: 0.6rem;
    margin-top: 0.6rem;
  }
}
`

/**
 * What a paper printed when the schedules had not arrived in time. The page
 * still went out — the masthead, the date, and a line saying so.
 */
const LATE = 'Programme details were not available when this page went to press.'

export function Guide({ pages, day, now, tunedTo, notice, onClose }: GuideProps) {
  const closeButton = useRef<HTMLButtonElement>(null)
  const columnsRef = useRef<HTMLDivElement>(null)
  const onAirRow = useRef<HTMLDivElement>(null)

  // Escape closes it, because every layer over a page has always closed on
  // Escape and a reader should not have to hunt for the button.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Opening a page puts you in it, not behind it.
  useEffect(() => {
    closeButton.current?.focus?.()
  }, [])

  /*
    A paper opens where your thumb left it, which at ten past eight in the
    evening is not six in the morning.

    Only when every column is on one row, though. Narrow enough and the
    columns wrap onto a second row, and scrolling to tonight then hides the
    last two channels below the fold with no sign they are there. jsdom has no
    layout at all, so both reads come back zero and the page starts at the top,
    which is where a paper starts anyway.
  */
  useEffect(() => {
    const columns = [...(columnsRef.current?.children ?? [])] as HTMLElement[]
    const oneRow = columns.every((column) => column.offsetTop === columns[0]?.offsetTop)
    if (oneRow) onAirRow.current?.scrollIntoView?.({ block: 'center' })
  }, [])

  const minuteMs = Math.floor(now.getTime() / 60_000) * 60_000

  const date = day.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  /*
    Portalled to the body, because a sheet held up in front of the set is in
    front of the whole room. Inside the stage it sits in that stacking context,
    and the controls in the corner of the page paint over it however high its
    z-index is.
  */
  return createPortal(
    <div
      className="guide-scrim"
      // Anywhere off the paper puts it down again, which is what a reader
      // expects of anything held up over what they were looking at.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="guide"
        role="dialog"
        aria-modal="true"
        aria-label="Television listings"
      >
        <style>{CSS}</style>
        <header className="guide__masthead">
          <h2 className="guide__title">Television</h2>
          <span className="guide__date">{date}</span>
          <button type="button" className="guide__close" ref={closeButton} onClick={onClose}>
            Close
          </button>
        </header>

        {pages.length > 0 ? (
          <div className="guide__columns" ref={columnsRef}>
            {pages.map((page) => (
              <Column
                key={page.station.id}
                page={page}
                minuteMs={minuteMs}
                tuned={page.station.id === tunedTo}
                onAirRef={page.station.id === tunedTo ? onAirRow : undefined}
              />
            ))}
          </div>
        ) : (
          /*
            The page goes out either way. Printing the masthead, the date and a
            line saying the schedules have not arrived is what a paper did, and
            it is also the only thing that tells a reader the difference between
            a page still being set and a button that does nothing.
          */
          <p className="guide__late" role="status">
            {notice ?? LATE}
          </p>
        )}

        <p className="guide__foot">Programmes as scheduled &middot; times may vary</p>
      </section>
    </div>,
    document.body,
  )
}

/**
 * One channel's column.
 *
 * Memoised, and given the time to the minute rather than the second, because
 * everything in here is settled for the whole broadcast day except which line
 * is ringed. Without both halves the page re-reads five schedules and lays two
 * hundred lines again on every tick of the set's clock.
 */
const Column = memo(function Column({
  page,
  minuteMs,
  tuned,
  onAirRef,
}: {
  page: GuidePage
  minuteMs: number
  tuned: boolean
  onAirRef?: React.RefObject<HTMLDivElement | null>
}) {
  const entries = useMemo(
    () => listing(page.schedule, page.station.dayparts),
    [page.schedule, page.station.dayparts],
  )
  const onAir = entryAt(entries, secondsIntoDay(new Date(minuteMs), page.schedule.startsAt))

  return (
    <div className="guide__column" data-tuned={String(tuned)}>
      <h3 className="guide__station">{page.name}</h3>
      <p className="guide__billing">{page.station.billing}</p>
      {entries.map((entry) => (
        <Row
          key={entry.startSec}
          entry={entry}
          dayStart={page.schedule.startsAt}
          onAir={entry === onAir}
          rowRef={entry === onAir ? onAirRef : undefined}
        />
      ))}
    </div>
  )
})

const Row = memo(function Row({
  entry,
  dayStart,
  onAir,
  rowRef,
}: {
  entry: Entry
  dayStart: Date
  onAir: boolean
  rowRef?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div className="guide__row" ref={rowRef} data-kind={entry.kind} data-on={String(onAir)}>
      <span className="guide__time">{clockOf(dayStart, entry.startSec)}</span>
      <p className="guide__what">
        {entry.label}
        {entry.repeat ? <span className="guide__repeat"> (R)</span> : null}
        {onAir ? <span className="sr-only"> — on now</span> : null}
      </p>
    </div>
  )
})
