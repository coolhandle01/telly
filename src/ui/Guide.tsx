import { memo, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { secondsIntoDay, type Schedule } from '../domain'
import type { Station } from '../programming'
import { entryAt, listing, type Entry } from './listing'
import './Guide.css'

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
