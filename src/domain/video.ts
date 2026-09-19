/** A candidate programme. Shaped by what the YouTube API can actually tell us. */
export interface Video {
  id: string
  channelId: string
  title: string
  durationSec: number
  /** ISO 8601. */
  publishedAt: string
  /** YouTube category; '25' is News & Politics. */
  categoryId?: string
  /** The uploader's own keywords. Thin on some videos, rich on others. */
  tags?: readonly string[]
  /** Views as reported. Absent where the uploader hides their statistics. */
  viewCount?: number
  /**
   * YouTube's own age restriction. The watershed rule in one field: nothing
   * carrying it goes out before nine.
   */
  ageRestricted: boolean
  /** Declared as children's content. Daytime, and nowhere near the late film. */
  madeForKids: boolean
  /**
   * Filtered at plan time, not discovered on air. This is the field that makes
   * "video unavailable in embedded player" mostly stop existing.
   */
  embeddable: boolean
  isLive: boolean
}

export interface Channel {
  id: string
  title: string
  /**
   * What YouTube says this channel is about, as the last segment of each
   * Wikipedia URL in `topicDetails.topicCategories`: `Humour`, `Food`,
   * `Video_game_culture`. YouTube's own judgement of a whole channel, which is
   * steadier than any one video's category and is the strongest genre signal
   * available without asking a model anything.
   */
  topics?: readonly string[]
  /** Subscribers as reported. Absent where the channel hides the count. */
  subscriberCount?: number
}

/** Everything eligible to be scheduled, plus the channels it came from. */
export interface Pool {
  videos: readonly Video[]
  channels: ReadonlyMap<string, Channel>
}
