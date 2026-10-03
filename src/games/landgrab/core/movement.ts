/**
 * Steering and move planning (tick order step 5) and the move itself (step 7). Plans are
 * made for every living player against the pre-move state before anyone moves.
 *
 * planHeadMove() is the one place the turning and edge-sliding rules live. step() plans
 * every player with it, and bots (rolling a head forward) and the renderer (guessing the
 * coming tick) call it too, so they all see exactly the moves the simulation makes.
 */
import type { TickContext } from './context';
import { depthPastStandoff, edgeAt, outwardNormal, STANDOFF_FIELD, type Edge } from './edge';
import { cellAt, isPlayableAt } from './grid';
import { bandRadius, forEachCellInDisc, PROBE_SPACING, stampBand } from './trail';
import { cosine, headingDelta, headingTo, normalizeHeading, sine, TRIG_ONE } from './trig';
import { ANGLES, SUB, type Heading, type Player, type SimState, type Slot } from './types';

const QUARTER = ANGLES / 4;
/**
 * The edge's normal wavers a little over the outline's stair steps, so a heading or target
 * within this of it counts as pointing straight out: a slide keeps its side there.
 */
const DEAD_ON = ANGLES / 128;
/**
 * When the way along the edge is blocked (a bump in it, or the outline's last stair step),
 * the slide turns further away from the edge in these steps...
 */
const ESCAPE_STEP = ANGLES / 128;
/** ...up to this much: enough to clear a step, too little to turn a sharp corner, where the player stops instead. */
const MAX_ESCAPE = ANGLES / 16;
/**
 * A slide changes sides only when the player steers the heading this far past the edge's
 * normal. Where the edge bends round past a fixed heading (into a corner, over the top of a
 * bulge) the player stops instead of running straight back over their own trail.
 */
const SIDE_SWITCH_MARGIN = ANGLES / 32;
/** Move heading of a plan that finds every way forward blocked. */
const BLOCKED = -1;

/** What one tick of movement reads from a head. A Player is one. */
export type HeadState = Readonly<Pick<Player, 'slot' | 'x' | 'y' | 'heading' | 'targetHeading' | 'moveHeading' | 'slideSide'>>;

/** Where one tick of movement leaves a head: its new facing, position and slide. */
export interface HeadMove extends Pick<Player, 'x' | 'y' | 'heading' | 'moveHeading' | 'slideSide'> {
  /** False when every way forward is blocked: the head stays put, keeping its moveHeading and slideSide. */
  moved: boolean;
}

export interface MovePlan extends HeadMove {
  /**
   * Points along the move (x, y pairs) where collisions are checked and trail is stamped,
   * evenly spaced and ending at the new head centre. Empty when staying put.
   */
  probes: number[];
}

/** Index = slot; null for empty slots and dead players. */
export function planMoves(state: SimState): (MovePlan | null)[] {
  return state.players.map((p) => (p && p.alive ? planMove(state, p) : null));
}

function planMove(state: SimState, p: Player): MovePlan {
  const plan: MovePlan = { x: 0, y: 0, heading: 0, moveHeading: 0, slideSide: 0, moved: false, probes: [] };
  planHeadMove(state, p, plan);
  if (plan.moved) plan.probes = probesAlong(state, p.x, p.y, plan.x, plan.y);
  return plan;
}

/** Scratch for the edge field at the head and at the end of a straight move. */
const HERE: Edge = { field: 0, gx: 0, gy: 0 };
const AHEAD: Edge = { field: 0, gx: 0, gy: 0 };

/**
 * One tick of movement for `head` on the state's map and trails, exactly as step() moves a
 * living player: turn toward the target, then step straight along the heading, or slide
 * along the map edge. Writes the result into `out` and returns it. `out` may be `head`
 * itself, which rolls a head forward tick by tick. Changes nothing else and allocates
 * nothing, so look-ahead loops can call it freely.
 */
export function planHeadMove<T extends HeadMove>(state: SimState, head: HeadState, out: T): T {
  const here = edgeAt(state, head.x, head.y, HERE);
  const normal = outwardNormal(here);
  const heading = turn(state, head, normal);
  let move: Heading = BLOCKED;
  let side: -1 | 0 | 1 = 0;
  // Still pressed against the edge or running along it, a slide carries on: stepping
  // straight whenever the heading happens to fit would jog the head in and out along it.
  const sliding = normal !== null && head.slideSide !== 0 && Math.abs(headingDelta(normal, heading)) <= QUARTER + DEAD_ON;
  if (!sliding && straightFits(state, head.x, head.y, heading, here.field)) {
    move = heading;
  } else if (normal !== null) {
    side = slideSideFor(state, head, heading, normal);
    if (side !== 0) move = slideHeading(state, head.x, head.y, here, normal, side);
  }
  // `out` may be `head`: from here on, each field of `head` is read before it is overwritten.
  if (move === BLOCKED) {
    out.x = head.x;
    out.y = head.y;
    out.moveHeading = head.moveHeading;
    out.slideSide = head.slideSide;
    out.moved = false;
  } else {
    const { speed } = state.config;
    out.x = head.x + stepX(move, speed);
    out.y = head.y + stepY(move, speed);
    out.moveHeading = move;
    out.slideSide = side;
    out.moved = true;
  }
  out.heading = heading;
  return out;
}

