/** Account level from total XP, level-up rewards, and the stat feed games report into. */
import { batch, computed, type Signal } from '@preact/signals';
import type { ProgressService, StatMode, WalletService } from '../shared/services';
import { LEVELS, type ChestType } from './config';
import type { MetaChests } from './chests';
import type { WritableQueue } from './queue';

export interface LevelUp {
  level: number;
  /** Coins already added to the wallet. */
  coins: number;
  /** A chest already added to the held stock (open it with chests.openFree), or null. */
  chest: ChestType | null;
}

export interface LevelInfo {
  level: number;
  /** XP earned inside `level`. */
  xp: number;
  /** XP needed to go from `level` to the next one. */
  xpToNext: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  let xp = totalXp;
  while (xp >= LEVELS.xpToNext(level)) {
    xp -= LEVELS.xpToNext(level);
    level++;
  }
  return { level, xp, xpToNext: LEVELS.xpToNext(level) };
}

export function createProgress(
  totalXp: Signal<number>,
  wallet: WalletService,
  chests: MetaChests,
  levelUps: WritableQueue<LevelUp>,
  onReport: (gameId: string, stat: string, value: number, mode: StatMode) => void,
): ProgressService {
  const info = computed(() => levelInfo(totalXp.value));
  return {
    level: computed(() => info.value.level),
    // Whole numbers for the bar's label; the fractional remainder still counts toward the next level.
    xp: computed(() => Math.floor(info.value.xp)),
    xpToNext: computed(() => info.value.xpToNext),
    addXp(amount) {
      if (!(amount > 0) || !Number.isFinite(amount)) return;
      const before = info.value.level;
      batch(() => {
        totalXp.value += amount;
        for (let level = before + 1; level <= info.value.level; level++) {
          const coins = LEVELS.rewardCoins(level);
          const chest = level % LEVELS.chestEvery === 0 ? LEVELS.chest : null;
          wallet.add(coins, 'level-up');
          if (chest) chests.give(chest);
          levelUps.push({ level, coins, chest });
        }
      });
    },
    report(gameId, stat, value, mode) {
      if (Number.isFinite(value)) onReport(gameId, stat, value, mode);
    },
  };
}
