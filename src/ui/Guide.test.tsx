import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '../test/render'
import { FixturePoolSource } from '../library'
import { planStations, STATIONS } from '../programming'
import { Guide, type GuidePage } from './Guide'

const DAY = new Date(2026, 8, 13, 9, 0, 0)

async function open(now = new Date(2026, 8, 13, 12, 10, 0), onClose = vi.fn()) {
  const pool = await new FixturePoolSource().load()
  const { schedules } = planStations(pool, { dayStart: DAY })
  const pages: GuidePage[] = STATIONS.map((station) => ({
    station,
    schedule: schedules.get(station.id)!,
    name: station.id === 1 ? 'CHANNEL ONE' : station.name,
  }))
  const view = render(<Guide pages={pages} day={DAY} now={now} tunedTo={1} onClose={onClose} />)
  return { view, onClose, page: screen.getByRole('dialog', { name: /listings/i }) }
}

const columns = (page: HTMLElement) => [...page.querySelectorAll('.guide__column')]

describe('Guide', () => {
  /*
    A column to a channel, times down each one, which is how a paper set it.
    An hour-by-hour grid across all five is a modern electronic guide and would
    be an anachronism twice over.
  */
  it('prints a column for every channel', async () => {
    const { page } = await open()

    expect(columns(page)).toHaveLength(STATIONS.length)
    expect(within(page).getByRole('heading', { name: 'CHANNEL ONE' })).toBeInTheDocument()
    expect(within(page).getByRole('heading', { name: 'CHANNEL FOUR' })).toBeInTheDocument()
  })

  it('prints the whole day, not now and next', async () => {
    const { page } = await open()
    const first = columns(page)[0]

    expect(first.querySelectorAll('.guide__row').length).toBeGreaterThan(10)
  })

  it('opens the broadcast day at six, in the point notation a paper used', async () => {
    const { page } = await open()

    expect(within(page).getAllByText('6.00')[0]).toBeInTheDocument()
    // Not 06:00, and not 6:00 either.
    expect(within(page).queryByText('06:00')).toBeNull()
  })

  it('rings what is on, in every column at once', async () => {
    const { page } = await open(new Date(2026, 8, 13, 21, 30, 0))
    const marked = page.querySelectorAll('[data-on="true"]')

    // One line per channel, and no more: a reader wants to know what else is
    // on, which is the entire reason for printing five columns.
    expect(marked).toHaveLength(STATIONS.length)
  })

  it('marks nothing when the page is not for today', async () => {
    const { page } = await open(new Date(2026, 8, 20, 12, 10, 0))

    expect(page.querySelectorAll('[data-on="true"]')).toHaveLength(0)
  })

  it('says which column the set is tuned to', async () => {
    const { page } = await open()
    const tuned = columns(page).filter((column) => column.getAttribute('data-tuned') === 'true')

    expect(tuned).toHaveLength(1)
    expect(within(tuned[0] as HTMLElement).getByRole('heading')).toHaveTextContent('CHANNEL ONE')
  })

  it('prints the date of the broadcast day, not of the reader', async () => {
    // The day runs to 06.00, so at 2am the listings are still yesterday's
    // page and must say so.
    const { page } = await open(new Date(2026, 8, 14, 2, 0, 0))

    expect(within(page).getByText(/Sunday 13 September/i)).toBeInTheDocument()
  })

  // Nobody printed two hundred and forty clips. They printed "2.00 Clip Show".
  it('gives a strand of clips one line', async () => {
    const { page } = await open()
    const five = columns(page).at(-1) as HTMLElement

    expect(within(five).getAllByText('Clip Show')).toHaveLength(1)
  })

  it('prints (R) against a repeat, as the papers did', async () => {
    const { page } = await open()

    expect(page.querySelectorAll('.guide__repeat').length).toBeGreaterThan(0)
  })

  describe('putting it down again', () => {
    it('closes on the button', async () => {
      const { view, onClose, page } = await open()

      await view.user.click(within(page).getByRole('button', { name: /close/i }))

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes on Escape', async () => {
      const { view, onClose } = await open()

      await view.user.keyboard('{Escape}')

      expect(onClose).toHaveBeenCalledOnce()
    })

    it('closes when you put it down beside the set', async () => {
      const { view, onClose } = await open()
      const scrim = document.querySelector('.guide-scrim') as HTMLElement

      await view.user.click(scrim)

      expect(onClose).toHaveBeenCalledOnce()
    })

    // Clicking the paper is reading the paper.
    it('stays open when you touch the page itself', async () => {
      const { view, onClose, page } = await open()

      await view.user.click(within(page).getByRole('heading', { name: 'Television' }))

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  /*
    The listings are worked out from a pool that has to be fetched, so there is
    a moment — and on a slow connection a long one — where there is nothing to
    print. A page that renders nothing at all in that moment is indistinguishable
    from a button that does not work.
  */
  describe('before the schedules arrive', () => {
    const empty = (notice?: string) =>
      render(
        <Guide
          pages={[]}
          day={DAY}
          now={new Date(2026, 8, 13, 12, 10, 0)}
          onClose={vi.fn()}
          notice={notice}
        />,
      )

    it('still goes out, with the masthead and the date on it', () => {
      empty()
      const page = screen.getByRole('dialog', { name: /listings/i })

      expect(within(page).getByRole('heading', { name: 'Television' })).toBeInTheDocument()
      expect(within(page).getByText(/Sunday 13 September/i)).toBeInTheDocument()
    })

    it('says the details have not arrived', () => {
      empty()

      expect(screen.getByRole('status')).toHaveTextContent(/not available|went to press/i)
    })

    it('can still be put down again', () => {
      empty()
      const page = screen.getByRole('dialog', { name: /listings/i })

      expect(within(page).getByRole('button', { name: /close/i })).toBeInTheDocument()
    })

    // A page that says "not yet" for ever, when the truth is that the fetch
    // failed, is worse than one that says why.
    it('prints the reason instead, when there is one', () => {
      empty('YouTube API 403: accessNotConfigured')

      expect(screen.getByRole('status')).toHaveTextContent(/accessNotConfigured/)
    })
  })

  it('puts the reader in the page rather than behind it', async () => {
    const { page } = await open()

    expect(within(page).getByRole('button', { name: /close/i })).toHaveFocus()
  })
})
