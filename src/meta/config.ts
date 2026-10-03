/**
 * Hub economy & progression tuning. Every number the meta layer uses lives here so
 * balancing never means hunting through services.
 */
import type { Rarity } from '../shared/services';

/** Rarity order from most to least common; chest fallbacks and sorting rely on it. */
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export const SAVE = {
  key: 'arcadium.save',
  /** An unreadable save is copied here before starting fresh, so it can still be recovered by hand. */
  corruptKey: 'arcadium.save.corrupt',
  /** The first change after a write starts this timer; later changes ride along with that write. */
  writeDelayMs: 500,
};

export const WALLET = {
  startingCoins: 1000,
};

export const PROFILE = {
  /** The starting colour is picked from 0..colorChoices-1; games wrap the index into their own palette. */
  colorChoices: 12,
};

export const SETTINGS_DEFAULTS = {
  sfxVolume: 0.8,
  musicVolume: 0.5,
  haptics: true,
  screenShake: true,
};

export interface ChestConfig {
  name: string;
  price: number;
  /** Percent chance per rarity; rarities a game catalog lacks fall back to the nearest one it has. */
  odds: Readonly<Record<Rarity, number>>;
}

export const CHESTS = {
  basic: { name: 'Basic Chest', price: 1500, odds: { common: 70, rare: 25, epic: 4.5, legendary: 0.5 } },
  big: { name: 'Big Chest', price: 5000, odds: { common: 40, rare: 40, epic: 17, legendary: 3 } },
  legendary: { name: 'Legendary Chest', price: 15000, odds: { common: 0, rare: 30, epic: 50, legendary: 20 } },
} as const satisfies Record<string, ChestConfig>;

export type ChestType = keyof typeof CHESTS;

export interface DailyRewardConfig {
  coins: number;
  chest: ChestType | null;
}

export const DAILY = {
  /** Calendar days 1..7. After day 7 the cycle starts over while the streak keeps counting. */
  rewards: [
    { coins: 250, chest: null },
    { coins: 500, chest: null },
    { coins: 750, chest: null },
    { coins: 1000, chest: null },
    { coins: 1500, chest: null },
    { coins: 2000, chest: null },
    { coins: 0, chest: 'big' },
  ] as const satisfies readonly DailyRewardConfig[],
  freezePrice: 2000,
  maxFreezes: 2,
};

export const SHOP = {
  prices: { common: 2000, rare: 5000, epic: 12000, legendary: 30000 } as const satisfies Record<Rarity, number>,
  rotationSize: 6,
  /** Share of the rarity's shop price paid back when a chest drops something already owned. */
  duplicateRefund: 0.25,
};

export const MISSIONS = {
  dailyCount: 3,
  weeklyCount: 3,
  freeRerollsPerDay: 1,
  rerollPrice: 200,
};

export const LEVELS = {
  /** XP needed to go from `level` to `level + 1`. */
  xpToNext: (level: number): number => 200 + 100 * (level - 1),
  /** Coins granted on reaching `level`. */
  rewardCoins: (level: number): number => 250 * level,
  /** Every Nth level also grants a chest of this type. */
  chestEvery: 5,
  chest: 'basic' as ChestType,
};

export const QUEUES = {
  /** Games add coins many times per match; only the most recent gains are worth animating. */
  coinGains: 12,
  levelUps: 50,
};
