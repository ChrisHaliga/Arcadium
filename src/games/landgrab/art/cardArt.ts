/**
 * The hub card's scene: a corner of a live match on a lumpy island floating in space.
 * Five players in vivid colours and different skins hold their land. In turn, the red
 * player heads out on a sparkling loop, snatches a gem and banks the land with confetti,
 * the blue one draws a comet loop and the yellow one a bubbly one, so a trail is nearly
 * always out. The action sits in the card's upper half, above the title.
 */
import type { Loadout } from '../../../shared/services';
import { GAME_ID } from '../config';
import { cosmeticById, DEFAULT_LOADOUT } from '../content';
import type { PlayerProfile, Slot } from '../core';
import { orbit, Pilot, sortie, to, travelling, type Circle, type Leg } from './pilot';
import type { SceneSpec } from './scene';
import { buildStage, startOn, type CastMember, type Disc } from './stage';

const SIZE = 128;
/** A match's pace, eased a touch so the card stays calm. */
const TICK_SECONDS = 1 / 17;
/** Ticks of scripted play before the card opens: everyone's land gets a captured lobe. */
const PREROLL_TICKS = 150;
/** The island: radius around its centre, with gentle lumps. */
const ISLAND = { x: 64, y: 80, r: 64 } as const;

/** How the card looks this many seconds in, shown as the still under reduced motion. */
export const CARD_STILL_AT = 3.2;

interface Player {
  slot: Slot;
  /** Index into HUMAN_COLORS. */
  color: number;
  look: Partial<Loadout>;
  home: readonly Disc[];
  /** The circle the head glides round at home. */
  circle: Circle;
  /** A loop out and back that shapes the land before the card opens. */
  shaping: readonly Leg[];
  /** The loop flown on the card, if any: when to leave (heading, after how many ticks) and the way round. */
  sortie?: { heading: number; after: number; legs: readonly Leg[] };
}

/** One loadout slot, by the item's short id in content.ts. */
const style = (kind: keyof Loadout, id: string) => ({ [kind]: `${GAME_ID}.${kind}.${id}` });

const PLAYERS: readonly Player[] = [
  {
    slot: 1,
    color: 0,
    look: { ...style('trail', 'sparkle'), ...style('capture', 'confetti') },
    home: [[62, 43, 8]],
    circle: [62, 43, 5],
    shaping: [to(52, 48), to(56, 56), to(62, 47)],
    sortie: { heading: 20, after: 0, legs: [to(66, 29), to(76, 24), to(81, 33), to(66, 43)] },
  },
  {
    slot: 2,
    color: 2,
    look: { ...style('skin', 'dots'), ...style('trail', 'bubbles') },
    home: [[42, 31, 7]],
    circle: [42, 32, 4.5],
    shaping: [to(36, 41), to(44, 43), to(44, 35)],
    sortie: { heading: 90, after: 56, legs: [to(52, 24), to(55, 33), to(45, 33)] },
  },
  {
    slot: 3,
    color: 5,
    look: { ...style('skin', 'stripes'), ...style('trail', 'comet') },
    home: [[89, 42, 7]],
    circle: [89, 42, 4.5],
    shaping: [to(97, 35), to(98, 45), to(92, 43)],
    sortie: { heading: 200, after: 28, legs: [to(84, 53), to(74, 55), to(78, 46), to(87, 43)] },
  },
  {
    slot: 4,
    color: 7,
    look: style('skin', 'galaxy'),
    home: [[40, 60, 8]],
    circle: [40, 60, 5],
    shaping: [to(50, 58), to(49, 67), to(42, 63)],
  },
  {
    slot: 5,
    color: 4,
    look: style('skin', 'aurora'),
    home: [[86, 68, 8]],
    circle: [86, 68, 5],
    shaping: [to(75, 70), to(77, 78), to(83, 71)],
  },
];

/** Gems on open ground; the first sits inside the red player's loop. */
const TREASURE: readonly (readonly [number, number])[] = [
  [73, 31],
  [58, 62],
  [68, 56],
];

export function cardScene(): SceneSpec {
  const cast = PLAYERS.map((p): CastMember => ({ slot: p.slot, profile: profile(p), home: p.home, ...startOn(p.circle) }));
  const shaping = PLAYERS.map((p) => new Pilot(p.slot, [...p.shaping, orbit(p.circle)]));
  const start = buildStage({ size: SIZE, playable: onIsland, cast, treasure: TREASURE, preroll: { pilots: shaping, ticks: PREROLL_TICKS } });
  const pilots = PLAYERS.map((p) => {
    if (!p.sortie) return new Pilot(p.slot, [orbit(p.circle)]);
    const { heading, after, legs } = p.sortie;
    const facing = travelling(p.slot, heading);
    return sortie(p.slot, p.circle, (state, ticks) => ticks >= after && facing(state, ticks), legs);
  });
  return {
    start,
    pilots,
    loopTicks: 120,
    // The loops never cross, so nobody's timing matters: whoever is home just carries on.
    inSync: [],
    tickSeconds: TICK_SECONDS,
    view: { x: 64, y: 54, span: 72 },
    cosmetics: cosmeticById,
  };
}

function profile(p: Player): PlayerProfile {
  // No names: labels would crowd the card.
  return { id: `card-${p.slot}`, name: '', kind: 'human', color: p.color, cosmetics: { ...DEFAULT_LOADOUT, ...p.look } };
}

function onIsland(x: number, y: number): boolean {
  const dx = x - ISLAND.x;
  const dy = y - ISLAND.y;
  const a = Math.atan2(dy, dx);
  const r = ISLAND.r * (1 + 0.06 * Math.sin(3 * a + 1) + 0.04 * Math.sin(5 * a + 2));
  return dx * dx + dy * dy < r * r;
}
