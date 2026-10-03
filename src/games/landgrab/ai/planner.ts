/**
 * Loop planning: where a bot leaves its land and how far it goes, so its outings read
 * as deliberate rather than wandering. A plan is a short list of waypoints: to the edge
 * of the land, then an arch out from it and along it. After the last one the brain takes
 * the quickest safe way home, which closes the loop. Going out square to the edge and
 * running along it grows land in blobs, and a loop cut short still encloses a wedge rather
 * than a thin finger. Plans are made only at home, a few times a minute, so they can
 * afford to look around.
 */
import { ANGLES, normalizeHeading, SUB, TRIG_ONE, vector, type Heading, type SimState, type Slot } from '../core';
import type { Personality } from './personality';
import type { Random } from './random';
import type { Rival } from './rivals';

/** A position in cells (fractional). */
export interface Point {
  x: number;
  y: number;
}

/** Exit directions considered around the bot. */
const DIRECTIONS = 16;
/** Furthest the bot looks through its own land for the edge, in cells. */
const MAX_INLAND = 160;
/** Shallower loops than this (cells) are not worth leaving home for; shorter legs are dropped. */
const MIN_LEG = 5;
/** Grid of sample points per side used to estimate what a loop would capture. */
const SAMPLES = 4;
/** Fixed cost of a loop, in cells of travel, so tiny loops don't look like bargains. */
const LOOP_OVERHEAD = 12;
/** Travelling across own land is safe, so it costs less than laying trail. */
const INLAND_COST = 0.5;
/** Rival heads closer than this (cells, plus half the trail) to a loop make it risky. */
const RISK_RADIUS = 25;
/** Cells of trail band per cell of trail lying outside the loop's outline (the band is 5 wide): captured too. */
const BAND_GAIN = 2;
/** Radius (cells) of land looked at around an exit point to tell which way is out. */
const NORMAL_RADIUS = 6;
/** The exit waypoint sits this far inside the land... */
const EXIT_INSET = 2;
/** ...and is skipped when the bot is about this close to it anyway (cells). */
const EXIT_NEAR = 8;
/** Range of arch shapes, from half ellipses to rounded boxes. */
const MIN_SQUARENESS = 2;
const MAX_SQUARENESS = 3.5;

function unit(heading: Heading): Point {
  const v = vector(heading);
  return { x: v.dx / TRIG_ONE, y: v.dy / TRIG_ONE };
}

/** Index of the cell containing the point (in cells), or -1 off the grid. */
function cellOf(state: SimState, x: number, y: number): number {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  return gx < 0 || gy < 0 || gx >= state.size || gy >= state.size ? -1 : gy * state.size + gx;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Plans the bot's next loop: tries every direction out of its land and both ways to run
 * along it, and keeps the loop that captures the most new ground per cell travelled, put
 * off by rival heads nearby. Falls back to the nearest ground it doesn't own (slivers along
 * the edge late in a round). Null only when the bot owns everything it can reach.
 */
export function planLoop(state: SimState, slot: Slot, personality: Personality, random: Random, rivals: readonly Rival[]): Point[] | null {
  const me = state.players[slot]!;
  const head = { x: me.x / SUB, y: me.y / SUB };
  // Bigger land has a longer edge to work along: loops grow with it, within reason.
  const grow = Math.min(1.7, Math.max(1, 0.85 + Math.sqrt(state.counts[slot]) / 150));
  const big = random.chance(personality.overreach) ? 1.5 : 1;
  const shape: ArchShape = {
    depth: random.range(personality.depth[0], personality.depth[1]) * grow * big,
    width: random.range(personality.width[0], personality.width[1]) * grow * big,
    squareness: random.range(MIN_SQUARENESS, MAX_SQUARENESS),
    points: random.chance(0.5) ? 4 : 5,
  };
  const first = random.int(ANGLES);
  let best: { score: number; waypoints: Point[] } | null = null;
  for (let i = 0; i < DIRECTIONS; i++) {
    const ray = unit(normalizeHeading(first + (i * ANGLES) / DIRECTIONS));
    const edge = landEdge(state, slot, head, ray);
    if (!edge) continue;
    const out = outward(state, slot, edge.at, ray);
    for (const side of [-1, 1]) {
      const along = { x: -out.y * side, y: out.x * side };
      const loop = fitArch(state, edge.at, out, along, shape);
      if (!loop) continue;
      const value = loopValue(state, slot, personality, loop, edge.inland);
      if (value <= 0) continue;
      const score = (value / (1 + personality.wariness * loopRisk(slot, rivals, loop))) * random.range(0.8, 1.2);
      if (best && score <= best.score) continue;
      const exit = { x: edge.at.x - out.x * EXIT_INSET, y: edge.at.y - out.y * EXIT_INSET };
      best = { score, waypoints: dist(head, exit) > EXIT_NEAR ? [exit, ...loop.waypoints] : loop.waypoints };
    }
  }
  return best?.waypoints ?? frontier(state, slot, head, random);
}

