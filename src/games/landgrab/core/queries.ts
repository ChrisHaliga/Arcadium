/** Read-only views of the state for HUD, bots and rewards. */
import type { SimState, Slot } from './types';

/** Living players, most cells first; ties go to the lower slot. */
export function leaderboard(state: SimState): { slot: Slot; cells: number }[] {
  const rows: { slot: Slot; cells: number }[] = [];
  for (let slot = 1; slot < state.players.length; slot++) {
    if (state.players[slot]?.alive) rows.push({ slot, cells: state.counts[slot] });
  }
  return rows.sort((a, b) => b.cells - a.cells || a.slot - b.slot);
}

/** Share of the playable cells the slot owns, 0..1000. */
export function permille(state: SimState, slot: Slot): number {
  const cells = state.counts[slot] ?? 0;
  return state.playable > 0 ? Math.floor((cells * 1000) / state.playable) : 0;
}
