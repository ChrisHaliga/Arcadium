/**
 * How tense the moment is, for the music's tension layer: nothing at home, rising with
 * the length of the trail you're dragging, and higher still with an enemy head close to
 * your head or trail.
 */
import { SUB, type SimState, type Slot } from '../core';

/** Trail points (one per tick outside) at which the trail alone gives its full share. */
const FULL_TRAIL_POINTS = 160;
/** Enemy heads closer than this many cells start to count as danger. */
const DANGER_CELLS = 36;
/** Every Nth trail point is enough to judge distance. */
const PATH_STRIDE = 3;
const BASE = 0.18;
const TRAIL_SHARE = 0.5;
const DANGER_SHARE = 0.4;

export function tensionLevel(view: SimState, slot: Slot): number {
  const me = view.players[slot];
  if (!me?.alive || view.roundOver) return 0;
  const points = me.trailPath.length >> 1;
  if (points === 0) return 0;
  const trail = Math.min(1, points / FULL_TRAIL_POINTS);
  return Math.min(1, BASE + TRAIL_SHARE * trail + DANGER_SHARE * danger(view, slot));
}

/** 0..1: how close the nearest enemy head is to your head or trail. */
function danger(view: SimState, slot: Slot): number {
  const me = view.players[slot]!;
  const path = me.trailPath;
  const reach = DANGER_CELLS * SUB;
  let nearest = reach * reach;
  for (let s = 1; s < view.players.length; s++) {
    const other = view.players[s];
    if (s === slot || !other?.alive) continue;
    nearest = Math.min(nearest, squared(other.x - me.x, other.y - me.y));
    for (let i = 0; i < path.length; i += 2 * PATH_STRIDE) {
      nearest = Math.min(nearest, squared(other.x - path[i], other.y - path[i + 1]));
    }
  }
  return 1 - Math.sqrt(nearest) / reach;
}

function squared(dx: number, dy: number): number {
  return dx * dx + dy * dy;
}
