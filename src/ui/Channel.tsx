import { startTransition, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { SystemClock, type Clock } from '../clock/clock'
import { broadcastDayStart, type Pool } from '../domain'
import { FixturePoolSource, type PoolSource, type Session } from '../library'
import { PlayerSurface, type Player, type PlayerFault } from '../player'
import { opensAt, planStations, stationById, STATIONS, type Listings } from '../programming'
import type { PlanOptions } from '../schedule/plan'
import { TestCard } from '../testcard/TestCard'
import { nextServiceResume } from '../testcard/serviceResume'
import { DEFAULT_TONE_HZ, type Sound } from '../audio/sound'
import { Caption } from './Caption'
import { GoogleSignInButton } from './GoogleSignInButton'
import { Guide, type GuidePage } from './Guide'
import { SourceLink } from './SourceLink'
import { Ident } from './Ident'
import { Room } from './Room'
import { Screen } from './Screen'
import { deflection } from './deflection'
import { NO_SIGNAL, picture } from './picture'
import { faultMessage, signInMessage, signOutMessage } from './faultMessage'
import { CENTRE } from './trim'
import {
  Cabinet,
  ChannelOverlay,
  ControlPanel,
  VolumeOverlay,
  useTransientFlag,
  type TrimmerId,
} from './controls'
import { useOnAir } from './useOnAir'
import { useCrtPower } from './useCrtPower'

export interface ChannelProps {
  /** The station on preset one, as the set's own label for it. */
  channelName: string
  clock?: Clock
  poolSource?: PoolSource
  player?: Player
  /** The element the player draws into. Omit and the picture is a blank frame. */
  playerHost?: HTMLElement
  sound?: Sound
  /** Must be stable across renders — it feeds a memo that must not churn. */
  planOptions?: Partial<PlanOptions>
  /**
   * The viewer's Google session. Present only when a client ID is configured;
   * absent means the channel runs on the fixture pool and there is nothing to
   * sign in to.
   *
   * Must be stable across renders: it feeds a subscription and a page-load
   * effect, and a fresh object each paint would re-run both.
   */
  session?: Session
  /**
   * A fault in the set itself, rather than in what is on.
   *
   * When one is handed over the screen shows the fault card and nothing else:
   * this is the station announcing it cannot provide a service, and it is not
   * a programme, so it does not take its turn between them. The viewer cannot
   * act on it and is not asked to — it exists to tell whoever deployed this
   * that they have deployed it wrong.
   */
  fault?: { code: string; detail: readonly string[] }
  /** Where the source lives. Absent and the corner stays empty. */
  sourceUrl?: string
}



const defaultClock = new SystemClock()
const NO_FAULTS: ReadonlySet<string> = new Set()

/**
 * How much snow it takes before the sound is noise rather than a programme.
 *
 * A set half off station still shows the picture through the speckle and you
 * can still follow it. Push further and the sound goes before the picture
 * does, which is the point at which nobody is watching it any more.
 */
const HISS_AT = 0.55

/** For the keys with no station behind them, which are still called something. */
const PRESET_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX']

/**
 * Behind a running picture: what the bars are made of.
 *
 * Not pure black. An unlit CRT phosphor is a very dark grey, and the glass in
 * front of it still catches the room — so a letterbox bar on a real set shows
 * the sheen and the shadow mask rather than reading as a hole cut in the
 * screen. Pure black gives the glass nothing to act on: every layer of it
 * darkens, and you cannot darken black.
 */
const blackStyle: CSSProperties = { position: 'absolute', inset: 0, background: '#07090b' }

/**
 * The picture layer, over the card. Hidden rather than unmounted: the player
 * has to stay loaded to have any chance of producing a picture at all.
 */
const pictureStyle = (hasPicture: boolean): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  display: 'grid',
  alignContent: 'center',
  opacity: hasPicture ? 1 : 0,
  pointerEvents: hasPicture ? 'auto' : 'none',
})

