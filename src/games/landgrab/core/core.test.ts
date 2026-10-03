import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config';
import {
  cellAt,
  checksum,
  cloneState,
  copyState,
  createSim,
  createSimFromMask,
  deserialize,
  headingDelta,
  headingTo,
  idx,
  planHeadMove,
  serialize,
  step,
  SUB,
  type Command,
  type Heading,
  type Player,
  type PlayerProfile,
  type SimConfig,
  type SimEvent,
  type SimState,
  type Slot,
} from './index';
import { newPlayer } from './spawn';

// ---- helpers -------------------------------------------------------------------------

const SIZE = 200;
const MIDDLE = SIZE / 2;
/** The real tuning (speed, turning, head and trail sizes) on a smaller raster, without treasure. */
const CONFIG: SimConfig = { ...SIM_CONFIG, size: SIZE, treasureCount: 0, reviveWindowTicks: 20, maxSlots: 4 };

/** A position in cells; fractions place a head inside its cell. */
type Point = [x: number, y: number];

const UP = 0;
const RIGHT = 256;
const DOWN = 512;
const LEFT = 768;

function profile(slot: Slot, kind: 'human' | 'bot' = 'bot'): PlayerProfile {
  return { id: `p${slot}`, name: `P${slot}`, kind, color: slot, cosmetics: { skin: '', trail: '', capture: '', kill: '' } };
}

/** An arena of the cells whose centres pass `playable`, with nobody on it. */
function arena(playable: (x: number, y: number) => boolean): SimState {
  const mask = new Array<number>(SIZE * SIZE).fill(0);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (playable(x + 0.5, y + 0.5)) mask[idx(SIZE, x, y)] = 1;
  return createSimFromMask(CONFIG, mask, 1);
}

/** A big open disc of radius 95 cells, filling most of the raster. */
function roundArena(): SimState {
  return arena((x, y) => (x - MIDDLE) ** 2 + (y - MIDDLE) ** 2 <= 95 * 95);
}

/** The playable cells whose centres lie within `r` cells of `centre`. */
function discCells(s: SimState, [x0, y0]: Point, r: number): number[] {
  const cells: number[] = [];
  for (let y = Math.floor(y0 - r); y <= y0 + r; y++) {
    for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
      const c = idx(SIZE, x, y);
      if ((x + 0.5 - x0) ** 2 + (y + 0.5 - y0) ** 2 <= r * r && s.mask[c] === 1) cells.push(c);
    }
  }
  return cells;
}

/** Hands `slot` a disc of land (taking it from whoever owned it). */
function claim(s: SimState, slot: Slot, centre: Point, r: number): void {
  for (const c of discCells(s, centre, r)) {
    if (s.owner[c] !== 0) s.counts[s.owner[c]]--;
    s.owner[c] = slot;
    s.counts[slot]++;
  }
}

/** Puts a living player's head at `at`, facing and steering `heading`. */
function place(s: SimState, slot: Slot, at: Point, heading: Heading, kind: 'human' | 'bot' = 'bot'): void {
  const p = newPlayer(slot, profile(slot, kind), s.tick);
  Object.assign(p, {
    alive: true,
    x: Math.round(at[0] * SUB),
    y: Math.round(at[1] * SUB),
    heading,
    targetHeading: heading,
    moveHeading: heading,
    diedAtTick: -1,
  });
  s.players[slot] = p;
}

/** Lays a blob of `slot`'s trail (stamped now) on the cells within 2 cells of `at`. */
function paintTrail(s: SimState, slot: Slot, at: Point): void {
  for (const c of discCells(s, at, 2)) {
    s.trail[c] = slot;
    s.trailTick[c] = s.tick;
    s.players[slot]!.trail.push(c);
  }
}

function head(s: SimState, slot: Slot): Point {
  const p = s.players[slot]!;
  return [p.x / SUB, p.y / SUB];
}

function cellOf([x, y]: Point): number {
  return idx(SIZE, Math.floor(x), Math.floor(y));
}

