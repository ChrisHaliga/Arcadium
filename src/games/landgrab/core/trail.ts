/**
 * The trail band: discs stamped along a player's path while they are outside their land
 * (tick order step 7), and the grace rule that keeps the freshly stamped band under
 * your own head from killing you (step 6).
 */
import type { TickContext } from './context';
import { cellAt } from './grid';
import { SUB, type SimState, type Slot } from './types';

/**
 * Longest distance between two consecutive probe points, in subunits (0.6 cells). With
 * discs of radius trailRadius + 0.5 cells this close together, every cell centre within
 * about trailRadius cells of the path is covered, so no 4-connected gap runs through the
 * band and a closed loop always walls off its inside.
 */
export const PROBE_SPACING = Math.floor((SUB * 3) / 5);

/** The band is 2 * trailRadius + 1 cells wide, so its discs reach half a cell past trailRadius. */
export function bandRadius(state: SimState): number {
  return state.config.trailRadius * SUB + SUB / 2;
}

/** Calls visit(cell) for every on-grid cell whose centre lies within `radius` subunits of (px, py). */
export function forEachCellInDisc(size: number, px: number, py: number, radius: number, visit: (cell: number) => void): void {
  const limit = radius * radius;
  const x0 = Math.max(0, Math.floor((px - radius) / SUB));
  const x1 = Math.min(size - 1, Math.floor((px + radius) / SUB));
  const y0 = Math.max(0, Math.floor((py - radius) / SUB));
  const y1 = Math.min(size - 1, Math.floor((py + radius) / SUB));
  for (let y = y0; y <= y1; y++) {
    const dy = y * SUB + SUB / 2 - py;
    for (let x = x0; x <= x1; x++) {
      const dx = x * SUB + SUB / 2 - px;
      if (dx * dx + dy * dy <= limit) visit(y * size + x);
    }
  }
}

/**
 * Stamps the band around one probe point. Probe points on the player's own land lay
 * nothing: the band only exists outside it. Playable cells the player doesn't own become
 * their trail, except cells already holding a trail. The one exception is the trail of a
 * player dying this tick (cut by this very move, say): it is taken over, since it is lifted
 * when the death is applied and would otherwise leave a hole in this band.
 */
export function stampBand(state: SimState, ctx: TickContext, slot: Slot, px: number, py: number): void {
  const at = cellAt(state.size, px, py);
  if (at < 0 || state.owner[at] === slot) return;
  const { mask, owner, trail, trailTick } = state;
  const stamped = state.players[slot]!.trail;
  const tick = ctx.t & 0xffff;
  forEachCellInDisc(state.size, px, py, bandRadius(state), (c) => {
    if (mask[c] === 0 || owner[c] === slot) return;
    const holder = trail[c];
    if (holder === slot || (holder !== 0 && ctx.dying[holder] === 0)) return;
    trail[c] = slot;
    trailTick[c] = tick;
    stamped.push(c);
  });
}

/** True when `cell` holds the slot's own trail stamped more than selfGraceTicks before tick t (wrap-aware). */
export function isLethalOwnTrail(state: SimState, t: number, slot: Slot, cell: number): boolean {
  return state.trail[cell] === slot && ((t - state.trailTick[cell]) & 0xffff) > state.config.selfGraceTicks;
}
