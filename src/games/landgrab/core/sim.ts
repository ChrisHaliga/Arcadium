/**
 * The Landgrab simulation: state creation and the tick pipeline. step() reads top to
 * bottom like "Tick order" in docs/ARCHITECTURE.md.
 */
import { resolveCollisions } from './collisions';
import { applyCommand } from './commands';
import { newTickContext } from './context';
import { runCaptures } from './capture';
import { applyDeaths, closeExpiredReviveWindows, killLandless } from './deaths';
import { generateMap } from './mapgen';
import { moveSurvivors, planMoves } from './movement';
import { seedRng } from './rng';
import { endRound, loadMap, roundWinner } from './round';
import { retryPendingSpawns } from './spawn';
import { tickTreasure } from './treasure';
import type { Command, SimConfig, SimEvent, SimState } from './types';

/** Round 1 on the generated map for `seed`, with no players. */
export function createSim(config: SimConfig, seed: number): SimState {
  return createOnMap(config, generateMap(config.size, seed), seed);
}

/**
 * Round 1 on a hand-made map (size x size, non-zero = playable), with no players. For
 * tests and tools; later rounds generate their maps from the newRound seed as usual.
 */
export function createSimFromMask(config: SimConfig, mask: ArrayLike<number>, seed: number): SimState {
  // A plain loop: Uint8Array.from with a mapping callback costs milliseconds on a full-size grid.
  const playableMask = new Uint8Array(mask.length);
  let playable = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    playableMask[i] = 1;
    playable++;
  }
  return createOnMap(config, { mask: playableMask, playable }, seed);
}

function createOnMap(config: SimConfig, map: { mask: Uint8Array; playable: number }, seed: number): SimState {
  // Grids store slots in bytes.
  if (config.maxSlots > 255) throw new Error('maxSlots must fit in a byte');
  const cells = config.size * config.size;
  const state: SimState = {
    config: { ...config },
    seed,
    round: 1,
    tick: 0,
    size: config.size,
    mask: map.mask,
    playable: map.playable,
    owner: new Uint8Array(cells),
    trail: new Uint8Array(cells),
    trailTick: new Uint16Array(cells),
    counts: new Int32Array(config.maxSlots + 1),
    players: Array.from({ length: config.maxSlots + 1 }, () => null),
    treasure: [],
    treasureCooldown: 0,
    rng: seedRng(seed),
    roundOver: null,
  };
  loadMap(state, map);
  return state;
}

/** Advances one tick, mutating `state`. Returns what happened, in order. */
export function step(state: SimState, cmds: readonly Command[]): SimEvent[] {
  const ctx = newTickContext(state);
  for (const cmd of cmds) applyCommand(state, cmd, ctx);
  closeExpiredReviveWindows(state, ctx);
  retryPendingSpawns(state, ctx);
  if (state.roundOver) {
    state.tick = ctx.t;
    return ctx.events;
  }
  const plans = planMoves(state);
  resolveCollisions(state, plans, ctx);
  moveSurvivors(state, plans, ctx);
  runCaptures(state, ctx);
  killLandless(state, ctx);
  // The win (step 10) is settled before deaths are applied: a death on the winning tick
  // must not open a revive window that the finished round would refuse.
  const winner = roundWinner(state, ctx);
  applyDeaths(state, ctx, winner !== 0);
  if (winner !== 0) {
    endRound(state, ctx, winner);
    // Windows opened on earlier ticks close with the round, not at the next tick's step 2.
    closeExpiredReviveWindows(state, ctx);
  }
  tickTreasure(state);
  updatePeaks(state);
  state.tick = ctx.t;
  return ctx.events;
}

function updatePeaks(state: SimState): void {
  for (const p of state.players) {
    if (p?.alive && state.counts[p.slot] > p.peakCells) p.peakCells = state.counts[p.slot];
  }
}
