/** Feeds a finished life into the hub's missions and XP (stat names are listed in content.ts). */
import type { ProgressService, StatMode } from '../../../shared/services';
import { GAME_ID } from '../config';
import type { LifeResult } from './types';

export function reportLife(progress: ProgressService, result: LifeResult): void {
  const { summary: s, ending } = result;
  const stats: [stat: string, value: number, mode: StatMode][] = [
    ['peakPercent', Math.floor(s.peakPermille / 10), 'max'],
    ['roundKills', s.kills, 'max'],
    ['kills', s.kills, 'add'],
    ['feats', s.feats.length, 'add'],
    ['treasures', s.treasures, 'add'],
    // A life counts as played when it ends in death or at the round's end, not when abandoned.
    ['lives', ending.kind === 'left' ? 0 : 1, 'add'],
    ['wins', s.won ? 1 : 0, 'add'],
    ['revives', s.revives, 'add'],
    // Exact, fractions included: rounding each life would lose up to 1% a life, and every capture counts.
    ['mapCaptured', s.capturedPermille / 10, 'add'],
  ];
  for (const [stat, value, mode] of stats) if (value > 0) progress.report(GAME_ID, stat, value, mode);
  if (result.xp > 0) progress.addXp(result.xp);
}
