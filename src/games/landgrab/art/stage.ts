/**
 * Authoring an art scene's opening state: a hand-made map, players placed where the
 * composition needs them on smooth home land, treasure, and then a pre-roll of the real
 * sim (scripted pilots, not drawn) so land takes the shapes captures give it in a match.
 */
import { SIM_CONFIG } from '../config';
import { ANGLES, createSimFromMask, step, SUB, type Command, type Player, type PlayerProfile, type SimState, type Slot } from '../core';
import type { Circle, Pilot } from './pilot';

/** A disc in cells: centre x, centre y, radius. */
export type Disc = readonly [number, number, number];

export interface CastMember {
  slot: Slot;
  profile: PlayerProfile;
  /** Home land: the union of these discs. */
  home: readonly Disc[];
  /** Where the head starts (cells, inside home) and which way it faces (degrees, 0 = up, clockwise). */
  at: readonly [number, number];
  facing: number;
}

/** The bottom of a home circle, heading west: where a head starts to go clockwise round it. */
export function startOn([x, y, r]: Circle): Pick<CastMember, 'at' | 'facing'> {
  return { at: [x, y + r], facing: 270 };
}

export interface StageSpec {
  /** Raster side in cells. */
  size: number;
  /** Whether the cell at (x, y) is part of the map. */
  playable(x: number, y: number): boolean;
  cast: readonly CastMember[];
  /** Treasure gems, as cell coordinates on neutral ground. */
  treasure?: readonly (readonly [number, number])[];
  /** Scripted play run before the scene is shown, to shape the land. */
  preroll?: { pilots: readonly Pilot[]; ticks: number };
  /** Players placed after the pre-roll, exactly where authored. */
  entrants?: readonly CastMember[];
}

export function buildStage(spec: StageSpec): SimState {
  const { size } = spec;
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mask[y * size + x] = spec.playable(x + 0.5, y + 0.5) ? 1 : 0;
  // No random treasure: gems sit where the composition puts them, and none respawn mid-loop.
  const everyone = [...spec.cast, ...(spec.entrants ?? [])];
  const config = { ...SIM_CONFIG, size, treasureCount: 0, maxSlots: Math.max(...everyone.map((c) => c.slot)) };
  const state = createSimFromMask(config, mask, 1);
  for (const member of spec.cast) place(state, member);
  for (const [x, y] of spec.treasure ?? []) state.treasure.push(y * size + x);
  if (spec.preroll) {
    const { pilots, ticks } = spec.preroll;
    for (let t = 0; t < ticks; t++) step(state, steer(pilots, state));
    for (const pilot of pilots) pilot.reset();
  }
  for (const member of spec.entrants ?? []) place(state, member);
  return state;
}

/** This tick's commands from every pilot. */
export function steer(pilots: readonly Pilot[], state: SimState): Command[] {
  const cmds: Command[] = [];
  for (const pilot of pilots) {
    const cmd = pilot.command(state);
    if (cmd) cmds.push(cmd);
  }
  return cmds;
}

function place(state: SimState, member: CastMember): void {
  const { size, owner, mask } = state;
  const { slot } = member;
  for (const [cx, cy, r] of member.home) {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(size - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(size - 1, Math.ceil(cx + r)); x++) {
        const c = y * size + x;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r && mask[c] === 1 && owner[c] === 0) owner[c] = slot;
      }
    }
  }
  for (let c = 0; c < owner.length; c++) if (owner[c] === slot) state.counts[slot]++;
  state.players[slot] = castPlayer(member, state.counts[slot], state.tick);
}

/**
 * A live player standing where the composition puts them, written out in full: the sim's
 * spawn rules pick a random spot, and a field added to Player must be decided here too.
 */
function castPlayer(member: CastMember, cells: number, tick: number): Player {
  const heading = Math.round((member.facing / 360) * ANGLES) % ANGLES;
  return {
    slot: member.slot,
    profile: { ...member.profile, cosmetics: { ...member.profile.cosmetics } },
    alive: true,
    x: Math.round(member.at[0] * SUB),
    y: Math.round(member.at[1] * SUB),
    heading,
    targetHeading: heading,
    moveHeading: heading,
    slideSide: 0,
    trail: [],
    trailPath: [],
    kills: 0,
    lastKilledBy: null,
    recentKillTicks: [],
    lifeStartTick: tick,
    peakCells: cells,
    diedAtTick: -1,
    reviveUntilTick: -1,
    revivesUsed: 0,
    spawnPending: false,
  };
}
