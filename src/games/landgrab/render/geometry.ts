/** Float helpers for angles and easing. Rendering needs no determinism, so these use plain floats. */
import { ANGLES } from '../core/types';

export const TAU = Math.PI * 2;

/** Canvas rotation (clockwise radians) that turns an up-facing shape to face heading h. */
export function headingRadians(h: number): number {
  return (h / ANGLES) * TAU;
}

/** Signed smallest rotation from a to b, in radians, in (-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  else if (d <= -Math.PI) d += TAU;
  return d;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeOutBack(t: number): number {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}
