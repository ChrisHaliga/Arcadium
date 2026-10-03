/**
 * A bot's brain. Every tick it settles on one target heading: along its planned loop,
 * home once the loop is done or a rival could cut it off, or after an exposed trail it
 * can reach before the owner gets home. Every choice goes through the look-ahead, so it
 * never steers into its own trail or a rival's head; edges are simply slid along.
 */
import { cellAt, headingDelta, headingTo, SUB, type Heading, type Player, type SimState, type Slot } from '../core';
import { Lookahead } from './lookahead';
import type { Personality } from './personality';
import { planLoop, type Point } from './planner';
import type { Random } from './random';
import { homeTicks, nearestOnPath, ticksToReach, type Rival } from './rivals';
import { routeHome, staysSafe, steerSafely, type Route } from './steering';

export interface Brain {
  readonly personality: Personality;
  /** Target heading for this tick; null while the bot is dead. */
  think(state: SimState, rivals: readonly Rival[]): Heading | null;
  /** Forgets plans and chases: called at the start of every life. */
  reset(): void;
}

export function createBrain(slot: Slot, personality: Personality, random: Random): Brain {
  return new Bot(slot, personality, random);
}

/** The heavier judgements (way home, danger, prey) run every few ticks, staggered by slot. */
const JUDGE_EVERY = 4;
/** Ticks the safety look-ahead covers (~17 cells). */
const SAFE_HORIZON = 16;
/** Longest way home searched for, in ticks. */
const ROUTE_HORIZON = 160;
/** A waypoint counts as reached this close, in cells: turning a little early rounds the corners. */
const WAYPOINT_REACH = 5;
/** Target changes up to this (heading units, ~3 degrees) aren't worth a command. */
const HYSTERESIS = 8;
/** The newest points of a rival's trail (about a cell each) are never aimed at: their head is right there. */
const PREY_HEAD_CLEARANCE = 10;
/** A chase is abandoned once the owner would get home this many ticks before the bot arrives. */
const CHASE_GIVE_UP = 4;
/** A rival heading away from the trail is given this long to notice it before counting as a threat. */
const RIVAL_REACTION = 8;
/** A heading chosen to get round something is kept this many ticks while it stays safe, so the bot doesn't dither. */
const COMMIT_TICKS = 6;
/** Ticks without moving (wedged in a corner of the map edge) before the bot backs out and rethinks. */
const STALL_TICKS = 3;

class Bot implements Brain {
  private waypoints: Point[] = [];
  private leg = 0;
  private legFrom: Point = { x: 0, y: 0 };
  /** Tick the bot left its land; -1 while home. */
  private outSince = -1;
  private returning = false;
  /** This outing ignores rivals: the occasional blunder. */
  private careless = false;
  private route: Route | null = null;
  /** Slot whose trail is being chased, 0 for none, and the ticks needed to reach it. */
  private prey: Slot = 0;
  private preyTicks = 0;
  /** Side of the last deflection, tried first next time so the bot doesn't dither. */
  private side: -1 | 1 = 1;
  /** A detour heading being held, and the tick it lapses. */
  private detour: Heading = 0;
  private detourUntil = -1;
  /** Where the head was last tick, and for how many ticks it hasn't moved. */
  private lastX = -1;
  private lastY = -1;
  private stalled = 0;

  constructor(
    private readonly slot: Slot,
    readonly personality: Personality,
    private readonly random: Random,
  ) {}

  reset(): void {
    this.endOuting();
    this.detourUntil = -1;
    this.stalled = 0;
  }

