/**
 * Near-miss framing for the results screen: the closest thing the player almost reached,
 * either the next place on the leaderboard or the next milestone bonus.
 */
import { REWARDS } from '../config';

/** Where the player stood on their last tick alive. */
export interface Standing {
  /** 1 = leader. */
  rank: number;
  permille: number;
  /** Share of the player one place up; null for the leader. */
  abovePermille: number | null;
}

/** Gaps wider than this (permille) aren't a near miss, so they go unmentioned. */
const NEAR_PERMILLE = 100;

export function nearMissLine(standing: Standing | null, peakPermille: number): string | null {
  const milestone = nextMilestone(peakPermille);
  const milestoneGap = milestone === null ? Number.POSITIVE_INFINITY : milestone * 10 - peakPermille;
  const rankGap =
    standing && standing.rank > 1 && standing.abovePermille !== null
      ? Math.max(1, standing.abovePermille - standing.permille)
      : Number.POSITIVE_INFINITY;
  if (standing && rankGap <= Math.min(milestoneGap, NEAR_PERMILLE)) {
    return `${formatGap(rankGap)} away from ${ordinal(standing.rank - 1)} place`;
  }
  if (milestone !== null && milestoneGap <= NEAR_PERMILLE) return `${formatGap(milestoneGap)} away from the ${milestone}% bonus`;
  return standing?.rank === 1 ? 'You led the whole map!' : null;
}

function nextMilestone(peakPermille: number): number | null {
  for (const [percent] of REWARDS.milestones) if (percent * 10 > peakPermille) return percent;
  return null;
}

/** Small gaps keep a decimal so "0.4%" doesn't round to a meaningless "0%". */
function formatGap(permille: number): string {
  return permille < 100 ? `${(permille / 10).toFixed(1).replace(/\.0$/, '')}%` : `${Math.round(permille / 10)}%`;
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
