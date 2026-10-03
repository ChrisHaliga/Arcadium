/**
 * Live meta state: one signal per save slice. Splitting by slice keeps updates cheap
 * (a coin change doesn't notify loadout or mission views) while snapshot() still
 * rebuilds the whole save for persistence. Slices are replaced, never mutated, so
 * computed views only recompute when their slice actually changed.
 */
import { signal, type Signal } from '@preact/signals';
import {
  SAVE_VERSION,
  type ChestCounts,
  type DailyData,
  type LifetimeStats,
  type MissionsData,
  type ProfileData,
  type SaveData,
  type Settings,
  type ShopData,
} from './save';

export interface MetaState {
  readonly playerId: string;
  readonly createdAt: number;
  readonly profile: Signal<ProfileData>;
  readonly coins: Signal<number>;
  readonly totalXp: Signal<number>;
  readonly owned: Signal<ReadonlySet<string>>;
  readonly chests: Signal<ChestCounts>;
  readonly missions: Signal<MissionsData>;
  readonly daily: Signal<DailyData>;
  readonly shop: Signal<ShopData>;
  readonly settings: Signal<Settings>;
  readonly stats: Signal<LifetimeStats>;
}

export function createState(data: SaveData): MetaState {
  return {
    playerId: data.playerId,
    createdAt: data.createdAt,
    profile: signal(data.profile),
    coins: signal(data.coins),
    totalXp: signal(data.totalXp),
    owned: signal<ReadonlySet<string>>(new Set(data.owned)),
    chests: signal(data.chests),
    missions: signal(data.missions),
    daily: signal(data.daily),
    shop: signal(data.shop),
    settings: signal(data.settings),
    stats: signal(data.stats),
  };
}

/** Reads every slice, so calling it inside an effect subscribes to all of them. */
export function snapshot(state: MetaState): SaveData {
  return {
    version: SAVE_VERSION,
    playerId: state.playerId,
    createdAt: state.createdAt,
    profile: state.profile.value,
    coins: state.coins.value,
    totalXp: state.totalXp.value,
    owned: [...state.owned.value].sort(),
    chests: state.chests.value,
    missions: state.missions.value,
    daily: state.daily.value,
    shop: state.shop.value,
    settings: state.settings.value,
    stats: state.stats.value,
  };
}
