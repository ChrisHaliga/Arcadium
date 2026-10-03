/**
 * State fingerprint for desync detection: 32-bit FNV-1a over every field that can
 * influence future ticks, plus the trail paths the renderer draws. Cosmetic profile
 * fields (name, colour, loadout) are left out. trailTick only matters under a trail,
 * so it is hashed for each player's trail cells rather than as a whole grid.
 */
import { forEachRun } from './runs';
import type { SimState } from './types';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function checksum(state: SimState): number {
  let h = FNV_OFFSET;
  const int = (v: number) => {
    h = Math.imul(h ^ (v & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), FNV_PRIME);
  };
  // Grids are hashed as runs of equal values, which pins them down just as exactly as
  // hashing every byte: the run-length encoding of a grid is unique. Most of a grid is long
  // runs, so this reads and multiplies a fraction as much.
  const runs = (grid: Uint8Array) =>
    forEachRun(grid, (value, length) => {
      int(value);
      int(length);
    });
  const list = (values: readonly number[]) => {
    int(values.length);
    for (const v of values) int(v);
  };
  const text = (s: string | null) => {
    int(s === null ? -1 : s.length);
    if (s !== null) for (let i = 0; i < s.length; i++) int(s.charCodeAt(i));
  };

  int(state.tick);
  int(state.round);
  int(state.seed);
  int(state.rng);
  int(state.size);
  runs(state.mask);
  runs(state.owner);
  runs(state.trail);
  list(state.treasure);
  int(state.treasureCooldown);
  int(state.roundOver ? state.roundOver.winner : -1);
  int(state.roundOver ? state.roundOver.tick : -1);
  for (const p of state.players) {
    int(p ? 1 : 0);
    if (!p) continue;
    text(p.profile.id);
    int(p.profile.kind === 'human' ? 1 : 0);
    int(p.alive ? 1 : 0);
    int(p.x);
    int(p.y);
    int(p.heading);
    int(p.targetHeading);
    int(p.moveHeading);
    int(p.slideSide);
    list(p.trail);
    for (const c of p.trail) int(state.trailTick[c]);
    list(p.trailPath);
    int(p.kills);
    text(p.lastKilledBy);
    list(p.recentKillTicks);
    int(p.lifeStartTick);
    int(p.peakCells);
    int(p.diedAtTick);
    int(p.reviveUntilTick);
    int(p.revivesUsed);
    int(p.spawnPending ? 1 : 0);
  }
  return h >>> 0;
}
