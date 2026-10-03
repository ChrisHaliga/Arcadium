/**
 * Feats (tick order step 12): notable plays that earn a callout and a bonus roll. The
 * thresholds implement the FeatId definitions in types.ts. Each feat is emitted for the
 * capturing or killing player right after the capture or death that earned it.
 */
import { isLiving, type PendingDeath, type TickContext } from './context';
import { cellAt, cx, cy } from './grid';
import type { FeatId, SimState, Slot } from './types';

export interface CaptureSummary {
  slot: Slot;
  /** Cells that became the capturer's. */
  gained: number;
  /** The trail that closed the loop. */
  trail: readonly number[];
  /** Leader just before this capture (0 if nobody was alive). */
  leader: Slot;
  /** Cells this capture took from the leader (0 when the capturer is the leader). */
  fromLeader: number;
}

/** Living player with the most land, lowest slot on ties; 0 when nobody is alive. */
export function leaderSlot(state: SimState, ctx: TickContext): Slot {
  let leader = 0;
  for (let slot = 1; slot < state.players.length; slot++) {
    if (!isLiving(state, ctx, slot)) continue;
    if (leader === 0 || state.counts[slot] > state.counts[leader]) leader = slot;
  }
  return leader;
}

export function captureFeats(state: SimState, ctx: TickContext, c: CaptureSummary): void {
  const { playable, config } = state;
  if (c.gained * 1000 >= config.bigHaulPermille * playable) emit(ctx, c.slot, 'bighaul', 0);
  if (c.fromLeader > 0 && c.fromLeader * 1000 >= config.leaderStealPermille * playable) {
    emit(ctx, c.slot, 'leadersteal', c.leader);
  }
  const rival = rivalNearTrail(state, ctx, c.slot, c.trail);
  if (rival !== 0) emit(ctx, c.slot, 'closecall', rival);
}

/**
 * Feats for the killer of `death`. Reads the killer's lastKilledBy as it stood before
 * this tick, so two players killing each other at once is not revenge.
 */
export function killFeats(state: SimState, ctx: TickContext, death: PendingDeath): void {
  const killer = state.players[death.killer]!;
  const victim = state.players[death.slot]!;
  if (death.cause === 'enclosed') emit(ctx, death.killer, 'trap', death.slot);
  if (death.cause === 'cut' && death.nearHome) emit(ctx, death.killer, 'clutch', death.slot);
  if (killer.lastKilledBy === victim.profile.id) emit(ctx, death.killer, 'revenge', death.slot);
  const window = state.config.multiKillTicks;
  killer.recentKillTicks = killer.recentKillTicks.filter((tick) => ctx.t - tick <= window);
  killer.recentKillTicks.push(ctx.t);
  if (killer.recentKillTicks.length >= 2) emit(ctx, death.killer, 'multikill', death.slot);
}

/** First living rival (slot order) whose head cell is within closeCallRadius cells of a trail cell; 0 if none. */
function rivalNearTrail(state: SimState, ctx: TickContext, slot: Slot, trail: readonly number[]): Slot {
  const { size } = state;
  const reach = state.config.closeCallRadius;
  const limit = reach * reach;
  for (let other = 1; other < state.players.length; other++) {
    if (other === slot || !isLiving(state, ctx, other)) continue;
    const q = state.players[other]!;
    const head = cellAt(size, q.x, q.y);
    const hx = cx(size, head);
    const hy = cy(size, head);
    const near = trail.some((c) => {
      const dx = cx(size, c) - hx;
      const dy = cy(size, c) - hy;
      return dx * dx + dy * dy <= limit;
    });
    if (near) return other;
  }
  return 0;
}

function emit(ctx: TickContext, slot: Slot, feat: FeatId, victim: Slot): void {
  ctx.events.push({ t: 'feat', slot, feat, victim });
}