/**
 * Turns the heading toward the target by at most turnRate, the shortest way round, unless
 * that way would sweep it back across the edge's `normal` while the player slides along
 * the edge, or turns away from it after a slide: that would send them straight back along
 * the edge, over the trail just laid. The heading turns the way that leads off the edge
 * instead, a U-turn like one in open space. Heading into the edge without sliding yet, or in
 * a corner the edge has bent round past the heading, the shortest way stands.
 */
function turn(state: SimState, head: HeadState, normal: Heading | null): Heading {
  const rate = state.config.turnRate;
  let delta = headingDelta(head.heading, head.targetHeading);
  if (normal !== null) {
    const lean = headingDelta(normal, head.heading);
    // A slide ends once the heading points this far away from the edge (see planHeadMove),
    // so from there on the side the heading is on carries the U-turn through.
    const side = head.slideSide !== 0 ? head.slideSide : Math.abs(lean) > QUARTER + DEAD_ON ? Math.sign(lean) : 0;
    if (
      side !== 0 &&
      side * headingDelta(normal, head.targetHeading) < -DEAD_ON &&
      side * lean > -SIDE_SWITCH_MARGIN
    ) {
      delta = side * ((side * (head.targetHeading - head.heading)) & (ANGLES - 1));
    }
  }
  return normalizeHeading(head.heading + Math.max(-rate, Math.min(rate, delta)));
}

/**
 * True when the move straight along `heading` from (x, y) ends on playable ground without
 * bringing the head closer to the edge than slides run (`field` is the edge field at (x, y)).
 */
function straightFits(state: SimState, x: number, y: number, heading: Heading, field: number): boolean {
  const { speed } = state.config;
  const endX = x + stepX(heading, speed);
  const endY = y + stepY(heading, speed);
  if (!isPlayableAt(state, endX, endY)) return false;
  const ahead = edgeAt(state, endX, endY, AHEAD).field;
  return ahead <= STANDOFF_FIELD || ahead <= field;
}

/**
 * The heading is blocked by the edge: the move heading along it instead, on `side`, leaning
 * in or out to keep at the standoff and turning a little further off the edge where a step
 * in it blocks the way. BLOCKED when even that ends on void (a sharp corner). The facing
 * itself stays put, so the player follows the edge until they steer away or it curves away.
 */
function slideHeading(state: SimState, x: number, y: number, here: Edge, normal: Heading, side: -1 | 1): Heading {
  const { speed } = state.config;
  const along = alongEdge(state, here, normal, side);
  for (let escape = 0; escape <= MAX_ESCAPE; escape += ESCAPE_STEP) {
    const move = normalizeHeading(along + side * escape);
    if (isPlayableAt(state, x + stepX(move, speed), y + stepY(move, speed))) return move;
  }
  return BLOCKED;
}

/**
 * Which way to slide: toward the side of the normal the heading leans to (dead on, the
 * side whose way doesn't hold your own trail, then the side closer to the map centre). A
 * slide keeps its side while the heading points within DEAD_ON of straight out; once the
 * edge has bent round past the heading it stops rather than reverse (see
 * SIDE_SWITCH_MARGIN). 0 = stay put.
 */
function slideSideFor(state: SimState, head: HeadState, heading: Heading, normal: Heading): -1 | 0 | 1 {
  const lean = headingDelta(normal, heading);
  const side = head.slideSide;
  if (side === 0) return lean > 0 ? 1 : lean < 0 ? -1 : preferredSide(state, head, normal);
  if (side * lean >= -DEAD_ON) return side;
  const other = side === 1 ? -1 : 1;
  const steeredOver = Math.sign(headingDelta(head.heading, heading)) === other;
  return steeredOver && side * lean <= -SIDE_SWITCH_MARGIN ? other : 0;
}