/** The caption over the card when there is no schedule to show at all. */
const NO_PROGRAMMES_MESSAGE = 'NO PROGRAMME INFORMATION AVAILABLE'

/** The caption over the card in a gap between programmes. */
const INTERLUDE_MESSAGE = 'PROGRAMMES WILL CONTINUE SHORTLY'

/** The caption over the card when a programme will not play. */
const FAULT_MESSAGE = 'NORMAL SERVICE WILL BE RESUMED AS SOON AS POSSIBLE'

/**
 * What the paper says while the set is running on the demo pool.
 *
 * These programmes are real videos and they schedule like any others, so
 * nothing on the screen would tell you whose they are. The listings say.
 */
const DEMO_POOL_NOTICE = 'Sample programmes. Sign in to see your own subscriptions.'

export function Channel({
  channelName,
  clock = defaultClock,
  poolSource,
  player,
  playerHost,
  sound,
  planOptions,
  session,
  fault,
  sourceUrl,
}: ChannelProps) {
  const [on, setOn] = useState(false)
  const [channel, setChannel] = useState(1)
  const [pool, setPool] = useState<Pool>()
  const [volume, setVolume] = useState(0.8)
  // Every trimmer starts where the engineer left it, so a set switched on
  // holds and shows the picture as transmitted. Nothing happens until someone
  // goes looking.
  const [trim, setTrim] = useState<Record<TrimmerId, number>>({
    vertical: CENTRE,
    horizontal: CENTRE,
    brightness: CENTRE,
    colour: CENTRE,
    tuning: CENTRE,
  })
  /*
    Every control makes a noise, and it is the cabinet's noise rather than the
    station's: a detent for a knob, a key going down for a preset or the power
    switch. They are fired from here, where the handlers already are, so the
    drawn controls stay presentational and know nothing about audio.
  */
  const trimmer = (id: TrimmerId) => ({
    value: trim[id],
    onChange: (value: number) => {
      sound?.click()
      setTrim((was) => ({ ...was, [id]: value }))
    },
  })
  const [faults, setFaults] = useState<{ day: number; ids: ReadonlySet<string> }>({
    day: 0,
    ids: NO_FAULTS,
  })
  const [showGuide, setShowGuide] = useState(false)
  const [hasPicture, setHasPicture] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  // Nothing is offered in the corner until a grant this browser already made
  // has had its chance. A button saying Sign in, replaced half a second later
  // by one saying Sign out, is the set telling the viewer two different things.
  const [resuming, setResuming] = useState(() => session !== undefined)
  const [sessionError, setSessionError] = useState<string>()
  const [poolError, setPoolError] = useState<string>()

  // Frozen at mount, so an unstable prop object cannot churn the plan memo:
  // `plan` is deterministic, so a fresh-but-equal Schedule every render would
  // re-trigger the tuner effect and spin for ever.
  const [planOptionsAtMount] = useState(() => planOptions)

  // The session outlives any click on it: the token's hour runs out on its own
  // and the corner has to follow, or the set offers a way out of a session
  // that ended without it.
  useEffect(() => session?.subscribe(setSignedIn), [session])

  // Google's token model takes a token at page load as well as from a gesture,
  // and that is what carries a viewer across a refresh.
  useEffect(() => {
    if (!session) return
    let live = true
    session.resume().then(
      (resumed) => {
        if (!live) return
        setSignedIn(resumed)
        setResuming(false)
      },
      () => {
        if (live) setResuming(false)
      },
    )
    return () => {
      live = false
    }
  }, [session])

  const [signingOut, setSigningOut] = useState(false)

  /*
    Signing out is two things and the viewer is told if either fails.

    The grant goes back to Google and the saved copy of the subscriptions goes
    out of this browser. A sign-out that only did the first would leave a
    day-old list of someone's subscriptions on a machine they have just
    finished using, so a failure here is reported rather than swallowed.
  */
  const onSignOut = () => {
    if (!session || signingOut) return
    setSigningOut(true)
    setSessionError(undefined)

    session
      .signOut()
      // Which half failed decides what the viewer has left to do, so the
      // sentence is chosen from the failure rather than assumed.
      .catch((error: unknown) => {
        setSessionError(signOutMessage(error))
      })
      .finally(() => {
        setSigningOut(false)
        setSignedIn(false)
        // The previous session's programmes come off the screen with it.
        setPool(undefined)
        setPoolError(undefined)
      })
  }

  const demoSource = useMemo(() => new FixturePoolSource(), [])
  /*
    Signed out with a service configured, the set runs on the demo pool.

    The alternative is a request with no token behind it, which fails, and a
    first-time viewer switching the set on is shown a failure rather than
    television. The paper says whose programmes these are.
  */
  const onDemoPool = session !== undefined && !signedIn
  const source = useMemo(
    () => (onDemoPool ? demoSource : (poolSource ?? demoSource)),
    [onDemoPool, poolSource, demoSource],
  )

  /** Which broadcast day we are in. Changing it is what rolls the schedule. */
  const [dayStartMs, setDayStartMs] = useState(() => broadcastDayStart(clock.now()).getTime())
  useEffect(
    () =>
      clock.subscribe((now) => {
        const next = broadcastDayStart(now).getTime()
        setDayStartMs((prev) => (prev === next ? prev : next))
      }),
    [clock],
  )

  // The pool is fetched once the set is switched on, or once someone picks up
  // the paper — never at import time, so the app costs nothing until someone
  // actually wants television. The listings matter with the set *off*: that is
  // when you look at them, to decide whether to switch it on.
  useEffect(() => {
    if (!on && !showGuide) return
    let live = true
    source
      .load()
      .then((loaded) => {
        if (!live) return
        /*
          A transition, because taking delivery of the pool is not the urgent
          part of taking delivery of the pool.

          Planning five broadcast days is a couple of hundred milliseconds of
          arithmetic in a render, and a source that resolves without touching
          the network resolves in a microtask — so without this the click that
          opened the listings, the pool arriving, and all five days being
          planned land in one task, and the browser paints none of it until the
          end. The page is there the whole time and nobody can see it.
        */
        startTransition(() => {
          setPool(loaded)
          // A pool with nothing schedulable is not an error, but it is not
          // television either, and it looks exactly like a failure from the sofa.
          setPoolError(
            loaded.videos.length === 0 ? 'No videos found in your subscriptions' : undefined,
          )
        })
      })
      // No pool is not a crash — the card is the honest screen for having
      // nothing to broadcast. But it must not be the *silent* screen: an
      // unexplained card is indistinguishable from a broken app. What is said
      // is the station's own words; the Error carries the endpoint, the status
      // and Google's wording, and none of that belongs on a screen.
      .catch((error: unknown) => {
        if (!live) return
        setPool(undefined)
        setPoolError(faultMessage(error))
      })
    return () => {
      live = false
    }
  }, [on, showGuide, source])

  /*
    All five stations, planned together and in one go.

    The listings are the paper: it prints the whole evening on every channel
    whether or not the set is tuned to any of them, and the stations have to be
    divided up before any one of them can be planned anyway. So they are done
    together, and the preset only decides which of the five is on the screen.
  */
  const listings: Listings | undefined = useMemo(() => {
    if (!pool) return undefined
    try {
      return planStations(pool, { ...planOptionsAtMount, dayStart: new Date(dayStartMs) })
    } catch {
      // This runs in a render, so a throw here reaches the root boundary and
      // the whole receiver goes to a fault card that never clears. A day that
      // cannot be planned is one day; the set stays on and shows the card,
      // and tomorrow is planned from tomorrow's pool.
      return undefined
    }
  }, [pool, dayStartMs, planOptionsAtMount])

  /** A pool arrived and no day could be built out of it. */
  const unplannable = pool !== undefined && listings === undefined

  const station = stationById(channel)
  const schedule = station ? listings?.schedules.get(station.id) : undefined

  /*
    The paper, which prints every channel whether or not the set is tuned to
    one. Preset one is the station whoever mounted the set gave a name to; the
    rest go under their own.
  */
  const pages: GuidePage[] = useMemo(() => {
    if (listings === undefined) return []
    return STATIONS.flatMap((entry) => {
      const schedule = listings.schedules.get(entry.id)
      if (schedule === undefined) return []
      return [{ station: entry, schedule, name: entry.id === 1 ? channelName : entry.name }]
    })
  }, [listings, channelName])

  const onAir = useOnAir(schedule, clock)

  /*
    What comes out of the speaker, at the set's own volume.

    The tone used to be a button on the screen, which a television has never
    had. It came with the card and you turned it down with the volume knob
    like everything else. And it follows what is on the screen rather than what
    is in the schedule: two channels showing the same thing must sound the
    same, or the set is lying about one of them.

    A fault is the set announcing it cannot provide a service. Nobody
    transmitted that, so nothing goes with it.
  */
  const atClosedown = onAir?.kind === 'filler' && onAir.variant === 'closedown'
  /*
    What the tuner is making of this preset.

    Six keys and five stations, and each station sits where its own tuning slug
    was left: the two nobody watched were set carelessly, so pressing them gets
    snow until the knob is turned. Preset six was never allocated at all, and
    no setting of the tuner will find anything on it.
  */
  const tuned = picture(trim.brightness, trim.colour, trim.tuning, station?.stationAt)
  const carrier = station !== undefined
  const hissing = on && !fault && (!carrier || tuned.snow >= HISS_AT)
  const toning = on && !fault && !hissing && atClosedown

  useEffect(() => {
    if (!sound) return
    if (hissing) sound.hiss()
    else if (toning) sound.tone(DEFAULT_TONE_HZ)
    else sound.stop()
  }, [sound, hissing, toning])

  // Never leave it playing behind us.
  useEffect(() => () => sound?.stop(), [sound])

  useEffect(() => {
    sound?.setLevel(volume)
  }, [sound, volume])

  useEffect(() => {
    if (!on) player?.stop()
    // Opening the audio context here is the whole reason the sound can play at
    // all: this runs from the click on the power switch, and closedown is
    // hours away from any gesture a browser would accept.
    else sound?.prepare()
  }, [on, player, sound])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'i') setShowGuide((was) => !was)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Stamped with the day that produced them, so a new broadcast day forgives
  // yesterday's faults without an effect having to reset anything.
  const faulted = faults.day === dayStartMs ? faults.ids : NO_FAULTS
  const onFault = (fault: PlayerFault) =>
    setFaults({ day: dayStartMs, ids: new Set(faulted).add(fault.videoId) })

  /*
    Preset one is named by whoever mounted the set; the rest of the stations
    name themselves. A key with nothing behind it is still a key, and it is
    still called something, or a screen reader is handed a set with no name.
  */
  const onScreenName =
    station === undefined
      ? `CHANNEL ${PRESET_WORDS[channel - 1] ?? channel}`
      : station.id === 1
        ? channelName
        : station.name

  // When this station opens up again, which is not six in the morning on one
  // that does not start until the afternoon.
  const resumesAt = useMemo(
    () => nextServiceResume(new Date(dayStartMs), station ? opensAt(station) : undefined),
    [dayStartMs, station],
  )

  // The on-screen displays, as the set did them: shown for a moment when
  // something moves, then gone again.
  const showVolume = useTransientFlag(volume)
  const showChannel = useTransientFlag(channel)

  // The tube's own state. The picture must stay mounted while it collapses,
  // or there would be nothing left to collapse.
  const phase = useCrtPower(on)
  const lit = phase !== 'off'

  // An empty preset is snow, and it is snow whatever the picture controls are
  // set to: there is no carrier for them to work on. A fault card is the set
  // talking to whoever deployed it, so it is not buried under noise. And a set
  // that is off shows nothing at all — not even the tuner's own snow, which is
  // made by a beam that is no longer lit.
  const noSignal = !fault && !carrier
  const shown = !lit
    ? undefined
    : station === undefined
      ? // Nothing was ever allocated to this key. No carrier at any setting of
        // the tuner, so nothing the viewer does will bring a picture out of it.
        NO_SIGNAL
      : tuned

  return (
    // The set and the things beside it are the page, so they are `main`. Not
    // decoration: without a landmark there is nothing for a screen-reader user
    // to skip to, and everything on the page sits outside every region.
    <main className="set">
      {/*
        Everything that is not the television, in the corner of the room where
        it belongs — the set had no button for signing in to anything and no
        on-screen guide, so neither of these is on it. Out of the flow
        entirely, which is the point: they cost the set no height at all, and
        the set is the thing you came for.
      */}
      <div className="set__corner">
        {!session || resuming ? null : signedIn ? (
          /*
            No Google mark on this one. Google's branding guidelines cover the
            button that starts the consent flow; every other use of the marks
            needs written permission, so the way out is the set's own control.
          */
          <button
            type="button"
            className="sign-out"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        ) : (
          <GoogleSignInButton
            onClick={() => {
              setSessionError(undefined)
              // Straight from the click: an await here would lose the user
              // gesture and the consent popup would be blocked.
              session.signIn().then(
                () => setSignedIn(true),
                // The reason decides the sentence. Google's own wording is for
                // whoever is holding the Error.
                (error: unknown) => setSessionError(signInMessage(error)),
              )
            }}
          />
        )}
        <button
          type="button"
          className="guide-toggle"
          onClick={() => setShowGuide((was) => !was)}
          aria-pressed={showGuide}
        >
          Telly Guide
        </button>
      </div>

      {/*
        The other corner: the way out of the room.

        Gone while the paper is up, which the corner opposite is not. The
        listings put their own close button in this exact spot, and two
        controls stacked on top of each other reads as a mistake even when the
        one behind is dimmed by the scrim — everything else back there merely
        looks like the page you came from.
      */}
      {sourceUrl && !showGuide ? (
        <div className="set__source">
          <SourceLink href={sourceUrl} />
        </div>
      ) : null}

      <div className="set__stage">
        <Room />

        {/*
          Always, once it is asked for. A page with nothing on it yet still
          says so, which is the difference between listings being worked out
          and a button that does nothing.
        */}
        {showGuide ? (
          <Guide
            pages={pages}
            day={new Date(dayStartMs)}
            now={clock.now()}
            tunedTo={station?.id}
            notice={poolError ?? (onDemoPool ? DEMO_POOL_NOTICE : undefined)}
            onClose={() => setShowGuide(false)}
          />
        ) : null}

      <Cabinet
      controls={
        <ControlPanel
          on={on}
          onToggleOn={() => {
            sound?.clunk()
            setOn((was) => !was)
          }}
          volume={volume}
          onVolumeChange={(next) => {
            sound?.click()
            setVolume(next)
          }}
          channel={channel}
          onChannelChange={(next) => {
            sound?.clunk()
            setChannel(next)
          }}
          signedIn={signedIn}
          trimmers={{
            vertical: trimmer('vertical'),
            horizontal: trimmer('horizontal'),
            brightness: trimmer('brightness'),
            colour: trimmer('colour'),
            tuning: trimmer('tuning'),
          }}
          faulted={Boolean(sessionError ?? poolError)}
        />
      }
    >
      <Screen
        label={`${onScreenName} — television`}
        phase={phase}
        deflection={deflection(trim.vertical, trim.horizontal)}
        picture={shown}
        overlay={
          /*
            Both displays can be up at once — a set that had two generators did
            not make them take turns — and neither belongs to the signal, so
            they read over snow as well as over a picture.
          */
          lit ? (
            <>
              {showChannel ? <ChannelOverlay channel={channel} /> : null}
              {showVolume ? <VolumeOverlay volume={volume} /> : null}
            </>
          ) : undefined
        }
      >
        {/*
          A set that is off shows nothing. Not a caption saying so: there is
          nobody to read it, because the only thing a dark screen can tell you
          is the one thing you can already see.
        */}
        {!lit ? null : fault ? (
          /*
            A fault takes the screen. Not a caption over the programmes and
            not a line of text under the cabinet: the set cannot provide a
            service, so it says so where a station says things, and nothing
            else is on.
          */
          <TestCard
            variant="closedown"
            design="fault"
            channelName={onScreenName}
            clock={clock}
            faultCode={fault.code}
            faultDetail={fault.detail}
          />
        ) : noSignal ? (
          /*
            Nothing. The snow over this is the whole of what an empty preset
            shows — there is no station behind it to put a card up.
          */
          null
        ) : !onAir ? (
          <>
            <TestCard
              variant="closedown"
              channelName={onScreenName}
              clock={clock}
              rotation={station?.cards}
              resumesAt={resumesAt}
              message={poolError !== undefined || unplannable ? NO_PROGRAMMES_MESSAGE : undefined}
            />
          </>
        ) : onAir.kind === 'programme' ? (
          <>
            {/*
              The card is the default state of the channel, not its error
              state: it sits underneath every programme and the picture is
              revealed over it only once the player reports one. A programme
              that fails in a way nobody predicted — no error event, a silent
              iframe, a blocked script — therefore leaves a card up rather
              than a blank screen, because nothing had to go right for the
              card to be there.
            */}
            {hasPicture ? (
              // Once there is a picture, what sits behind it is black — so a
              // 16:9 programme in a 4:3 set gets proper black bars rather than
              // a test card peering out round the edges.
              <div style={blackStyle} aria-hidden="true" />
            ) : (
              <TestCard
                variant="closedown"
                channelName={onScreenName}
                clock={clock}
                rotation={station?.cards}
                message={faulted.has(onAir.videoId) ? FAULT_MESSAGE : onAir.title.toUpperCase()}
              />
            )}
            {player ? (
              <div style={pictureStyle(hasPicture)}>
                <PlayerSurface
                  onAir={onAir}
                  player={player}
                  host={playerHost}
                  volume={volume}
                  onFault={onFault}
                  onPicture={setHasPicture}
                />
              </div>
            ) : null}
          </>
        ) : onAir.kind === 'continuity' ? (
          <Caption>{onAir.message}</Caption>
        ) : onAir.variant === 'ident' && station ? (
          /*
            The station's own symbol, held for the minute or two it takes to
            bring the next programme up onto the hour.
          */
          <Ident ident={station.ident} name={onScreenName} number={station.id} />
        ) : (
          <>
            <TestCard
              variant="closedown"
              channelName={onScreenName}
              clock={clock}
              rotation={station?.cards}
              resumesAt={resumesAt}
              message={onAir.variant === 'interlude' ? INTERLUDE_MESSAGE : undefined}
            />
          </>
        )}
      </Screen>

      </Cabinet>
      </div>

      {/*
        The carpet, doing a second job.

        A site has to make its terms and its privacy policy reachable from the
        page itself, and the only surface here that is not the television is
        the floor the television is standing on. Written small and warm so it
        reads as part of the room rather than as a bar of browser chrome.

        Not a `contentinfo` landmark: it sits inside `main`, where that role
        does not apply. Moving `main` inward to earn it would mean re-plumbing
        a layout that has cost several subtle paint bugs already, for a
        landmark whose contents are two links in the reading order anyway.
      */}
      <footer className="set__footer">
        {sessionError ?? poolError ? (
          <span className="set__fault" role="alert">
            {sessionError ?? poolError}
          </span>
        ) : null}
        <nav className="set__legal" aria-label="About this site">
          {/*
            Relative, so they resolve under a project path as well as a root,
            and naming the file rather than the directory, so they resolve on
            a host that does not serve directory indexes. `privacy/` is a
            request the dev server answers with the app's own index.html, and
            the telly reappears at an address that is not the telly.
          */}
          <a href="privacy/index.html">Privacy</a>
          <a href="terms/index.html">Terms</a>
        </nav>
      </footer>
    </main>
  )
}
