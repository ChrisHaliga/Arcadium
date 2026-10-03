/**
 * Look-ahead: the bot's head rolled forward with the core's own movement (planHeadMove,
 * the code step() moves every player with: turning, edge slides and all) over the current
 * grids, so a bot sees exactly where a steering choice takes it before committing to it.
 *
 * The bot's own future trail is left out: over the horizons used, a path that turns
 * toward one heading and then runs straight (or along the edge) cannot curl back into
 * what it lays.
 */
import { planHeadMove, SUB, type Heading, type HeadMove, type SimState, type Slot } from '../core';
import type { Rival } from './rivals';

export type RolloutEnd =
  | 'home' // back on own land with a trail: the loop closes
  | 'death' // into own trail
  | 'headon' // into a rival's head
  | 'stuck' // wedged against the edge for good: facing the target and still no way on
  | 'open'; // none of the above within the horizon

export interface Rollout {
  end: RolloutEnd;
  /** Ticks until the end; the horizon for 'open'. */
  ticks: number;
}

/** The head being rolled forward: planHeadMove reads it and writes the next tick back into it. */
interface RolledHead extends HeadMove {
  readonly slot: Slot;
  targetHeading: Heading;
}

/** Rival heads are only predicted this far ahead: beyond it their straight-line guess is worthless. */
const HAZARD_TICKS = 10;
/** Clearance kept from rival heads beyond the head-on distance, in cells. */
const HEAD_MARGIN = 2;

/** One bot's view of the next few seconds, for one tick's decisions. */
export class Lookahead {
  private readonly size: number;
  private readonly trail: Uint8Array;
  private readonly trailTick: Uint16Array;
  private readonly grace: number;
  /** Nearby rival heads as x, y, vx, vy quadruples (subunits, per tick). */
  private readonly hazards: number[] = [];
  private readonly headReachSq: number;
  private readonly head: RolledHead;

  constructor(
    private readonly state: SimState,
    private readonly slot: Slot,
    rivals: readonly Rival[],
  ) {
    const { speed, headRadius } = state.config;
    ({ size: this.size, trail: this.trail, trailTick: this.trailTick } = state);
    this.grace = state.config.selfGraceTicks;
    const reach = (2 * headRadius + HEAD_MARGIN) * SUB;
    this.headReachSq = reach * reach;
    const me = state.players[slot]!;
    this.head = { slot, x: 0, y: 0, heading: 0, targetHeading: 0, moveHeading: 0, slideSide: 0, moved: false };
    // Two heads closing at full speed for HAZARD_TICKS, plus the reach itself.
    const near = 2 * HAZARD_TICKS * speed + reach;
    for (const r of rivals) {
      if (r.slot === slot || Math.abs(r.x - me.x) > near || Math.abs(r.y - me.y) > near) continue;
      this.hazards.push(r.x, r.y, r.vx, r.vy);
    }
  }

  /** Plays out steering toward `target` for up to `horizon` ticks. */
  run(target: Heading, horizon: number): Rollout {
    const { state, slot, size, head } = this;
    const { owner } = state;
    const me = state.players[slot]!;
    head.x = me.x;
    head.y = me.y;
    head.heading = me.heading;
    head.targetHeading = target;
    head.moveHeading = me.moveHeading;
    head.slideSide = me.slideSide;
    let out = me.trail.length > 0 || owner[Math.floor(me.y / SUB) * size + Math.floor(me.x / SUB)] !== slot;
    for (let k = 1; k <= horizon; k++) {
      planHeadMove(state, head, head);
      if (!head.moved) {
        // Blocked while still turning can open up next tick; facing the target, it never will.
        if (head.heading === target) return { end: 'stuck', ticks: k };
      } else {
        const gx = Math.floor(head.x / SUB);
        const gy = Math.floor(head.y / SUB);
        const cell = gy * size + gx;
        if (this.nearOwnTrail(gx, gy, state.tick + k)) return { end: 'death', ticks: k };
        if (owner[cell] === slot) {
          if (out) return { end: 'home', ticks: k };
        } else {
          out = true;
        }
      }
      if (k <= HAZARD_TICKS && this.nearHazard(head.x, head.y, k)) return { end: 'headon', ticks: k };
    }
    return { end: 'open', ticks: horizon };
  }

  /**
   * True when the head in cell (gx, gy) on `tick` would touch its own trail old enough to
   * kill. The four neighbouring cells count too: a cell of margin covers the core's
   * mid-move probe and keeps the bot from shaving past its trail.
   */
  private nearOwnTrail(gx: number, gy: number, tick: number): boolean {
    const { size } = this;
    const c = gy * size + gx;
    return (
      this.lethal(c, tick) ||
      (gx > 0 && this.lethal(c - 1, tick)) ||
      (gx < size - 1 && this.lethal(c + 1, tick)) ||
      (gy > 0 && this.lethal(c - size, tick)) ||
      (gy < size - 1 && this.lethal(c + size, tick))
    );
  }

  private lethal(cell: number, tick: number): boolean {
    return this.trail[cell] === this.slot && ((tick - this.trailTick[cell]) & 0xffff) > this.grace;
  }

  private nearHazard(x: number, y: number, k: number): boolean {
    const h = this.hazards;
    for (let i = 0; i < h.length; i += 4) {
      const dx = h[i] + h[i + 2] * k - x;
      const dy = h[i + 1] + h[i + 3] * k - y;
      if (dx * dx + dy * dy < this.headReachSq) return true;
    }
    return false;
  }
}
