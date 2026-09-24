import type { Channel, Pool, Video } from '../domain'
import { parseIso8601Duration } from './duration'
import { QuotaExceededError, YouTubeApiError } from './errors'
import type { FetchLike } from './http'
import { mapLimit } from './mapLimit'
import type { LoadProgress, PoolSource } from './poolSource'
import type { AccessTokenProvider } from './tokenProvider'

/**
 * The real pool: your subscriptions, their uploads, and enough detail about each
 * video to schedule it.
 *
 * The call sequence and the quota it costs are the design. A list call costs
 * one unit whatever parts it asks for, so the cost is the number of calls:
 *
 * | call                 | per       | 200 subs, 20 videos each |
 * |----------------------|-----------|--------------------------|
 * | `channels.list` mine | the owner | 1                        |
 * | `subscriptions.list` | 50 subs   | 4                        |
 * | `channels.list`      | 50 ids    | 4                        |
 * | `playlistItems.list` | 1 channel | 200                      |
 * | `videos.list`        | 50 ids    | 80                       |
 *
 * ~290 units against a 10,000/day allowance, and the two `50`s are what hold
 * it there: a `videos.list` per video would be 4,000 on its own.
 *
 * The playlist row is the one that is per-channel and cannot be batched, so
 * two hundred subscriptions is two hundred calls, and made one after another
 * that is most of a minute of a viewer watching nothing happen. They are made
 * `CONCURRENCY` at a time instead. The charge is per call and the number of
 * calls does not change, so this costs no extra quota: it only stops the wall
 * clock from being the sum of two hundred round trips.
 */

const API_BASE = 'https://www.googleapis.com/youtube/v3'

/** The API's own maximum ids per `id=` list, and its maximum page size. */
const MAX_IDS_PER_CALL = 50
const MAX_PAGE_SIZE = 50

/** Recent uploads fetched per channel. Enough to plan a week without paging. */
const DEFAULT_VIDEOS_PER_CHANNEL = 20

/**
 * How many API calls may be in the air at once.
 *
 * Enough to turn a minute into a few seconds, and far short of anything that
 * looks like abuse from the far end. The per-call quota is untouched either
 * way, so there is nothing to be won by raising it and a rate limit to be
 * tripped by raising it a lot.
 */
export const CONCURRENCY = 8

/**
 * Subscriptions read per load. The load costs about 1.45 units per
 * subscription by the table above, so this holds one load to about 1,450 of
 * the day's 10,000 however long the list is.
 */
export const MAX_SUBSCRIPTIONS = 1000

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
  nextPageToken?: string
}

/** What every list endpoint has in common, and all `#pages` needs to page. */
interface PagedResponse {
  items?: readonly unknown[]
  nextPageToken?: string
}

interface PlaylistItemListResponse {
  items?: readonly { contentDetails?: { videoId?: string } }[]
  nextPageToken?: string
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
  nextPageToken?: string
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
 * Anything about *us* (a rejected token, spent quota, too many requests a
 * minute) will fail identically for every remaining channel, so carrying on
 * would burn two hundred more calls to learn the same thing, and end with an
 * empty pool that reads from the sofa as an empty subscription list. Anything
 * about one playlist is that playlist's problem alone.
 *
 * 429 is in here by status as well as by reason: the per-minute limit is
 * returned with `rateLimitExceeded` or `userRateLimitExceeded`, and a 429
 * carrying neither is still the same wall.
 */
function isFatal(error: unknown): boolean {
  if (error instanceof QuotaExceededError) return true
  return (
    error instanceof YouTubeApiError &&
    (error.status === 401 || error.status === 403 || error.status === 429)
  )
}

export class YouTubePoolSource implements PoolSource {
  readonly #fetch: FetchLike
  readonly #tokens: AccessTokenProvider
  readonly #videosPerChannel: number
  readonly #baseUrl: string
  #owner: Promise<string> | undefined

  constructor(options: YouTubePoolSourceOptions) {
    this.#fetch = options.fetch
    this.#tokens = options.tokens
    this.#videosPerChannel = options.videosPerChannel ?? DEFAULT_VIDEOS_PER_CHANNEL
    this.#baseUrl = options.baseUrl ?? API_BASE
  }