function distance([ax, ay]: Point, [bx, by]: Point): number {
  return Math.hypot(ax - bx, ay - by);
}

function towards(s: SimState, slot: Slot, [x, y]: Point): Heading {
  const p = s.players[slot]!;
  return headingTo(Math.round(x * SUB) - p.x, Math.round(y * SUB) - p.y);
}

/** Steering for one player on one tick: a fixed heading, or a heading worked out from the state. */
type Steering = Heading | ((s: SimState) => Heading);

/**
 * Steps up to `ticks` times with each listed player steering as given (only while alive),
 * stopping after the first tick whose events satisfy `until`.
 */
function run(
  s: SimState,
  ticks: number,
  steering: Record<Slot, Steering> = {},
  until: (tickEvents: SimEvent[]) => boolean = () => false,
): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const cmds: Command[] = [];
    for (const [key, steer] of Object.entries(steering)) {
      const slot = Number(key);
      if (!s.players[slot]?.alive) continue;
      cmds.push({ t: 'steer', slot, heading: typeof steer === 'number' ? steer : steer(s) });
    }
    const tickEvents = step(s, cmds);
    events.push(...tickEvents);
    if (until(tickEvents)) break;
  }
  return events;
}

const captured = (events: SimEvent[]) => events.some((e) => e.t === 'capture');
const died = (events: SimEvent[]) => events.some((e) => e.t === 'death');

/**
 * Steering that heads for each waypoint in turn, moving on once within 1.5 cells, and
 * keeps the heading it has after the last one.
 */
function route(slot: Slot, waypoints: Point[]): (s: SimState) => Heading {
  let next = 0;
  return (s) => {
    while (next < waypoints.length && distance(head(s, slot), waypoints[next]) < 1.5) next++;
    return next < waypoints.length ? towards(s, slot, waypoints[next]) : s.players[slot]!.heading;
  };
}

/** Steering that turns as hard as it can, clockwise: circles about 9 cells across. */
function circling(slot: Slot): (s: SimState) => Heading {
  return (s) => (s.players[slot]!.heading + RIGHT) % 1024;
}

/**
 * Waypoints around a wobbly circle: radius + wobble * sin(3θ + phase) about `centre`,
 * a full turn from angle `start` (degrees; 0 = right, clockwise on screen) and back.
 */
function wobblyLoop(centre: Point, radius: number, wobble: number, phase: number, start: number, clockwise = true): Point[] {
  const points: Point[] = [];
  for (let k = 1; k <= 36; k++) {
    const angle = ((start + (clockwise ? 10 : -10) * k) * Math.PI) / 180;
    const r = radius + wobble * Math.sin(3 * angle + phase);
    points.push([centre[0] + r * Math.cos(angle), centre[1] + r * Math.sin(angle)]);
  }
  return points;
}

function deaths(events: SimEvent[]) {
  return events.filter((e) => e.t === 'death').map(({ slot, killer, cause, canRevive }) => ({ slot, killer, cause, canRevive }));
}

function captures(events: SimEvent[]) {
  return events.filter((e) => e.t === 'capture');
}

function ownedBy(s: SimState, slot: Slot, cells: number[]): boolean {
  return cells.every((c) => s.owner[c] === slot);
}

/**
 * Slot 1 owns a disc at (60, 100) and goes out round a wobbly loop about (90, 100),
 * coming back into its land: everything within ~15 cells of (90, 100) ends up enclosed.
 */
const LOOP_CENTRE: Point = [90, 100];
const LOOP = [...wobblyLoop(LOOP_CENTRE, 22, 3, 0, 180), [60, 100] as Point];

/**
 * Slot 1 on its land at (60, 100), facing the first of `waypoints`: one behind it could
 * sit inside its turning circle, where it would circle the waypoint forever.
 */
function loopArena(waypoints: Point[] = LOOP): SimState {
  const s = roundArena();
  claim(s, 1, [60, 100], 12);
  const start: Point = [64, 100];
  place(s, 1, start, headingTo(waypoints[0][0] - start[0], waypoints[0][1] - start[1]));
  return s;
}