interface ArchShape {
  /** How far out from the land and how far along it, in cells. */
  depth: number;
  width: number;
  /** Superellipse exponent of the arch: 2 is a half ellipse, higher is boxier (more area per cell of trail). */
  squareness: number;
  /** Waypoints along the arch: each one bends the path by 180 / (points + 1) degrees. */
  points: number;
}

/** The loop as planned, plus the outline used to judge it. */
interface FittedLoop {
  waypoints: Point[];
  /** Exit point, far corners and the far end's foot on the exit's edge line: the area the loop roughly encloses. */
  corners: [Point, Point, Point, Point];
  trailLength: number;
}

/**
 * Where a ray from `from` along `dir` leaves the slot's land, and how many cells it ran
 * inside it. Null when it reaches the map edge first.
 */
function landEdge(state: SimState, slot: Slot, from: Point, dir: Point): { at: Point; inland: number } | null {
  for (let t = 0; t <= MAX_INLAND; t++) {
    const x = from.x + dir.x * t;
    const y = from.y + dir.y * t;
    const c = cellOf(state, x, y);
    if (c < 0 || state.mask[c] === 0) return null;
    if (state.owner[c] !== slot) return { at: { x, y }, inland: t };
  }
  return null;
}

/**
 * Which way is straight out of the land at an edge point: away from the middle of the
 * slot's cells nearby. Falls back to `ray` (the way the bot arrived) where the edge is
 * too ragged to say, or the answer would turn the bot back into its land.
 */
function outward(state: SimState, slot: Slot, at: Point, ray: Point): Point {
  const { size, owner } = state;
  const x0 = Math.floor(at.x);
  const y0 = Math.floor(at.y);
  let sx = 0;
  let sy = 0;
  for (let dy = -NORMAL_RADIUS; dy <= NORMAL_RADIUS; dy++) {
    for (let dx = -NORMAL_RADIUS; dx <= NORMAL_RADIUS; dx++) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (dx * dx + dy * dy > NORMAL_RADIUS * NORMAL_RADIUS || x < 0 || y < 0 || x >= size || y >= size) continue;
      if (owner[y * size + x] !== slot) continue;
      sx -= dx;
      sy -= dy;
    }
  }
  const len = Math.hypot(sx, sy);
  if (len < 1 || sx * ray.x + sy * ray.y <= 0) return ray;
  return { x: sx / len, y: sy / len };
}

/** The furthest point from `from` toward `to` reachable in a straight line over playable ground. */
function reach(state: SimState, from: Point, to: Point): Point {
  const steps = Math.ceil(dist(from, to));
  const dx = (to.x - from.x) / steps;
  const dy = (to.y - from.y) / steps;
  for (let k = 1; k <= steps; k++) {
    const c = cellOf(state, from.x + dx * k, from.y + dy * k);
    if (c < 0 || state.mask[c] === 0) return { x: from.x + dx * (k - 1), y: from.y + dy * (k - 1) };
  }
  return to;
}

/**
 * An arch from the exit: a half superellipse standing on the land's edge, out `depth`
 * and along `width`, as a few evenly spread waypoints. Between them the bot bends gently,
 * so the loop reads as one smooth curve. Cut short where the map ends (a loop that meets
 * the edge simply runs along it: the bot slides). Null when there is no room to get out.
 */
function fitArch(state: SimState, exit: Point, out: Point, along: Point, shape: ArchShape): FittedLoop | null {
  const { depth, width, squareness, points } = shape;
  const bend = 2 / squareness;
  const waypoints: Point[] = [];
  let from = exit;
  let trailLength = 0;
  let height = 0;
  for (let k = 1; k <= points; k++) {
    const angle = Math.PI * (1 - k / (points + 1));
    const cos = Math.cos(angle);
    const across = (width / 2) * (1 + Math.sign(cos) * Math.abs(cos) ** bend);
    const up = depth * Math.sin(angle) ** bend;
    const p = reach(state, from, {
      x: exit.x + out.x * up + along.x * across,
      y: exit.y + out.y * up + along.y * across,
    });
    if (dist(from, p) < MIN_LEG) {
      // The map edge cut this leg short: the arch ends here, unless it never got out at all.
      if (k === 1) return null;
      break;
    }
    trailLength += dist(from, p);
    height = Math.max(height, (p.x - exit.x) * out.x + (p.y - exit.y) * out.y);
    waypoints.push(p);
    from = p;
  }
  const last = waypoints[waypoints.length - 1];
  const across = (last.x - exit.x) * along.x + (last.y - exit.y) * along.y;
  trailLength += Math.max(0, (last.x - exit.x) * out.x + (last.y - exit.y) * out.y);
  const foot = { x: exit.x + along.x * across, y: exit.y + along.y * across };
  const lift = { x: out.x * height, y: out.y * height };
  return {
    waypoints,
    corners: [exit, { x: exit.x + lift.x, y: exit.y + lift.y }, { x: foot.x + lift.x, y: foot.y + lift.y }, foot],
    trailLength,
  };
}

