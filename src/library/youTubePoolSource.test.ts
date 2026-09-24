import { beforeEach, describe, expect, it } from 'vitest'
import { QuotaExceededError, YouTubeApiError } from './errors'
import type { FetchLike, HttpResponseLike } from './http'
import type { AccessTokenProvider } from './tokenProvider'
import { CONCURRENCY, MAX_SUBSCRIPTIONS, RATE_LIMIT_BACKOFF_MS, YouTubePoolSource } from './youTubePoolSource'

/** The four endpoints the source is allowed to touch, keyed by last path segment. */
type Endpoint = 'subscriptions' | 'channels' | 'playlistItems' | 'videos'

interface RecordedCall {
  endpoint: Endpoint
  url: URL
  params: URLSearchParams
  headers: Record<string, string>
}

type Handler = (params: URLSearchParams, callIndex: number) => HttpResponseLike

function json(payload: unknown, status = 200): HttpResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

function apiError(status: number, reason: string): HttpResponseLike {
  return json(
    { error: { code: status, message: `the api said ${reason}`, errors: [{ reason, domain: 'youtube.quota' }] } },
    status,
  )
}

/**
 * A fake transport, not a fake source: the code under test still builds every
 * URL, sets every header and parses every payload. Nothing here reaches a
 * network, and an endpoint with no handler fails loudly rather than hanging.
 */
function fakeYouTube(handlers: Partial<Record<Endpoint, Handler>>): {
  fetch: FetchLike
  calls: RecordedCall[]
  callsTo(endpoint: Endpoint): RecordedCall[]
} {
  const calls: RecordedCall[] = []

  const fetch: FetchLike = async (url, init) => {
    const parsed = new URL(url)
    const endpoint = parsed.pathname.split('/').pop() as Endpoint
    const handler = handlers[endpoint]
    if (!handler) throw new Error(`unstubbed request to ${parsed.pathname}`)

    const seen = calls.filter((call) => call.endpoint === endpoint).length
    calls.push({
      endpoint,
      url: parsed,
      params: parsed.searchParams,
      headers: { ...init.headers },
    })
    return handler(parsed.searchParams, seen)
  }

  return { fetch, calls, callsTo: (endpoint) => calls.filter((call) => call.endpoint === endpoint) }
}

function subscriptionPage(channelIds: readonly string[], nextPageToken?: string): HttpResponseLike {
  return json({
    items: channelIds.map((id) => ({
      snippet: { title: `Channel ${id}`, resourceId: { kind: 'youtube#channel', channelId: id } },
    })),
    ...(nextPageToken ? { nextPageToken } : {}),
  })
}

function channelsPage(channelIds: readonly string[]): HttpResponseLike {
  return json({
    items: channelIds.map((id) => ({
      id,
      contentDetails: { relatedPlaylists: { uploads: `UU${id.slice(2)}` } },
      topicDetails: { topicCategories: ['https://en.wikipedia.org/wiki/Knowledge'] },
      statistics: { subscriberCount: '1234' },
    })),
  })
}

function playlistItemsPage(videoIds: readonly string[], nextPageToken?: string): HttpResponseLike {
  return json({
    items: videoIds.map((id) => ({ contentDetails: { videoId: id, videoPublishedAt: '2026-09-01T00:00:00Z' } })),
    ...(nextPageToken ? { nextPageToken } : {}),
  })
}

interface VideoStub {
  id: string
  channelId?: string
  duration?: string
  embeddable?: boolean
  liveBroadcastContent?: string
  categoryId?: string
  title?: string
  publishedAt?: string
  tags?: readonly string[]
  viewCount?: string
  ytRating?: string
  madeForKids?: boolean
  /** Present on anything that is or was a stream. */
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string }
}

function videosPage(videos: readonly VideoStub[], nextPageToken?: string): HttpResponseLike {
  return json({
    ...(nextPageToken ? { nextPageToken } : {}),
    items: videos.map((video) => ({
      id: video.id,
      contentDetails: {
        duration: video.duration ?? 'PT10M',
        ...(video.ytRating ? { contentRating: { ytRating: video.ytRating } } : {}),
      },
      liveStreamingDetails: video.liveStreamingDetails,
      status: {
        embeddable: video.embeddable ?? true,
        privacyStatus: 'public',
        madeForKids: video.madeForKids ?? false,
      },
      statistics: video.viewCount === undefined ? undefined : { viewCount: video.viewCount },
      snippet: {
        title: video.title ?? `Video ${video.id}`,
        channelId: video.channelId ?? 'UC1',
        publishedAt: video.publishedAt ?? '2026-09-01T00:00:00Z',
        categoryId: video.categoryId,
        tags: video.tags,
        liveBroadcastContent: video.liveBroadcastContent ?? 'none',
      },
    })),
  })
}