function preferredSide(state: SimState, head: HeadState, normal: Heading): -1 | 1 {
  const { size, trail } = state;
  const { speed } = state.config;
  const cw = normalizeHeading(normal + QUARTER);
  const ccw = normalizeHeading(normal - QUARTER);
  const cwX = head.x + stepX(cw, speed);
  const cwY = head.y + stepY(cw, speed);
  const ccwX = head.x + stepX(ccw, speed);
  const ccwY = head.y + stepY(ccw, speed);
  const cwTrail = trail[cellAt(size, cwX, cwY)] === head.slot;
  const ccwTrail = trail[cellAt(size, ccwX, ccwY)] === head.slot;
  if (cwTrail !== ccwTrail) return cwTrail ? -1 : 1;
  return distanceToCentreSq(state, ccwX, ccwY) < distanceToCentreSq(state, cwX, cwY) ? -1 : 1;
}

function distanceToCentreSq(state: SimState, x: number, y: number): number {
  const centre = (state.size * SUB) / 2;
  const dx = x - centre;
  const dy = y - centre;
  return dx * dx + dy * dy;
}

/**
 * The edge's tangent on `side`, tilted toward the edge when the head is short of the
 * standoff and away when past it, by as much as closes the gap in one move (at most half a
 * move across, about 27 degrees).
 */
function alongEdge(state: SimState, here: Edge, normal: Heading, side: -1 | 1): Heading {
  const { speed } = state.config;
  const tangent = normalizeHeading(normal + side * QUARTER);
  const depth = Math.max(-speed / 2, Math.min(speed / 2, depthPastStandoff(here)));
  const dx = sine(tangent) * speed - sine(normal) * depth;
  const dy = cosine(normal) * depth - cosine(tangent) * speed;
  return headingTo(Math.trunc(dx), Math.trunc(dy));
}

/** How far one tick along `heading` moves a head across, in subunits. */
function stepX(heading: Heading, speed: number): number {
  return Math.trunc((sine(heading) * speed) / TRIG_ONE);
}

/** How far one tick along `heading` moves a head down, in subunits. */
function stepY(heading: Heading, speed: number): number {
  return Math.trunc((-cosine(heading) * speed) / TRIG_ONE);
}

/**
 * The probe points of a move from (x, y) to (endX, endY), splitting it into equal parts no
 * longer than PROBE_SPACING (two at the default speed: the midpoint and the end). Only the
 * end is checked for void: a midpoint may clip a void corner of the outline's stair steps,
 * which the smooth outline the map is drawn with cuts off anyway.
 */
function probesAlong(state: SimState, x: number, y: number, endX: number, endY: number): number[] {
  const dx = endX - x;
  const dy = endY - y;
  const parts = Math.max(1, Math.ceil(state.config.speed / PROBE_SPACING));
  const probes: number[] = [];
  for (let k = 1; k <= parts; k++) probes.push(x + Math.trunc((dx * k) / parts), y + Math.trunc((dy * k) / parts));
  return probes;
}

/**
 * Moves every planned player who survived collision resolution. Outside their land they
 * lay trail at each probe point and extend trailPath, which starts at the point they left
 * from so the drawn trail meets their land.
 */
export function moveSurvivors(state: SimState, plans: readonly (MovePlan | null)[], ctx: TickContext): void {
  for (let slot = 1; slot < plans.length; slot++) {
    const plan = plans[slot];
    if (!plan || ctx.dying[slot]) continue;
    const p = state.players[slot]!;
    p.heading = plan.heading;
    p.slideSide = plan.slideSide;
    if (!plan.moved) {
      refreshBandUnderHead(state, ctx, slot);
      continue;
    }
    for (let i = 0; i < plan.probes.length; i += 2) stampBand(state, ctx, slot, plan.probes[i], plan.probes[i + 1]);
    const fromX = p.x;
    const fromY = p.y;
    p.x = plan.x;
    p.y = plan.y;
    p.moveHeading = plan.moveHeading;
    updateTrailPath(state, p, slot, fromX, fromY);
  }
}

/**
 * A player who stays put outside their land keeps the band under their head fresh, as
 * if stamping it again: otherwise it would age past selfGraceTicks while they wait, and
 * their first move would run them into their own trail.
 */
function refreshBandUnderHead(state: SimState, ctx: TickContext, slot: Slot): void {
  const p = state.players[slot]!;
  const { trail, trailTick } = state;
  const tick = ctx.t & 0xffff;
  forEachCellInDisc(state.size, p.x, p.y, bandRadius(state), (c) => {
    if (trail[c] === slot) trailTick[c] = tick;
  });
}

function updateTrailPath(state: SimState, p: Player, slot: Slot, fromX: number, fromY: number): void {
  if (state.owner[cellAt(state.size, p.x, p.y)] !== slot) {
    if (p.trailPath.length === 0) p.trailPath.push(fromX, fromY);
    p.trailPath.push(p.x, p.y);
  } else if (p.trail.length === 0 && p.trailPath.length > 0) {
    // Dipped out and back without laying any trail (every cell was taken): nothing to close.
    p.trailPath = [];
  }
  // Home with a trail: this tick's capture clears both.
}
