/**
 * Scripted drivers for the art scenes: each player follows a list of legs (steer for a
 * point, circle a point), sending the same steer commands a player would. The sim does
 * the turning, so every path has the real turning circle and trails curve like in a match.
 */
import { ANGLES, headingDelta, headingTo, SUB, type Command, type SimState, type Slot } from '../core';

/** A circle a head glides round: centre x, centre y and radius, in cells. */
export type Circle = readonly [number, number, number];

export type Leg =
  /** Steer for the point (cells) until within ARRIVE_CELLS of it. */
  | { kind: 'to'; x: number; y: number }
  /** Go clockwise round the circle until `until` says so (never, without one). */
  | { kind: 'orbit'; circle: Circle; until?: Until };

/** When an orbit ends, given the state and how many ticks the orbit has run. */
export type Until = (state: SimState, ticks: number) => boolean;

export const to = (x: number, y: number): Leg => ({ kind: 'to', x, y });
export const orbit = (circle: Circle, until?: Until): Leg => ({ kind: 'orbit', circle, until });

/** Circle home until `leave`, fly `legs` (ending back home), then circle home again. */
export function sortie(slot: Slot, home: Circle, leave: Until, legs: readonly Leg[]): Pilot {
  return new Pilot(slot, [orbit(home, leave), ...legs, orbit(home)]);
}

/**
 * True while the slot's head travels within 25 degrees of `deg` (0 = up, clockwise). An
 * orbit passes every heading once a lap, so `orbit(..., travelling(slot, deg))` leaves
 * home from the same spot every time.
 */
export function travelling(slot: Slot, deg: number): Until {
  const want = Math.round((deg / 360) * ANGLES) % ANGLES;
  const window = Math.round((25 / 360) * ANGLES);
  return (state) => {
    const p = state.players[slot];
    return p !== null && Math.abs(headingDelta(p.moveHeading, want)) <= window;
  };
}

const ARRIVE_CELLS = 2.5;
/** How far ahead along the circle an orbit aims (radians): enough to pull a stray head back onto it. */
const ORBIT_LEAD = 0.9;

export class Pilot {
  private leg = 0;
  private legTicks = 0;

  constructor(
    readonly slot: Slot,
    private readonly legs: readonly Leg[],
  ) {}

  /** Back to the first leg (the scene restarted). */
  reset(): void {
    this.leg = 0;
    this.legTicks = 0;
  }

  /** This tick's steer, or null once the legs are done (the player keeps its heading). */
  command(state: SimState): Command | null {
    const p = state.players[this.slot];
    if (!p?.alive) return null;
    const x = p.x / SUB;
    const y = p.y / SUB;
    for (;;) {
      const leg = this.legs[this.leg];
      if (!leg) return null;
      if (leg.kind === 'to' && Math.hypot(leg.x - x, leg.y - y) > ARRIVE_CELLS) return this.steer(leg.x - x, leg.y - y);
      if (leg.kind === 'orbit' && !leg.until?.(state, this.legTicks)) {
        this.legTicks++;
        const [cx, cy, r] = leg.circle;
        const a = Math.atan2(y - cy, x - cx) + ORBIT_LEAD;
        return this.steer(cx + Math.cos(a) * r - x, cy + Math.sin(a) * r - y);
      }
      this.leg++;
      this.legTicks = 0;
    }
  }

  private steer(dx: number, dy: number): Command {
    return { t: 'steer', slot: this.slot, heading: headingTo(Math.round(dx * SUB), Math.round(dy * SUB)) };
  }
}
