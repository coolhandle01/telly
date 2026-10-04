import { describe, expect, it } from 'vitest'
import { Channel } from '@/ui/Channel'
import { act, render, screen, waitFor, within } from '../support/render'
import { FakeClock } from '../support/fakeClock'
import { FakePlayer } from '../support/fakePlayer'
import { SignInError, YouTubeApiError } from '@/library'
import { FixturePoolSource } from '../support/fixturePoolSource'
import type { PoolSource, Session } from '@/library'
import { createFakeSound } from '../support/fakeAudio'
import { broadcastDayStart, type Schedule, type ScheduleItem } from '@/domain'
import { planStations } from '@/programming'

const CHANNEL = 'CHANNEL ONE'
/** Mid-afternoon: a programme is certainly on air. */
const AFTERNOON = new Date(2026, 8, 9, 14, 32, 7)
/** Inside closedown, where the schedule carries no programmes at all. */
const SMALL_HOURS = new Date(2026, 8, 10, 3, 0, 0)

function setUp(now = AFTERNOON, source: PoolSource = new FixturePoolSource()) {
  const clock = new FakeClock(now)
  const player = new FakePlayer()
  const sound = createFakeSound()
  const host = document.createElement('div')
  const view = render(
    <Channel
      channelName={CHANNEL}
      clock={clock}
      poolSource={source}
      player={player}
      playerHost={host}
      sound={sound}
      sourceUrl="https://github.com/example/telly"
    />,
  )
  return { clock, player, sound, view }
}

/** The glass, and what the set is putting on it. */
const glass = () => screen.getByRole('region', { name: /television/i })
const snowing = () => glass().querySelector('.screen__snow')?.getAttribute('data-snowing')
const tuneTo = async (user: { click: (el: Element) => Promise<void> }, preset: number) =>
  user.click(screen.getByRole('radio', { name: String(preset) }))

/** Six keys on the fascia and five stations. Nothing was ever put on this one. */
const EMPTY_PRESET = 6
/** A station whose tuning slug was never set properly. */
const MISTUNED_PRESET = 4

const switchOn = async (user: { click: (el: Element) => Promise<void> }) =>
  user.click(screen.getByRole('button', { name: 'Power' }))

/**
 * Waits until the channels are programmed: the pool in, five days planned.
 * The button says so: while it is working it counts, and it goes back to
 * being the way to the paper once there is a paper to go to.
 */
const programmed = () => screen.findByRole('button', { name: /telly guide/i })

/**
 * Lets the effects of the last render run. The sound follows what is on the
 * screen from an effect, so a test that asserts the sound did *not* happen has
 * to give that effect its chance first, or it passes before the effect fires.
 */
const settle = () => act(async () => {})

