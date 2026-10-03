/**
 * Lifetime stats for the profile screen: hub counters plus the running totals games
 * report ('add' stats). One-life bests ('max' stats) only feed missions: kept for life
 * they would be a personal best score, and Arcadium deliberately has none.
 */
import type { ReadonlySignal, Signal } from '@preact/signals';
import type { LifetimeStats } from './save';

type Counter = Exclude<keyof LifetimeStats, 'games'>;

export interface StatsRecorder {
  readonly value: ReadonlySignal<LifetimeStats>;
  add(counter: Counter, amount: number): void;
  best(counter: Counter, value: number): void;
  /** Adds `amount` to a game's lifetime total of `stat`. */
  addGame(gameId: string, stat: string, amount: number): void;
}

export function createStats(stats: Signal<LifetimeStats>): StatsRecorder {
  const set = (counter: Counter, next: number) => {
    if (next !== stats.value[counter]) stats.value = { ...stats.value, [counter]: next };
  };
  return {
    value: stats,
    add(counter, amount) {
      set(counter, stats.value[counter] + amount);
    },
    best(counter, value) {
      set(counter, Math.max(stats.value[counter], value));
    },
    addGame(gameId, stat, amount) {
      const current = stats.value.games[gameId] ?? {};
      const next = (current[stat] ?? 0) + amount;
      if (next === current[stat]) return;
      stats.value = { ...stats.value, games: { ...stats.value.games, [gameId]: { ...current, [stat]: next } } };
    },
  };
}
