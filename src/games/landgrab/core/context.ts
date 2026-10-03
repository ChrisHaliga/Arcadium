/**
 * Bookkeeping for a single step(). Deaths found during the tick are only recorded
 * here and applied together at the end (tick order step 11), so later stages still
 * see the dying player's trail but treat them as out of play.
 */
import type { DeathCause, SimEvent, SimState, Slot } from './types';

export interface PendingDeath {
  slot: Slot;
  /** 0 when nobody is credited (head-on, self). */
  killer: Slot;
  cause: DeathCause;
  /** Cut victims only: their head was within reach of their own land (the clutch feat). */
  nearHome: boolean;
}

export interface TickContext {
  /** The tick being computed: state.tick + 1. */
  t: number;
  events: SimEvent[];
  /** In the order they were found; first finding wins. */
  deaths: PendingDeath[];
  /** 1 = died earlier this tick: no longer moves, captures, kills or dies again. */
  dying: Uint8Array;
  /** Slot that most recently captured land from each slot this tick (killer for land lost). */
  lastCapturer: Int32Array;
}

export function newTickContext(state: SimState): TickContext {
  const slots = state.players.length;
  return {
    t: state.tick + 1,
    events: [],
    deaths: [],
    dying: new Uint8Array(slots),
    lastCapturer: new Int32Array(slots),
  };
}

/** Records a death unless the player already died this tick, so the first cause and killer found stick. */
export function markDeath(ctx: TickContext, slot: Slot, killer: Slot, cause: DeathCause, nearHome = false): void {
  if (ctx.dying[slot]) return;
  ctx.dying[slot] = 1;
  ctx.deaths.push({ slot, killer, cause, nearHome });
}

/** Alive and not already doomed this tick. */
export function isLiving(state: SimState, ctx: TickContext, slot: Slot): boolean {
  const p = state.players[slot];
  return p !== null && p.alive && ctx.dying[slot] === 0;
}