describe('Channel', () => {
  // A set that is off is a dark screen. It does not caption itself: the only
  // thing that screen could tell you is the thing you can already see.
  it('shows nothing at all until it is switched on', () => {
    setUp()
    expect(glass()).toHaveAttribute('data-phase', 'off')
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('loads no pool at all until switched on', () => {
    let loads = 0
    const counting: PoolSource = {
      load: async () => {
        loads++
        return new FixturePoolSource().load()
      },
    }
    setUp(AFTERNOON, counting)
    expect(loads).toBe(0)
  })

  it('joins the programme that is on air, part-way in', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)

    await waitFor(() => expect(player.loads).toHaveLength(1))
    // Not the top of the video: we joined it in progress.
    expect(player.loads[0].offsetSec).toBeGreaterThan(0)
  })

  it('shows the test card, with tone, during closedown', async () => {
    const { player, sound, view } = setUp(SMALL_HOURS)
    await switchOn(view.user)

    await waitFor(() => expect(screen.getByRole('timer')).toBeInTheDocument())
    await waitFor(() => expect(sound.tone).toHaveBeenCalled())
    // Closedown carries no programmes, so nothing was ever asked of the player.
    expect(player.loads).toHaveLength(0)
  })

  it('re-tunes as the clock moves on within one programme', async () => {
    const { clock, player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    act(() => clock.set(new Date(2026, 8, 9, 14, 32, 8)))
    act(() => clock.set(new Date(2026, 8, 9, 14, 32, 9)))

    // The offset moved, but the surface must not reload the same programme.
    expect(player.loads).toHaveLength(1)
  })

  // Anything that cannot be streamed falls back to the card, not to a bare
  // line of text: the failure screen and the signature screen are the same
  // screen, which is the whole point of having a test card.
  it('falls back to the test card, captioned, when the player faults', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    act(() => player.fault({ videoId: player.loads[0].videoId, code: 150, reason: 'not embeddable' }))

    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/normal service will be resumed/i)
  })

  // The card is the channel's default state, not its error state.
  it('shows the card under a programme until a picture actually arrives', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    // Player loaded and still loading — the card is what is on screen.
    expect(screen.getByRole('timer')).toBeInTheDocument()
    // Whatever is on, the card is captioned with its name.
    expect(screen.getByRole('status').textContent ?? '').toMatch(/\S/)
  })

  it('reveals the picture once the player reports one', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    // The surface is labelled with the programme's title, whatever is on.
    const layer = () =>
      screen.getAllByRole('region').find((region) => region.tagName === 'SECTION')?.parentElement

    act(() => player.picture(true))
    expect(layer()).toHaveStyle({ opacity: '1' })

    act(() => player.picture(false))
    expect(layer()).toHaveStyle({ opacity: '0' })
  })

  it('puts black, not a test card, behind a running picture', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    expect(screen.getByRole('timer')).toBeInTheDocument()
    act(() => player.picture(true))

    // The card is gone: a 16:9 programme in a 4:3 set shows black bars.
    expect(screen.queryByRole('timer')).toBeNull()

    act(() => player.picture(false))
    expect(screen.getByRole('timer')).toBeInTheDocument()
  })

  it('keeps the player loaded while the card is up, so it can still start', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    const stopsOnceOn = player.stops

    expect(screen.getByRole('timer')).toBeInTheDocument()
    // The card being up must not tear the player down — it is still trying.
    expect(player.stops).toBe(stopsOnceOn)
    expect(player.loads).toHaveLength(1)
  })

  it('stops the picture when switched off', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.loads).toHaveLength(1))

    await view.user.click(screen.getByRole('button', { name: 'Power' }))

    // The sound goes at once; the picture does not. A tube collapses to a
    // line and then a spot, so the screen is still lit for a moment.
    expect(player.stops).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: /television/i })).toHaveAttribute(
      'data-phase',
      'collapsing',
    )

    await waitFor(() => expect(glass()).toHaveAttribute('data-phase', 'off'), { timeout: 3000 })
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('warms up rather than snapping on', async () => {
    const { view } = setUp()

    await switchOn(view.user)

    expect(screen.getByRole('region', { name: /television/i })).toHaveAttribute(
      'data-phase',
      'warming',
    )
  })

  it('shows the test card, not a spinner, when the pool cannot be loaded', async () => {
    const failing: PoolSource = { load: async () => { throw new Error('quota') } }
    const { view } = setUp(AFTERNOON, failing)
    await switchOn(view.user)

    await waitFor(() => expect(screen.getByRole('timer')).toBeInTheDocument())
  })

  // A card with no explanation is indistinguishable from a broken app — which
  // is exactly how this failed the first time it met a real account.
  it('says why there is nothing on, rather than just showing a card', async () => {
    const failing: PoolSource = {
      load: async () => {
        throw new YouTubeApiError(403, 'accessNotConfigured', 'youtube videos failed: 403')
      },
    }
    const { view } = setUp(AFTERNOON, failing)
    await switchOn(view.user)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/would not answer/i))
    expect(screen.getByRole('status')).toHaveTextContent(/no programme information/i)
  })

  it('says so when the subscriptions turn up empty, which is not an error', async () => {
    const empty: PoolSource = { load: async () => ({ videos: [], channels: new Map() }) }
    const { view } = setUp(AFTERNOON, empty)
    await switchOn(view.user)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no videos found/i))
  })

  it('prints every channel when you ask what is on', async () => {
    const { view } = setUp()
    await switchOn(view.user)
    await view.user.click(await programmed())

    // Not now-and-next, and not one channel: the listings came in the paper,
    // and a paper printed the whole evening on every channel there was.
    const page = await screen.findByRole('dialog', { name: /listings/i })
    expect(within(page).getByRole('heading', { name: CHANNEL })).toBeInTheDocument()
    expect(within(page).getByRole('heading', { name: 'CHANNEL FIVE' })).toBeInTheDocument()
    expect(within(page).getAllByText('6.00')[0]).toBeInTheDocument()
  })

  it('takes the page away again', async () => {
    const { view } = setUp()
    await switchOn(view.user)

    await view.user.click(await programmed())
    const page = await screen.findByRole('dialog', { name: /listings/i })

    await view.user.click(within(page).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog', { name: /listings/i })).toBeNull()
  })

  describe('programming the channels', () => {
    /**
     * A source held open, so the several seconds a live account takes can be
     * looked at a frame at a time. `report` is the callback the set handed it.
     */
    function heldSource(): {
      source: PoolSource
      report(fraction: number): Promise<void>
      finish(): Promise<void>
    } {
      let onProgress: ((fraction: number) => void) | undefined
      let release: (() => void) | undefined
      const source: PoolSource = {
        async load(progress) {
          onProgress = progress
          await new Promise<void>((resolve) => {
            release = resolve
          })
          return new FixturePoolSource().load()
        },
      }
      return {
        source,
        report: async (fraction) => {
          await act(async () => {
            onProgress?.(fraction)
          })
        },
        finish: async () => {
          await act(async () => {
            release?.()
          })
        },
      }
    }

    it('counts on the button while the schedules are being worked out', async () => {
      // A minute of a button doing nothing is indistinguishable from a broken
      // button, and a live subscription list takes a while.
      const held = heldSource()
      const { view } = setUp(AFTERNOON, held.source)
      await switchOn(view.user)

      await held.report(0.42)
      const counting = screen.getByRole('button', { name: /programming/i })
      expect(counting).toHaveTextContent('Programming 42%')
      expect(counting).toBeDisabled()

      await held.finish()
      expect(await programmed()).toBeEnabled()
    })

    it('holds the station ident while there is nothing to put on yet', async () => {
      /*
        Not the closedown card. The station has not closed down: it is the
        middle of the afternoon and the schedules are simply still being
        worked out. A card reading NORMAL SERVICE WILL RESUME AT 06.00
        would be the set inventing a reason it does not have.
      */
      const held = heldSource()
      const { view } = setUp(AFTERNOON, held.source)
      await switchOn(view.user)
      await held.report(0.1)

      expect(screen.getByRole('img', { name: `${CHANNEL} ident` })).toBeInTheDocument()
      expect(screen.queryByText(/normal service/i)).toBeNull()

      await held.finish()
      await programmed()
      expect(screen.queryByRole('img', { name: `${CHANNEL} ident` })).toBeNull()
    })

    it('shows nothing at all while a set that is off programmes for the paper', async () => {
      // Opening the listings loads the pool with the set still off, and a
      // dark screen stays dark: there is no ident on an unlit tube.
      const held = heldSource()
      const { view } = setUp(AFTERNOON, held.source)

      await view.user.click(screen.getByRole('button', { name: /telly guide/i }))
      await held.report(0.3)

      expect(glass()).toHaveAttribute('data-phase', 'off')
      expect(screen.queryByRole('img', { name: `${CHANNEL} ident` })).toBeNull()
      expect(screen.getByRole('button', { name: /programming 30%/i })).toBeDisabled()
    })

    it('stops counting when the pool cannot be had at all', async () => {
      // Otherwise the one outcome the viewer most needs to hear about is the
      // one where the button counts for ever and says nothing.
      const failing: PoolSource = {
        load: async () => {
          throw new Error('quota')
        },
      }
      const { view } = setUp(AFTERNOON, failing)
      await switchOn(view.user)

      expect(await programmed()).toBeEnabled()
    })
  })

  describe('the Google session', () => {
    /** A session the test drives, standing in for `googleSession`. */
    const fakeSession = (overrides: Partial<Session> = {}) => {
      const listeners = new Set<(signedIn: boolean) => void>()
      const announce = (signedIn: boolean) => {
        for (const listener of [...listeners]) listener(signedIn)
      }
      const calls = { signIn: 0, signOut: 0 }
      const session: Session = {
        signIn: async () => {
          calls.signIn += 1
          announce(true)
        },
        signOut: async () => {
          calls.signOut += 1
          announce(false)
        },
        resume: async () => false,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        ...overrides,
      }
      return { session, calls, announce }
    }

    const render_ = (session?: Session, source: PoolSource = new FixturePoolSource()) => {
      const clock = new FakeClock(AFTERNOON)
      return render(
        <Channel
          channelName={CHANNEL}
          clock={clock}
          poolSource={source}
          player={new FakePlayer()}
          session={session}
        />,
      )
    }

    const signInButton = () => screen.queryByRole('button', { name: /sign in with google/i })
    const signOutButton = () => screen.queryByRole('button', { name: /sign out/i })

    it('offers nothing to sign in to when no client ID is configured', () => {
      render_(undefined)
      expect(signInButton()).toBeNull()
      expect(signOutButton()).toBeNull()
    })

    it('offers sign-in when a client ID is configured', async () => {
      render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
    })

    // Both at once, or one and then the other, is the set saying two
    // different things about the same session.
    it('offers neither while a grant is still being taken up', () => {
      render_(fakeSession({ resume: () => new Promise(() => {}) }).session)

      expect(signInButton()).toBeNull()
      expect(signOutButton()).toBeNull()
    })

    it('calls sign-in straight from the click, so the popup is not blocked', async () => {
      const { session, calls } = fakeSession()
      const view = render_(session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await view.user.click(signInButton()!)

      expect(calls.signIn).toBe(1)
    })

    it('says what went wrong, and lets you try again', async () => {
      const view = render_(
        fakeSession({
          signIn: async () => {
            throw new SignInError('popup_closed')
          },
        }).session,
      )
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await view.user.click(signInButton()!)

      const alert = await screen.findByRole('alert')
      await waitFor(() => expect(alert).toHaveTextContent(/closed before it finished/i))
      // Google's own wording is for whoever is holding the Error. This used to
      // put `YouTube sign-in failed: popup_closed` in front of the viewer.
      expect(alert).not.toHaveTextContent(/popup_closed|YouTube sign-in failed/)
      expect(signInButton()).toBeInTheDocument()
    })

    // A refresh is not a sign-out.
    it('shows the way out when a grant is taken up at page load', async () => {
      render_(fakeSession({ resume: async () => true }).session)

      await waitFor(() => expect(signOutButton()).toBeInTheDocument())
      expect(signInButton()).toBeNull()
    })

    it('signs out, and offers sign-in again', async () => {
      const { session, calls } = fakeSession({ resume: async () => true })
      const view = render_(session)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      await view.user.click(signOutButton()!)

      expect(calls.signOut).toBe(1)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      expect(signOutButton()).toBeNull()
    })

    // Nothing was clicked: the token expired. The corner has to follow
    // it, or the set offers a way out of a session that has already ended.
    it('follows the session when the token expires on its own', async () => {
      const { session, announce } = fakeSession({ resume: async () => true })
      render_(session)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      act(() => announce(false))

      await waitFor(() => expect(signInButton()).toBeInTheDocument())
    })

    // The refusal belonged to the session that ended. Signing in again takes
    // it off the screen, rather than leaving it up while the next load runs.
    it('clears the last session\'s load error when signing in again', async () => {
      let loads = 0
      const { session, announce } = fakeSession({ resume: async () => true })
      const refusedThenHeld: PoolSource = {
        load: async () => {
          loads += 1
          if (loads > 1) return new Promise(() => {})
          throw new YouTubeApiError(401, 'authError', 'youtube subscriptions failed: 401')
        },
      }
      const view = render_(session, refusedThenHeld)
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no longer accepts this sign-in/i))
      act(() => announce(false))
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await view.user.click(signInButton()!)

      await waitFor(() => expect(loads).toBe(2))
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('starts programming as soon as someone is signed in, with the set still off', async () => {
      let loads = 0
      const counting: PoolSource = {
        load: () => {
          loads += 1
          return new Promise(() => {})
        },
      }
      render_(fakeSession({ resume: async () => true }).session, counting)

      await waitFor(() => expect(loads).toBe(1))
      expect(glass()).toHaveAttribute('data-phase', 'off')
      expect(await screen.findByRole('button', { name: /programming 0%/i })).toBeDisabled()
    })

    it('starts the count from nothing again after signing out and back in', async () => {
      let loads = 0
      const secondHeld: PoolSource = {
        load: (onProgress) => {
          loads += 1
          if (loads > 1) return new Promise(() => {})
          onProgress?.(1)
          return new FixturePoolSource().load()
        },
      }
      const view = render_(fakeSession({ resume: async () => true }).session, secondHeld)
      await waitFor(() => expect(screen.getByRole('button', { name: /telly guide/i })).toBeEnabled())

      await view.user.click(signOutButton()!)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await view.user.click(signInButton()!)

      await waitFor(() => expect(loads).toBe(2))
      expect(await screen.findByRole('button', { name: /programming/i })).toHaveTextContent('Programming 0%')
    })

    /** A load the test settles by hand, once it has started. */
    const heldLoad = () => {
      const held: { resolve?: (pool: Awaited<ReturnType<PoolSource['load']>>) => void; reject?: (error: unknown) => void } = {}
      const source: PoolSource = {
        load: () =>
          new Promise((resolve, reject) => {
            held.resolve = resolve
            held.reject = reject
          }),
      }
      return { source, held }
    }

    // The grant or the saved copy may still stand, and the viewer has to know.
    it('says so when signing out fails, rather than swallowing it', async () => {
      const view = render_(
        fakeSession({
          resume: async () => true,
          signOut: async () => {
            throw new Error('revoke failed')
          },
        }).session,
      )
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      await view.user.click(signOutButton()!)

      expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement()
    })

    it('ignores the button while it is signing out, and says it is', async () => {
      const { session, calls } = fakeSession({
        resume: async () => true,
        signOut: () => {
          calls.signOut += 1
          return new Promise(() => {})
        },
      })
      const view = render_(session)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      await view.user.click(signOutButton()!)
      const busy = screen.getByRole('button', { name: /signing out/i })
      await view.user.click(busy)

      expect(busy).toBeDisabled()
      expect(calls.signOut).toBe(1)
    })

    it('can sign out again in the next session', async () => {
      const { session, announce } = fakeSession({ resume: async () => true })
      const view = render_(session)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())
      await view.user.click(signOutButton()!)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      act(() => announce(true))

      await waitFor(() => expect(signOutButton()).toBeEnabled())
    })

    // A slow load that lands after the viewer has signed out belongs to them,
    // and must not put their programmes back on the screen.
    it('keeps a load that lands after signing out off the screen', async () => {
      const { source, held } = heldLoad()
      const view = render_(fakeSession({ resume: async () => true }).session, source)
      await waitFor(() => expect(held.resolve).toBeDefined())
      await view.user.click(signOutButton()!)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await switchOn(view.user)

      await act(async () => held.resolve!(await new FixturePoolSource().load()))

      expect(glass()).toHaveTextContent('NO PROGRAMME INFORMATION AVAILABLE')
    })

    it('keeps a load that fails after signing out off the screen too', async () => {
      const { source, held } = heldLoad()
      const view = render_(fakeSession({ resume: async () => true }).session, source)
      await waitFor(() => expect(held.reject).toBeDefined())
      await view.user.click(signOutButton()!)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await act(async () => held.reject!(new Error('youtube subscriptions failed: 500')))

      expect(screen.queryByRole('alert')).toBeNull()
    })

    // A grant that cannot be taken up is no grant: the corner offers sign-in.
    it('offers sign-in when taking up a grant fails', async () => {
      render_(
        fakeSession({
          resume: async () => {
            throw new Error('storage unavailable')
          },
        }).session,
      )

      await waitFor(() => expect(signInButton()).toBeInTheDocument())
    })

    it('takes the last error off the screen when signing in again', async () => {
      let attempts = 0
      const view = render_(
        fakeSession({
          signIn: () => {
            attempts += 1
            return attempts === 1 ? Promise.reject(new SignInError('popup_closed')) : new Promise(() => {})
          },
        }).session,
      )
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await view.user.click(signInButton()!)
      await screen.findByRole('alert')

      await view.user.click(signInButton()!)

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('takes the last error off the screen when signing out', async () => {
      const { session, announce } = fakeSession({
        signIn: async () => {
          throw new SignInError('popup_closed')
        },
      })
      const view = render_(session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await view.user.click(signInButton()!)
      await screen.findByRole('alert')
      act(() => announce(true)) // signed in after all, by another route
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      await view.user.click(signOutButton()!)

      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('takes a load error off the screen when signing out', async () => {
      const refused: PoolSource = {
        load: async () => {
          throw new YouTubeApiError(401, 'authError', 'youtube subscriptions failed: 401')
        },
      }
      const view = render_(fakeSession({ resume: async () => true }).session, refused)
      await screen.findByRole('alert')

      await view.user.click(signOutButton()!)

      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      expect(screen.queryByRole('alert')).toBeNull()
    })

    // The key looks for the source of the render it is pressed in, not the
    // one there was before anybody signed in.
    it('opens the paper on i once someone has signed in', async () => {
      const view = render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await view.user.click(signInButton()!)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      await view.user.keyboard('i')

      expect(await screen.findByRole('dialog', { name: /listings/i })).toBeInTheDocument()
    })

    it('ignores i while nobody is signed in, and does not save it for later', async () => {
      const view = render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await view.user.keyboard('i')
      await view.user.click(signInButton()!)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      expect(screen.queryByRole('dialog', { name: /listings/i })).toBeNull()
    })

    // One listener for the key, however many times the source has changed.
    it('opens the paper on i after signing in, out and in again', async () => {
      const view = render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await view.user.click(signInButton()!)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())
      await view.user.click(signOutButton()!)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())
      await view.user.click(signInButton()!)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      await view.user.keyboard('i')

      expect(await screen.findByRole('dialog', { name: /listings/i })).toBeInTheDocument()
    })

    it('has no programmes to show while nobody is signed in', async () => {
      const view = render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await switchOn(view.user)
      await view.user.keyboard('i')

      await waitFor(() => expect(glass()).toHaveTextContent('NO PROGRAMME INFORMATION AVAILABLE'))
      expect(screen.queryByRole('dialog', { name: /listings/i })).toBeNull()
    })

    it('offers no Telly Guide while nobody is signed in', async () => {
      render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      expect(screen.queryByRole('button', { name: /telly guide/i })).toBeNull()
    })

    it('does not touch the signed-in source while nobody is signed in', async () => {
      let loads = 0
      const counting: PoolSource = {
        load: async () => {
          loads += 1
          throw new Error('not signed in: no YouTube access token is available')
        },
      }
      const view = render_(fakeSession().session, counting)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await switchOn(view.user)

      expect(loads).toBe(0)
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  // The listings come from a pool that has to be fetched. A button that
  // renders nothing while that happens is indistinguishable from a broken one.
  it('opens the listings before there is anything to print on them', async () => {
    const slow: PoolSource = { load: () => new Promise(() => {}) }
    const { view } = setUp(AFTERNOON, slow)

    await view.user.click(screen.getByRole('button', { name: /telly guide/i }))

    const page = await screen.findByRole('dialog', { name: /listings/i })
    expect(within(page).getByRole('heading', { name: 'Television' })).toBeInTheDocument()
    expect(within(page).getByRole('status')).toHaveTextContent(/not available|went to press/i)
  })

  it('says why the page is empty when the pool would not load', async () => {
    const failing: PoolSource = {
      load: async () => {
        throw new YouTubeApiError(403, 'quotaExceeded', 'youtube videos failed: 403 (quotaExceeded)')
      },
    }
    const { view } = setUp(AFTERNOON, failing)

    await view.user.click(screen.getByRole('button', { name: /telly guide/i }))

    const page = await screen.findByRole('dialog', { name: /listings/i })
    const notice = within(page).getByRole('status')
    await waitFor(() => expect(notice).toHaveTextContent(/allowance of YouTube requests/i))
    // The endpoint, the status and Google's own wording belong to whoever is
    // holding the Error, not to the person sitting in front of the screen.
    expect(notice).not.toHaveTextContent(/403|quotaExceeded|youtube videos/)
  })

  describe('the on-screen display', () => {
    // Arriving at a channel is not the same event as changing it.
    it('says nothing until a preset is pressed', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await programmed()

      expect(screen.queryByRole('img', { name: /^CH \d/ })).toBeNull()
    })

    it('shows the preset for a moment when one goes in', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, 4)

      expect(screen.getByRole('img', { name: 'CH 4' })).toBeInTheDocument()
    })

    /*
      The set's own display is generated in the cabinet, not received, so the
      tuner has nothing to do with it. On a preset with no station the snow is
      fully opaque, and an overlay drawn under it is present, correctly sized,
      and completely invisible — which is a thing jsdom cannot tell from one
      that works, so this asserts where the node sits rather than that it is
      there at all.
    */
    it('is drawn above the snow, not under it', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)

      expect(snowing()).toBe('true')
      const osd = screen.getByRole('img', { name: `CH ${EMPTY_PRESET}` })
      const snow = glass().querySelector('.screen__snow') as HTMLElement

      // Later sibling of the snow, and outside the layers the deflection moves.
      expect(osd.closest('.screen__raster')).toBeNull()
      expect(osd.closest('.screen__tube')).not.toBeNull()
      expect(snow.compareDocumentPosition(osd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows the volume over snow as readily as over a picture', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)

      const knob = screen.getByRole('slider', { name: /volume/i })
      knob.focus()
      await view.user.keyboard('{ArrowDown}')

      const vol = screen.getByRole('img', { name: /^VOL/ })
      expect(vol.closest('.screen__osd')).not.toBeNull()
      expect(vol.closest('.screen__raster')).toBeNull()
    })
  })

  describe('the noises the cabinet makes', () => {
    it('clunks the power switch', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)

      expect(sound.clunk).toHaveBeenCalled()
    })

    it('clunks a preset key, which is a key and not a knob', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)
      sound.clunk.mockClear()

      await tuneTo(view.user, 2)

      expect(sound.clunk).toHaveBeenCalledOnce()
      expect(sound.click).not.toHaveBeenCalled()
    })

    it('clicks a detent on a trimmer', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)

      const knob = screen.getByRole('slider', { name: /brightness/i })
      knob.focus()
      await view.user.keyboard('{ArrowUp}')

      expect(sound.click).toHaveBeenCalled()
    })

    // A control that is already at its stop has not moved, so it has not
    // clicked: the detent is the movement, not the key press.
    it('does not click a control that cannot move any further', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)

      const knob = screen.getByRole('slider', { name: /brightness/i })
      knob.focus()
      await view.user.keyboard('{Home}')
      sound.click.mockClear()
      await view.user.keyboard('{ArrowDown}')

      expect(sound.click).not.toHaveBeenCalled()
    })
  })

  /*
    The sixth preset has nothing on it. That is not the same thing as
    a station with nothing to broadcast, which is what a test card is for, and
    a 1975 set did not confuse the two: no carrier meant snow and hiss.
  */
  describe('an empty preset', () => {
    it('shows snow, and no card behind it', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)

      expect(snowing()).toBe('true')
      expect(screen.queryByRole('timer')).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('hisses rather than sounding the line-up tone', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)

      expect(sound.hiss).toHaveBeenCalled()
      expect(sound.tone).not.toHaveBeenCalled()
    })

    // The picture controls work on a carrier. There is no carrier here, so
    // there is nothing for them to bring out of the noise.
    it('snows whatever the tuner is doing', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)

      const read = () => parseFloat(glass().style.getPropertyValue('--snow'))
      expect(read()).toBe(1)
    })

    it('gives the station back when you tune back to it', async () => {
      const { sound, view } = setUp(SMALL_HOURS)
      await switchOn(view.user)
      await waitFor(() => expect(screen.getByRole('timer')).toBeInTheDocument())

      await tuneTo(view.user, EMPTY_PRESET)
      expect(screen.queryByRole('timer')).toBeNull()

      await tuneTo(view.user, 1)
      expect(screen.getByRole('timer')).toBeInTheDocument()
      expect(snowing()).toBe('false')
      expect(sound.tone).toHaveBeenCalled()
    })

    // Snow is drawn by the beam, and a set that is off has no beam.
    it('is dark, not snowy, with the set switched off', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)
      await view.user.click(screen.getByRole('button', { name: 'Power' }))

      await waitFor(() => expect(glass()).toHaveAttribute('data-phase', 'off'), { timeout: 3000 })
      expect(snowing()).toBe('false')
    })

    it('goes quiet with the set switched off', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)
      sound.stop.mockClear()

      await view.user.click(screen.getByRole('button', { name: 'Power' }))

      expect(sound.stop).toHaveBeenCalled()
    })

    // The listings are the paper. The paper does not know which preset the
    // knob was left on.
    it('still prints the listings', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)
      await view.user.click(await programmed())

      const page = await screen.findByRole('dialog', { name: /listings/i })
      expect(within(page).getByRole('heading', { name: CHANNEL })).toBeInTheDocument()
      expect(page.querySelectorAll('[data-tuned="true"]')).toHaveLength(0)
    })
  })

  /*
    Each preset had its own tuning slug behind the flap, set once by whoever
    installed the set. The ones nobody watched were set carelessly, so finding
    them again means turning the knob — which is the difference between a
    station nobody has tuned in and a key with nothing behind it at all.
  */
  describe('a preset that was never set properly', () => {
    const tuner = () => screen.getByRole('slider', { name: /tuning/i })
    const snow = () => parseFloat(glass().style.getPropertyValue('--snow'))

    it('comes up as snow', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, MISTUNED_PRESET)

      expect(snowing()).toBe('true')
    })

    it('comes in as the tuner reaches it', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, MISTUNED_PRESET)
      const before = snow()

      tuner().focus()
      await view.user.keyboard('{ArrowDown}{ArrowDown}')

      expect(snow()).toBeLessThan(before)
    })

    it('holds a picture once the tuner is on it', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, MISTUNED_PRESET)

      tuner().focus()
      // Down the travel to where this preset's carrier actually sits. The
      // trimmers move in fine steps, which is why this takes a while by hand.
      for (let step = 0; step < 9; step++) await view.user.keyboard('{ArrowDown}')

      expect(snowing()).toBe('false')
      await waitFor(() => expect(screen.getByRole('timer')).toBeInTheDocument())
    })

    // Nothing was ever allocated to the sixth key. No amount of tuning finds
    // anything, because there is nothing there to find.
    it('is not the same thing as a preset with nothing behind it', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, EMPTY_PRESET)

      tuner().focus()
      for (let step = 0; step < 20; step++) await view.user.keyboard('{ArrowDown}')

      expect(snow()).toBe(1)
    })
  })

  describe('the five stations', () => {
    it('puts a different station on every preset', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      const seen = new Set<string>()

      for (const preset of [1, 2, 3]) {
        await tuneTo(view.user, preset)
        await waitFor(() => expect(glass().textContent ?? '').toMatch(/\S/))
        seen.add(glass().textContent ?? '')
      }

      expect(seen.size).toBe(3)
    })

    it('names the station the set is tuned to', async () => {
      const { view } = setUp()
      await switchOn(view.user)
      await tuneTo(view.user, 2)

      expect(screen.getByRole('region', { name: /channel two — television/i })).toBeInTheDocument()
    })

    // Preset one is the one whoever mounted the set gave a name to.
    it('keeps the name it was given for the first preset', async () => {
      const { view } = setUp()
      await switchOn(view.user)

      expect(screen.getByRole('region', { name: new RegExp(`${CHANNEL} — television`, 'i') }))
        .toBeInTheDocument()
    })
  })

  describe('the way out to the source', () => {
    it('is in the corner opposite the paper', () => {
      setUp()

      expect(screen.getByRole('link', { name: /source on github/i })).toHaveAttribute(
        'href',
        'https://github.com/example/telly',
      )
    })

    // The listings put their own close button in this exact spot.
    it('stands down while the paper is up', async () => {
      const { view } = setUp()
      await view.user.click(screen.getByRole('button', { name: /telly guide/i }))

      await screen.findByRole('dialog', { name: /listings/i })
      expect(screen.queryByRole('link', { name: /source on github/i })).toBeNull()
    })

    it('is absent when nobody says where the source is', () => {
      render(
        <Channel channelName={CHANNEL} clock={new FakeClock(AFTERNOON)} poolSource={new FixturePoolSource()} />,
      )

      expect(screen.queryByRole('link', { name: /source on github/i })).toBeNull()
    })
  })

  /*
    A site has to make its terms and its privacy policy reachable from the page
    itself, so these are not decoration and they are not conditional.
  */
  describe('the footer on the carpet', () => {
    it('links the privacy policy and the terms', () => {
      setUp()

      const privacy = screen.getByRole('link', { name: /privacy/i })
      const terms = screen.getByRole('link', { name: /terms/i })
      expect(privacy).toHaveAttribute('href', 'privacy/index.html')
      expect(terms).toHaveAttribute('href', 'terms/index.html')
    })

    /*
      The one assertion here that is about the pages rather than the markup.

      jsdom does not follow links, so an href pointing at nothing renders
      exactly like one that works — and it did, for a while: `privacy/` asks
      the server for a directory, the dev server has no index for it, and the
      request falls through to the single-page fallback, which answers with
      the television at an address that is not the television. Naming the file
      resolves on every server; matching the href against the files that are
      really in `public/` is what keeps it named.
    */
    it('points at pages that are actually there', () => {
      setUp()

      // Vite globs the directory at transform time, so the keys are the
      // files that are really there. Lazy: we want the names, not the pages.
      const pages = Object.keys(import.meta.glob('../../public/**/*.html'))

      for (const name of [/privacy/i, /terms/i]) {
        const href = screen.getByRole('link', { name }).getAttribute('href') ?? ''
        const found = pages.includes(`../../public/${href}`)
        expect({ href, found }).toEqual({ href, found: true })
      }
    })

    // Relative, or they break the moment the app is served under a path
    // rather than at a domain root.
    it('points at them relatively', () => {
      setUp()

      for (const link of screen.getAllByRole('link')) {
        expect(link.getAttribute('href')).not.toMatch(/^\//)
      }
    })

    it('is there with the set off, and with it on', async () => {
      const { view } = setUp()
      expect(screen.getByRole('link', { name: /privacy/i })).toBeInTheDocument()

      await switchOn(view.user)
      expect(screen.getByRole('link', { name: /privacy/i })).toBeInTheDocument()
    })

    // The row it shares used to render only when there was a fault. It now
    // always renders, and the fault joins it rather than replacing it.
    it('keeps the links when a fault is showing', async () => {
      const failing: PoolSource = {
        load: async () => {
          throw new YouTubeApiError(403, 'quotaExceeded', 'youtube videos failed: 403')
        },
      }
      const { view } = setUp(AFTERNOON, failing)
      await switchOn(view.user)

      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/allowance/i))
      expect(screen.getByRole('link', { name: /privacy/i })).toBeInTheDocument()
    })
  })

  it('carries the volume through to the player', async () => {
    const { player, view } = setUp()
    await switchOn(view.user)
    await waitFor(() => expect(player.volumes.length).toBeGreaterThan(0))
    expect(player.volumes.at(-1)).toBeCloseTo(0.8)
  })

  describe('what goes with the picture, and what the card says', () => {
    /** Channel one's day, planned the way the set plans it for `now`. */
    async function dayOf(now: Date) {
      const pool = await new FixturePoolSource().load()
      const dayStart = broadcastDayStart(now)
      return { pool, schedule: planStations(pool, { dayStart }).schedules.get(1)! }
    }

    /** A second into the first item of the day that `test` picks. */
    const momentOf = (schedule: Schedule, test: (item: ScheduleItem) => boolean) => {
      const item = schedule.items.find(test)
      return item && new Date(schedule.startsAt.getTime() + (item.startSec + 1) * 1000)
    }

    const filler = (variant: 'interlude' | 'ident') => (item: ScheduleItem) =>
      item.content.kind === 'filler' && item.content.variant === variant

    it('says when normal service will resume at closedown', async () => {
      const { view } = setUp(SMALL_HOURS)
      await switchOn(view.user)
      await programmed()

      expect(glass()).toHaveTextContent('NORMAL SERVICE WILL RESUME AT 06.00')
    })

    it('names a key with no station behind it in words', async () => {
      const { view } = setUp()
      await switchOn(view.user)

      await tuneTo(view.user, EMPTY_PRESET)

      expect(screen.getByRole('region', { name: /CHANNEL SIX/ })).toBeInTheDocument()
    })

    it('lights the fault lamp when the pool will not load', async () => {
      const failing: PoolSource = {
        load: async () => {
          throw new YouTubeApiError(403, 'quotaExceeded', 'youtube videos failed: 403')
        },
      }
      const { view } = setUp(AFTERNOON, failing)
      await switchOn(view.user)
      await screen.findByRole('alert')

      expect(document.querySelector('.tv-fascia__lamp--tune')).toHaveAttribute('data-lit', 'true')
    })

    it('leaves nothing playing when the set is taken away', async () => {
      const { sound, view } = setUp(SMALL_HOURS)
      await switchOn(view.user)
      await waitFor(() => expect(sound.tone).toHaveBeenCalled())
      const stops = sound.stop.mock.calls.length

      view.unmount()

      expect(sound.stop.mock.calls.length).toBeGreaterThan(stops)
    })

    it('rolls on to the new day at six in the morning', async () => {
      const { clock, player, view } = setUp(new Date(2026, 8, 10, 5, 30, 0))
      await switchOn(view.user)
      await programmed()
      expect(player.loads).toHaveLength(0)

      act(() => clock.set(new Date(2026, 8, 10, 6, 30, 0)))

      await waitFor(() => expect(player.loads).toHaveLength(1))
    })

    // The power click is the one gesture a browser accepts for audio, and
    // closedown is hours after it.
    it('opens the sound from the power switch, and stops the picture with it', async () => {
      const { player, sound, view } = setUp()
      expect(sound.prepare).not.toHaveBeenCalled()

      await switchOn(view.user)
      expect(sound.prepare).toHaveBeenCalledOnce()

      const stops = player.stops
      await switchOn(view.user) // and off again
      expect(player.stops).toBeGreaterThan(stops)
    })

    it('turns the sound with the volume knob', async () => {
      const { sound, view } = setUp()

      screen.getByRole('slider', { name: /volume/i }).focus()
      await view.user.keyboard('{ArrowUp}')

      expect(sound.setLevel.mock.calls.at(-1)?.[0]).toBeCloseTo(0.85)
    })

    it('sounds the tone at closedown, and not over an interlude or an ident', async () => {
      const { schedule } = await dayOf(AFTERNOON)
      for (const variant of ['interlude', 'ident'] as const) {
        const at = momentOf(schedule, filler(variant))
        expect(at, variant).toBeDefined()
        const { sound, view } = setUp(at)
        await switchOn(view.user)
        await programmed()
        await settle()

        expect(sound.tone, variant).not.toHaveBeenCalled()
        view.unmount()
      }
    })

    it('keeps quiet at closedown while the set is off', async () => {
      const { sound, view } = setUp(SMALL_HOURS)

      await view.user.click(screen.getByRole('button', { name: /telly guide/i }))
      await screen.findByRole('heading', { name: CHANNEL })
      await settle()

      expect(sound.tone).not.toHaveBeenCalled()
    })

    // A fault is the set saying it cannot provide a service. Nobody
    // transmitted that, so nothing goes out with it.
    it('sounds no tone over a fault', async () => {
      const sound = createFakeSound()
      const view = render(
        <Channel
          channelName={CHANNEL}
          clock={new FakeClock(SMALL_HOURS)}
          poolSource={new FixturePoolSource()}
          player={new FakePlayer()}
          sound={sound}
          fault={{ code: 'Fault 01', detail: ['This receiver is broken.'] }}
        />,
      )

      await switchOn(view.user)
      await programmed()
      await settle()

      expect(sound.tone).not.toHaveBeenCalled()
    })

    it('hisses on a station the tuner is not on', async () => {
      const { sound, view } = setUp()
      await switchOn(view.user)

      await tuneTo(view.user, MISTUNED_PRESET)

      await waitFor(() => expect(sound.hiss).toHaveBeenCalled())
    })

    it('raises no alert over subscriptions that have videos in them', async () => {
      const { player, view } = setUp()
      await switchOn(view.user)

      await waitFor(() => expect(player.loads).toHaveLength(1))

      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('says programmes will continue over an interlude, and not at closedown', async () => {
      const { schedule } = await dayOf(AFTERNOON)
      const interlude = setUp(momentOf(schedule, filler('interlude')))
      await switchOn(interlude.view.user)
      await programmed()
      expect(glass()).toHaveTextContent('PROGRAMMES WILL CONTINUE SHORTLY')
      interlude.view.unmount()

      const closedown = setUp(SMALL_HOURS)
      await switchOn(closedown.view.user)
      await programmed()
      expect(glass()).not.toHaveTextContent('PROGRAMMES WILL CONTINUE SHORTLY')
    })

    it('captions the card under a programme with its title, in capitals', async () => {
      const { pool } = await dayOf(AFTERNOON)
      const { player, view } = setUp()
      await switchOn(view.user)

      await waitFor(() => expect(player.loads).toHaveLength(1))

      const title = pool.videos.find((video) => video.id === player.loads[0].videoId)!.title
      expect(title).not.toBe(title.toUpperCase())
      expect(glass()).toHaveTextContent(title.toUpperCase())
    })

    // A video that would not play yesterday gets another chance today.
    it('forgives yesterday\'s faults on a new day', async () => {
      const today = await dayOf(AFTERNOON)
      const tomorrow = await dayOf(new Date(2026, 8, 10, 12, 0, 0))
      const videoOf = (item: ScheduleItem) =>
        item.content.kind === 'programme' ? item.content.videoId : undefined
      const shownToday = new Set(today.schedule.items.map(videoOf).filter(Boolean))
      const again = tomorrow.schedule.items.find((item) => shownToday.has(videoOf(item)))
      expect(again).toBeDefined()
      const videoId = videoOf(again!)!
      const { clock, player, view } = setUp(
        momentOf(today.schedule, (item) => videoOf(item) === videoId),
      )
      await switchOn(view.user)
      await waitFor(() => expect(player.loads).toHaveLength(1))
      act(() => player.fault({ videoId, code: 150, reason: 'not embeddable' }))
      await waitFor(() => expect(glass()).toHaveTextContent(/NORMAL SERVICE WILL BE RESUMED/))

      act(() => clock.set(momentOf(tomorrow.schedule, (item) => item === again)!))

      await waitFor(() => expect(player.loads.at(-1)?.videoId).toBe(videoId))
      expect(glass()).not.toHaveTextContent(/NORMAL SERVICE WILL BE RESUMED/)
    })
  })
})
