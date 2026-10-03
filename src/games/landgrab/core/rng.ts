/**
 * The simulation's only source of randomness: mulberry32 over state.rng, so every
 * client draws the same numbers in the same order.
 */

/** Spreads an arbitrary seed into a well-mixed uint32 starting state (murmur3 finaliser). */
export function seedRng(seed: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Next uint32 from the generator, advancing holder.rng. */
export function nextU32(holder: { rng: number }): number {
  const a = (holder.rng + 0x6d2b79f5) >>> 0;
  holder.rng = a;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

/** Uniform-enough integer in [0, n). The modulo bias is negligible for the small n used here. */
export function randInt(holder: { rng: number }, n: number): number {
  return nextU32(holder) % n;
}