// ---- tests ---------------------------------------------------------------------------

describe('capture', () => {
  it('closing a smooth loop takes the trail and everything inside it, stealing land on the way', () => {
    const s = loopArena();
    // Slot 2 owns a patch inside the loop and circles safely on its main land far away.
    claim(s, 2, [92, 100], 5);
    claim(s, 2, [140, 60], 10);
    place(s, 2, [140, 60], UP);
    const patch = discCells(s, [92, 100], 5);
    const before = s.counts[1];

    const events = run(s, 200, { 1: route(1, LOOP), 2: circling(2) }, captured);

    const [capture] = captures(events);
    expect(captures(events)).toHaveLength(1);
    expect(capture).toMatchObject({ slot: 1, stolen: [{ slot: 2, count: patch.length }] });
    expect(capture.t === 'capture' && capture.trailLength).toBeGreaterThan(300);
    expect(s.counts[1]).toBe(before + (capture.t === 'capture' ? capture.cells.length : 0));
    expect(ownedBy(s, 1, discCells(s, LOOP_CENTRE, 14))).toBe(true);
    expect(ownedBy(s, 1, patch)).toBe(true);
    expect(s.counts[2]).toBe(discCells(s, [140, 60], 10).length);
    // Outside the loop nothing changed hands.
    expect(s.owner[cellOf([90, 135])]).toBe(0);
    expect(s.owner[cellOf([125, 100])]).toBe(0);
    expect(s.players[1]!.trail).toEqual([]);
    expect(s.players[1]!.trailPath).toEqual([]);
    expect(s.trail.every((v) => v === 0)).toBe(true);
    expect(deaths(events)).toEqual([]);
  });

  it.each([
    ['round, clockwise', 20, 0, 0, true],
    ['lumpy, clockwise', 22, 4, 1, true],
    ['lumpy, counter-clockwise', 22, 4, 2, false],
    ['wide and wavy', 26, 5, 3, true],
    ['tight', 14, 2, 4, false],
  ])('a %s loop is watertight: its whole inside is captured', (_name, radius, wobble, phase, clockwise) => {
    const centre: Point = [64 + radius, 100];
    const waypoints = [...wobblyLoop(centre, radius, wobble, phase, 180, clockwise), [60, 100] as Point];
    const s = loopArena(waypoints);

    const events = run(s, 250, { 1: route(1, waypoints) }, captured);

    expect(captures(events)).toHaveLength(1);
    expect(deaths(events)).toEqual([]);
    expect(ownedBy(s, 1, discCells(s, centre, radius - wobble - 5))).toBe(true);
  });
});