  think(state: SimState, rivals: readonly Rival[]): Heading | null {
    const me = state.players[this.slot];
    if (!me?.alive) return null;
    const out = me.trail.length > 0 || state.owner[cellAt(state.size, me.x, me.y)] !== this.slot;
    if (out && this.outSince < 0) this.startOuting(state.tick);
    else if (!out && this.outSince >= 0) this.endOuting();
    const look = new Lookahead(state, this.slot, rivals);
    const judge = (state.tick + this.slot) % JUDGE_EVERY === 0;
    if (judge && this.prey === 0 && !this.returning) this.choosePrey(state, rivals);
    if (out) this.watch(state, rivals, look, judge);
    if (this.isStalled(me)) this.backOut(state, me, out);
    const wanted = this.wanted(state, rivals, look, me, out);
    if (state.tick < this.detourUntil && staysSafe(look, this.detour, SAFE_HORIZON)) return this.detour;
    const choice = steerSafely(look, wanted, this.side, SAFE_HORIZON);
    if (!choice.exact) {
      if (choice.side !== 0) this.side = choice.side;
      this.detour = choice.heading;
      this.detourUntil = state.tick + COMMIT_TICKS;
    }
    if (choice.exact && Math.abs(headingDelta(me.targetHeading, choice.heading)) <= HYSTERESIS) return me.targetHeading;
    return choice.heading;
  }

  private isStalled(me: Player): boolean {
    this.stalled = me.x === this.lastX && me.y === this.lastY ? this.stalled + 1 : 0;
    this.lastX = me.x;
    this.lastY = me.y;
    return this.stalled >= STALL_TICKS;
  }

  /**
   * Wedged where the map edge leaves no way on (the core stops a player there until they
   * steer): head for the middle of the map for a while, and at home pick a new plan.
   */
  private backOut(state: SimState, me: Player, out: boolean): void {
    const centre = (state.size * SUB) / 2;
    this.detour = headingTo(centre - me.x, centre - me.y);
    this.detourUntil = state.tick + 2 * COMMIT_TICKS;
    this.stalled = 0;
    if (!out) {
      this.waypoints = [];
      this.leg = 0;
    }
  }

  private startOuting(tick: number): void {
    this.outSince = tick;
    this.careless = this.random.chance(this.personality.blunder);
    this.route = null;
  }

  /** Home again: the loop closed (or the bot wandered back), so the plan is spent. */
  private endOuting(): void {
    this.outSince = -1;
    this.returning = false;
    this.route = null;
    this.prey = 0;
    this.waypoints = [];
    this.leg = 0;
  }

  /** While out: keep the way home fresh, and give up the loop when a rival could cut it off or it has run too long. */
  private watch(state: SimState, rivals: readonly Rival[], look: Lookahead, judge: boolean): void {
    if (judge) {
      this.route = routeHome(look, this.routeHint(state), ROUTE_HORIZON);
      if (!this.careless && this.inDanger(state, rivals)) {
        this.returning = true;
        this.prey = 0;
      }
    }
    if (state.tick - this.outSince > this.personality.maxOutTicks) this.returning = true;
  }

  /**
   * A rival could reach the trail too soon compared with how long the bot needs to get
   * home. Racing the rival it is chasing is fine while the bot would cut them first.
   */
  private inDanger(state: SimState, rivals: readonly Rival[]): boolean {
    const me = state.players[this.slot]!;
    const path = me.trailPath;
    if (path.length < 2) return false;
    const { config } = state;
    const myTicks = this.route?.ticks ?? ROUTE_HORIZON;
    const limit = this.personality.fear * myTicks + this.personality.fearSlack;
    const touch = config.trailRadius + 0.5;
    for (const r of rivals) {
      if (r.slot === this.slot) continue;
      const i = nearestOnPath(path, r.x, r.y, 2);
      const ticks = ticksToReach(config, r.x, r.y, r.moveHeading, path[i], path[i + 1], touch, RIVAL_REACTION);
      if (ticks >= limit) continue;
      if (r.slot === this.prey && this.preyTicks < ticks) continue;
      return true;
    }
    return false;
  }

  private wanted(state: SimState, rivals: readonly Rival[], look: Lookahead, me: Player, out: boolean): Heading {
    if (this.prey !== 0) {
      const aim = this.aimAtPrey(state, rivals);
      if (aim) return headingTo(aim.x - me.x, aim.y - me.y);
      this.prey = 0;
      if (out) this.returning = true;
    }
    const head = { x: me.x / SUB, y: me.y / SUB };
    if (out && !this.returning) {
      this.advance(state, head, out);
      if (this.leg >= this.waypoints.length) this.returning = true;
    }
    if (out && this.returning) return this.homeHeading(state, look, me);
    if (!out) {
      this.advance(state, head, out);
      if (this.leg >= this.waypoints.length) this.plan(state, rivals, head);
    }
    const target = this.waypoints[this.leg];
    return target ? headingTo(target.x - head.x, target.y - head.y) : me.targetHeading;
  }

