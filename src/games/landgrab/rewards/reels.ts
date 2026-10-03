/**
 * End-of-life bonus spins: one per feat pulled off this life (capped), each landing on a
 * multiplier from REWARDS.reelMultipliers; the best one multiplies the life's earnings.
 * Every multiplier has its own game icon and the spin shows a single face, so it reads
 * as a reward rolled for the feat: there is nothing to line up and nothing to nearly match.
 */
import { REWARDS } from '../config';
import type { FeatId } from '../core/types';
import { tableValues, weightedPick, type Rng } from './random';

export type ReelIcon = 'blob' | 'flag' | 'gem' | 'crown' | 'trophy';

export interface ReelFace {
  multiplier: number;
  icon: ReelIcon;
}

/** Icons for the multipliers, smallest first; the last one covers any extra tiers. */
const ICON_LADDER: readonly ReelIcon[] = ['blob', 'flag', 'gem', 'crown', 'trophy'];

/** Every face a spin can land on, smallest multiplier first. */
export const REEL_FACES: readonly ReelFace[] = tableValues(REWARDS.reelMultipliers)
  .sort((a, b) => a - b)
  .map((multiplier, tier) => ({ multiplier, icon: ICON_LADDER[Math.min(tier, ICON_LADDER.length - 1)] }));

export interface ReelSpin {
  /** The feat that earned this spin. */
  feat: FeatId;
  multiplier: number;
}

/** One spin per feat, in the order they were pulled off, up to REWARDS.maxSpins. */
export function rollSpins(feats: readonly FeatId[], rng: Rng): ReelSpin[] {
  return feats.slice(0, REWARDS.maxSpins).map((feat) => ({ feat, multiplier: weightedPick(REWARDS.reelMultipliers, rng) }));
}

/** The best spin's multiplier; 1 when there were no spins. */
export function bestMultiplier(spins: readonly ReelSpin[]): number {
  return spins.reduce((best, spin) => Math.max(best, spin.multiplier), 1);
}