describe('deaths', () => {
  it('cut: crossing a trail kills its owner and credits the crosser', () => {
    const s = roundArena();
    claim(s, 1, [60, 100], 8);
    place(s, 1, [64, 100], RIGHT);
    claim(s, 2, [85, 143], 6);
    place(s, 2, [85, 140], UP);

    const events = run(s, 60, { 1: RIGHT, 2: UP }, died);

    expect(deaths(events)).toEqual([{ slot: 1, killer: 2, cause: 'cut', canRevive: false }]);
    expect(s.players[2]!.alive).toBe(true);
    expect(s.players[2]!.kills).toBe(1);
    expect(s.players[1]!.lastKilledBy).toBe('p2');
    expect(s.counts[1]).toBe(0);
    expect(s.trail.includes(1)).toBe(false);
  });

  it('self: crossing your own older trail', () => {
    const s = roundArena();
    claim(s, 1, [60, 100], 8);
    place(s, 1, [64, 100], RIGHT);

    // Out to the right, round, and back up across the way out.
    const events = run(s, 120, { 1: route(1, [[90, 100], [90, 115], [78, 115], [78, 80]]) }, died);

    expect(deaths(events)).toEqual([{ slot: 1, killer: 0, cause: 'self', canRevive: false }]);
  });

  it('head-on: two heads meeting both die, with no kill credited', () => {
    const s = roundArena();
    claim(s, 1, [70, 100], 5);
    place(s, 1, [70, 100], RIGHT);
    claim(s, 2, [110, 100], 5);
    place(s, 2, [110, 100], LEFT);

    const events = run(s, 30, { 1: RIGHT, 2: LEFT }, died);

    expect(deaths(events)).toEqual([
      { slot: 1, killer: 0, cause: 'headon', canRevive: false },
      { slot: 2, killer: 0, cause: 'headon', canRevive: false },
    ]);
    expect(distance(head(s, 1), head(s, 2))).toBeLessThan(2 * CONFIG.headRadius + 3);
    expect(s.players[1]!.kills + s.players[2]!.kills).toBe(0);
  });

  it('enclosed: a capture swallowing your head kills you and credits the capturer', () => {
    const s = loopArena();
    // Slot 2 circles on its own land in the middle of the loop.
    claim(s, 2, LOOP_CENTRE, 10);
    place(s, 2, LOOP_CENTRE, UP);

    const events = run(s, 200, { 1: route(1, LOOP), 2: circling(2) }, captured);

    expect(deaths(events)).toEqual([{ slot: 2, killer: 1, cause: 'enclosed', canRevive: false }]);
    expect(events).toContainEqual({ t: 'feat', slot: 1, feat: 'trap', victim: 2 });
    expect(s.players[1]!.kills).toBe(1);
    expect(s.counts[2]).toBe(0);
  });

  it('enclosed: a capture swallowing only part of your trail kills you too', () => {
    const s = loopArena();
    // Slot 2 is out on a run far from the loop, but part of its trail lies inside it.
    claim(s, 2, [45, 150], 5);
    place(s, 2, [60, 160], RIGHT);
    paintTrail(s, 2, LOOP_CENTRE);

    const events = run(s, 200, { 1: route(1, LOOP), 2: RIGHT }, captured);

    const death = events.find((e) => e.t === 'death');
    expect(deaths(events)).toEqual([{ slot: 2, killer: 1, cause: 'enclosed', canRevive: false }]);
    const capture = captures(events)[0];
    expect(death?.t === 'death' && capture.t === 'capture' && capture.cells.includes(death.at)).toBe(false);
    expect(s.trail.includes(2)).toBe(false);
  });

  it('land lost: losing your last land to a capture kills you, credited to the capturer', () => {
    const s = loopArena();
    // Slot 2's only land lies inside the loop while slot 2 itself is out far away.
    claim(s, 2, LOOP_CENTRE, 4);
    place(s, 2, [60, 160], RIGHT);
    const land = s.counts[2];

    const events = run(s, 200, { 1: route(1, LOOP), 2: RIGHT }, captured);

    expect(captures(events)[0]).toMatchObject({ slot: 1, stolen: [{ slot: 2, count: land }] });
    expect(deaths(events)).toEqual([{ slot: 2, killer: 1, cause: 'landlost', canRevive: false }]);
    expect(s.trail.includes(2)).toBe(false);
  });
});

describe('turning', () => {
  it('turns toward the steered heading by at most turnRate a tick, the shortest way round', () => {
    const s = roundArena();
    claim(s, 1, [MIDDLE, MIDDLE], 40);
    place(s, 1, [MIDDLE, MIDDLE], UP);

    const headings: Heading[] = [];
    for (let i = 0; i < 14; i++) {
      step(s, i === 0 ? [{ t: 'steer', slot: 1, heading: DOWN }] : []);
      headings.push(s.players[1]!.heading);
      expect(s.players[1]!.moveHeading).toBe(s.players[1]!.heading);
    }
    const rate = CONFIG.turnRate;
    expect(headings).toEqual([...Array.from({ length: 12 }, (_, i) => (i + 1) * rate), DOWN, DOWN]);

    // From down, "slightly left of up" is reached turning clockwise through left: 512 -> 1000.
    run(s, 1, { 1: 1000 });
    expect(s.players[1]!.heading).toBe(DOWN + rate);
  });

  it('a tight U-turn out in the open never kills you', () => {
    const s = roundArena();
    claim(s, 1, [60, 100], 8);
    place(s, 1, [66, 100], RIGHT);

    const out = run(s, 12, { 1: RIGHT });
    const turnPoint = head(s, 1);
    const back = run(s, 30, { 1: LEFT });

    expect(deaths([...out, ...back])).toEqual([]);
    const [x, y] = head(s, 1);
    // Back past where it turned, on a parallel line one turning circle (~9 cells) away.
    expect(x).toBeLessThan(turnPoint[0] - 10);
    expect(Math.abs(y - turnPoint[1])).toBeGreaterThan(6);
    expect(Math.abs(y - turnPoint[1])).toBeLessThan(12);
    expect(s.players[1]!.trail.length).toBeGreaterThan(0);
  });
});

