/**
 * Seeded randomness for the match authority (bot names, personalities, decisions, map
 * seeds). It runs the simulation's generator on a state of its own: bots run only on the
 * authority, so their dice must never touch state.rng, which every client advances in
 * lockstep.
 */
import { nextU32, seedRng } from '../core';

/** The room seeds its simulation with the same number, so the seed is salted to start a different stream. */
const STREAM_SALT = 0xbb728d28;

export class Random {
  private readonly generator: { rng: number };

  constructor(seed: number) {
    this.generator = { rng: seedRng(seed ^ STREAM_SALT) };
  }

  u32(): number {
    return nextU32(this.generator);
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.u32() / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.float() * n);
  }

  /** Uniform in [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.float();
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  /** An independent generator seeded from this one, so one consumer's draws never shift another's. */
  fork(): Random {
    return new Random(this.u32());
  }
}
