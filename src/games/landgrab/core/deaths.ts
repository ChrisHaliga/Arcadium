/**
 * Death handling: revive windows closing (tick order step 2), land lost (step 9) and
 * applying the tick's deaths (step 11).
 */
import { isLiving, markDeath, type TickContext } from './context';
import { killFeats } from './feats';
import { cellAt } from './grid';
import { clearLand, removeTrail } from './land';
import type { SimState, Slot } from './types';

/**
 * A dead player's kept land goes neutral once the window has passed, the land is gone
 * anyway, or the round is over (no revive is accepted after that).
 */
export function closeExpiredReviveWindows(state: SimState, ctx: TickContext): void {
  for (let slot = 1; slot < state.players.length; slot++) {
    const p = state.players[slot];
    if (!p || p.alive || p.reviveUntilTick < 0) continue;
    if (ctx.t <= p.reviveUntilTick && state.counts[slot] > 0 && state.roundOver === null) continue;
    clearLand(state, slot);
    p.reviveUntilTick = -1;
    ctx.events.push({ t: 'landCleared', slot });
  }
}

/** Anyone left with no land dies, credited to whoever took the last of it. */
export function killLandless(state: SimState, ctx: TickContext): void {
  for (let slot = 1; slot < state.players.length; slot++) {
    if (isLiving(state, ctx, slot) && state.counts[slot] === 0) {
      markDeath(ctx, slot, ctx.lastCapturer[slot], 'landlost');
    }
  }
}

/**
 * Applies every death found this tick, in the order found. Humans with revives and land
 * left keep their land for the revive window, unless this tick ends the round (no revive
 * is accepted after that); everyone else's goes neutral at once.
 * A death's `at` is the victim's head cell: players killed in a collision never made
 * their move, so for them it is where they stood.
 */
export function applyDeaths(state: SimState, ctx: TickContext, roundEnding: boolean): void {
  const { maxRevivesPerRound, reviveWindowTicks } = state.config;
  const losingLand: Slot[] = [];
  for (const death of ctx.deaths) {
    const p = state.players[death.slot]!;
    removeTrail(state, p);
    const canRevive =
      !roundEnding &&
      p.profile.kind === 'human' &&
      p.revivesUsed < maxRevivesPerRound &&
      state.counts[death.slot] > 0;
    if (!canRevive) losingLand.push(death.slot);
    p.alive = false;
    p.slideSide = 0;
    p.diedAtTick = ctx.t;
    p.reviveUntilTick = canRevive ? ctx.t + reviveWindowTicks : -1;
    ctx.events.push({
      t: 'death',
      slot: death.slot,
      killer: death.killer,
      cause: death.cause,
      at: cellAt(state.size, p.x, p.y),
      canRevive,
    });
    if (death.killer !== 0) {
      state.players[death.killer]!.kills++;
      killFeats(state, ctx, death);
    }
  }
  // Nothing above reads land, so one pass over the grid serves every death this tick.
  clearLand(state, ...losingLand);
  // Only now, so revenge checks above never see a death from this same tick.
  for (const death of ctx.deaths) {
    if (death.killer !== 0) state.players[death.slot]!.lastKilledBy = state.players[death.killer]!.profile.id;
  }
}
