/** Maps, round transitions and the win condition (tick order step 10). */
import type { TickContext } from './context';
import { leaderSlot } from './feats';
import { generateMap } from './mapgen';
import { fillTreasures } from './treasure';
import type { Player, SimState, Slot } from './types';

/**
 * Puts a map in place on an empty board: no land, no trails, no round result, a full set
 * of treasures. Takes ownership of the mask (one byte per cell, 1 = playable), as
 * generateMap hands it over.
 */
export function loadMap(state: SimState, map: { mask: Uint8Array; playable: number }): void {
  const cells = state.size * state.size;
  if (map.mask.length !== cells) throw new Error(`mask has ${map.mask.length} cells, expected ${cells}`);
  state.mask = map.mask;
  state.playable = map.playable;
  state.owner.fill(0);
  state.trail.fill(0);
  state.trailTick.fill(0);
  state.counts.fill(0);
  state.treasure = [];
  state.roundOver = null;
  fillTreasures(state);
}

/** New map from `seed`; everyone present waits dead and landless, with this round's revives unused. */
export function startNewRound(state: SimState, seed: number, ctx: TickContext): void {
  state.seed = seed;
  state.round++;
  loadMap(state, generateMap(state.size, seed));
  for (const p of state.players) {
    if (!p) continue;
    if (p.alive) p.diedAtTick = ctx.t;
    Object.assign(p, {
      alive: false,
      trail: [],
      trailPath: [],
      slideSide: 0,
      reviveUntilTick: -1,
      revivesUsed: 0,
      spawnPending: false,
    } satisfies Partial<Player>);
  }
  ctx.events.push({ t: 'newRound', seed, round: state.round });
}

/**
 * Who wins the round this tick, or 0: the surviving player with the most land (lowest
 * slot on ties) once they hold winPermille of the map. It can be known before this
 * tick's deaths are applied, since those only clear the dying players' land.
 */
export function roundWinner(state: SimState, ctx: TickContext): Slot {
  const leader = leaderSlot(state, ctx);
  if (leader === 0 || state.counts[leader] * 1000 < state.config.winPermille * state.playable) return 0;
  return leader;
}

/** Freezes the board: nothing moves again until newRound. */
export function endRound(state: SimState, ctx: TickContext, winner: Slot): void {
  state.roundOver = { winner, tick: ctx.t };
  ctx.events.push({ t: 'roundOver', winner });
}
