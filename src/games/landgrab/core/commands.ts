/**
 * Command handling (tick order step 1). Commands may come off the network, so anything
 * malformed or out of place is ignored rather than trusted.
 */
import type { TickContext } from './context';
import { clearLand, removeTrail } from './land';
import { startNewRound } from './round';
import { newPlayer, revive, startLife } from './spawn';
import { ANGLES, type Command, type Player, type PlayerProfile, type SimState, type Slot } from './types';

export function applyCommand(state: SimState, cmd: Command, ctx: TickContext): void {
  switch (cmd.t) {
    case 'steer':
      return steer(state, cmd.slot, cmd.heading);
    case 'join':
      return join(state, cmd.slot, cmd.profile, ctx);
    case 'spawn':
      return respawn(state, cmd.slot, ctx);
    case 'revive':
      if (occupant(state, cmd.slot)) revive(state, cmd.slot, ctx);
      return;
    case 'leave':
      return leave(state, cmd.slot, ctx);
    case 'newRound':
      return startNewRound(state, cmd.seed, ctx);
  }
}

function isSlot(state: SimState, slot: Slot): boolean {
  return Number.isInteger(slot) && slot >= 1 && slot < state.players.length;
}

function occupant(state: SimState, slot: Slot): Player | null {
  return isSlot(state, slot) ? state.players[slot] : null;
}

/** Any heading is accepted: turning toward it is gradual, so even a full reversal is a U-turn. */
function steer(state: SimState, slot: Slot, heading: unknown): void {
  const p = occupant(state, slot);
  if (p && p.alive && isHeading(heading)) p.targetHeading = heading;
}

function isHeading(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < ANGLES;
}

function join(state: SimState, slot: Slot, profile: PlayerProfile, ctx: TickContext): void {
  if (!isSlot(state, slot) || state.players[slot] !== null) return;
  state.players[slot] = newPlayer(slot, profile, ctx.t);
  ctx.events.push({ t: 'join', slot });
  startLife(state, slot, ctx);
}

/** A new life gives up any land kept for a revive. */
function respawn(state: SimState, slot: Slot, ctx: TickContext): void {
  const p = occupant(state, slot);
  if (!p || p.alive) return;
  if (p.reviveUntilTick >= 0) {
    clearLand(state, slot);
    p.reviveUntilTick = -1;
    ctx.events.push({ t: 'landCleared', slot });
  }
  startLife(state, slot, ctx);
}

function leave(state: SimState, slot: Slot, ctx: TickContext): void {
  const p = occupant(state, slot);
  if (!p) return;
  removeTrail(state, p);
  clearLand(state, slot);
  state.players[slot] = null;
  ctx.events.push({ t: 'leave', slot });
}
