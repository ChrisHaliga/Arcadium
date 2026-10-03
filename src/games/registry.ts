/**
 * Every game the hub shows, in carousel order, and the featured one. The only place the
 * hub reaches into a game's folder: everything else it needs comes through GameModule.
 */
import type { GameModule } from '../shared/game';
import type { PlayerColor } from '../shared/services';
import { landgrab } from './landgrab';

export type { PlayerColor };

/**
 * Holds the carousel's place for the games still to come. Deliberately unnamed: no next
 * game is announced until its concept is agreed. The hub never launches it.
 */
const MORE_GAMES: GameModule = {
  id: 'more-games',
  title: 'More games',
  tagline: 'New games are on the way',
  accent: '#8f5bff',
  available: false,
  missions: [],
  cosmetics: [],
  launch() {
    throw new Error('The "More games" card is a placeholder, not a game');
  },
};

export const GAMES: readonly GameModule[] = [landgrab, MORE_GAMES];

/**
 * The game the home screen opens on: its attract match plays behind the menus, and its
 * player colours are the ones the hub shows, so it must have some.
 */
const FEATURED: GameModule & Pick<Required<GameModule>, 'playerColors'> = landgrab;

export const FEATURED_GAME_ID = FEATURED.id;

/**
 * The colours ProfileService.color indexes into, as the hub shows them. Every game wraps
 * the index into its own palette; the hub shows the featured game's, which is what the
 * player sees most.
 */
export const PLAYER_COLORS: readonly PlayerColor[] = FEATURED.playerColors;

export function playerColor(index: number): PlayerColor {
  const n = PLAYER_COLORS.length;
  return PLAYER_COLORS[((index % n) + n) % n];
}
