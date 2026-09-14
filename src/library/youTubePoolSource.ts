import type { Channel, Pool, Video } from '../domain'
import { parseIso8601Duration } from './duration'
import { QuotaExceededError, YouTubeApiError } from './errors'
import type { FetchLike } from './http'
import type { PoolSource } from './poolSource'
import type { AccessTokenProvider } from './tokenProvider'

/**
 * The real pool: your subscriptions, their uploads, and enough detail about each
 * video to schedule it.
 *
 * The call sequence and the quota it costs are the design (~220 units for ~200
 * subscriptions, against a 10,000/day allowance):
 *
 * | call                | per       | units |
 * |---------------------|-----------|-------|
 * | `subscriptions.list`| 50 subs   | 1     |
 * | `channels.list`     | 50 ids    | 1     |
 * | `playlistItems.list`| 1 channel | 1     |
 * | `videos.list`       | 50 ids    | 1     |
 *
 * The two `50`s are load-bearing: batching ids is the difference between ~220
 * units a day and blowing the quota before breakfast.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3'

/** The API's own maximum ids per `id=` list, and its maximum page size. */
const MAX_IDS_PER_CALL = 50
const MAX_PAGE_SIZE = 50

/** Recent uploads fetched per channel. Enough to plan a week without paging. */
const DEFAULT_VIDEOS_PER_CHANNEL = 20

/** What `contentDetails.contentRating.ytRating` says when a video is 18+. */
const AGE_RESTRICTED = 'ytAgeRestricted'

/** Reasons Google returns when there is nothing left to spend. */
const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded'])

export interface YouTubePoolSourceOptions {
  /** Injected transport. Never read from a global, so tests cannot escape. */
  fetch: FetchLike
  /** Injected token provider — see `AccessTokenProvider`. */
  tokens: AccessTokenProvider
  videosPerChannel?: number
  /** Override for tests and for a proxy deployment. */
  baseUrl?: string
}

interface SubscriptionListResponse {
  items?: readonly { snippet?: { title?: string; resourceId?: { channelId?: string } } }[]
  nextPageToken?: string
}

interface ChannelListResponse {
  items?: readonly {
    id?: string
    contentDetails?: { relatedPlaylists?: { uploads?: string } }
    /** Wikipedia URLs. YouTube's own judgement of what a channel is about. */
    topicDetails?: { topicCategories?: readonly string[] }
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean }
  }[]
}

interface PlaylistItemListResponse {
  items?: readonly { contentDetails?: { videoId?: string } }[]
}

interface VideoListResponse {
  items?: readonly {
    id?: string
    contentDetails?: { duration?: string; contentRating?: { ytRating?: string } }
    /** Present on anything that is or was a stream; `actualEndTime` once over. */
    liveStreamingDetails?: { actualEndTime?: string }
    status?: { embeddable?: boolean; madeForKids?: boolean }
    statistics?: { viewCount?: string }
    snippet?: {
      title?: string
      channelId?: string
      publishedAt?: string
      categoryId?: string
      tags?: readonly string[]
      liveBroadcastContent?: string
    }
  }[]
}

interface ApiErrorBody {
  error?: { code?: number; message?: string; errors?: readonly { reason?: string }[] }
}

/**
 * `https://en.wikipedia.org/wiki/Video_game_culture` -> `Video_game_culture`.
 *
 * The last segment is the stable part. The rest is a host and a path that say
 * the same thing for every topic there is, and matching on the whole URL would
 * make the genre table break the day Google changed a prefix.
 */
export function topicSlugs(urls: readonly string[] | undefined): string[] | undefined {
  if (!urls || urls.length === 0) return undefined
  const slugs = urls
    .map((url) => url.split('/').filter(Boolean).pop())
    .filter((slug): slug is string => slug !== undefined && slug.length > 0)
    // Percent-decoded, because some of them are: `Children%27s_music`.
    .map(decodeSegment)
  return slugs.length > 0 ? [...new Set(slugs)] : undefined
}

/** A slug that is not valid escaping is still a slug; take it as it came. */
function decodeSegment(slug: string): string {
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}

