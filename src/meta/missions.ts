/**
 * Daily and weekly missions drawn from every playable game's MissionDef pool.
 *
 * Draws are seeded by the day/week key, so the same player sees the same missions
 * however often the app restarts that day; only rerolls use the live random source.
 */
import { batch, computed, type ReadonlySignal, type Signal } from '@preact/signals';
import type { GameModule, MissionDef } from '../shared/game';
import type { StatMode, WalletService } from '../shared/services';
import { MISSIONS } from './config';
import { hashString, pickOne, seededRandom, shuffled } from './random';
import type { MissionPeriod, MissionSlot, MissionsData } from './save';
import type { StatsRecorder } from './stats';
import { dayEnd, weekEnd, type Clock } from './time';

type Cadence = MissionDef['cadence'];

/** Applies a reported value with ProgressService.report semantics. */
function combine(previous: number, value: number, mode: StatMode): number {
  return mode === 'add' ? previous + value : Math.max(previous, value);
}

export interface ActiveMission {
  def: MissionDef;
  /** Capped at def.target. */
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export interface Missions {
  readonly daily: ReadonlySignal<readonly ActiveMission[]>;
  readonly weekly: ReadonlySignal<readonly ActiveMission[]>;
  /** Local midnight when the daily missions are redrawn (epoch ms). */
  readonly dailyResetsAt: ReadonlySignal<number>;
  /** Local Monday midnight when the weekly missions are redrawn (epoch ms). */
  readonly weeklyResetsAt: ReadonlySignal<number>;
  /** Coins the next reroll costs; 0 while today's free reroll is unused. */
  readonly rerollCost: ReadonlySignal<number>;
  /** Pays out a complete mission; returns the coins granted, or null when it isn't claimable. */
  claim(id: string): number | null;
  /**
   * Swaps an unfinished mission for another one of the same cadence that isn't active.
   * Returns the new mission, or null (nothing charged) when the mission is complete or
   * claimed, no alternative exists, or coins are short.
   */
  reroll(id: string): ActiveMission | null;
}

export interface MetaMissions extends Missions {
  /** Applies a reported gameplay stat to matching active missions (ProgressService.report). */
  record(gameId: string, stat: string, value: number, mode: StatMode): void;
}

const COUNTS: Readonly<Record<Cadence, number>> = { daily: MISSIONS.dailyCount, weekly: MISSIONS.weeklyCount };

const newSlot = (def: MissionDef): MissionSlot => ({ id: def.id, progress: 0, claimed: false });

export function createMissions(
  missions: Signal<MissionsData>,
  games: readonly GameModule[],
  clock: Clock,
  wallet: WalletService,
  stats: StatsRecorder,
  random: () => number,
): MetaMissions {
  const byId = new Map<string, MissionDef>();
  for (const game of games.filter((g) => g.available)) {
    for (const def of game.missions) if (!byId.has(def.id)) byId.set(def.id, def);
  }
  // Sorted so the seeded draw doesn't depend on the order games are registered in.
  const sortedDefs = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const pools: Readonly<Record<Cadence, readonly MissionDef[]>> = {
    daily: sortedDefs.filter((def) => def.cadence === 'daily'),
    weekly: sortedDefs.filter((def) => def.cadence === 'weekly'),
  };

  /**
   * Keeps the period when it still belongs to `key`, dropping missions no game offers any
   * more; otherwise starts over. Empty slots are filled from the key's seeded draw.
   */
  const settle = (period: MissionPeriod, cadence: Cadence, key: string): MissionPeriod => {
    const current = period.key === key;
    const kept = current
      ? period.slots.filter((slot) => byId.get(slot.id)?.cadence === cadence).slice(0, COUNTS[cadence])
      : [];
    const taken = new Set(kept.map((slot) => slot.id));
    const fill = shuffled(pools[cadence], seededRandom(hashString(`${cadence}:${key}`)))
      .filter((def) => !taken.has(def.id))
      .slice(0, COUNTS[cadence] - kept.length);
    if (current && fill.length === 0 && kept.length === period.slots.length) return period;
    return { key, slots: [...kept, ...fill.map(newSlot)] };
  };

  const rollover = () => {
    const m = missions.value;
    const day = clock.day.value;
    const daily = settle(m.daily, 'daily', day);
    const weekly = settle(m.weekly, 'weekly', clock.week.value);
    const rerollsUsed = m.rerollDay === day ? m.rerollsUsed : 0;
    if (daily !== m.daily || weekly !== m.weekly || m.rerollDay !== day || rerollsUsed !== m.rerollsUsed) {
      missions.value = { daily, weekly, rerollDay: day, rerollsUsed };
    }
  };
  rollover();
  clock.onRollover(rollover);

  const view = (period: MissionPeriod): ActiveMission[] =>
    period.slots.flatMap((slot) => {
      const def = byId.get(slot.id);
      return def ? [{ def, progress: slot.progress, complete: slot.progress >= def.target, claimed: slot.claimed }] : [];
    });

  const rerollCost = computed(() =>
    missions.value.rerollsUsed >= MISSIONS.freeRerollsPerDay ? MISSIONS.rerollPrice : 0,
  );

  const locate = (id: string) => {
    const m = missions.value;
    const def = byId.get(id);
    const slot = def && m[def.cadence].slots.find((s) => s.id === id);
    return def && slot ? { m, def, slot, period: m[def.cadence] } : null;
  };

  const replaceSlot = (period: MissionPeriod, id: string, next: MissionSlot): MissionPeriod => ({
    ...period,
    slots: period.slots.map((slot) => (slot.id === id ? next : slot)),
  });

  return {
    daily: computed(() => view(missions.value.daily)),
    weekly: computed(() => view(missions.value.weekly)),
    dailyResetsAt: computed(() => dayEnd(missions.value.daily.key)),
    weeklyResetsAt: computed(() => weekEnd(missions.value.weekly.key)),
    rerollCost,
    record(gameId, stat, value, mode) {
      if (!Number.isFinite(value)) return;
      clock.sync();
      const advance = (period: MissionPeriod): MissionPeriod => {
        let changed = false;
        const slots = period.slots.map((slot) => {
          const def = byId.get(slot.id);
          if (!def || slot.claimed || def.gameId !== gameId || def.stat !== stat) return slot;
          const progress = Math.min(def.target, combine(slot.progress, value, mode));
          if (progress === slot.progress) return slot;
          changed = true;
          return { ...slot, progress };
        });
        return changed ? { ...period, slots } : period;
      };
      const m = missions.value;
      const daily = advance(m.daily);
      const weekly = advance(m.weekly);
      if (daily !== m.daily || weekly !== m.weekly) missions.value = { ...m, daily, weekly };
    },
    claim(id) {
      clock.sync();
      const found = locate(id);
      if (!found || found.slot.claimed || found.slot.progress < found.def.target) return null;
      const { m, def, slot, period } = found;
      batch(() => {
        missions.value = { ...m, [def.cadence]: replaceSlot(period, id, { ...slot, claimed: true }) };
        wallet.add(def.reward, 'mission');
        stats.add('missionsClaimed', 1);
      });
      return def.reward;
    },
    reroll(id) {
      clock.sync();
      const found = locate(id);
      if (!found || found.slot.claimed || found.slot.progress >= found.def.target) return null;
      const { m, def, period } = found;
      const active = new Set(period.slots.map((slot) => slot.id));
      const replacement = pickOne(pools[def.cadence].filter((candidate) => !active.has(candidate.id)), random);
      if (!replacement) return null;
      const cost = rerollCost.value;
      return batch(() => {
        if (cost > 0 && !wallet.spend(cost, 'mission-reroll')) return null;
        missions.value = {
          ...m,
          [def.cadence]: replaceSlot(period, id, newSlot(replacement)),
          rerollsUsed: m.rerollsUsed + 1,
        };
        return { def: replacement, progress: 0, complete: false, claimed: false };
      });
    },
  };
}
