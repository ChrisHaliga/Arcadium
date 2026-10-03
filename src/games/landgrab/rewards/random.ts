/** Randomness for rewards: injected so payouts can be tested with a seeded generator. */

/** A uniform number in [0, 1). The game passes Math.random. */
export type Rng = () => number;

/** [value, weight] pairs, e.g. REWARDS.featMultipliers. */
export type WeightTable = readonly (readonly [value: number, weight: number])[];

/** Picks a value with probability proportional to its weight. */
export function weightedPick(table: WeightTable, rng: Rng): number {
  if (table.length === 0) throw new Error('weightedPick needs at least one entry');
  let total = 0;
  for (const [, weight] of table) total += weight;
  let roll = rng() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll < 0) return value;
  }
  // Only reachable when rng() returns 1 or rounding leaves a sliver past the last weight.
  return table[table.length - 1][0];
}

/** Every value a table can produce, in table order (for roll animations). */
export function tableValues(table: WeightTable): number[] {
  return table.map(([value]) => value);
}
