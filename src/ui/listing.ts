import { DEFAULT_DAYPARTS, type Daypart, type DaypartId, type Schedule, type ScheduleItem } from '../domain'

/**
 * The day's schedule as a page of listings.
 *
 * A schedule and a listing are not the same document. The schedule is every
 * item the packer laid down, down to the two minutes of station ident before
 * a programme; a listing is what a paper printed, and no paper ever printed
 * "18.42 Ident". So runs of everything that is not a programme collapse into
 * one line — which is exactly what "6.00 Closedown" is, a four-and-a-half-hour
 * run of test card given one line and no apology.
 *
 * A stripped daypart collapses its programmes too. Nobody printed two hundred
 * and forty clips; they printed `2.00 Clip Show`.
 */

export type EntryKind = 'programme' | 'closedown' | 'interlude'

export interface Entry {
  /** Seconds from the broadcast day's 06.00 anchor. */
  startSec: number
  endSec: number
  daypart: DaypartId
  kind: EntryKind
  label: string
  /** Shown earlier the same day. Printed (R), as the papers printed it. */
  repeat?: boolean
}

const kindOf = (item: ScheduleItem): EntryKind => {
  if (item.content.kind === 'programme') return 'programme'
  return item.content.variant === 'closedown' ? 'closedown' : 'interlude'
}

/** An ident: the station's symbol, held to bring the next programme up. */
const isIdent = (item: ScheduleItem): boolean =>
  item.content.kind === 'filler' && item.content.variant === 'ident'

const labelFor = (item: ScheduleItem, kind: EntryKind): string =>
  item.content.kind === 'programme'
    ? item.content.title
    : kind === 'closedown'
      ? 'Closedown'
      : 'Interlude'

export function listing(
  schedule: Schedule,
  dayparts: readonly Daypart[] = DEFAULT_DAYPARTS,
): Entry[] {
  const stripped = new Map(dayparts.map((daypart) => [daypart.id, daypart]))
  const entries: Entry[] = []

  for (const item of schedule.items) {
    const kind = kindOf(item)
    const previous = entries.at(-1)
    const strip = stripped.get(item.daypart)?.stripped === true

    // Programmes are always their own line, even two of the same name back to
    // back — they are separate programmes and the times say so. Everything
    // else joins the run it belongs to, but never across a daypart boundary,
    // because the listing is grouped by daypart and a line cannot sit in two.
    if (
      (kind !== 'programme' || strip) &&
      previous !== undefined &&
      previous.daypart === item.daypart &&
      (previous.kind === kind || strip)
    ) {
      previous.endSec = item.endSec
      continue
    }

    // An ident is not printed. A paper printed programme times, not the two
    // minutes of station symbol before one, so it belongs to the line above it.
    if (isIdent(item) && previous !== undefined && previous.daypart === item.daypart) {
      previous.endSec = item.endSec
      continue
    }

    entries.push({
      startSec: item.startSec,
      endSec: item.endSec,
      daypart: item.daypart,
      kind,
      label: strip ? (stripped.get(item.daypart)?.name ?? item.daypart) : labelFor(item, kind),
      ...(item.content.kind === 'programme' && item.content.repeat && !strip
        ? { repeat: true }
        : {}),
    })
  }

  return entries
}

/** The entry on air at `sec`, by the same half-open rule the tuner uses. */
export const entryAt = (entries: readonly Entry[], sec: number): Entry | undefined =>
  entries.find((entry) => sec >= entry.startSec && sec < entry.endSec)
