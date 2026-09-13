import { Osd } from './Osd'

export interface ChannelOverlayProps {
  /** The preset that is in. Drawn as it is, however many there are. */
  channel: number
}

/**
 * `CH 3`, in the top corner, for a moment after a preset goes in.
 *
 * Top rather than bottom because that is where it went: the channel number and
 * the volume were two different displays in two different corners, and a set
 * that put them in the same place would have had them fight.
 */
export function ChannelOverlay({ channel }: ChannelOverlayProps) {
  return (
    <Osd word="CH" label={`CH ${channel}`} corner="top-left">
      <span className="tv-osd__value" aria-hidden="true">
        {channel}
      </span>
    </Osd>
  )
}
