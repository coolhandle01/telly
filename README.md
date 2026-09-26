# telly

Your YouTube subscriptions, broadcast as five television channels with their
own schedules. You don't pick what to watch — you switch it on, press a preset,
and see what's on. When nothing is on, you get the test card.

![The set at closedown, showing the colour bars test card](docs/set-closedown.png)

## Running it

Needs **Node 20.19+ or 22.12+** (a Vite requirement); `.nvmrc` pins 24. Distro
packages are often still on Node 18, which is below the floor: take the LTS
from [nodejs.org/en/download](https://nodejs.org/en/download) instead.

```bash
npm install
npm run dev        # then press POWER
```

**It needs a client ID to schedule anything.** Without one the set shows the
no-service-configuration fault card. The tests run on a deterministic fixture
pool in `test/support/`, offline and with no credentials.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full script list and how the code
is arranged, and [docs/](docs/) for how it works and why — [architecture](docs/architecture/)
for the build, [research](docs/research/) for the period detail behind the set.

## Connecting your own subscriptions

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services
   → Library → YouTube Data API v3 → Enable**.
2. **OAuth consent screen** → External. Add yourself under **Test users** —
   without that you get a 403 telling you to contact the developer, who is you.
3. **Credentials → Create credentials → OAuth client ID → Web application**,
   with `http://localhost:5173` as an authorised JavaScript origin. No redirect
   URI; the token client uses a popup.
4. `cp .env.example .env.local`, paste the **client ID** only, and **restart the
   dev server** — env files are read at startup.

A **Sign in with Google** button then appears. Until it does, the set shows the
fault card: `.env.local` is deliberately not in the repository, so a fresh
clone on a second machine has no client ID and therefore nothing to sign in to.

**Sign out** hands the grant back to
Google and empties the schedule data this browser saved.

Security posture, and what is stored where, is in [SECURITY.md](SECURITY.md).

## Five channels

Six keys on the fascia and five broadcasters behind them, each with its own
taste, its own hours and its own test cards.

| | Hours | What it is |
|---|---|---|
| One | 06.00–01.30 | The national service. News on the hour, children's television after school. |
| Two | 11.00–02.00 | Serious, but not solemn. Documentaries, arts, and Thursday night is comedy night. |
| Three | 06.00–02.30 | Popular television. Sport, lifestyle, and Saturday variety. |
| Four | 15.00–03.00 | The alternative. Film, arts, and satire on a Friday. |
| Five | round the clock | Never closes. The small hours are a clip show. |

Your subscriptions are divided between them and belong to one each, so tuning
around means something. Which one a channel goes to comes from what YouTube
says it is about; when it goes out comes from how long its videos run, how
often it posts and how well watched it is.

Two of the presets were tuned in carelessly by whoever installed the set, so
they come up as snow until you turn the tuner. Preset six has nothing on it at
all.

Press **Telly Guide** for the listings, which print all five. The first time,
that button counts, `Programming 46%`, because there is nothing to print
until your subscriptions are in and five days have been planned off them. A set
switched on while that is happening holds the station's ident, which is what a
station with nothing to hand out yet put up.

## Terms and privacy

The [privacy policy](https://telly.na-n.xyz/privacy/) and the
[terms](https://telly.na-n.xyz/terms/) are served with the site.

## Licence

MIT. See [LICENSE](LICENSE). That covers the code; the terms above cover using
the site.
