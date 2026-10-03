/**
 * The plug-in contract between the hub and each game in the bundle.
 *
 * CONTRACT FILE: the hub (src/hub) only knows games through this interface;
 * each game exports one GameModule from its folder's index.ts.
 */
import type { CosmeticDef, GameServices, Loadout, MissionDef, PlayerColor } from './services';

// Defined with the other DOM-free game data, which the match server type-checks without the DOM.
export type { MissionDef } from './services';

export interface Disposable {
  dispose(): void;
}

export interface LaunchOptions {
  mode: 'online' | 'offline';
}

export interface GameModule {
  id: string;
  title: string;
  tagline: string;
  /** CSS colour used for the game's card and accents in the hub. */
  accent: string;
  /** false = "coming soon" card. */
  available: boolean;
  /** Mission pool this game contributes to the hub's daily/weekly missions. */
  missions: readonly MissionDef[];
  /** Cosmetics this game contributes to the hub's shop and chests. */
  cosmetics: readonly CosmeticDef[];
  /**
   * What a new player wears, from `cosmetics`: owned from the start, never sold or dropped.
   * Without one a player wears the first cosmetic of each kind.
   */
  defaultLoadout?: Loadout;
  /**
   * The colours ProfileService.color picks from in this game (the index wraps). The hub shows
   * the featured game's palette in the profile and colour picker.
   */
  playerColors?: readonly PlayerColor[];
  /** Self-playing, silent match rendered behind the hub menus. */
  mountAttract?(host: HTMLElement): Disposable;
  /** Art for the game's card in the hub, drawn in the game's own style (may animate). */
  mountCardArt?(host: HTMLElement): Disposable;
  /**
   * Draw a preview of one of this game's cosmetics into `canvas` (sized by the caller, CSS pixels =
   * canvas.clientWidth/Height) in the player's colour, using the game's real rendering so shop and
   * locker previews match what players see in a match. May animate until disposed.
   */
  renderCosmeticPreview?(canvas: HTMLCanvasElement, cosmetic: CosmeticDef, color: number): Disposable;
  /** Start the game inside `host`; the hub calls dispose() when leaving. */
  launch(host: HTMLElement, services: GameServices, opts: LaunchOptions): Disposable;
}
