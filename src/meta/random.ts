/**
 * Randomness helpers. Seeded draws (mission picks, shop rotation) must come out the
 * same every time the app starts on the same day, so they hash a key into a small
 * PRNG instead of using the injected random source.
 */

/** FNV-1a: a stable 32-bit hash for turning day/week keys into seeds. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: returns floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates on a copy. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pickOne<T>(items: readonly T[], random: () => number): T | undefined {
  return items.length === 0 ? undefined : items[Math.floor(random() * items.length)];
}

/** Picks a key with probability proportional to its weight; zero weights are never picked. */
export function pickWeighted<K extends string>(weights: Readonly<Record<K, number>>, random: () => number): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  let roll = random() * total;
  for (const [key, weight] of entries) {
    if (weight <= 0) continue;
    roll -= weight;
    if (roll < 0) return key;
  }
  // Floating-point leftovers land on the last key that can be picked.
  const last = entries.filter(([, w]) => w > 0).pop();
  if (!last) throw new Error('pickWeighted: no positive weights');
  return last[0];
}

/** Random v4 UUID. Falls back to getRandomValues where randomUUID is missing (insecure http origins, old WebViews). */
export function newPlayerId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
