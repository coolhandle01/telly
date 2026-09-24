import { describe, expect, it } from 'vitest'
import { Channel } from './Channel'
import { act, render, screen, waitFor, within } from '../test/render'
import { FakeClock } from '../test/fakeClock'
import { FakePlayer } from '../player/fakePlayer'
import { FixturePoolSource, SignInError, YouTubeApiError } from '../library'
import type { PoolSource, Session } from '../library'
import { createFakeSound } from '../test/fakeAudio'

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

    // The card is up before the schedule is: it is the channel's base state,
    // and the tone follows the schedule rather than the picture.
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
    await view.user.click(screen.getByRole('button', { name: /telly guide/i }))

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

    await view.user.click(screen.getByRole('button', { name: /telly guide/i }))
    const page = await screen.findByRole('dialog', { name: /listings/i })

    await view.user.click(within(page).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog', { name: /listings/i })).toBeNull()
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

    // A refresh is not a sign-out. Google's token model takes a token at page
    // load, and taking one up is what keeps a returning viewer signed in.
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

    // Nothing was clicked: the token's hour ran out. The corner has to follow
    // it, or the set offers a way out of a session that has already ended.
    it('follows the session when the token expires on its own', async () => {
      const { session, announce } = fakeSession({ resume: async () => true })
      render_(session)
      await waitFor(() => expect(signOutButton()).toBeInTheDocument())

      act(() => announce(false))

      await waitFor(() => expect(signInButton()).toBeInTheDocument())
    })

    it('says the programmes are samples while nobody is signed in', async () => {
      const view = render_(fakeSession().session)
      await waitFor(() => expect(signInButton()).toBeInTheDocument())

      await view.user.click(screen.getByRole('button', { name: /telly guide/i }))

      const page = await screen.findByRole('dialog', { name: /listings/i })
      await waitFor(() =>
        expect(within(page).getByRole('status')).toHaveTextContent(/sample programmes/i),
      )
    })

    // The signed-out set runs on the fixture, so switching it on shows
    // television rather than the failure of a request with no token behind it.
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

      expect(screen.queryByRole('img', { name: /^CH/ })).toBeNull()
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
    Five of the six presets have nothing on them. That is not the same thing as
    a station with nothing to broadcast — which is what a test card is for — and
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
      await view.user.click(screen.getByRole('button', { name: /telly guide/i }))

      const page = await screen.findByRole('dialog', { name: /listings/i })
      expect(within(page).getByRole('heading', { name: CHANNEL })).toBeInTheDocument()
      // No column is ringed, because the set is not tuned to one.
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
})
