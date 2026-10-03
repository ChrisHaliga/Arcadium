/**
 * Landgrab's contributions to the hub: cosmetics (shop + chests) and missions.
 * Styles are interpreted by src/games/landgrab/render; every style listed here must be drawn there.
 */
import type { CosmeticDef, Loadout, MissionDef } from '../../shared/services';
import { GAME_ID } from './config';

const c = (
  id: string,
  kind: CosmeticDef['kind'],
  name: string,
  rarity: CosmeticDef['rarity'],
  style: string,
  params?: CosmeticDef['params'],
): CosmeticDef => ({ id: `${GAME_ID}.${kind}.${id}`, gameId: GAME_ID, kind, name, rarity, style, params });

/** Skin styles: solid | stripes | dots | checker | gradient | glow | galaxy */
/** Trail styles: plain | sparkle | bubbles | glitter | comet | fire | rainbow */
/** Capture styles: wave | ripple | confetti | shockwave | fireworks */
/** Kill styles: burst | poof | shatter | lightning | blackhole */
export const COSMETICS: readonly CosmeticDef[] = [
  c('solid', 'skin', 'Classic', 'common', 'solid'),
  c('stripes', 'skin', 'Pinstripe', 'common', 'stripes'),
  c('dots', 'skin', 'Polka', 'common', 'dots'),
  c('checker', 'skin', 'Checkmate', 'rare', 'checker'),
  c('sunset', 'skin', 'Sunset', 'rare', 'gradient', { to: '#ffcc33' }),
  c('ocean', 'skin', 'Deep Sea', 'rare', 'gradient', { to: '#1f33c4' }),
  c('neon', 'skin', 'Neon', 'epic', 'glow'),
  c('aurora', 'skin', 'Aurora', 'epic', 'gradient', { to: '#1fd6a0', via: '#9b3dff' }),
  c('galaxy', 'skin', 'Galaxy', 'legendary', 'galaxy'),

  c('plain', 'trail', 'Classic Trail', 'common', 'plain'),
  c('bubbles', 'trail', 'Bubbles', 'common', 'bubbles'),
  c('glitter', 'trail', 'Glitter', 'rare', 'glitter'),
  c('sparkle', 'trail', 'Sparkle', 'rare', 'sparkle'),
  c('comet', 'trail', 'Comet', 'epic', 'comet'),
  c('fire', 'trail', 'Blaze', 'epic', 'fire'),
  c('rainbow', 'trail', 'Rainbow Road', 'legendary', 'rainbow'),

  c('wave', 'capture', 'Wave Fill', 'common', 'wave'),
  c('ripple', 'capture', 'Ripple', 'rare', 'ripple'),
  c('confetti', 'capture', 'Confetti', 'rare', 'confetti'),
  c('shockwave', 'capture', 'Shockwave', 'epic', 'shockwave'),
  c('fireworks', 'capture', 'Fireworks', 'legendary', 'fireworks'),

  c('burst', 'kill', 'Burst', 'common', 'burst'),
  c('poof', 'kill', 'Poof', 'common', 'poof'),
  c('shatter', 'kill', 'Shatter', 'rare', 'shatter'),
  c('lightning', 'kill', 'Thunderstrike', 'epic', 'lightning'),
  c('blackhole', 'kill', 'Black Hole', 'legendary', 'blackhole'),
];

const catalog = new Map(COSMETICS.map((cosmetic) => [cosmetic.id, cosmetic]));

/** A Landgrab cosmetic by id, for drawing players where the hub's CosmeticsService isn't at hand (hub art, the background match). */
export function cosmeticById(id: string): CosmeticDef | undefined {
  return catalog.get(id);
}

/** What every new player owns and wears. */
export const DEFAULT_LOADOUT: Loadout = {
  skin: `${GAME_ID}.skin.solid`,
  trail: `${GAME_ID}.trail.plain`,
  capture: `${GAME_ID}.capture.wave`,
  kill: `${GAME_ID}.kill.burst`,
};

/**
 * Stats Landgrab reports through ProgressService.report:
 *   'peakPercent' (max)  peak share of the map in one life, whole percent
 *   'roundKills'  (max)  kills in one life
 *   'kills'       (add)  kills
 *   'feats'       (add)  feats pulled off
 *   'treasures'   (add)  treasure cells captured
 *   'lives'       (add)  lives played (each spawn that ends in death or round end)
 *   'wins'        (add)  rounds won
 *   'revives'     (add)  second chances used
 *   'mapCaptured' (add)  percent of the map captured, summed over captures (fractional)
 */
const m = (
  id: string,
  title: string,
  stat: string,
  mode: MissionDef['mode'],
  target: number,
  cadence: MissionDef['cadence'],
  reward: number,
): MissionDef => ({ id: `${GAME_ID}.${id}`, gameId: GAME_ID, title, stat, mode, target, cadence, reward });

export const MISSIONS: readonly MissionDef[] = [
  m('d.peak10', 'Own 10% of the map in one life', 'peakPercent', 'max', 10, 'daily', 400),
  m('d.peak25', 'Own 25% of the map in one life', 'peakPercent', 'max', 25, 'daily', 900),
  m('d.kills3', 'Take out 3 players', 'kills', 'add', 3, 'daily', 500),
  m('d.multi', 'Get 2 kills in one life', 'roundKills', 'max', 2, 'daily', 600),
  m('d.feats3', 'Pull off 3 feats', 'feats', 'add', 3, 'daily', 600),
  m('d.treasure2', 'Capture 2 treasures', 'treasures', 'add', 2, 'daily', 500),
  m('d.lives5', 'Play 5 lives', 'lives', 'add', 5, 'daily', 300),
  m('d.map30', 'Capture 30% of the map in total', 'mapCaptured', 'add', 30, 'daily', 500),

  m('w.peak50', 'Own 50% of the map in one life', 'peakPercent', 'max', 50, 'weekly', 4000),
  m('w.win', 'Win a round', 'wins', 'add', 1, 'weekly', 6000),
  m('w.kills25', 'Take out 25 players', 'kills', 'add', 25, 'weekly', 3000),
  m('w.feats20', 'Pull off 20 feats', 'feats', 'add', 20, 'weekly', 3500),
  m('w.treasure15', 'Capture 15 treasures', 'treasures', 'add', 15, 'weekly', 3000),
  m('w.map300', 'Capture 300% of the map in total', 'mapCaptured', 'add', 300, 'weekly', 3000),
];
