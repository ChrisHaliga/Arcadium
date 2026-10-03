/**
 * Copies of the state: clones and in-place copies for prediction, and JSON-safe
 * snapshots (grids run-length encoded) for joining mid-round and recovering from a desync.
 */
import { forEachRun } from './runs';
import type { Player, SimState, Snapshot } from './types';

type Grid = Uint8Array | Uint16Array;

/** Deep copy that continues independently of `state`. Shares the mask, which is never mutated in place. */
export function cloneState(state: SimState): SimState {
  return {
    config: { ...state.config },
    seed: state.seed,
    round: state.round,
    tick: state.tick,
    size: state.size,
    mask: state.mask,
    playable: state.playable,
    owner: state.owner.slice(),
    trail: state.trail.slice(),
    trailTick: state.trailTick.slice(),
    counts: state.counts.slice(),
    players: state.players.map((p) => p && clonePlayer(p)),
    treasure: state.treasure.slice(),
    treasureCooldown: state.treasureCooldown,
    rng: state.rng,
    roundOver: state.roundOver && { ...state.roundOver },
  };
}

/**
 * Makes `dst` continue exactly like `src`, reusing dst's grids, player objects and arrays
 * so prediction can rebuild its state every frame without allocating. Both states must
 * have the same raster size and slot count (e.g. dst came from cloneState(src) earlier).
 * Objects step() never mutates in place are shared rather than copied: the mask (a new
 * round allocates a new one), the config, player profiles and roundOver (always replaced
 * whole).
 */
export function copyState(dst: SimState, src: SimState): void {
  if (dst.owner.length !== src.owner.length || dst.players.length !== src.players.length) {
    throw new Error('copyState needs two states of the same size');
  }
  dst.config = src.config;
  dst.seed = src.seed;
  dst.round = src.round;
  dst.tick = src.tick;
  dst.size = src.size;
  dst.mask = src.mask;
  dst.playable = src.playable;
  dst.owner.set(src.owner);
  dst.trail.set(src.trail);
  dst.trailTick.set(src.trailTick);
  dst.counts.set(src.counts);
  for (let slot = 0; slot < src.players.length; slot++) {
    const from = src.players[slot];
    dst.players[slot] = from && copyPlayer(dst.players[slot], from);
  }
  copyNumbers(dst.treasure, src.treasure);
  dst.treasureCooldown = src.treasureCooldown;
  dst.rng = src.rng;
  dst.roundOver = src.roundOver;
}

export function serialize(state: SimState): Snapshot {
  return {
    v: 2,
    config: { ...state.config },
    seed: state.seed,
    round: state.round,
    tick: state.tick,
    rng: state.rng,
    mask: encodeRuns(state.mask),
    owner: encodeRuns(state.owner),
    trail: encodeRuns(state.trail),
    trailTick: encodeRuns(state.trailTick),
    players: state.players.map((p) => p && clonePlayer(p)),
    treasure: state.treasure.slice(),
    treasureCooldown: state.treasureCooldown,
    roundOver: state.roundOver && { ...state.roundOver },
  };
}

/** Rebuilds a state that continues exactly like the one serialized. Throws on a malformed snapshot. */
export function deserialize(snap: Snapshot): SimState {
  if (snap.v !== 2) throw new Error(`unsupported snapshot version ${String(snap.v)}`);
  const size = snap.config.size;
  const cells = size * size;
  const mask = decodeRuns(snap.mask, new Uint8Array(cells));
  const owner = decodeRuns(snap.owner, new Uint8Array(cells));
  const counts = new Int32Array(snap.config.maxSlots + 1);
  let playable = 0;
  for (let i = 0; i < cells; i++) {
    playable += mask[i];
    if (owner[i] !== 0) counts[owner[i]]++;
  }
  return {
    config: { ...snap.config },
    seed: snap.seed,
    round: snap.round,
    tick: snap.tick,
    size,
    mask,
    playable,
    owner,
    trail: decodeRuns(snap.trail, new Uint8Array(cells)),
    trailTick: decodeRuns(snap.trailTick, new Uint16Array(cells)),
    counts,
    players: snap.players.map((p) => p && clonePlayer(p)),
    treasure: snap.treasure.slice(),
    treasureCooldown: snap.treasureCooldown,
    rng: snap.rng,
    roundOver: snap.roundOver && { ...snap.roundOver },
  };
}

function clonePlayer(p: Player): Player {
  return {
    ...p,
    profile: { ...p.profile, cosmetics: { ...p.profile.cosmetics } },
    trail: p.trail.slice(),
    trailPath: p.trailPath.slice(),
    recentKillTicks: p.recentKillTicks.slice(),
  };
}

/** Copies `src` into `into` (when there is one), keeping into's own arrays. */
function copyPlayer(into: Player | null, src: Player): Player {
  if (!into) return clonePlayer(src);
  const { trail, trailPath, recentKillTicks } = into;
  Object.assign(into, src);
  into.trail = copyNumbers(trail, src.trail);
  into.trailPath = copyNumbers(trailPath, src.trailPath);
  into.recentKillTicks = copyNumbers(recentKillTicks, src.recentKillTicks);
  return into;
}

function copyNumbers(dst: number[], src: readonly number[]): number[] {
  dst.length = src.length;
  for (let i = 0; i < src.length; i++) dst[i] = src[i];
  return dst;
}

/** [value, runLength, value, runLength, ...] */
function encodeRuns(grid: Grid): number[] {
  const runs: number[] = [];
  forEachRun(grid, (value, length) => runs.push(value, length));
  return runs;
}

function decodeRuns<G extends Grid>(runs: readonly number[], grid: G): G {
  let at = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const length = runs[i + 1];
    if (length < 0 || at + length > grid.length) break;
    grid.fill(runs[i], at, at + length);
    at += length;
  }
  if (at !== grid.length || runs.length % 2 !== 0) throw new Error('snapshot grid does not match the map size');
  return grid;
}
