/** Landgrab's GameModule: what the hub lists, themes and launches, plus the silent background match and the hub art. */
import type { GameModule } from '../../shared/game';
import { mountCardArt, renderCosmeticPreview } from './art';
import { GAME_ID, GAME_TITLE } from './config';
import { COSMETICS, DEFAULT_LOADOUT, MISSIONS } from './content';
import { mountAttract } from './game/attract';
import { launchSession } from './game/session';
import { HUMAN_COLORS } from './palette';

/** Mint, the colour of the game's card and accents in the hub. */
const ACCENT = HUMAN_COLORS[4].base;

// `satisfies` keeps the optional fields this game fills in typed as present, so the registry
// can rely on its player colours.
export const landgrab = {
  id: GAME_ID,
  title: GAME_TITLE,
  tagline: 'Grab land. Cut trails. Own the map.',
  accent: ACCENT,
  available: true,
  missions: MISSIONS,
  cosmetics: COSMETICS,
  defaultLoadout: DEFAULT_LOADOUT,
  playerColors: HUMAN_COLORS,
  mountAttract,
  mountCardArt,
  renderCosmeticPreview,
  launch: launchSession,
} satisfies GameModule;
