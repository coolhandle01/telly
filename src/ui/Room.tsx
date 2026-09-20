/**
 * The room the set is in.
 *
 * A console television is furniture: it has legs and it stands on the floor,
 * so the scene it needs is a wall behind it, a skirting board, and carpet,
 * not a sideboard. (A set without legs would want one; `Cabinet` takes
 * `legs={false}` for that day.)
 *
 * Everything here is drawn with gradients, like the cabinet, and everything is
 * lit from the upper left, like the cabinet. The room is kept *dim* on
 * purpose: a sitting room with the curtains shut and the only real light
 * coming off the tube. That is both what it looked like and what keeps the
 * wallpaper from competing with the set, which is the thing you came for.
 *
 * The floor line is the stage's own bottom edge, which is where the feet are,
 * so the set stands on the carpet at every window size without anyone
 * measuring anything.
 */

const CSS = `
.room {
  position: absolute;
  inset: 0;
  /* Behind everything in the stage, and nothing else has to know it is here. */
  z-index: -1;
  pointer-events: none;
}
.room > * {
  position: absolute;
  /* Bled well past the stage: the room is the whole page, and the stage is
     only the part of it the television occupies. The page clips this. */
  left: -100vw;
  right: -100vw;
}

/*
  The paper. A hung wall of interlocking rings, staggered: the pattern a 1970
  sitting room had and nobody chose twice. Two rings to a tile, offset by half
  a step, which is what makes it read as hung paper rather than as a grid.
*/
.room__wall {
  top: -100vh;
  bottom: 0;
  background-color: #241a11;
  background-image:
    radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0) 0 25%, rgba(206, 150, 78, 0.13) 25% 29.5%, rgba(0, 0, 0, 0) 30.5%),
    radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0) 0 25%, rgba(206, 150, 78, 0.13) 25% 29.5%, rgba(0, 0, 0, 0) 30.5%),
    radial-gradient(circle at 50% 50%, rgba(206, 150, 78, 0.09) 0 7%, rgba(0, 0, 0, 0) 8%),
    radial-gradient(circle at 50% 50%, rgba(206, 150, 78, 0.09) 0 7%, rgba(0, 0, 0, 0) 8%),
    /* The light in the room, falling from the upper left as it does on
       everything else here, and dying off towards the corners. */
    radial-gradient(120% 85% at 16% 2%, rgba(255, 216, 156, 0.15), rgba(0, 0, 0, 0) 60%),
    linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.5));
  background-size: 7.5rem 7.5rem, 7.5rem 7.5rem, 7.5rem 7.5rem, 7.5rem 7.5rem, 100% 100%, 100% 100%;
  background-position: 0 0, 3.75rem 3.75rem, 0 0, 3.75rem 3.75rem, 0 0, 0 0;
}

/*
  The skirting, painted the gloss cream every house had. Its top edge catches
  the light, its face is flat, and the dark line under it is the gap no board
  ever quite closes against a floor.
*/
.room__skirting {
  bottom: 0;
  height: 1.35rem;
  /*
    Painted, but down at floor level in a room lit from above, so it is the
    dimmest paint in the house, not the brightest thing in the picture. Gloss
    cream at full value made a bright band across the frame that pulled the
    eye straight off the television.
  */
  background: linear-gradient(
    #a2947c 0 12%,
    #8d806a 12% 28%,
    #7b6f5b 28% 82%,
    #60564a 82% 94%,
    #3d3529 94% 100%
  );
  box-shadow:
    /* The wall above it is in the board's own shadow. */
    0 -0.16rem 0.28rem rgba(0, 0, 0, 0.45),
    0 0.06rem 0.1rem rgba(0, 0, 0, 0.6);
}

/*
  Carpet. Dark, warm and short-pile, going darker towards the front of the
  room where the light does not reach, which is also what stops the floor
  reading as a wall lying down.
*/
.room__floor {
  top: 100%;
  height: 100vh;
  background-color: #31200f;
  background-image:
    repeating-linear-gradient(93deg, rgba(255, 255, 255, 0.022) 0 2px, rgba(0, 0, 0, 0.03) 2px 4px),
    repeating-linear-gradient(8deg, rgba(255, 255, 255, 0.018) 0 3px, rgba(0, 0, 0, 0.028) 3px 6px),
    linear-gradient(rgba(255, 214, 150, 0.07), rgba(0, 0, 0, 0.62) 62%);
}

/* Where the set meets the carpet: the pool of dark under a heavy object. */
.room__contact {
  top: 100%;
  height: 5rem;
  background: radial-gradient(
    58% 100% at 50% 0%,
    rgba(0, 0, 0, 0.62),
    rgba(0, 0, 0, 0) 74%
  );
}
`

export function Room() {
  return (
    <div className="room" aria-hidden="true">
      <style>{CSS}</style>
      <span className="room__wall" />
      <span className="room__floor" />
      <span className="room__contact" />
      <span className="room__skirting" />
    </div>
  )
}
