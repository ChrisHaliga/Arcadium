/**
 * What a bot knows about the other players: where their heads are and where they are
 * going, which trails are exposed, and how quickly anyone can reach a point. Observed
 * once per tick and shared by every brain.
 */
import { ANGLES, cellAt, headingDelta, headingTo, SUB, vector, TRIG_ONE, type Heading, type SimConfig, type SimState, type Slot } from '../core';

export interface Rival {
  slot: Slot;
  /** Head centre, subunits. */
  x: number;
  y: number;
  /** Last tick's movement in subunits: a straight-line guess at where the head goes next. */
  vx: number;
  vy: number;
  moveHeading: Heading;
  /** Head positions while outside their land (empty at home): their exposed trail. */
  trailPath: readonly number[];
  /** Ticks they need to get home, worked out on first use (see homeTicks). */
  home: number | null;
}

/** Every living player this tick, in slot order. */
export function observe(state: SimState): Rival[] {
  const { speed } = state.config;
  const rivals: Rival[] = [];
  for (const p of state.players) {
    if (!p?.alive) continue;
    const v = vector(p.moveHeading);
    rivals.push({
      slot: p.slot,
      x: p.x,
      y: p.y,
      vx: (v.dx * speed) / TRIG_ONE,
      vy: (v.dy * speed) / TRIG_ONE,
      moveHeading: p.moveHeading,
      trailPath: p.trailPath,
      home: null,
    });
  }
  return rivals;
}

/** Cells travelled per tick. */
function cellsPerTick(config: SimConfig): number {
  return config.speed / SUB;
}

/**
 * Ticks for a head at (x, y) moving along `heading` to come within `reach` cells of
 * (tx, ty): the straight distance plus the time spent turning to face it, plus `hesitation`
 * when the point lies behind them (they have to notice it before turning round).
 */
export function ticksToReach(
  config: SimConfig,
  x: number,
  y: number,
  heading: Heading,
  tx: number,
  ty: number,
  reach: number,
  hesitation = 0,
): number {
  const dx = tx - x;
  const dy = ty - y;
  const cells = Math.max(0, Math.sqrt(dx * dx + dy * dy) / SUB - reach);
  if (cells === 0) return 0;
  const turn = Math.abs(headingDelta(heading, headingTo(dx, dy)));
  return cells / cellsPerTick(config) + turn / config.turnRate + (turn > ANGLES / 4 ? hesitation : 0);
}

/** Index (of the x coordinate) of the point of `path` nearest (x, y), looking at every `stride`-th point; -1 for an empty path. */
export function nearestOnPath(path: readonly number[], x: number, y: number, stride: number, from = 0, to = path.length): number {
  let best = -1;
  let bestSq = Infinity;
  const step = 2 * stride;
  for (let i = from; i + 1 < to; i += step) {
    const dx = path[i] - x;
    const dy = path[i + 1] - y;
    const sq = dx * dx + dy * dy;
    if (sq < bestSq) {
      bestSq = sq;
      best = i;
    }
  }
  return best;
}

/** How far the land search reaches around a head, in cells: beyond it the trail's start stands in. */
const HOME_SEARCH_RADIUS = 40;

/**
 * Ticks the rival needs to get home: straight to the nearest bit of their land found
 * near their head, or back to where their trail started if that is nearer. 0 at home.
 */
export function homeTicks(state: SimState, rival: Rival): number {
  if (rival.home !== null) return rival.home;
  let cells = 0;
  if (rival.trailPath.length >= 2 && state.owner[cellAt(state.size, rival.x, rival.y)] !== rival.slot) {
    const dx = (rival.trailPath[0] - rival.x) / SUB;
    const dy = (rival.trailPath[1] - rival.y) / SUB;
    cells = Math.min(Math.sqrt(dx * dx + dy * dy), nearestOwnedCell(state, rival.slot, rival.x, rival.y, HOME_SEARCH_RADIUS));
  }
  rival.home = cells / cellsPerTick(state.config);
  return rival.home;
}

/**
 * Distance in cells from (x, y) (subunits) to the nearest cell owned by `slot` within
 * `radius` cells, or Infinity. Searches square rings outward on every other cell, which is
 * plenty for land that is always several cells thick, and stops once no nearer cell can
 * turn up.
 */
function nearestOwnedCell(state: SimState, slot: Slot, x: number, y: number, radius: number): number {
  const { size, owner } = state;
  const cx0 = Math.floor(x / SUB);
  const cy0 = Math.floor(y / SUB);
  let bestSq = Infinity;
  for (let r = 1; r <= radius && r * r < bestSq; r += 2) {
    for (let d = -r; d <= r; d += 2) {
      bestSq = Math.min(
        bestSq,
        ownedDistSq(cx0 + d, cy0 - r),
        ownedDistSq(cx0 + d, cy0 + r),
        ownedDistSq(cx0 - r, cy0 + d),
        ownedDistSq(cx0 + r, cy0 + d),
      );
    }
  }
  return Math.sqrt(bestSq);

  function ownedDistSq(gx: number, gy: number): number {
    if (gx < 0 || gy < 0 || gx >= size || gy >= size || owner[gy * size + gx] !== slot) return Infinity;
    const dx = gx + 0.5 - x / SUB;
    const dy = gy + 0.5 - y / SUB;
    return dx * dx + dy * dy;
  }
}