  /**
   * Whose subscriptions these are, as their own channel id.
   *
   * `mine=true` answers for whoever the token belongs to, so this is an
   * identity the `youtube.readonly` scope already covers: no profile scope,
   * no name, no address, nothing the app has not already been granted. It
   * exists to key the cache: two accounts on one browser must not be able to
   * read each other's pool.
   *
   * Held for the life of the source, which is the life of a signed-in
   * session, so it costs its one unit once.
   */
  async ownerId(): Promise<string> {
    this.#owner ??= this.#fetchOwnerId().catch((error: unknown) => {
      this.#owner = undefined
      throw error
    })
    return this.#owner
  }

  /**
   * Forget who the token belonged to. The next load asks again, so the account
   * that signs in after a sign-out is keyed as itself.
   */
  async forget(): Promise<void> {
    this.#owner = undefined
  }

  async #fetchOwnerId(): Promise<string> {
    const page = (await this.#get('channels', { part: 'id', mine: 'true' })) as ChannelListResponse
    const id = page.items?.[0]?.id
    if (!id) throw new YouTubeApiError(200, undefined, 'youtube channels returned no owner')
    return id
  }

  async load(onProgress?: LoadProgress): Promise<Pool> {
    const subscribed = await this.#listSubscriptions()

    /*
      Now that the subscription list is in, how many calls the rest of this
      will take is arithmetic: one per 50 channels to describe them, one per
      channel for its uploads, and one per 50 videos to describe those. The
      last is an over-estimate (channels with uploads disabled contribute
      none, and two channels can carry the same video), so it is replaced with
      the real figure the moment that is known. A denominator that only ever
      shrinks moves the fraction forwards, which is the direction progress is
      allowed to move.
    */
    const perChannelCalls = subscribed.length
    const describeCalls = batchIds(subscribed.map((c) => c.id)).length
    let total =
      describeCalls +
      perChannelCalls +
      Math.ceil((subscribed.length * this.#videosPerChannel) / MAX_IDS_PER_CALL)
    let done = 0
    const tick = (): void => {
      done += 1
      onProgress?.(Math.min(done / Math.max(total, 1), 1))
    }

    const described = await this.#describeChannels(subscribed, tick)
    const videoIds = await this.#listRecentVideoIds(described.uploadPlaylists, tick)

    const videoCalls = batchIds(videoIds).length
    total = describeCalls + perChannelCalls + videoCalls
    const videos = await this.#describeVideos(videoIds, tick)

    onProgress?.(1)
    return { videos, channels: described.channels }
  }

  /**
   * Every page of a list call, following `nextPageToken` as the API sends it.
   *
   * The peer decides how long the loop runs, so the bounds are ours.
   * `maxResults` is clamped to the API's maximum, above which it answers 400.
   * A token it has already issued ends the loop: a peer reissuing one is
   * repeating itself, not paging. `limit` ends it once the caller has what it
   * asked for, and a page with no items ends it too, because a peer handing
   * out fresh tokens for empty pages would otherwise never reach the limit.
   * Every page before the last brings at least one item, so no list call
   * makes more requests than its `limit`.
   */
  async *#pages<T extends PagedResponse>(
    endpoint: string,
    params: Record<string, string>,
    limit: number,
  ): AsyncGenerator<T> {
    const followed = new Set<string>()
    let pageToken: string | undefined
    let collected = 0

    do {
      const page = (await this.#get(endpoint, {
        ...params,
        maxResults: String(Math.min(limit - collected, MAX_PAGE_SIZE)),
        ...(pageToken ? { pageToken } : {}),
      })) as T

      yield page
      const brought = page.items?.length ?? 0
      collected += brought

      const next = page.nextPageToken
      pageToken = next !== undefined && !followed.has(next) && brought > 0 && collected < limit ? next : undefined
      if (pageToken !== undefined) followed.add(pageToken)
    } while (pageToken)
  }

  /** Every page `#pages` yields, for a worker that hands its pages back whole. */
  async #collect<T extends PagedResponse>(
    endpoint: string,
    params: Record<string, string>,
    limit: number,
  ): Promise<T[]> {
    const pages: T[] = []
    for await (const page of this.#pages<T>(endpoint, params, limit)) pages.push(page)
    return pages
  }

  /** Step 1: the subscribed channels, 50 a page, up to `MAX_SUBSCRIPTIONS`. */
  async #listSubscriptions(): Promise<Channel[]> {
    const channels: Channel[] = []

    for await (const page of this.#pages<SubscriptionListResponse>(
      'subscriptions',
      { part: 'snippet', mine: 'true' },
      MAX_SUBSCRIPTIONS,
    )) {
      for (const item of page.items ?? []) {
        const id = item.snippet?.resourceId?.channelId
        if (!id) continue
        channels.push({ id, title: item.snippet?.title ?? id })
      }
    }

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
    tick: () => void,
  ): Promise<{ channels: Map<string, Channel>; uploadPlaylists: string[] }> {
    const uploadPlaylists: string[] = []
    const channels = new Map(subscribed.map((channel) => [channel.id, channel]))

    const batches = await mapLimit(
      batchIds(subscribed.map((channel) => channel.id)),
      CONCURRENCY,
      async (batch) => {
        const pages = await this.#collect<ChannelListResponse>(
          'channels',
          { part: 'contentDetails,topicDetails,statistics', id: batch.join(',') },
          batch.length,
        )
        tick()
        return pages
      },
    )

    for (const page of batches.flat()) {
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
   * Step 3: recent uploads per playlist, one playlist to a worker and
   * `CONCURRENCY` of them in the air. This is the long pole: it is the only
   * step the API will not let us batch, so it is as many calls as you have
   * subscriptions.
   *
   * `videosPerChannel` is a budget, not a page size: above the API's maximum
   * it takes more than one page.
   *
   * The ids come back in playlist order however the requests interleaved, so
   * the pool, and the day planned from it, does not depend on which channel's
   * server answered first.
   */
  async #listRecentVideoIds(playlistIds: readonly string[], tick: () => void): Promise<string[]> {
    const failures = new Map<number, unknown>()

    const perPlaylist = await mapLimit(playlistIds, CONCURRENCY, async (playlistId, index) => {
      try {
        const pages = await this.#collect<PlaylistItemListResponse>(
          'playlistItems',
          { part: 'contentDetails', playlistId },
          this.#videosPerChannel,
        )
        tick()
        return pages
      } catch (error) {
        // One channel being deleted, made private or otherwise unreachable is
        // an ordinary fact of a subscription list that has been around a
        // while. It must cost you that channel, not the other two hundred.
        // A fatal error fails the load, and mapLimit hands out no more
        // playlists once one has.
        if (isFatal(error)) throw error
        failures.set(index, error)
        tick()
        return []
      }
    })

    // Every playlist failing is a failure of the load, whatever each
    // individual answer said. An empty pool is shown as an empty subscription
    // list, and this is the case where that would be untrue.
    if (failures.size > 0 && failures.size === playlistIds.length) throw failures.get(0)

    const videoIds = new Set<string>()
    for (const page of perPlaylist.flat()) {
      for (const item of page.items ?? []) {
        const id = item.contentDetails?.videoId
        if (id) videoIds.add(id)
      }
    }
    return [...videoIds]
  }

  /** Step 4 — durations, ratings, category and views, batched 50 ids to a call. */
  async #describeVideos(videoIds: readonly string[], tick: () => void): Promise<Video[]> {
    const videos: Video[] = []

    const batches = await mapLimit(batchIds(videoIds), CONCURRENCY, async (batch) => {
      const pages = await this.#collect<VideoListResponse>(
        'videos',
        {
          // `liveStreamingDetails` is free (parts cost nothing extra within a
          // call) and it is the only reliable way to tell a finished stream
          // from one still running.
          part: 'contentDetails,status,snippet,statistics,liveStreamingDetails',
          id: batch.join(','),
        },
        batch.length,
      )
      tick()
      return pages
    })

    for (const page of batches.flat()) {
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

    // 401 is the API refusing the credential itself (reason `authError`,
    // located in the Authorization header), so the token is handed back to be
    // dropped. 403 refuses the request, and the token stays good.
    if (response.status === 401) this.#tokens.reject?.(token)
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