  private plan(state: SimState, rivals: readonly Rival[], head: Point): void {
    this.waypoints = planLoop(state, this.slot, this.personality, this.random, rivals) ?? [];
    this.leg = 0;
    this.legFrom = head;
  }

  /**
   * Moves past every waypoint that is close or already behind the bot along its leg, and,
   * once out, past those on its own land (the way to the edge, when it left early).
   */
  private advance(state: SimState, head: Point, out: boolean): void {
    while (this.leg < this.waypoints.length) {
      const target = this.waypoints[this.leg];
      const toTarget = { x: target.x - head.x, y: target.y - head.y };
      const passed = toTarget.x * (target.x - this.legFrom.x) + toTarget.y * (target.y - this.legFrom.y) <= 0;
      const behind = out && state.owner[cellAt(state.size, target.x * SUB, target.y * SUB)] === this.slot;
      if (!passed && !behind && Math.hypot(toTarget.x, toTarget.y) > WAYPOINT_REACH) return;
      this.legFrom = target;
      this.leg++;
    }
  }

  private homeHeading(state: SimState, look: Lookahead, me: Player): Heading {
    this.route ??= routeHome(look, this.routeHint(state), ROUTE_HORIZON);
    if (this.route) return this.route.heading;
    // Further than the look-ahead reaches: make for where the trail left the land.
    return me.trailPath.length >= 2 ? headingTo(me.trailPath[0] - me.x, me.trailPath[1] - me.y) : me.targetHeading;
  }

  /** The previous way home if any (ties keep it), else straight back to where the trail began. */
  private routeHint(state: SimState): Heading {
    const me = state.players[this.slot]!;
    if (this.route) return this.route.heading;
    if (me.trailPath.length < 2) return me.heading;
    return headingTo(me.trailPath[0] - me.x, me.trailPath[1] - me.y);
  }

  /**
   * Picks the exposed trail the bot can reach with the biggest lead over its owner's
   * way home, within the personality's range.
   */
  private choosePrey(state: SimState, rivals: readonly Rival[]): void {
    const { huntRange, huntLead } = this.personality;
    let best: Slot = 0;
    let bestLead = huntLead;
    for (const r of rivals) {
      if (r.slot === this.slot) continue;
      const chase = this.chase(state, r, huntRange);
      if (chase && chase.lead >= bestLead) {
        best = r.slot;
        bestLead = chase.lead;
      }
    }
    if (best === 0) return;
    this.prey = best;
    this.waypoints = [];
    this.leg = 0;
  }

  /** Where the current prey's trail is best hit (subunits), or null once the chase is lost. */
  private aimAtPrey(state: SimState, rivals: readonly Rival[]): { x: number; y: number } | null {
    const r = rivals.find((rival) => rival.slot === this.prey);
    const chase = r && this.chase(state, r, Infinity);
    if (!chase || chase.lead < -CHASE_GIVE_UP) return null;
    this.preyTicks = chase.ticks;
    return chase.aim;
  }

  /**
   * The nearest point of the rival's trail away from their head, how soon the bot gets
   * there, and its lead over the rival's way home. Null when there's nothing to chase
   * within `range` cells.
   */
  private chase(state: SimState, r: Rival, range: number): { aim: { x: number; y: number }; ticks: number; lead: number } | null {
    const path = r.trailPath;
    const end = path.length - 2 * PREY_HEAD_CLEARANCE;
    if (end <= 0) return null;
    const me = state.players[this.slot]!;
    const i = nearestOnPath(path, me.x, me.y, 1, 0, end);
    const aim = { x: path[i], y: path[i + 1] };
    if (Math.hypot(aim.x - me.x, aim.y - me.y) > range * SUB) return null;
    const { config } = state;
    const ticks = ticksToReach(config, me.x, me.y, me.heading, aim.x, aim.y, config.trailRadius + 0.5);
    return { aim, ticks, lead: homeTicks(state, r) - ticks };
  }
}