describe('edge sliding', () => {
  /** A square arena with straight edges, x and y in [10, 190). */
  function squareArena(): SimState {
    return arena((x, y) => x >= 10 && x < 190 && y >= 10 && y < 190);
  }

  function everyTick(s: SimState, ticks: number, steer: Steering, check: (s: SimState, events: SimEvent[]) => void): void {
    for (let i = 0; i < ticks; i++) check(s, run(s, 1, { 1: steer }));
  }

  it('steering straight into an edge slides along it, never onto void, and stops in the corner', () => {
    const s = squareArena();
    claim(s, 1, [100, 40], 6);
    place(s, 1, [100, 40], UP);

    const path: Point[] = [];
    everyTick(s, 150, UP, (state, events) => {
      expect(deaths(events)).toEqual([]);
      expect(state.mask[cellAt(SIZE, state.players[1]!.x, state.players[1]!.y)]).toBe(1);
      path.push(head(state, 1));
    });

    // Up to the top edge, then along it (toward the centre on a tie: right) into the corner,
    // which slides round off by a few cells.
    const p = s.players[1]!;
    expect(p.heading).toBe(UP);
    expect(p.slideSide).toBe(1);
    const [x, y] = head(s, 1);
    expect(x).toBeGreaterThan(180);
    expect(y).toBeLessThan(13);
    expect(path.some(([px, py]) => py < 13 && px > 120 && px < 170)).toBe(true);

    // Pressed into the corner for a while, out on its own trail; steering away is safe.
    everyTick(s, 30, DOWN, (_state, events) => expect(deaths(events)).toEqual([]));
    expect(head(s, 1)[1]).toBeGreaterThan(y + 5);
  });

  it('planHeadMove rolls a head forward exactly as step() moves the player, slides and stops included', () => {
    const s = squareArena();
    claim(s, 1, [100, 40], 6);
    place(s, 1, [100, 40], UP);
    const p = s.players[1]!;
    const ghost = { slot: 1, x: p.x, y: p.y, heading: UP, targetHeading: UP, moveHeading: UP, slideSide: p.slideSide, moved: true };
    const motion = (h: typeof ghost | Player) => [h.x, h.y, h.heading, h.moveHeading, h.slideSide];

    let slid = 0;
    let stopped = 0;
    // Up into the edge, along it into the corner, wedged there, then away again.
    for (const heading of [...Array<Heading>(150).fill(UP), ...Array<Heading>(30).fill(DOWN)]) {
      ghost.targetHeading = heading;
      planHeadMove(s, ghost, ghost);
      expect(deaths(run(s, 1, { 1: heading }))).toEqual([]);
      expect(motion(ghost)).toEqual(motion(p));
      if (ghost.slideSide !== 0) slid++;
      if (!ghost.moved) stopped++;
    }
    expect(slid).toBeGreaterThan(50);
    expect(stopped).toBeGreaterThan(0);
  });

  it('pressing into a straight diagonal edge at an angle runs steadily along it', () => {
    // A stair-stepped edge 30 cells out, facing 37.5 degrees: heading 1003 meets it 45 degrees off.
    const facing = (37.5 * Math.PI) / 180;
    const s = arena(
      (x, y) =>
        (x - MIDDLE) * Math.sin(facing) - (y - MIDDLE) * Math.cos(facing) <= 30 &&
        (x - MIDDLE) ** 2 + (y - MIDDLE) ** 2 <= 95 * 95,
    );
    claim(s, 1, [MIDDLE, MIDDLE], 5);
    place(s, 1, [MIDDLE, MIDDLE], 1003);

    const travelled: Heading[] = [];
    everyTick(s, 80, 1003, (state, events) => {
      expect(deaths(events)).toEqual([]);
      const p = state.players[1]!;
      if (p.slideSide !== 0) travelled.push(p.moveHeading);
    });

    // Never stuck, and after the turn onto the edge the course along it (about 875) holds steady.
    expect(travelled.length).toBeGreaterThan(40);
    for (let i = 2; i < travelled.length; i++) {
      expect(Math.abs(headingDelta(travelled[i - 1], travelled[i]))).toBeLessThanOrEqual(8);
      expect(Math.abs(headingDelta(875, travelled[i]))).toBeLessThanOrEqual(8);
    }
  });

  it('steering back while sliding along an edge turns off it, not back over the trail', () => {
    const s = squareArena();
    claim(s, 1, [60, 30], 8);
    place(s, 1, [60, 30], 128);
    run(s, 45, { 1: 128 });
    expect(s.players[1]!.slideSide).toBe(1);
    const turnPoint = head(s, 1);

    let travelled = s.players[1]!.moveHeading;
    everyTick(s, 40, LEFT, (state, events) => {
      expect(deaths(events)).toEqual([]);
      const p = state.players[1]!;
      expect(Math.abs(headingDelta(travelled, p.moveHeading))).toBeLessThanOrEqual(CONFIG.turnRate);
      travelled = p.moveHeading;
    });

    // Back the way it came, a turning circle below the edge.
    const [x, y] = head(s, 1);
    expect(x).toBeLessThan(turnPoint[0] - 15);
    expect(y).toBeGreaterThan(turnPoint[1] + 6);
  });

  it('pressing into a round edge at an angle follows the curve without dying or leaving the map', () => {
    const s = roundArena();
    claim(s, 1, [MIDDLE, MIDDLE], 30);
    place(s, 1, [MIDDLE, MIDDLE], RIGHT);
    // Always aim 40 degrees off straight out from the middle: into the edge, and along it clockwise.
    const outward = (state: SimState) => {
      const [x, y] = head(state, 1);
      return (headingTo(x - MIDDLE, y - MIDDLE) + 114) % 1024;
    };

    const visited: Point[] = [];
    everyTick(s, 200, outward, (state, events) => {
      expect(deaths(events)).toEqual([]);
      expect(state.mask[cellAt(SIZE, state.players[1]!.x, state.players[1]!.y)]).toBe(1);
      visited.push(head(state, 1));
    });

    const atEdge = visited.filter((p) => distance(p, [MIDDLE, MIDDLE]) > 92);
    expect(atEdge.length).toBeGreaterThan(80);
    expect(distance(atEdge[0], atEdge[atEdge.length - 1])).toBeGreaterThan(50);
  });
});

