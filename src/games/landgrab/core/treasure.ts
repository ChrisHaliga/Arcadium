/** Treasure cells: bonus pickups kept on neutral, trail-free ground (tick order step 13). */
import type { TickContext } from './context';
import { cx, cy } from './grid';
import type { CellMarks } from './marks';
import { randInt } from './rng';
import type { SimState, Slot } from './types';

const PLACE_ATTEMPTS = 200;
/** Cells around a treasure's centre that must be playable, neutral and trail-free too, so it never sits half on the edge or on land. */
const CLEARANCE = 3;
/** Treasures keep at least this many cells apart, so the set spreads over the map. */
const SPACING = 24;

/** Round start: lay out the full set at once. */
export function fillTreasures(state: SimState): void {
  for (let i = 0; i < state.config.treasureCount; i++) placeTreasure(state);
  state.treasureCooldown = state.config.treasureRespawnTicks;
}

/**
 * Replaces collected treasures one at a time. The cooldown only runs while the set is
 * short, so a treasure reappears treasureRespawnTicks after one is taken.
 */
export function tickTreasure(state: SimState): void {
  const { treasureCount, treasureRespawnTicks } = state.config;
  if (state.treasure.length >= treasureCount) {
    state.treasureCooldown = treasureRespawnTicks;
    return;
  }
  if (state.treasureCooldown > 0) state.treasureCooldown--;
  if (state.treasureCooldown === 0 && placeTreasure(state)) state.treasureCooldown = treasureRespawnTicks;
}

/** Removes every treasure inside `gained`, crediting the capturer. */
export function collectTreasures(state: SimState, ctx: TickContext, slot: Slot, gained: CellMarks): void {
  for (let i = 0; i < state.treasure.length; ) {
    const cell = state.treasure[i];
    if (gained.has(cell)) {
      state.treasure.splice(i, 1);
      ctx.events.push({ t: 'treasure', slot, cell });
    } else {
      i++;
    }
  }
}

function placeTreasure(state: SimState): boolean {
  const cells = state.size * state.size;
  for (let i = 0; i < PLACE_ATTEMPTS; i++) {
    const c = randInt(state, cells);
    if (isClear(state, c) && isApartFromTreasures(state, c)) {
      state.treasure.push(c);
      return true;
    }
  }
  return false;
}

function isClear(state: SimState, centre: number): boolean {
  const { size, mask, owner, trail } = state;
  const x0 = cx(size, centre);
  const y0 = cy(size, centre);
  if (x0 < CLEARANCE || y0 < CLEARANCE || x0 >= size - CLEARANCE || y0 >= size - CLEARANCE) return false;
  for (let y = y0 - CLEARANCE; y <= y0 + CLEARANCE; y++) {
    for (let x = x0 - CLEARANCE; x <= x0 + CLEARANCE; x++) {
      const c = y * size + x;
      if (mask[c] === 0 || owner[c] !== 0 || trail[c] !== 0) return false;
    }
  }
  return true;
}

function isApartFromTreasures(state: SimState, cell: number): boolean {
  const x = cx(state.size, cell);
  const y = cy(state.size, cell);
  return state.treasure.every((t) => {
    const dx = cx(state.size, t) - x;
    const dy = cy(state.size, t) - y;
    return dx * dx + dy * dy >= SPACING * SPACING;
  });
}
