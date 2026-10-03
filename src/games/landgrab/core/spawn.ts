/** New lives (join, spawn, pending retries) and second chances (revive). */
import type { TickContext } from './context';
import { cellAt, cellCentre, cx, cy, idx } from './grid';
import { claimDisc } from './land';
import { randInt } from './rng';
import { headingTo } from './trig';
import { ANGLES, SUB, type Player, type PlayerProfile, type SimState, type Slot } from './types';

const SPAWN_ATTEMPTS = 200;
/** Free cells required around the start territory, beyond startRadius. */
const SPAWN_MARGIN = 4;
/** A spawn this many cells from every living head is preferred over a closer one. */
const SPAWN_PREFERRED_HEAD_DISTANCE = 60;

/** A dead, landless player occupying `slot`; startLife() brings them in. */
export function newPlayer(slot: Slot, profile: PlayerProfile, tick: number): Player {
  return {
    slot,
    // Copied so the state never shares objects with the command stream that delivered it.
    profile: { ...profile, cosmetics: { ...profile.cosmetics } },
    alive: false,
    x: 0,
    y: 0,
    heading: 0,
    targetHeading: 0,
    moveHeading: 0,
    slideSide: 0,
    trail: [],
    trailPath: [],
    kills: 0,
    lastKilledBy: null,
    recentKillTicks: [],
    lifeStartTick: tick,
    peakCells: 0,
    diedAtTick: tick,
    reviveUntilTick: -1,
    revivesUsed: 0,
    spawnPending: false,
  };
}

/** Spawns a fresh life on free ground, or marks the player pending when the map has no room. */
export function startLife(state: SimState, slot: Slot, ctx: TickContext): void {
  const p = state.players[slot]!;
  const cell = findSpawnCell(state, slot);
  if (cell < 0) {
    p.spawnPending = true;
    return;
  }
  claimDisc(state, slot, cx(state.size, cell), cy(state.size, cell), state.config.startRadius);
  const heading = randInt(state, ANGLES);
  Object.assign(p, {
    alive: true,
    x: cellCentre(cx(state.size, cell)),
    y: cellCentre(cy(state.size, cell)),
    heading,
    targetHeading: heading,
    moveHeading: heading,
    slideSide: 0,
    trail: [],
    trailPath: [],
    kills: 0,
    recentKillTicks: [],
    lifeStartTick: ctx.t,
    peakCells: state.counts[slot],
    diedAtTick: -1,
    reviveUntilTick: -1,
    spawnPending: false,
  } satisfies Partial<Player>);
  ctx.events.push({ t: 'spawn', slot, x: p.x, y: p.y, revive: false });
}

export function retryPendingSpawns(state: SimState, ctx: TickContext): void {
  for (let slot = 1; slot < state.players.length; slot++) {
    const p = state.players[slot];
    if (p && !p.alive && p.spawnPending) startLife(state, slot, ctx);
  }
}

/**
 * Second chance: the same life continues (kills, peak, start tick are kept) from the
 * owned cell nearest where the player died, heading toward the middle of their land.
 * Ignored unless the revive window is open and revives and land remain.
 */
export function revive(state: SimState, slot: Slot, ctx: TickContext): void {
  const p = state.players[slot];
  if (!p || p.alive || state.roundOver !== null) return;
  if (ctx.t > p.reviveUntilTick || state.counts[slot] === 0) return;
  if (p.revivesUsed >= state.config.maxRevivesPerRound) return;
  const cell = nearestOwnedFreeCell(state, slot, cellAt(state.size, p.x, p.y));
  if (cell < 0) return;
  const x = cellCentre(cx(state.size, cell));
  const y = cellCentre(cy(state.size, cell));
  const middle = landMiddle(state, slot);
  const heading = middle.x === x && middle.y === y ? p.heading : headingTo(middle.x - x, middle.y - y);
  Object.assign(p, {
    alive: true,
    x,
    y,
    heading,
    targetHeading: heading,
    moveHeading: heading,
    slideSide: 0,
    diedAtTick: -1,
    reviveUntilTick: -1,
    revivesUsed: p.revivesUsed + 1,
    spawnPending: false,
  } satisfies Partial<Player>);
  ctx.events.push({ t: 'spawn', slot, x, y, revive: true });
}

/**
 * Random cell whose surroundings (startRadius + margin) are playable, neutral and free of
 * trails and treasure. The first candidate far from every living head wins; otherwise the
 * first acceptable one. -1 when no attempt fits.
 */
function findSpawnCell(state: SimState, slot: Slot): number {
  const r = state.config.startRadius + SPAWN_MARGIN;
  const span = state.size - 2 * r;
  if (span <= 0) return -1;
  let fallback = -1;
  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const x = r + randInt(state, span);
    const y = r + randInt(state, span);
    if (!isAreaFree(state, x, y, r)) continue;
    const cell = idx(state.size, x, y);
    if (isFarFromHeads(state, slot, x, y)) return cell;
    if (fallback < 0) fallback = cell;
  }
  return fallback;
}

function isAreaFree(state: SimState, x: number, y: number, r: number): boolean {
  const limit = r * r + r;
  for (const t of state.treasure) {
    const dx = cx(state.size, t) - x;
    const dy = cy(state.size, t) - y;
    if (dx * dx + dy * dy <= limit) return false;
  }
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > limit) continue;
      const c = idx(state.size, x + dx, y + dy);
      if (state.mask[c] === 0 || state.owner[c] !== 0 || state.trail[c] !== 0) return false;
    }
  }
  return true;
}

function isFarFromHeads(state: SimState, slot: Slot, x: number, y: number): boolean {
  const far = SPAWN_PREFERRED_HEAD_DISTANCE * SUB;
  for (const other of state.players) {
    if (!other || !other.alive || other.slot === slot) continue;
    const dx = other.x - cellCentre(x);
    const dy = other.y - cellCentre(y);
    if (dx * dx + dy * dy < far * far) return false;
  }
  return true;
}

/** Owned, trail-free cell closest (Euclidean) to `target`; ties go to the lowest index. -1 if none. */
function nearestOwnedFreeCell(state: SimState, slot: Slot, target: number): number {
  const { size, owner, trail } = state;
  const tx = cx(size, target);
  const ty = cy(size, target);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < owner.length; i++) {
    if (owner[i] !== slot || trail[i] !== 0) continue;
    const dx = cx(size, i) - tx;
    const dy = cy(size, i) - ty;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Centre of mass of the slot's land, in subunits (the slot owns at least one cell). */
function landMiddle(state: SimState, slot: Slot): { x: number; y: number } {
  const { size, owner } = state;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++) {
      if (owner[i] !== slot) continue;
      sumX += x;
      sumY += y;
    }
  }
  const n = state.counts[slot];
  return { x: Math.floor((sumX * SUB) / n) + SUB / 2, y: Math.floor((sumY * SUB) / n) + SUB / 2 };
}