describe('winning', () => {
  it('owning 98% of the map ends the round and freezes everything', () => {
    const s = roundArena();
    // Slot 1 owns everything but a hole of ~2.2% of the map, and drives straight through it.
    for (let c = 0; c < s.mask.length; c++) {
      if (s.mask[c] === 0) continue;
      s.owner[c] = 1;
      s.counts[1]++;
    }
    for (const c of discCells(s, [130, 100], 14)) {
      s.owner[c] = 0;
      s.counts[1]--;
    }
    place(s, 1, [110, 100], RIGHT);
    expect(s.counts[1] * 1000).toBeLessThan(CONFIG.winPermille * s.playable);

    const events = run(s, 40, { 1: RIGHT });

    expect(events).toContainEqual({ t: 'roundOver', winner: 1 });
    expect(s.counts[1]).toBe(s.playable);
    expect(s.roundOver?.winner).toBe(1);
    const frozenAt = head(s, 1);
    const tick = s.tick;
    expect(run(s, 5, { 1: DOWN })).toEqual([]);
    expect(head(s, 1)).toEqual(frozenAt);
    expect(s.tick).toBe(tick + 5);
  });
});

describe('revive', () => {
  /** A human who dies to their own trail next to their land, keeping it for the revive window. */
  function humanDies(): { s: SimState; land: number } {
    const s = roundArena();
    claim(s, 1, [60, 100], 8);
    place(s, 1, [64, 100], RIGHT, 'human');
    const land = s.counts[1];
    const events = run(s, 120, { 1: route(1, [[90, 100], [90, 115], [78, 115], [78, 80]]) }, died);
    expect(deaths(events)).toEqual([{ slot: 1, killer: 0, cause: 'self', canRevive: true }]);
    expect(s.players[1]!.reviveUntilTick).toBe(s.players[1]!.diedAtTick + CONFIG.reviveWindowTicks);
    return { s, land };
  }

  it('reviving within the window comes back on the kept land, facing into it', () => {
    const { s, land } = humanDies();
    expect(run(s, 10)).toEqual([]);
    expect(s.counts[1]).toBe(land);

    const events = step(s, [{ t: 'revive', slot: 1 }]);

    expect(events).toEqual([{ t: 'spawn', slot: 1, x: expect.any(Number), y: expect.any(Number), revive: true }]);
    const spawn = events[0].t === 'spawn' ? events[0] : null;
    const p = s.players[1]!;
    expect(p.alive).toBe(true);
    expect(p.revivesUsed).toBe(1);
    expect(s.counts[1]).toBe(land);
    expect(s.owner[cellAt(SIZE, spawn!.x, spawn!.y)]).toBe(1);
    // It came back and set off toward the middle of its land.
    const toMiddle = headingTo(60 * SUB - spawn!.x, 100 * SUB - spawn!.y);
    expect(Math.abs(headingDelta(p.heading, toMiddle))).toBeLessThan(30);
    expect(s.owner[cellAt(SIZE, p.x, p.y)]).toBe(1);
  });

  it('a round ending closes the window at once', () => {
    const { s } = humanDies();
    // Slot 2 owns everything else: over 98% of the map, so the round ends on the next tick.
    for (let c = 0; c < s.mask.length; c++) {
      if (s.mask[c] === 0 || s.owner[c] !== 0) continue;
      s.owner[c] = 2;
      s.counts[2]++;
    }
    place(s, 2, [140, 100], UP);

    expect(step(s, [])).toEqual([
      { t: 'roundOver', winner: 2 },
      { t: 'landCleared', slot: 1 },
    ]);
    expect(s.players[1]!.reviveUntilTick).toBe(-1);
    expect(s.counts[1]).toBe(0);
  });

  it('the kept land goes neutral when the window closes, and a late revive is refused', () => {
    const { s, land } = humanDies();
    const until = s.players[1]!.reviveUntilTick;
    expect(run(s, until - s.tick)).toEqual([]);
    expect(s.counts[1]).toBe(land);

    const events = step(s, [{ t: 'revive', slot: 1 }]);

    expect(events).toEqual([{ t: 'landCleared', slot: 1 }]);
    expect(s.players[1]!.alive).toBe(false);
    expect(s.counts[1]).toBe(0);
    expect(s.owner.includes(1)).toBe(false);
  });
});

