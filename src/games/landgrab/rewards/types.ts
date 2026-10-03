/** What the rewards logic hands the game: moments to celebrate and the end-of-life tally. */
import type { SfxId } from '../../../shared/services';
import type { DeathCause, FeatId } from '../core/types';
import type { ReelSpin } from './reels';

export type HapticStrength = 'light' | 'medium' | 'heavy';

export interface MomentSound {
  id: SfxId;
  /** Playback-rate style multiplier (1 = normal). */
  pitch: number;
}

export type MomentKind = 'capture' | 'kill' | 'feat' | 'treasure' | 'milestone' | 'win';

/** Something this player just earned, with everything the UI needs to make it loud. */
export interface RewardMoment {
  kind: MomentKind;
  /** Big callout text; empty for plain captures, which only fly coins. */
  title: string;
  /** Second callout line, e.g. who it happened to. */
  detail: string;
  coins: number;
  /** Cells the coins fly out of; empty means from the player's head. */
  from: readonly number[];
  sounds: readonly MomentSound[];
  haptic: HapticStrength;
  /** Feats: the multiplier rolled on the bonus, and the faces the roll animation cycles through. */
  roll: { multiplier: number; faces: readonly number[] } | null;
  /** Kills: one line for the kill feed. */
  feed: string | null;
}

export interface FeatAward {
  feat: FeatId;
  multiplier: number;
  coins: number;
}

/** Running tally of one life (a spawn until death, round end or leaving; revives continue it). */
export interface LifeSummary {
  startTick: number;
  captures: number;
  captureCoins: number;
  /** Longest combo reached (0 = no capture followed another within the window). */
  bestCombo: number;
  kills: number;
  killCoins: number;
  feats: FeatAward[];
  featCoins: number;
  treasures: number;
  treasureCoins: number;
  /** Thresholds crossed (percent), in the order crossed. */
  milestones: number[];
  milestoneCoins: number;
  won: boolean;
  winCoins: number;
  revives: number;
  /** Part of second-chance prices paid out of this life's earnings (the wallet paid the rest). */
  revivePaidFromRun: number;
  peakPermille: number;
  /** Sum over captures of each capture's share of the map, permille (fractional). */
  capturedPermille: number;
}

export type LifeEnding =
  | { kind: 'death'; cause: DeathCause; killer: string | null }
  | { kind: 'roundOver'; won: boolean; winner: string | null }
  /** Quit, disconnect or the game closing: coins are credited without bonus spins. */
  | { kind: 'left' };

export type EarningId = 'land' | 'kills' | 'feats' | 'treasures' | 'milestones' | 'win' | 'revive';

export interface EarningLine {
  id: EarningId;
  label: string;
  /** How many of the thing (captures, kills...); 0 where a count means nothing. */
  count: number;
  /** Negative for second chances paid out of the run. */
  coins: number;
}

export interface LifeResult {
  ending: LifeEnding;
  summary: LifeSummary;
  /** Earnings by category, only the ones that happened. */
  lines: EarningLine[];
  /** Sum of the lines (never below 0). */
  subtotal: number;
  spins: ReelSpin[];
  /** Best spin, 1 without spins. */
  multiplier: number;
  /** What goes into the wallet. */
  total: number;
  xp: number;
  /** Near-miss framing such as "4% away from 3rd place"; null when there is nothing close to point at. */
  nearMiss: string | null;
  /** Seconds alive: from spawn to the death (a second chance's countdown not included), the round's end or leaving. */
  seconds: number;
}
