/**
 * Bot personalities. Each is a set of dials on the same brain: how big its loops are,
 * how early it runs home, how keenly it chases exposed trails, and how often it slips up
 * (bots that never blunder are no fun to play against).
 */
import type { Random } from './random';

export type PersonalityKind = 'cautious' | 'greedy' | 'hunter';

export interface Personality {
  kind: PersonalityKind;
  /** Loop depth out from the land and width along it, in cells, for a fresh start territory. Loops grow with the land. */
  depth: readonly [number, number];
  width: readonly [number, number];
  /**
   * Heads home once a rival could reach the trail within fear x (ticks it needs to get
   * home) + fearSlack ticks. Higher = leaves earlier.
   */
  fear: number;
  fearSlack: number;
  /** Never stays out longer than this many ticks. */
  maxOutTicks: number;
  /** Chases exposed trails whose nearest point is within this many cells. */
  huntRange: number;
  /** Ticks of lead over the trail's owner needed before giving chase. */
  huntLead: number;
  /** How much a rival head near a candidate loop puts the bot off it. */
  wariness: number;
  /** Value of a rival's land inside a loop relative to neutral ground (stealing). */
  stealBias: number;
  /** Chance per loop of not watching rivals at all: the slip a human can punish. */
  blunder: number;
  /** Chance per loop of making it half again as big as planned. */
  overreach: number;
}

const PERSONALITIES: Readonly<Record<PersonalityKind, Personality>> = {
  cautious: {
    kind: 'cautious',
    depth: [10, 18],
    width: [18, 34],
    fear: 1.3,
    fearSlack: 8,
    maxOutTicks: 90,
    huntRange: 14,
    huntLead: 8,
    wariness: 1.6,
    stealBias: 0.9,
    blunder: 0.05,
    overreach: 0.05,
  },
  greedy: {
    kind: 'greedy',
    depth: [18, 34],
    width: [30, 64],
    fear: 0.9,
    fearSlack: 2,
    maxOutTicks: 230,
    huntRange: 18,
    huntLead: 6,
    wariness: 0.6,
    stealBias: 1.35,
    blunder: 0.1,
    overreach: 0.15,
  },
  hunter: {
    kind: 'hunter',
    depth: [12, 24],
    width: [20, 40],
    fear: 1.1,
    fearSlack: 4,
    maxOutTicks: 150,
    huntRange: 60,
    huntLead: 3,
    wariness: 0.8,
    stealBias: 1.1,
    blunder: 0.08,
    overreach: 0.08,
  },
};

/** Roughly a third each, with slightly fewer hunters so a room never feels like a pack hunt. */
export function randomPersonality(random: Random): Personality {
  const roll = random.float();
  return roll < 0.36 ? PERSONALITIES.cautious : roll < 0.72 ? PERSONALITIES.greedy : PERSONALITIES.hunter;
}
