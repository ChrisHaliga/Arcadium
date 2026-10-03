/**
 * Turning wishes into safe headings: the nearest heading to where the bot wants to go
 * that doesn't run it into its own trail or a rival's head, and the quickest safe way
 * back onto its land.
 */
import { ANGLES, normalizeHeading, type Heading } from '../core';
import type { Lookahead, Rollout } from './lookahead';

/** Deflections tried away from the wanted heading, nearest first (each on both sides). */
const DEFLECTIONS = [32, 64, 96, 128, 192, 256, 320, 384, 448];

export interface Choice {
  heading: Heading;
  /** True when the wanted heading itself was safe. */
  exact: boolean;
  /** -1 or 1 when deflected: the side taken, so the next tick tries it first and the bot doesn't dither. */
  side: -1 | 0 | 1;
}

function isSafe(r: Rollout): boolean {
  return r.end === 'open' || r.end === 'home';
}

/** True when steering toward `heading` stays safe for `horizon` ticks. */
export function staysSafe(look: Lookahead, heading: Heading, horizon: number): boolean {
  return isSafe(look.run(heading, horizon));
}

/**
 * The heading nearest `wanted` whose look-ahead stays safe for `horizon` ticks.
 * Deflections try `firstSide` first. With no safe heading at all, the one that keeps the
 * bot alive longest.
 */
export function steerSafely(look: Lookahead, wanted: Heading, firstSide: -1 | 1, horizon: number): Choice {
  const straight = look.run(wanted, horizon);
  if (isSafe(straight)) return { heading: wanted, exact: true, side: 0 };
  let fallback: Choice = { heading: wanted, exact: true, side: 0 };
  let fallbackTicks = straight.ticks;
  for (const deflection of DEFLECTIONS) {
    for (const side of [firstSide, -firstSide as -1 | 1]) {
      const heading = normalizeHeading(wanted + side * deflection);
      const r = look.run(heading, horizon);
      if (isSafe(r)) return { heading, exact: false, side };
      if (r.ticks > fallbackTicks) {
        fallback = { heading, exact: false, side };
        fallbackTicks = r.ticks;
      }
    }
  }
  const reverse = normalizeHeading(wanted + ANGLES / 2);
  const r = look.run(reverse, horizon);
  if (isSafe(r) || r.ticks > fallbackTicks) return { heading: reverse, exact: false, side: firstSide };
  return fallback;
}

export interface Route {
  heading: Heading;
  /** Ticks until the loop closes along it. */
  ticks: number;
}

/** The way home is searched coarsely first (every 1/16 of a turn), then refined either side of the best. */
const ROUTE_COARSE = ANGLES / 16;
const ROUTE_FINE = ANGLES / 32;

/**
 * The quickest way back onto the bot's land without touching its own trail. Headings are
 * tried from `hint` outward (so ties keep the previous choice), each try stopping as soon
 * as it can no longer beat the best so far; then the neighbours of the winner. Null when
 * nothing gets home within `horizon` ticks.
 */
export function routeHome(look: Lookahead, hint: Heading, horizon: number): Route | null {
  const attempt = (heading: Heading, best: Route | null): Route | null => {
    const r = look.run(heading, best ? best.ticks - 1 : horizon);
    return r.end === 'home' ? { heading, ticks: r.ticks } : best;
  };
  let best: Route | null = null;
  for (let i = 0; i < ANGLES / ROUTE_COARSE; i++) {
    best = attempt(normalizeHeading(hint + ((i + 1) >> 1) * ROUTE_COARSE * (i % 2 === 1 ? 1 : -1)), best);
  }
  if (!best) return null;
  const centre = best.heading;
  best = attempt(normalizeHeading(centre - ROUTE_FINE), best);
  return attempt(normalizeHeading(centre + ROUTE_FINE), best);
}
