/**
 * Cosmetic preview scenes, one per kind, each showing the item the way it looks in a
 * match: a skin on a patch of land with the head gliding over it, a trail drawn on a loop
 * out from home and back, a capture closing a loop, and a knockout as the player cuts a
 * rival's trail. Positions are in cells on an open floor bigger than the frame. The trail
 * and knockout scenes are timed so their item is on show for most of each loop.
 */
import type { CosmeticDef, CosmeticKind } from '../../../shared/services';
import { cosmeticById, DEFAULT_LOADOUT } from '../content';
import type { PlayerProfile, SimState, Slot } from '../core';
import { HUMAN_COLORS } from '../palette';
import { parseHex } from '../render/colors';
import { orbit, Pilot, sortie, to, travelling, type Circle } from './pilot';
import type { SceneSpec } from './scene';
import { buildStage, startOn, type CastMember, type Disc } from './stage';

const SIZE = 72;
const HERO = 1;
const RIVAL = 2;
/** Previews play a little slower than a match: calmer at card size. */
const TICK_SECONDS = 1 / 15;
/** Ticks spent circling home before the scene opens, so heads start on their settled circle. */
const SETTLE_TICKS = 60;

/** How each preview looks `seconds` in, shown as the still under reduced motion. */
export const PREVIEW_STILL_AT: Readonly<Record<CosmeticKind, number>> = { skin: 1, trail: 2.6, capture: 3.4, kill: 1.6 };

export function previewScene(cosmetic: CosmeticDef, color: number): SceneSpec {
  const hero: PlayerProfile = {
    id: 'preview-hero',
    name: '',
    kind: 'human',
    color,
    cosmetics: { ...DEFAULT_LOADOUT, [cosmetic.kind]: cosmetic.id },
  };
  const cosmetics = (id: string) => (id === cosmetic.id ? cosmetic : cosmeticById(id));
  // Every loop replays exactly: the player's timing is what lines the moments up.
  return { ...SCENES[cosmetic.kind](hero), cosmetics, tickSeconds: TICK_SECONDS, inSync: [HERO] };
}

type Recipe = (hero: PlayerProfile) => Omit<SceneSpec, 'cosmetics' | 'tickSeconds' | 'inSync'>;

/** Somebody living on `home`, circling it until the script takes over. */
interface Resident {
  slot: Slot;
  profile: PlayerProfile;
  home: readonly Disc[];
  circle: Circle;
}

const SCENES: Readonly<Record<CosmeticKind, Recipe>> = {
  /** A lumpy patch of land wearing the skin, the head circling on it. */
  skin(hero) {
    const home = { slot: HERO, profile: hero, home: [[36, 36, 11], [42, 31, 7], [30, 42, 7]], circle: [36, 36, 5] } as const;
    return { start: settle([home]), pilots: [new Pilot(HERO, [orbit(home.circle)])], loopTicks: Infinity, view: { x: 36, y: 37, span: 30 } };
  },

  /**
   * Out over the top of home on a loop that bends back round to the left, trail on show,
   * and back in to bank it. The loop comes home a third of a lap before the spot it set
   * out from, so the player is soon off again and the trail is out for most of the loop
   * (a lobe bending right would come home three quarters of a lap short). It is short
   * enough that the trail never heats up (TRAIL_HEAT), so no risk glow covers the item.
   */
  trail(hero) {
    const home = { slot: HERO, profile: hero, home: [[40, 46, 9], [46, 50, 6]], circle: [40, 46, 5.5] } as const;
    const loop = [to(44, 32), to(36, 26), to(28, 29), to(26, 38), to(31, 45)];
    // A few ticks past the usual settle, the player opens at the top of its circle, where the loop sets out.
    const start = settle([home], [], SETTLE_TICKS + 3);
    return { start, pilots: [sortie(HERO, home.circle, travelling(HERO, 100), loop)], loopTicks: 44, view: { x: 39, y: 41, span: 40 } };
  },

  /** A loop out of home that closes and plays the capture over the new land. */
  capture(hero) {
    const home = { slot: HERO, profile: hero, home: [[28, 46, 9], [22, 50, 6]], circle: [28, 46, 5.5] } as const;
    const loop = [to(38, 29), to(48, 33), to(33, 46)];
    return { start: settle([home]), pilots: [sortie(HERO, home.circle, travelling(HERO, 30), loop)], loopTicks: 58, view: { x: 37, y: 37, span: 40 } };
  },

  /**
   * A rival drives in across the player's land; the player, circling at home, runs
   * through the trail a few cells behind the rival's head, near the middle of the frame
   * so the knockout plays out in shot. A loop is one lap of the player's circle, so the
   * knockout is still playing as the next rival comes in.
   */
  kill(hero) {
    const rival: PlayerProfile = { ...hero, id: 'preview-rival', color: contrasting(hero.color) };
    const killer = { slot: HERO, profile: hero, home: [[34, 44, 10], [28, 50, 7]], circle: [34, 44, 5.5] } as const;
    // The rival comes straight in: it opens at the edge of its land, just out of shot, heading this way.
    const victim: CastMember = { slot: RIVAL, profile: rival, home: [[10, 40, 6]], at: [16, 40], facing: 90 };
    const pilots = [new Pilot(HERO, [orbit(killer.circle)]), new Pilot(RIVAL, [to(70, 40)])];
    // Opening a few ticks past the usual settle puts the player on the rival's line just after the head has passed.
    const start = settle([killer], [victim], SETTLE_TICKS + 5);
    // Just short of a lap: the restart then catches the player the first time it passes its opening spot.
    return { start, pilots, loopTicks: 24, view: { x: 40, y: 43, span: 40 } };
  },
};

/**
 * The opening state: residents circle home for `ticks` (which also sets where round their
 * circle they open), then any entrants are placed as authored.
 */
function settle(residents: readonly Resident[], entrants: readonly CastMember[] = [], ticks = SETTLE_TICKS): SimState {
  const cast = residents.map(({ slot, profile, home, circle }): CastMember => ({ slot, profile, home, ...startOn(circle) }));
  const pilots = residents.map(({ slot, circle }) => new Pilot(slot, [orbit(circle)]));
  return buildStage({ size: SIZE, playable: () => true, cast, preroll: { pilots, ticks }, entrants });
}

/** The palette colour furthest round the colour wheel from the player's, so the rival reads at a glance. */
function contrasting(color: number): number {
  const n = HUMAN_COLORS.length;
  const mine = hue(HUMAN_COLORS[((color % n) + n) % n].base);
  let best = 0;
  let bestGap = -1;
  HUMAN_COLORS.forEach((c, i) => {
    const d = Math.abs(hue(c.base) - mine);
    const gap = Math.min(d, 360 - d);
    if (gap > bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

function hue(hex: string): number {
  const [r, g, b] = parseHex(hex);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