const ids = (count: number, prefix: string): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(3, '0')}`)

describe('YouTubePoolSource', () => {
  let tokens: AccessTokenProvider
  let tokensAsked: number

  beforeEach(() => {
    tokensAsked = 0
    tokens = {
      getAccessToken: async () => {
        tokensAsked += 1
        return 'test-access-token'
      },
    }
  })

  it('accepts the platform fetch as its transport', () => {
    const injectable: FetchLike = globalThis.fetch
    expect(typeof injectable).toBe('function')
  })

  describe('the subscription list', () => {
    it('asks for the documented part, mine=true and a full page of 50', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage([]),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      const [call] = callsTo('subscriptions')
      expect(call.params.get('part')).toBe('snippet')
      expect(call.params.get('mine')).toBe('true')
      expect(call.params.get('maxResults')).toBe('50')
      expect(call.params.get('pageToken')).toBeNull()
    })

    it('follows nextPageToken and stops when the last page omits it', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: (_params, call) =>
          call === 0
            ? subscriptionPage(ids(50, 'UC'), 'page-2')
            : call === 1
              ? subscriptionPage(ids(50, 'UD'), 'page-3')
              : subscriptionPage(ids(20, 'UE')),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage([]),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('subscriptions')).toHaveLength(3)
      expect(callsTo('subscriptions')[1].params.get('pageToken')).toBe('page-2')
      expect(callsTo('subscriptions')[2].params.get('pageToken')).toBe('page-3')
      expect(pool.channels.size).toBe(120)
      expect(pool.channels.get('UC000')).toEqual({
        id: 'UC000',
        title: 'Channel UC000',
        topics: ['Knowledge'],
        subscriberCount: 1234,
      })
    })
  })

  describe('batching ids 50 at a time', () => {
    it('turns 120 subscribed channels into 3 channels.list calls, not 120', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: (_params, call) =>
          call === 0
            ? subscriptionPage(ids(50, 'UC'), 'page-2')
            : call === 1
              ? subscriptionPage(ids(50, 'UD'), 'page-3')
              : subscriptionPage(ids(20, 'UE')),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage([]),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      const calls = callsTo('channels')
      expect(calls).toHaveLength(3)
      expect(calls.map((call) => call.params.get('id')!.split(',').length)).toEqual([50, 50, 20])
      // Topics and statistics ride along on a call that was being made anyway.
      // A call costs one unit whatever parts it asks for.
      expect(calls[0].params.get('part')).toBe('contentDetails,topicDetails,statistics')
      // Every subscribed channel is asked about exactly once.
      const asked = calls.flatMap((call) => call.params.get('id')!.split(','))
      expect(new Set(asked).size).toBe(120)
    })

    // Found by a real account: one channel you are still subscribed to gets
    // deleted or goes private, its uploads playlist 404s, and the whole load
    // dies — taking two hundred healthy channels with it.
    it('skips a playlist that has gone, and keeps the rest', async () => {
      const channelIds = ['UC1', 'UC2', 'UC3']
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(channelIds),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: (params) => {
          const playlistId = params.get('playlistId')!
          if (playlistId === 'UU2') return apiError(404, 'playlistNotFound')
          return playlistItemsPage([`${playlistId}-v1`])
        },
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      // It carried on past the dead one rather than stopping at it.
      expect(callsTo('playlistItems')).toHaveLength(3)
      expect(pool.videos.map((video) => video.id).sort()).toEqual(['UU1-v1', 'UU3-v1'])
    })

    it('still fails on a quota error, which is not one channel being odd', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1', 'UC2']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => apiError(403, 'quotaExceeded'),
        videos: () => videosPage([]),
      })

      await expect(new YouTubePoolSource({ fetch, tokens }).load()).rejects.toBeInstanceOf(
        QuotaExceededError,
      )
    })

    // Found on a real account: the per-minute limit bites partway through two
    // hundred playlists, every one after it answers the same way, and the load
    // finishes with a pool the screen reads out as an empty subscription list.
    // The subscriptions were fine. The rate limit was the thing to say.
    // Playlists are fetched CONCURRENCY at a time, so the first wave is already
    // in the air when the first 429 lands. A limit that outlasts the backoff
    // means no playlist is started after it: the first wave, and nothing more.
    it.each(['rateLimitExceeded', 'userRateLimitExceeded'])(
      'abandons the whole load on a 429 %s that outlasts the backoff, rather than emptying the pool',
      async (reason) => {
        const { fetch, callsTo } = fakeYouTube({
          subscriptions: () => subscriptionPage(ids(3 * CONCURRENCY, 'UC')),
          channels: (params) => channelsPage(params.get('id')!.split(',')),
          playlistItems: () => apiError(429, reason),
          videos: () => videosPage([]),
        })

        const load = new YouTubePoolSource({ fetch, tokens, sleep: async () => {} }).load()

        await expect(load).rejects.toBeInstanceOf(QuotaExceededError)
        await expect(load).rejects.toMatchObject({ status: 429, reason })
        const asked = new Set(callsTo('playlistItems').map((call) => call.params.get('playlistId')))
        expect(asked.size).toBe(CONCURRENCY)
      },
    )

    it('abandons the whole load on a 429 that names no reason at all, once it outlasts the backoff', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(ids(3 * CONCURRENCY, 'UC')),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => json({ error: { code: 429, message: 'too many requests' } }, 429),
        videos: () => videosPage([]),
      })

      await expect(
        new YouTubePoolSource({ fetch, tokens, sleep: async () => {} }).load(),
      ).rejects.toMatchObject({ status: 429 })
      const asked = new Set(callsTo('playlistItems').map((call) => call.params.get('playlistId')))
      expect(asked.size).toBe(CONCURRENCY)
    })

    it('still fails when the token is rejected', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => apiError(401, 'authError'),
        videos: () => videosPage([]),
      })

      await expect(new YouTubePoolSource({ fetch, tokens }).load()).rejects.toBeInstanceOf(
        YouTubeApiError,
      )
    })

    it('tells the token provider which token the API refused', async () => {
      const refused: string[] = []
      tokens.reject = (token) => refused.push(token)
      const { fetch } = fakeYouTube({
        subscriptions: () => apiError(401, 'authError'),
      })

      await expect(new YouTubePoolSource({ fetch, tokens }).load()).rejects.toMatchObject({ status: 401 })
      expect(refused).toEqual(['test-access-token'])
    })

    // A 403 is a verdict on the request (quota, or a resource this account may
    // not read), not on the token, which still works for everything else.
    it('keeps the token when the API refuses the request rather than the token', async () => {
      const refused: string[] = []
      tokens.reject = (token) => refused.push(token)
      const { fetch } = fakeYouTube({
        subscriptions: () => apiError(403, 'quotaExceeded'),
      })

      await expect(new YouTubePoolSource({ fetch, tokens }).load()).rejects.toMatchObject({ status: 403 })
      expect(refused).toEqual([])
    })

    it('turns 120 video ids into 3 videos.list calls, not 120', async () => {
      const channelIds = ids(12, 'UC')
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(channelIds),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: (params) => {
          const playlistId = params.get('playlistId')!
          return playlistItemsPage(ids(10, `${playlistId}-v`))
        },
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      const calls = callsTo('videos')
      expect(calls).toHaveLength(3)
      expect(calls.map((call) => call.params.get('id')!.split(',').length)).toEqual([50, 50, 20])
      expect(calls[0].params.get('part')).toBe(
        'contentDetails,status,snippet,statistics,liveStreamingDetails',
      )
      expect(pool.videos).toHaveLength(120)
    })
  })

  describe('the uploads playlists', () => {
    it('asks about a video shared by two playlists only once', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1', 'UC2']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['shared', 'shared']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('videos')[0].params.get('id')).toBe('shared')
      expect(pool.videos.map((video) => video.id)).toEqual(['shared'])
    })

    it('asks each channel uploads playlist for the requested number of recent videos', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1', 'UC2']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage([]),
      })

      await new YouTubePoolSource({ fetch, tokens, videosPerChannel: 15 }).load()

      const calls = callsTo('playlistItems')
      expect(calls).toHaveLength(2)
      expect(calls.map((call) => call.params.get('playlistId'))).toEqual(['UU1', 'UU2'])
      expect(calls[0].params.get('part')).toBe('contentDetails')
      expect(calls[0].params.get('maxResults')).toBe('15')
    })

    it('skips a channel that reports no uploads playlist rather than failing the load', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1', 'UC2']),
        channels: () =>
          json({
            items: [
              { id: 'UC1', contentDetails: { relatedPlaylists: {} } },
              { id: 'UC2', contentDetails: { relatedPlaylists: { uploads: 'UU2' } } },
            ],
          }),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id, channelId: 'UC2' }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('playlistItems').map((call) => call.params.get('playlistId'))).toEqual(['UU2'])
      expect(pool.videos.map((video) => video.id)).toEqual(['v1'])
    })
  })

  describe('when every uploads playlist fails', () => {
    it('fails the load with the first error it saw', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1', 'UC2']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => apiError(404, 'playlistNotFound'),
        videos: () => videosPage([]),
      })

      const load = new YouTubePoolSource({ fetch, tokens }).load()

      // Nothing came back from anywhere, which is a broken load. An empty pool
      // is shown as an empty subscription list, and this viewer has two.
      await expect(load).rejects.toBeInstanceOf(YouTubeApiError)
      await expect(load).rejects.toMatchObject({ status: 404, reason: 'playlistNotFound' })
    })

    it('resolves on the one playlist that answered, whatever the other did', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1', 'UC2']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: (params) =>
          params.get('playlistId') === 'UU1'
            ? apiError(404, 'playlistNotFound')
            : playlistItemsPage(['UU2-v1']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('playlistItems')).toHaveLength(2)
      expect(pool.videos.map((video) => video.id)).toEqual(['UU2-v1'])
    })

    it('resolves with nothing on when no channel has uploads enabled', async () => {
      // No `playlistItems` handler: a request to one fails the test loudly, and
      // a subscription list with no uploads playlists in it makes none.
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: () => json({ items: [{ id: 'UC1', contentDetails: { relatedPlaylists: {} } }] }),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(pool.videos).toEqual([])
      expect(pool.channels.size).toBe(1)
    })
  })

  describe('whose subscriptions these are', () => {
    const ownerPage = (id: string) => json({ items: [{ id, kind: 'youtube#channel' }] })

    it('asks channels for the signed-in account own id', async () => {
      const { fetch, callsTo } = fakeYouTube({ channels: () => ownerPage('UC-owner') })

      const owner = await new YouTubePoolSource({ fetch, tokens }).ownerId()

      expect(owner).toBe('UC-owner')
      const [call] = callsTo('channels')
      // `id` and `mine` are the whole request: an identity `youtube.readonly`
      // already covers, with no name and no address anywhere in the answer.
      expect(call.params.get('part')).toBe('id')
      expect(call.params.get('mine')).toBe('true')
    })

    it('asks once for the life of the source, so it costs its one unit once', async () => {
      const { fetch, callsTo } = fakeYouTube({ channels: () => ownerPage('UC-owner') })
      const source = new YouTubePoolSource({ fetch, tokens })

      await source.ownerId()
      await source.ownerId()

      expect(callsTo('channels')).toHaveLength(1)
    })

    it('asks again after a sign-out, so the next account is keyed as itself', async () => {
      const { fetch, callsTo } = fakeYouTube({
        channels: (_params, call) => ownerPage(call === 0 ? 'UC-alice' : 'UC-bob'),
      })
      const source = new YouTubePoolSource({ fetch, tokens })
      expect(await source.ownerId()).toBe('UC-alice')

      await source.forget()

      expect(await source.ownerId()).toBe('UC-bob')
      expect(callsTo('channels')).toHaveLength(2)
    })

    it('asks again after a failure rather than holding on to it', async () => {
      const { fetch, callsTo } = fakeYouTube({
        channels: (_params, call) => (call === 0 ? apiError(500, 'backendError') : ownerPage('UC-owner')),
      })
      const source = new YouTubePoolSource({ fetch, tokens })

      await expect(source.ownerId()).rejects.toMatchObject({ status: 500 })

      expect(await source.ownerId()).toBe('UC-owner')
      expect(callsTo('channels')).toHaveLength(2)
    })

    it('rejects when the answer names no channel', async () => {
      const { fetch } = fakeYouTube({ channels: () => json({ items: [] }) })

      await expect(new YouTubePoolSource({ fetch, tokens }).ownerId()).rejects.toBeInstanceOf(
        YouTubeApiError,
      )
    })
  })

  /*
    The channel's own topics are the strongest genre signal there is without
    asking a model anything, and they cost nothing: parts are free within a
    call, and this call was being made for the uploads playlist regardless.
  */
  describe('what YouTube says a channel is about', () => {
    const loadChannel = async (payload: unknown) => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: () => json(payload),
        playlistItems: () => playlistItemsPage([]),
        videos: () => videosPage([]),
      })
      const pool = await new YouTubePoolSource({ fetch, tokens }).load()
      return pool.channels.get('UC1')
    }

    it('keeps the last segment of each topic URL and nothing else', async () => {
      const channel = await loadChannel({
        items: [
          {
            id: 'UC1',
            contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
            topicDetails: {
              topicCategories: [
                'https://en.wikipedia.org/wiki/Humour',
                'https://en.wikipedia.org/wiki/Video_game_culture',
              ],
            },
          },
        ],
      })

      expect(channel?.topics).toEqual(['Humour', 'Video_game_culture'])
    })

    it('leaves the topics absent when YouTube has no opinion', async () => {
      const channel = await loadChannel({
        items: [{ id: 'UC1', contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }],
      })

      expect(channel?.topics).toBeUndefined()
      expect(channel?.title).toBe('Channel UC1')
    })

    it('does not repeat a topic two URLs agree on', async () => {
      const channel = await loadChannel({
        items: [
          {
            id: 'UC1',
            contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
            topicDetails: {
              topicCategories: [
                'https://en.wikipedia.org/wiki/Music',
                'https://en.wikipedia.org/wiki/Music',
              ],
            },
          },
        ],
      })

      expect(channel?.topics).toEqual(['Music'])
    })

    it('leaves the subscriber count absent where the channel hides it', async () => {
      const channel = await loadChannel({
        items: [
          {
            id: 'UC1',
            contentDetails: { relatedPlaylists: { uploads: 'UU1' } },
            statistics: { hiddenSubscriberCount: true },
          },
        ],
      })

      expect(channel?.subscriberCount).toBeUndefined()
    })
  })

  describe('mapping a video onto the domain', () => {
    const loadOne = async (stub: VideoStub) => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage([stub.id]),
        videos: () => videosPage([stub]),
      })
      const pool = await new YouTubePoolSource({ fetch, tokens }).load()
      return pool.videos[0]
    }

    it('carries every field the scheduler plans with', async () => {
      const video = await loadOne({
        id: 'v1',
        channelId: 'UC1',
        duration: 'PT1H2M3S',
        categoryId: '25',
        title: 'The World Tonight',
        publishedAt: '2026-09-08T22:00:00Z',
        tags: ['politics', 'bulletin'],
        viewCount: '48210',
      })

      expect(video).toEqual({
        id: 'v1',
        channelId: 'UC1',
        title: 'The World Tonight',
        durationSec: 3723,
        publishedAt: '2026-09-08T22:00:00Z',
        categoryId: '25',
        tags: ['politics', 'bulletin'],
        viewCount: 48210,
        ageRestricted: false,
        madeForKids: false,
        embeddable: true,
        isLive: false,
      })
    })

    // The watershed, as a field. This is the only judgement of its kind the
    // API makes, and taking it at face value is the whole rule.
    it('reports an age-restricted video as such', async () => {
      expect((await loadOne({ id: 'late', ytRating: 'ytAgeRestricted' })).ageRestricted).toBe(true)
      expect((await loadOne({ id: 'open' })).ageRestricted).toBe(false)
    })

    it('reports a video declared for children', async () => {
      expect((await loadOne({ id: 'kids', madeForKids: true })).madeForKids).toBe(true)
      expect((await loadOne({ id: 'grown' })).madeForKids).toBe(false)
    })

    // A channel may hide its figures. That is an absent count, not a zero, and
    // the difference matters to anything ranking on it.
    it('leaves the view count absent where the uploader hides it', async () => {
      expect((await loadOne({ id: 'shy' })).viewCount).toBeUndefined()
      expect((await loadOne({ id: 'open', viewCount: '0' })).viewCount).toBe(0)
    })

    it('parses the awkward duration forms the API really returns', async () => {
      expect((await loadOne({ id: 'a', duration: 'PT45S' })).durationSec).toBe(45)
      expect((await loadOne({ id: 'b', duration: 'PT2M' })).durationSec).toBe(120)
      expect((await loadOne({ id: 'c', duration: 'P0D' })).durationSec).toBe(0)
    })

    it('reports an unembeddable video faithfully instead of dropping it', async () => {
      const video = await loadOne({ id: 'blocked', embeddable: false })

      expect(video.id).toBe('blocked')
      expect(video.embeddable).toBe(false)
    })

    it('reports a live item as live, and an upcoming premiere too', async () => {
      expect((await loadOne({ id: 'live', liveBroadcastContent: 'live', duration: 'P0D' })).isLive).toBe(true)
      expect((await loadOne({ id: 'soon', liveBroadcastContent: 'upcoming', duration: 'P0D' })).isLive).toBe(true)
      expect((await loadOne({ id: 'vod', liveBroadcastContent: 'none' })).isLive).toBe(false)
    })

    it('calls a stream that has not finished live, whatever the snippet says', async () => {
      // The window this closes: a stream ends, the snippet drops back to
      // `none`, and the recording is not published yet — so it still plays as
      // "this live event has ended", inside the iframe, with no error event to
      // tell anyone about it. Streaming details without an end time means the
      // stream is not over.
      const ending = await loadOne({
        id: 'ending',
        liveBroadcastContent: 'none',
        liveStreamingDetails: { actualStartTime: '2026-09-12T20:00:00Z' },
      })

      expect(ending.isLive).toBe(true)
    })

    it('lets a finished stream through once it has an end time', async () => {
      const finished = await loadOne({
        id: 'finished',
        liveBroadcastContent: 'none',
        liveStreamingDetails: {
          actualStartTime: '2026-09-12T20:00:00Z',
          actualEndTime: '2026-09-12T21:00:00Z',
        },
      })

      expect(finished.isLive).toBe(false)
    })

    it('leaves categoryId absent when the API does not say', async () => {
      expect((await loadOne({ id: 'v1' })).categoryId).toBeUndefined()
    })
  })

  describe('payloads that are not the shape the docs promise', () => {
    it('skips a subscription with no channel id instead of inventing one', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => json({ items: [{ snippet: { title: 'Nameless' } }, ...[]] }),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(pool.channels.size).toBe(0)
      expect(callsTo('channels')).toHaveLength(0)
    })

    it('falls back to the channel id when a subscription has no title', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => json({ items: [{ snippet: { resourceId: { channelId: 'UC1' } } }] }),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage([]),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(pool.channels.get('UC1')).toEqual({
        id: 'UC1',
        title: 'UC1',
        topics: ['Knowledge'],
        subscriberCount: 1234,
      })
    })

    it('keeps a video whose detail fields are missing, with a zero duration the scheduler can reject', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['bare']),
        videos: () => json({ items: [{ id: 'bare' }] }),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(pool.videos[0]).toEqual({
        id: 'bare',
        channelId: '',
        title: '',
        durationSec: 0,
        publishedAt: '',
        categoryId: undefined,
        tags: undefined,
        viewCount: undefined,
        // Absent means unrated and not declared for children, which is what
        // the API means by leaving them out.
        ageRestricted: false,
        madeForKids: false,
        // Absent `status` is read as embeddable: the player has a fault path,
        // and refusing everything on a payload change would empty the schedule.
        embeddable: true,
        isLive: false,
      })
    })

    it('ignores a videos.list item with no id at all', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: () => json({ items: [{ contentDetails: { duration: 'PT5M' } }] }),
      })

      expect((await new YouTubePoolSource({ fetch, tokens }).load()).videos).toEqual([])
    })

    // The termination test at :168 scripts a peer that volunteers a last page
    // with no token, so it measures the peer's good manners rather than a bound
    // in #listSubscriptions: a sane value sat in the one field that controls
    // that loop. A peer that keeps handing back the token it just issued is the
    // hostile one, and nothing in the code stops it. The fake caps itself so a
    // loop with no cap fails as an assertion here instead of hanging the run.
    it('stops when the peer keeps handing back the same nextPageToken', async () => {
      const PEER_GIVES_UP_AFTER = 20
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: (_params, call) =>
          call < PEER_GIVES_UP_AFTER ? subscriptionPage([], 'same-page') : subscriptionPage([]),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      // A token already followed once is a peer that is not paging. Following
      // it again spends quota the 24h cache cannot give back, because a load
      // that never finishes is never cached (cachedPoolSource.ts:77-88).
      expect(callsTo('subscriptions').length).toBeLessThanOrEqual(2)
    })

    // Fresh tokens get past the repeat check, so only a limit ends this loop.
    // The load's cost grows with the subscription count, a call per channel for
    // its uploads, so the list is where the bound belongs.
    it('stops listing subscriptions at MAX_SUBSCRIPTIONS however many pages are offered', async () => {
      const PEER_GIVES_UP_AFTER = 100
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: (_params, call) =>
          call < PEER_GIVES_UP_AFTER
            ? subscriptionPage(ids(50, `UC${String(call)}-`), `page-${String(call + 1)}`)
            : subscriptionPage([]),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage([]),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('subscriptions')).toHaveLength(MAX_SUBSCRIPTIONS / 50)
      const described = callsTo('channels').flatMap((call) => call.params.get('id')!.split(','))
      expect(described).toHaveLength(MAX_SUBSCRIPTIONS)
    })

    // An item limit counts items, so a peer paging nothing but fresh tokens
    // never reaches it. A page that brings nothing ends the loop.
    it('stops at an empty page even when it offers another', async () => {
      const PEER_GIVES_UP_AFTER = 50
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: (_params, call) =>
          call < PEER_GIVES_UP_AFTER ? subscriptionPage([], `page-${String(call + 1)}`) : subscriptionPage([]),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('subscriptions')).toHaveLength(1)
    })

    it('stops paging a batch of ids once every id in it has come back', async () => {
      const PEER_GIVES_UP_AFTER = 20
      const offer = (call: number) => (call < PEER_GIVES_UP_AFTER ? { nextPageToken: `more-${String(call + 1)}` } : {})
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (_params, call) =>
          json({
            ...offer(call),
            items: [{ id: 'UC1', contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }],
          }),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: (_params, call) => json({ ...offer(call), items: [{ id: 'v1', contentDetails: { duration: 'PT10M' } }] }),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('channels')).toHaveLength(1)
      expect(callsTo('videos')).toHaveLength(1)
    })

    it('never asks for a page larger than the API will give', async () => {
      const { fetch, calls } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      // The API answers 400 invalidValue above its maximum, and the catch in
      // #listRecentVideoIds reads that as one bad playlist, skipping them all.
      await new YouTubePoolSource({ fetch, tokens, videosPerChannel: 200 }).load()

      for (const call of calls) {
        expect(Number(call.params.get('maxResults'))).toBeLessThanOrEqual(50)
      }
    })

    it('pages a channel uploads request until it has the budget it was given', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        // Every page offers another, so only the budget can stop this.
        playlistItems: (_params, call) =>
          playlistItemsPage([`v${String(call)}`], `page-${String(call + 1)}`),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens, videosPerChannel: 3 }).load()

      expect(callsTo('playlistItems')).toHaveLength(3)
      expect(pool.videos.map((video) => video.id).sort()).toEqual(['v0', 'v1', 'v2'])
    })

    it('follows nextPageToken on a short videos page rather than losing the rest', async () => {
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['v1', 'v2']),
        // A batch of ids the peer answers over two pages.
        videos: (params) =>
          params.get('pageToken') === 'rest' ? videosPage([{ id: 'v2' }]) : videosPage([{ id: 'v1' }], 'rest'),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(callsTo('videos')).toHaveLength(2)
      expect(pool.videos.map((video) => video.id).sort()).toEqual(['v1', 'v2'])
    })

    it('treats an empty response body as an empty page rather than a failure', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => json({}),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens }).load()

      expect(pool.videos).toEqual([])
      expect(pool.channels.size).toBe(0)
    })

    it('reports a failure whose body is not JSON at all', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => ({
          ok: false,
          status: 502,
          json: async () => {
            throw new SyntaxError('unexpected token < in JSON at position 0')
          },
        }),
      })

      await expect(new YouTubePoolSource({ fetch, tokens }).load()).rejects.toMatchObject({ status: 502 })
    })
  })

  describe('credentials', () => {
    it('sends the access token in the Authorization header on every call', async () => {
      const { fetch, calls } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      expect(calls).not.toHaveLength(0)
      for (const call of calls) {
        expect(call.headers.Authorization).toBe('Bearer test-access-token')
      }
      expect(tokensAsked).toBeGreaterThan(0)
    })

    it('never puts the token, or any key, in the URL', async () => {
      const { fetch, calls } = fakeYouTube({
        subscriptions: () => subscriptionPage(['UC1']),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      await new YouTubePoolSource({ fetch, tokens }).load()

      for (const call of calls) {
        expect(call.url.href).not.toContain('test-access-token')
        expect(call.params.get('access_token')).toBeNull()
        expect(call.params.get('key')).toBeNull()
      }
    })
  })

  // The per-minute limit clears in seconds, so it is waited out and the call
  // made again. The daily quota does not, and neither does a refusal.
  describe('the per-minute rate limit', () => {
    const recorder = () => {
      const waits: number[] = []
      return { waits, sleep: async (ms: number) => void waits.push(ms) }
    }

    it.each([
      ['a 429 rateLimitExceeded', () => apiError(429, 'rateLimitExceeded')],
      ['a 429 userRateLimitExceeded', () => apiError(429, 'userRateLimitExceeded')],
      ['a 403 rateLimitExceeded', () => apiError(403, 'rateLimitExceeded')],
      ['a 429 that names no reason', () => json({ error: { code: 429, message: 'too many requests' } }, 429)],
    ])('backs off and asks again after %s, and the load succeeds', async (_name, limited) => {
      const { waits, sleep } = recorder()
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: (_params, call) => (call < 2 ? limited() : subscriptionPage(['UC1'])),
        channels: (params) => channelsPage(params.get('id')!.split(',')),
        playlistItems: () => playlistItemsPage(['v1']),
        videos: (params) => videosPage(params.get('id')!.split(',').map((id) => ({ id }))),
      })

      const pool = await new YouTubePoolSource({ fetch, tokens, sleep }).load()

      expect(callsTo('subscriptions')).toHaveLength(3)
      expect(pool.videos.map((video) => video.id)).toEqual(['v1'])
      expect(waits).toHaveLength(2)
      // Each wait is longer than the last, so a limit that is still in force
      // is not asked again at the rate that tripped it.
      expect(waits[1]).toBeGreaterThan(waits[0])
      expect(waits[0]).toBeGreaterThanOrEqual(1000)
    })

    it('gives up after a bounded number of attempts and fails the load with the limit', async () => {
      const { waits, sleep } = recorder()
      const { fetch, callsTo } = fakeYouTube({
        subscriptions: () => apiError(429, 'rateLimitExceeded'),
      })

      const load = new YouTubePoolSource({ fetch, tokens, sleep }).load()

      await expect(load).rejects.toBeInstanceOf(QuotaExceededError)
      await expect(load).rejects.toMatchObject({ status: 429, reason: 'rateLimitExceeded' })
      expect(callsTo('subscriptions')).toHaveLength(RATE_LIMIT_BACKOFF_MS.length + 1)
      expect(waits).toHaveLength(RATE_LIMIT_BACKOFF_MS.length)
    })

    it.each([
      ['the daily quota', () => apiError(403, 'quotaExceeded')],
      ['the daily limit', () => apiError(403, 'dailyLimitExceeded')],
      ['a refused token', () => apiError(401, 'authError')],
      ['a refused request', () => apiError(403, 'forbidden')],
      ['a server error', () => json({ error: { code: 500, message: 'backend error' } }, 500)],
    ])('does not wait out %s', async (_name, refused) => {
      const { waits, sleep } = recorder()
      const { fetch, callsTo } = fakeYouTube({ subscriptions: refused })

      await expect(new YouTubePoolSource({ fetch, tokens, sleep }).load()).rejects.toBeInstanceOf(
        YouTubeApiError,
      )
      expect(callsTo('subscriptions')).toHaveLength(1)
      expect(waits).toEqual([])
    })
  })

  describe('failures', () => {
    it('surfaces a 403 quotaExceeded distinguishably, so the screen can show the test card', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => apiError(403, 'quotaExceeded'),
      })

      const load = new YouTubePoolSource({ fetch, tokens }).load()

      await expect(load).rejects.toBeInstanceOf(QuotaExceededError)
      await expect(load).rejects.toMatchObject({ status: 403, reason: 'quotaExceeded' })
    })

    it('treats a 403 that is not about quota as an ordinary API error', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => apiError(403, 'forbidden'),
      })

      const load = new YouTubePoolSource({ fetch, tokens }).load()

      await expect(load).rejects.toBeInstanceOf(YouTubeApiError)
      await expect(load).rejects.not.toBeInstanceOf(QuotaExceededError)
    })

    it('reports the status of any other failed call', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => json({ error: { code: 500, message: 'backend error' } }, 500),
      })

      await expect(new YouTubePoolSource({ fetch, tokens }).load()).rejects.toMatchObject({ status: 500 })
    })

    it('does not leak the access token into the error message', async () => {
      const { fetch } = fakeYouTube({
        subscriptions: () => apiError(403, 'quotaExceeded'),
      })

      const error = await new YouTubePoolSource({ fetch, tokens }).load().catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(YouTubeApiError)
      expect(String(error)).not.toContain('test-access-token')
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain('test-access-token')
    })
  })
})

describe('YouTubePoolSource, two hundred subscriptions', () => {
  const tokens: AccessTokenProvider = { getAccessToken: async () => 'test-access-token' }

  /**
   * Holds every request open for a turn of the event loop, so requests made
   * together actually overlap and the peak can be counted. Without this the
   * fake answers inside a microtask and nothing is ever in flight beside
   * anything else, concurrent or not.
   */
  function held(fetch: FetchLike, delayFor: (url: URL) => number = () => 0) {
    const seen = { inFlight: 0, peak: 0 }
    const wrapped: FetchLike = async (url, init) => {
      seen.inFlight += 1
      seen.peak = Math.max(seen.peak, seen.inFlight)
      await new Promise((resolve) => setTimeout(resolve, delayFor(new URL(url))))
      seen.inFlight -= 1
      return fetch(url, init)
    }
    return { fetch: wrapped, seen }
  }

  /** Thirty subscriptions: more than one batch of channels, plenty of playlists. */
  const channelIds = ids(30, 'UC')
  const uploadsOf = (id: string) => `UU${id.slice(2)}`
  const videoOf = (id: string) => `v${id.slice(2)}`

  const fakeAccount = () =>
    fakeYouTube({
      subscriptions: () => subscriptionPage(channelIds),
      channels: (params) => channelsPage(params.get('id')!.split(',')),
      playlistItems: (params) => {
        const playlist = params.get('playlistId')!
        return playlistItemsPage([videoOf(`UC${playlist.slice(2)}`)])
      },
      videos: (params) =>
        videosPage(params.get('id')!.split(',').map((id) => ({ id, channelId: `UC${id.slice(1)}` }))),
    })

  it('has several playlist calls in the air at once', async () => {
    // The per-channel call is the one the API will not batch, so it is the
    // whole of the wait. One at a time, thirty subscriptions is thirty round
    // trips and two hundred is most of a minute.
    const account = fakeAccount()
    const { fetch, seen } = held(account.fetch)

    await new YouTubePoolSource({ fetch, tokens }).load()

    expect(account.callsTo('playlistItems')).toHaveLength(30)
    expect(seen.peak).toBeGreaterThan(1)
    expect(seen.peak).toBeLessThanOrEqual(8)
  })

  it('keeps the pool in subscription order however the requests interleave', async () => {
    // Later playlists answered first. A pool whose order followed the network
    // would plan a different day on every load, and the planner is only
    // deterministic because its input is.
    const account = fakeAccount()
    const { fetch } = held(account.fetch, (url) => {
      const playlist = url.searchParams.get('playlistId')
      return playlist ? 30 - Number(playlist.slice(2)) : 0
    })

    const pool = await new YouTubePoolSource({ fetch, tokens }).load()

    expect(pool.videos.map((video) => video.id)).toEqual(channelIds.map(videoOf))
  })

  it('climbs to one and never goes back', async () => {
    const fractions: number[] = []

    await new YouTubePoolSource({ fetch: fakeAccount().fetch, tokens }).load((fraction) =>
      fractions.push(fraction),
    )

    expect(fractions.length).toBeGreaterThan(1)
    expect(fractions.at(-1)).toBe(1)
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions)
    expect(fractions.every((fraction) => fraction > 0 && fraction <= 1)).toBe(true)
  })

  it('abandons the rest of the playlists once the token is refused', async () => {
    // A 403 will refuse every remaining playlist identically. Carrying on
    // would spend another twenty-nine calls to learn the same thing. And
    // with requests in flight, "stop" has to mean the workers stop taking
    // new ones, not merely that the loop breaks.
    const account = fakeYouTube({
      subscriptions: () => subscriptionPage(channelIds),
      channels: (params) => channelsPage(params.get('id')!.split(',')),
      playlistItems: () => apiError(403, 'forbidden'),
    })

    await expect(new YouTubePoolSource({ fetch: account.fetch, tokens }).load()).rejects.toBeInstanceOf(
      YouTubeApiError,
    )
    expect(account.callsTo('playlistItems').length).toBeLessThanOrEqual(8)
  })

  // The case above stops by itself: every worker meets the wall on its first
  // playlist. Here only one does, and the other workers are doing well.
  it('stops taking playlists once one has failed the load, while the rest are succeeding', async () => {
    const account = fakeYouTube({
      subscriptions: () => subscriptionPage(channelIds),
      channels: (params) => channelsPage(params.get('id')!.split(',')),
      playlistItems: (_params, call) => (call === 0 ? apiError(401, 'authError') : playlistItemsPage(['v1'])),
    })

    await expect(new YouTubePoolSource({ fetch: account.fetch, tokens }).load()).rejects.toMatchObject({
      status: 401,
    })
    // Let any worker still running finish what it holds.
    await new Promise((resolve) => setTimeout(resolve, 0))

    // The first wave is in the air when the 401 lands, and a worker that
    // finished before hearing of it may take one more. Nothing past that.
    expect(account.callsTo('playlistItems').length).toBeLessThanOrEqual(2 * CONCURRENCY)
  })

  it('loses one unreachable channel and keeps the other twenty-nine', async () => {
    const gone = uploadsOf(channelIds[7])
    const account = fakeYouTube({
      subscriptions: () => subscriptionPage(channelIds),
      channels: (params) => channelsPage(params.get('id')!.split(',')),
      playlistItems: (params) => {
        const playlist = params.get('playlistId')!
        return playlist === gone
          ? apiError(404, 'playlistNotFound')
          : playlistItemsPage([videoOf(`UC${playlist.slice(2)}`)])
      },
      videos: (params) =>
        videosPage(params.get('id')!.split(',').map((id) => ({ id, channelId: `UC${id.slice(1)}` }))),
    })

    const pool = await new YouTubePoolSource({ fetch: account.fetch, tokens }).load()

    expect(pool.videos).toHaveLength(29)
    expect(account.callsTo('playlistItems')).toHaveLength(30)
  })
})
