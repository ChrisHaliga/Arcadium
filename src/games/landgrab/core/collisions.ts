/**
 * Collision rules (tick order step 6), judged against the pre-move state. Every rule is
 * checked independently and all resulting deaths happen; when a player is caught by
 * several, the earlier rule in the spec's order decides cause and credit, and within a
 * rule the lowest-slot killer gets the kill.
 */
import { markDeath, type TickContext } from './context';
import { cellAt, ownsNear } from './grid';
import type { MovePlan } from './movement';
import { isLethalOwnTrail } from './trail';
import { SUB, type SimState } from './types';

export function resolveCollisions(state: SimState, plans: readonly (MovePlan | null)[], ctx: TickContext): void {
  headOns(state, plans, ctx);
  cuts(state, plans, ctx);
  selfHits(state, plans, ctx);
}

/** Two heads ending the tick less than two head radii apart both die, with no killer. */
function headOns(state: SimState, plans: readonly (MovePlan | null)[], ctx: TickContext): void {
  const reach = 2 * state.config.headRadius * SUB;
  const reachSq = reach * reach;
  for (let a = 1; a < plans.length; a++) {
    const pa = plans[a];
    if (!pa) continue;
    for (let b = a + 1; b < plans.length; b++) {
      const pb = plans[b];
      if (!pb) continue;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      if (dx * dx + dy * dy < reachSq) {
        markDeath(ctx, a, 0, 'headon');
        markDeath(ctx, b, 0, 'headon');
      }
    }
  }
}

/** A probe point on another player's trail kills its owner, credited to the mover. */
function cuts(state: SimState, plans: readonly (MovePlan | null)[], ctx: TickContext): void {
  const { size } = state;
  const { clutchRadius } = state.config;
  for (let slot = 1; slot < plans.length; slot++) {
    const plan = plans[slot];
    if (!plan) continue;
    for (let i = 0; i < plan.probes.length; i += 2) {
      const victim = state.trail[cellAt(size, plan.probes[i], plan.probes[i + 1])];
      if (victim === 0 || victim === slot) continue;
      const v = state.players[victim]!;
      const nearHome = ownsNear(state, victim, cellAt(size, v.x, v.y), clutchRadius);
      markDeath(ctx, victim, slot, 'cut', nearHome);
    }
  }
}

/** A probe point on your own trail kills you once that trail is older than the grace period. */
function selfHits(state: SimState, plans: readonly (MovePlan | null)[], ctx: TickContext): void {
  for (let slot = 1; slot < plans.length; slot++) {
    const plan = plans[slot];
    if (!plan) continue;
    for (let i = 0; i < plan.probes.length; i += 2) {
      if (isLethalOwnTrail(state, ctx.t, slot, cellAt(state.size, plan.probes[i], plan.probes[i + 1]))) {
        markDeath(ctx, slot, 0, 'self');
      }
    }
  }
}