/**
 * Cells gained per cell travelled: the loop's area times the share of it that isn't the
 * bot's already (rival land weighted by stealBias), over its trail plus the walk to the exit.
 */
function loopValue(state: SimState, slot: Slot, personality: Personality, loop: FittedLoop, inland: number): number {
  const [a, b, c, d] = loop.corners;
  let worth = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const u = (i + 0.5) / SAMPLES;
    for (let j = 0; j < SAMPLES; j++) {
      const v = (j + 0.5) / SAMPLES;
      // Bilinear point: u runs exit -> far, v runs out along the land.
      const x = (1 - u) * ((1 - v) * a.x + v * d.x) + u * ((1 - v) * b.x + v * c.x);
      const y = (1 - u) * ((1 - v) * a.y + v * d.y) + u * ((1 - v) * b.y + v * c.y);
      const cell = cellOf(state, x, y);
      if (cell < 0 || state.mask[cell] === 0 || state.owner[cell] === slot) continue;
      worth += state.owner[cell] === 0 ? 1 : personality.stealBias;
    }
  }
  const area = Math.abs((b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x)) + loop.trailLength * BAND_GAIN;
  return ((worth / (SAMPLES * SAMPLES)) * area) / (loop.trailLength + INLAND_COST * inland + LOOP_OVERHEAD);
}

/** How exposed the loop would be: rival heads near its middle, worse for rivals already out of their land. */
function loopRisk(slot: Slot, rivals: readonly Rival[], loop: FittedLoop): number {
  const [a, , c] = loop.corners;
  const mid = { x: ((a.x + c.x) / 2) * SUB, y: ((a.y + c.y) / 2) * SUB };
  const radius = (RISK_RADIUS + loop.trailLength / 2) * SUB;
  let risk = 0;
  for (const r of rivals) {
    if (r.slot === slot) continue;
    const d = Math.hypot(r.x - mid.x, r.y - mid.y);
    if (d < radius) risk += (1 - d / radius) * (r.trailPath.length > 0 ? 1.2 : 1);
  }
  return risk;
}

/** Frontier targets are drawn from this many cells beyond the nearest one, so a sliver the bot failed to reach isn't retried the same way. */
const FRONTIER_SPREAD = 8;

/**
 * A short poke out to playable ground the bot doesn't own: one of the cells nearest its
 * head, found in growing square rings. Null when there is none.
 */
function frontier(state: SimState, slot: Slot, head: Point, random: Random): Point[] | null {
  const { size, owner } = state;
  const hx = Math.floor(head.x);
  const hy = Math.floor(head.y);
  const found: Point[] = [];
  let limit = size;
  const consider = (x: number, y: number, r: number) => {
    if (!standable(state, x, y) || owner[y * size + x] === slot) return;
    if (found.length === 0) limit = Math.min(size, r + FRONTIER_SPREAD);
    found.push({ x: x + 0.5, y: y + 0.5 });
  };
  for (let r = 1; r < limit; r++) {
    for (let d = -r; d <= r; d++) {
      consider(hx + d, hy - r, r);
      consider(hx + d, hy + r, r);
      // The corners belong to the rows above.
      if (d === -r || d === r) continue;
      consider(hx - r, hy + d, r);
      consider(hx + r, hy + d, r);
    }
  }
  if (found.length === 0) return null;
  const target = random.pick(found);
  const len = dist(head, target);
  // A few cells past the target, so the trail band sweeps it fully.
  const beyond = { x: target.x + ((target.x - head.x) / len) * 4, y: target.y + ((target.y - head.y) / len) * 4 };
  return [reach(state, target, beyond)];
}

/**
 * True when a head can get onto cell (x, y): it and its eight neighbours are playable.
 * Edge slides keep heads about a cell inside the map's outline, so a cell on the outline
 * is only ever taken by the trail band laid from further in; aiming at one next to the
 * bot's own land would send it round and round its land for nothing.
 */
function standable(state: SimState, x: number, y: number): boolean {
  const { size, mask } = state;
  if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) if (mask[(y + dy) * size + x + dx] === 0) return false;
  }
  return true;
}
