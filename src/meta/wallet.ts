/** Coins. Every gain is also queued so the hub can fly coins into the counter. */
import type { Signal } from '@preact/signals';
import type { WalletService } from '../shared/services';
import type { WritableQueue } from './queue';
import type { StatsRecorder } from './stats';

export interface CoinGain {
  /** Unique per session; use as the animation key. */
  id: number;
  amount: number;
  /** The reason passed to WalletService.add, e.g. 'daily', 'mission', 'level-up', 'chest-duplicate'. */
  reason: string;
  at: number;
}

export function createWallet(
  coins: Signal<number>,
  stats: StatsRecorder,
  gains: WritableQueue<CoinGain>,
  now: () => number,
): WalletService {
  let nextGainId = 1;
  return {
    coins,
    add(amount, reason) {
      // Games pass multiplied payouts (combos, feat rolls); the balance stays whole.
      const coinsAdded = Math.round(amount);
      if (!(coinsAdded > 0)) return;
      coins.value += coinsAdded;
      stats.add('coinsEarned', coinsAdded);
      gains.push({ id: nextGainId++, amount: coinsAdded, reason, at: now() });
    },
    spend(amount) {
      const cost = Math.round(amount);
      if (!(cost >= 0) || cost > coins.value) return false;
      coins.value -= cost;
      stats.add('coinsSpent', cost);
      return true;
    },
  };
}
