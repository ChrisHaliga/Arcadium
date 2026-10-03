/** Ownership and trail grid edits shared by spawning, captures, deaths, leaving and rounds. */
import { idx } from './grid';
import type { Player, SimState, Slot } from './types';

/** Every cell owned by any of `slots` goes neutral, in a single pass over the grid. */
export function clearLand(state: SimState, ...slots: Slot[]): void {
  const clearing = new Uint8Array(state.players.length);
  let any = false;
  for (const slot of slots) {
    if (state.counts[slot] === 0) continue;
    clearing[slot] = 1;
    state.counts[slot] = 0;
    any = true;
  }
  if (!any) return;
  const { owner } = state;
  for (let i = 0; i < owner.length; i++) if (clearing[owner[i]] === 1) owner[i] = 0;
}

/**
 * Lifts the player's trail off the grid, leaving alone cells another player has since
 * taken over. trailTick is zeroed with it, so cells without a trail always read 0 there.
 * Fresh arrays rather than truncation: a capture still reads the old trail afterwards.
 */
export function removeTrail(state: SimState, p: Player): void {
  for (const c of p.trail) {
    if (state.trail[c] !== p.slot) continue;
    state.trail[c] = 0;
    state.trailTick[c] = 0;
  }
  p.trail = [];
  p.trailPath = [];
}

/** Gives the slot every cell with dx² + dy² <= r² + r around cell (x, y); callers have checked the cells are free. */
export function claimDisc(state: SimState, slot: Slot, x: number, y: number, r: number): void {
  const limit = r * r + r;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > limit) continue;
      state.owner[idx(state.size, x + dx, y + dy)] = slot;
      state.counts[slot]++;
    }
  }
}
