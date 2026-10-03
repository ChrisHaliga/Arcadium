/**
 * Second-chance pricing. The price rises with each revive in a round. It can be paid from
 * the wallet and, for whatever the wallet can't cover, from the coins this life has
 * earned but not banked yet, so a good run can always buy its own second chance.
 */
import { REWARDS } from '../config';

export interface RevivePayment {
  fromWallet: number;
  fromRun: number;
}

/** Price of the next revive after `revivesUsed` this round. */
export function reviveCost(revivesUsed: number): number {
  const costs = REWARDS.reviveCosts;
  return costs[Math.min(Math.max(0, revivesUsed), costs.length - 1)];
}

/** How to split `price` between wallet and run; null when both together fall short. */
export function planRevivePayment(price: number, wallet: number, run: number): RevivePayment | null {
  const fromWallet = Math.min(price, Math.max(0, wallet));
  const fromRun = price - fromWallet;
  return fromRun <= Math.max(0, run) ? { fromWallet, fromRun } : null;
}