/** The API sends counts as strings, and omits them where they are hidden. */
function countOf(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

/** Splits ids into API-sized batches. The whole quota argument lives here. */
export function batchIds(ids: readonly string[], size: number = MAX_IDS_PER_CALL): string[][] {
  const batches: string[][] = []
  for (let index = 0; index < ids.length; index += size) {
    batches.push(ids.slice(index, index + size))
  }
  return batches
}

/**
 * Whether an error condemns the whole load rather than one playlist.
 *
 * Anything about *us* — a rejected token, spent quota, a forbidden request —
 * will fail identically for every remaining channel, so carrying on would
 * burn two hundred more calls to learn the same thing. Anything about one
 * playlist is that playlist's problem alone.
 */
function isFatal(error: unknown): boolean {
  return error instanceof YouTubeApiError && (error.status === 401 || error.status === 403)
}

export class YouTubePoolSource implements PoolSource {
  readonly #fetch: FetchLike
  readonly #tokens: AccessTokenProvider
  readonly #videosPerChannel: number
  readonly #baseUrl: string

  constructor(options: YouTubePoolSourceOptions) {
    this.#fetch = options.fetch
    this.#tokens = options.tokens
    this.#videosPerChannel = options.videosPerChannel ?? DEFAULT_VIDEOS_PER_CHANNEL
    this.#baseUrl = options.baseUrl ?? API_BASE
  }

  async load(): Promise<Pool> {
    const subscribed = await this.#listSubscriptions()
    const described = await this.#describeChannels(subscribed)
    const videoIds = await this.#listRecentVideoIds(described.uploadPlaylists)
    const videos = await this.#describeVideos(videoIds)

    return { videos, channels: described.channels }
  }

  /** Step 1 — every subscribed channel, 50 a page, following `nextPageToken`. */
  async #listSubscriptions(): Promise<Channel[]> {
    const channels: Channel[] = []
    let pageToken: string | undefined

    do {
      const page = (await this.#get('subscriptions', {
        part: 'snippet',
        mine: 'true',
        maxResults: String(MAX_PAGE_SIZE),
        ...(pageToken ? { pageToken } : {}),
      })) as SubscriptionListResponse

      for (const item of page.items ?? []) {
        const id = item.snippet?.resourceId?.channelId
        if (!id) continue
        channels.push({ id, title: item.snippet?.title ?? id })
      }
      pageToken = page.nextPageToken
    } while (pageToken)

    return channels
  }

  /**
   * Step 2 — each channel's uploads playlist and what YouTube says it is
   * about, batched 50 ids to a call.
   *
   * `topicDetails` and `statistics` ride along for nothing: a call costs one
   * unit whatever parts it asks for, so the topics that decide which station a
   * subscription belongs to are free.
   */
  async #describeChannels(
    subscribed: readonly Channel[],
  ): Promise<{ channels: Map<string, Channel>; uploadPlaylists: string[] }> {
    const uploadPlaylists: string[] = []
    const channels = new Map(subscribed.map((channel) => [channel.id, channel]))

    for (const batch of batchIds(subscribed.map((channel) => channel.id))) {
      const page = (await this.#get('channels', {
        part: 'contentDetails,topicDetails,statistics',
        id: batch.join(','),
        maxResults: String(MAX_PAGE_SIZE),
      })) as ChannelListResponse

      for (const item of page.items ?? []) {
        // A channel with uploads disabled has no uploads playlist. Skip it
        // rather than losing every other channel to one missing field.
        const uploads = item.contentDetails?.relatedPlaylists?.uploads
        if (uploads) uploadPlaylists.push(uploads)

        const known = item.id ? channels.get(item.id) : undefined
        if (!known) continue
        channels.set(known.id, {
          ...known,
          topics: topicSlugs(item.topicDetails?.topicCategories),
          subscriberCount: countOf(item.statistics?.subscriberCount),
        })
      }
    }

    return { channels, uploadPlaylists }
  }

  /**
   * Step 3 — recent uploads per playlist. One call each; this is the expensive
   * step, so it is sequential to stay inside the per-minute rate limit rather
   * than firing two hundred requests at once.
   */
  async #listRecentVideoIds(playlistIds: readonly string[]): Promise<string[]> {
    const videoIds = new Set<string>()

    for (const playlistId of playlistIds) {
      let page: PlaylistItemListResponse
      try {
        page = (await this.#get('playlistItems', {
          part: 'contentDetails',
          playlistId,
          maxResults: String(this.#videosPerChannel),
        })) as PlaylistItemListResponse
      } catch (error) {
        // One channel being deleted, made private or otherwise unreachable is
        // an ordinary fact of a subscription list that has been around a
        // while. It must cost you that channel, not the other two hundred.
        if (isFatal(error)) throw error
        continue
      }

      for (const item of page.items ?? []) {
        const id = item.contentDetails?.videoId
        if (id) videoIds.add(id)
      }
    }

    return [...videoIds]
  }

  /** Step 4 — durations, ratings, category and views, batched 50 ids to a call. */
  async #describeVideos(videoIds: readonly string[]): Promise<Video[]> {
    const videos: Video[] = []

    for (const batch of batchIds(videoIds)) {
      const page = (await this.#get('videos', {
        // `liveStreamingDetails` is free — parts cost nothing extra within a
        // call — and it is the only reliable way to tell a finished stream
        // from one still running.
        part: 'contentDetails,status,snippet,statistics,liveStreamingDetails',
        id: batch.join(','),
        maxResults: String(MAX_PAGE_SIZE),
      })) as VideoListResponse

      for (const item of page.items ?? []) {
        if (!item.id) continue
        videos.push({
          id: item.id,
          channelId: item.snippet?.channelId ?? '',
          title: item.snippet?.title ?? '',
          durationSec: parseIso8601Duration(item.contentDetails?.duration ?? ''),
          publishedAt: item.snippet?.publishedAt ?? '',
          categoryId: item.snippet?.categoryId,
          tags: item.snippet?.tags,
          viewCount: countOf(item.statistics?.viewCount),
          // The watershed, as a field. YouTube has already made this judgement
          // and it is the only one of its kind we get for free.
          ageRestricted: item.contentDetails?.contentRating?.ytRating === AGE_RESTRICTED,
          madeForKids: item.status?.madeForKids === true,
          // Reported, not filtered: the scheduler decides what to do with an
          // unembeddable or live item, this layer only says what is true.
          embeddable: item.status?.embeddable !== false,
          // Two ways to be live, and the snippet only knows one of them. A
          // stream that is running says so; a stream that has *just* finished
          // says `none` and still plays as "this live event has ended" until
          // YouTube publishes the recording. Anything carrying streaming
          // details without an end time has not finished.
          isLive:
            (item.snippet?.liveBroadcastContent ?? 'none') !== 'none' ||
            (item.liveStreamingDetails !== undefined &&
              item.liveStreamingDetails.actualEndTime === undefined),
        })
      }
    }

    return videos
  }

  async #get(endpoint: string, params: Record<string, string>): Promise<unknown> {
    const url = `${this.#baseUrl}/${endpoint}?${new URLSearchParams(params).toString()}`
    // The token goes in the header, never the query string: URLs end up in
    // browser history, referrers and server logs (CWE-598).
    const token = await this.#tokens.getAccessToken()

    const response = await this.#fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    if (!response.ok) throw await toApiError(response, endpoint)
    return response.json()
  }
}

/** Never includes the request URL or any header: an error must not carry a token. */
async function toApiError(
  response: { status: number; json(): Promise<unknown> },
  endpoint: string,
): Promise<YouTubeApiError> {
  let reason: string | undefined
  let detail = ''
  try {
    const body = (await response.json()) as ApiErrorBody
    reason = body.error?.errors?.[0]?.reason
    detail = body.error?.message ?? ''
  } catch {
    // A failure with an unreadable body is still a failure worth reporting.
  }

  const message = `youtube ${endpoint} failed: ${response.status}${reason ? ` (${reason})` : ''}${detail ? ` — ${detail}` : ''}`
  return reason && QUOTA_REASONS.has(reason)
    ? new QuotaExceededError(response.status, reason, message)
    : new YouTubeApiError(response.status, reason, message)
}
