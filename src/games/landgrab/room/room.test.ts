import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config';
import { cellAt, permille, type SimEvent, type SimState } from '../core';
import { createRoom } from './index';

/** Every way the grids and the players could drift apart, as readable messages. */
function invariantErrors(s: SimState): string[] {
  const errors: string[] = [];
  const owned = new Int32Array(s.counts.length);
  const trailed = new Int32Array(s.counts.length);
  for (let c = 0; c < s.owner.length; c++) {
    owned[s.owner[c]]++;
    trailed[s.trail[c]]++;
    if (s.mask[c] === 0 && (s.owner[c] !== 0 || s.trail[c] !== 0)) errors.push(`void cell ${c} is owned or trailed`);
    if (s.trail[c] !== 0 && s.trail[c] === s.owner[c]) errors.push(`cell ${c} is both land and trail of ${s.owner[c]}`);
  }
  for (let slot = 1; slot < s.players.length; slot++) {
    if (owned[slot] !== s.counts[slot]) errors.push(`slot ${slot} owns ${owned[slot]} cells but counts ${s.counts[slot]}`);
    const p = s.players[slot];
    const trail = p?.trail ?? [];
    if (trailed[slot] !== trail.length) errors.push(`slot ${slot} has ${trailed[slot]} trail cells on the grid but ${trail.length} in its trail`);
    if (trail.some((c) => s.trail[c] !== slot)) errors.push(`slot ${slot} lists trail cells the grid doesn't hold`);
    if (!p) continue;
    if (!p.alive && trail.length > 0) errors.push(`dead slot ${slot} still has a trail`);
    if (p.alive) {
      const head = cellAt(s.size, p.x, p.y);
      if (head < 0 || s.mask[head] === 0) errors.push(`slot ${slot} is on void`);
    }
  }
  return errors;
}

describe('room', () => {
  it('runs a long bots-only match that keeps every invariant, with real captures and kills', () => {
    const room = createRoom({ seed: 7, minPopulation: 15 });
    let captured = 0;
    let kills = 0;
    let bestShare = 0;
    for (let i = 0; i < 6000; i++) {
      const { events } = room.tick();
      for (const e of events) {
        if (e.t === 'capture') captured += e.cells.length;
        if (e.t === 'death' && e.killer !== 0) kills++;
      }
      if (i % 5 === 0) expect(invariantErrors(room.sim)).toEqual([]);
      for (const p of room.sim.players) if (p?.alive) bestShare = Math.max(bestShare, permille(room.sim, p.slot));
    }
    expect(room.sim.players.filter((p) => p?.profile.kind === 'bot')).toHaveLength(15);
    // Bots claim the map loop by loop: well over its whole area in total, and someone holds a solid share.
    expect(captured).toBeGreaterThan(room.sim.playable);
    expect(bestShare).toBeGreaterThan(60);
    expect(kills).toBeGreaterThanOrEqual(10);
  });

  it('a lone bot on a small map wins the round, then the room starts a new map', () => {
    const roundEndTicks = 40;
    const room = createRoom({ seed: 3, minPopulation: 1, roundEndTicks }, { ...SIM_CONFIG, size: 120 });
    const firstSeed = room.sim.seed;
    const firstMask = room.sim.mask;
    const seen: { tick: number; event: SimEvent }[] = [];
    for (let i = 0; i < 20_000 && room.sim.round === 1; i++) {
      for (const event of room.tick().events) seen.push({ tick: room.sim.tick, event });
    }
    const over = seen.find(({ event }) => event.t === 'roundOver');
    const next = seen.find(({ event }) => event.t === 'newRound');
    expect(over?.event).toEqual({ t: 'roundOver', winner: 1 });
    expect(next!.tick - over!.tick).toBe(roundEndTicks);
    expect(room.sim.round).toBe(2);
    expect(room.sim.seed).not.toBe(firstSeed);
    expect(room.sim.mask).not.toEqual(firstMask);
    // The bot is back on the new map straight away.
    expect(seen.some(({ tick, event }) => tick === next!.tick && event.t === 'spawn' && event.slot === 1)).toBe(true);
    expect(room.sim.players[1]?.alive).toBe(true);
  });
});
