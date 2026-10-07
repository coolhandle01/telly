import './Room.css'

/**
 * The room the set is in.
 *
 * A console television is furniture: it has legs and it stands on the floor,
 * so the scene it needs is a wall behind it, a skirting board, and carpet —
 * not a sideboard. (A set without legs would want one; `Cabinet` takes
 * `legs={false}` for that day.)
 *
 * Everything here is drawn with gradients, like the cabinet, and everything is
 * lit from the upper left, like the cabinet. The room is kept *dim* on
 * purpose: a sitting room with the curtains shut and the only real light
 * coming off the tube. That is both what it looked like and what keeps the
 * wallpaper from competing with the set, which is the thing you came for.
 *
 * The floor line is the stage's own bottom edge, which is where the feet are —
 * so the set stands on the carpet at every window size without anyone
 * measuring anything.
 */

export function Room() {
  return (
    <div className="room" aria-hidden="true">
      <span className="room__wall" />
      <span className="room__floor" />
      <span className="room__contact" />
      <span className="room__skirting" />
    </div>
  )
}