describe('determinism', () => {
  const DET_CONFIG: SimConfig = { ...SIM_CONFIG, size: 240, maxSlots: 10 };

  /**
   * A seeded stream of commands for ten players: they wander out of their land with random
   * steering, head home after a while, respawn and revive at random, and some leave and
   * rejoin. Decisions read the state they are given, so both copies get the same commands.
   */
  function commandStream(seed: number) {
    let r = seed >>> 0;
    const rand = (n: number) => {
      r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
      return (r >>> 8) % n;
    };
    return (s: SimState): Command[] => {
      const cmds: Command[] = [];
      if (s.tick === 0) {
        for (let slot = 1; slot <= 10; slot++) cmds.push({ t: 'join', slot, profile: profile(slot, slot <= 3 ? 'human' : 'bot') });
      }
      if (s.tick === 900) cmds.push({ t: 'newRound', seed: 4242 });
      if (s.tick % 150 === 75) {
        const slot = 1 + rand(10);
        cmds.push({ t: 'leave', slot }, { t: 'join', slot, profile: profile(slot, 'bot') });
      }
      for (const p of s.players) {
        if (!p) continue;
        if (!p.alive) {
          if (p.reviveUntilTick > s.tick && rand(3) === 0) cmds.push({ t: 'revive', slot: p.slot });
          else if (rand(8) === 0) cmds.push({ t: 'spawn', slot: p.slot });
        } else if (p.trail.length > 40 + 10 * (p.slot % 7)) {
          cmds.push({ t: 'steer', slot: p.slot, heading: homeward(s, p.slot) });
        } else if (rand(4) === 0) {
          cmds.push({ t: 'steer', slot: p.slot, heading: (p.heading + rand(301) - 150 + 1024) % 1024 });
        }
      }
      return cmds;
    };
  }

  /** Heading toward the player's nearest owned cell (sampled), or straight on if it has none. */
  function homeward(s: SimState, slot: Slot): Heading {
    const p = s.players[slot]!;
    let best = -1;
    let bestDist = Infinity;
    for (let c = 0; c < s.owner.length; c += 5) {
      if (s.owner[c] !== slot) continue;
      const d = ((c % s.size) * SUB - p.x) ** 2 + (Math.floor(c / s.size) * SUB - p.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (best < 0) return p.heading;
    return headingTo((best % s.size) * SUB + SUB / 2 - p.x, Math.floor(best / s.size) * SUB + SUB / 2 - p.y);
  }

  it('the same commands give the same state every tick, after a snapshot round-trip, and after copyState', () => {
    const a = createSim(DET_CONFIG, 77);
    const b = createSim(DET_CONFIG, 77);
    const next = commandStream(9);
    const seen = new Set<string>();
    // A prediction buffer made early and then left stale, as MatchClient reuses one.
    let buffer: SimState | null = null;

    for (let i = 0; i < 600; i++) {
      const cmds = next(a);
      const ea = step(a, cmds);
      expect(step(b, cmds)).toEqual(ea);
      expect(checksum(b)).toBe(checksum(a));
      for (const e of ea) seen.add(e.t === 'death' ? `death:${e.cause}` : e.t);
      for (const p of a.players) if (p?.alive) expect(a.mask[cellAt(a.size, p.x, p.y)]).toBe(1);
      if (i === 100) buffer = cloneState(a);
    }

    const restored = deserialize(JSON.parse(JSON.stringify(serialize(a))) as ReturnType<typeof serialize>);
    copyState(buffer!, a);
    const copied = buffer!;
    const atSplit = checksum(a);
    expect(checksum(restored)).toBe(atSplit);
    expect(checksum(copied)).toBe(atSplit);

    // The copy runs ahead alone first: the original must not move with it.
    const ahead: { cmds: Command[]; events: SimEvent[]; sum: number }[] = [];
    for (let i = 0; i < 700; i++) {
      const cmds = next(copied);
      const events = step(copied, cmds);
      ahead.push({ cmds, events, sum: checksum(copied) });
      for (const e of events) seen.add(e.t === 'death' ? `death:${e.cause}` : e.t);
    }
    expect(checksum(a)).toBe(atSplit);

    for (const { cmds, events, sum } of ahead) {
      expect(step(a, cmds)).toEqual(events);
      expect(step(restored, cmds)).toEqual(events);
      expect(checksum(a)).toBe(sum);
      expect(checksum(restored)).toBe(sum);
    }
    // The run exercised the rules rather than idling.
    expect([...seen]).toEqual(
      expect.arrayContaining(['join', 'leave', 'spawn', 'capture', 'death:self', 'death:cut', 'newRound']),
    );
  });
});
