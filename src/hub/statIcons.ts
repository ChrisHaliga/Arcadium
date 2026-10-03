/** Icons for the stat names games commonly report (missions, lifetime stats); anything else gets a star. */
import type { IconName } from '../shared/ui/kit';

const STAT_ICONS: Readonly<Record<string, IconName>> = {
  kills: 'boom',
  roundKills: 'boom',
  peakPercent: 'flag',
  feats: 'star',
  treasures: 'gem',
  lives: 'heart',
  revives: 'heart',
  wins: 'trophy',
  mapCaptured: 'tile',
};

export function statIcon(stat: string): IconName {
  return STAT_ICONS[stat] ?? 'star';
}
