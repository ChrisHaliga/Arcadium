/**
 * Integer trigonometry. Headings are integers in [0, ANGLES): 0 = up, clockwise. Sine
 * and cosine come from a literal table instead of Math.sin, whose last bits differ
 * between JS engines, so every client moves players by exactly the same amounts.
 */
import { ANGLES, type Heading } from './types';

/** Fixed-point 1.0 of the table: vector() components are scaled by this. */
export const TRIG_ONE = 16384;

const QUARTER = ANGLES / 4;
const HALF = ANGLES / 2;
/** headingTo() first samples every COARSE_STEP-th heading. */
const COARSE_STEP = ANGLES / 16;

/**
 * round(sin(i / QUARTER * 90°) * TRIG_ONE) for i = 0..QUARTER, generated once and kept
 * as literals. The other three quadrants mirror it, so opposite headings give exactly
 * opposite vectors.
 */
const QUARTER_SINE: readonly number[] = [
  0, 101, 201, 302, 402, 503, 603, 704, 804, 904, 1005, 1105, 1205, 1306, 1406, 1506,
  1606, 1706, 1806, 1906, 2006, 2105, 2205, 2305, 2404, 2503, 2603, 2702, 2801, 2900, 2999, 3098,
  3196, 3295, 3393, 3492, 3590, 3688, 3786, 3883, 3981, 4078, 4176, 4273, 4370, 4467, 4563, 4660,
  4756, 4852, 4948, 5044, 5139, 5235, 5330, 5425, 5520, 5614, 5708, 5803, 5897, 5990, 6084, 6177,
  6270, 6363, 6455, 6547, 6639, 6731, 6823, 6914, 7005, 7096, 7186, 7276, 7366, 7456, 7545, 7635,
  7723, 7812, 7900, 7988, 8076, 8163, 8250, 8337, 8423, 8509, 8595, 8680, 8765, 8850, 8935, 9019,
  9102, 9186, 9269, 9352, 9434, 9516, 9598, 9679, 9760, 9841, 9921, 10001, 10080, 10159, 10238, 10316,
  10394, 10471, 10549, 10625, 10702, 10778, 10853, 10928, 11003, 11077, 11151, 11224, 11297, 11370, 11442, 11514,
  11585, 11656, 11727, 11797, 11866, 11935, 12004, 12072, 12140, 12207, 12274, 12340, 12406, 12472, 12537, 12601,
  12665, 12729, 12792, 12854, 12916, 12978, 13039, 13100, 13160, 13219, 13279, 13337, 13395, 13453, 13510, 13567,
  13623, 13678, 13733, 13788, 13842, 13896, 13949, 14001, 14053, 14104, 14155, 14206, 14256, 14305, 14354, 14402,
  14449, 14497, 14543, 14589, 14635, 14680, 14724, 14768, 14811, 14854, 14896, 14937, 14978, 15019, 15059, 15098,
  15137, 15175, 15213, 15250, 15286, 15322, 15357, 15392, 15426, 15460, 15493, 15525, 15557, 15588, 15619, 15649,
  15679, 15707, 15736, 15763, 15791, 15817, 15843, 15868, 15893, 15917, 15941, 15964, 15986, 16008, 16029, 16049,
  16069, 16088, 16107, 16125, 16143, 16160, 16176, 16192, 16207, 16221, 16235, 16248, 16261, 16273, 16284, 16295,
  16305, 16315, 16324, 16332, 16340, 16347, 16353, 16359, 16364, 16369, 16373, 16376, 16379, 16381, 16383, 16384,
  16384,
];

/** Wraps any integer onto [0, ANGLES). */
export function normalizeHeading(h: number): Heading {
  return h & (ANGLES - 1);
}

/**
 * sin(h) * TRIG_ONE for every heading, unfolded from QUARTER_SINE once so a lookup needs
 * no quadrant logic (movement reads it in every bot look-ahead step). An integer array
 * can't hold -0, so a zero never comes out negative.
 */
const SINE = Int32Array.from({ length: ANGLES }, (_, h) => {
  const i = h & (QUARTER - 1);
  switch ((h / QUARTER) | 0) {
    case 0:
      return QUARTER_SINE[i];
    case 1:
      return QUARTER_SINE[QUARTER - i];
    case 2:
      return -QUARTER_SINE[i];
    default:
      return -QUARTER_SINE[QUARTER - i];
  }
});

/** sin(h) * TRIG_ONE. */
export function sine(h: Heading): number {
  return SINE[h & (ANGLES - 1)];
}

/** cos(h) * TRIG_ONE. */
export function cosine(h: Heading): number {
  return SINE[(h + QUARTER) & (ANGLES - 1)];
}

/** Unit vector of a heading scaled by TRIG_ONE, in screen axes (y grows downward). */
export function vector(h: Heading): { dx: number; dy: number } {
  return { dx: sine(h), dy: 0 - cosine(h) };
}

/**
 * The heading closest to the direction (dx, dy), found without atan2. The best of 16
 * evenly spaced headings (by dot product) lands within COARSE_STEP of the answer; then
 * bisection on the sign of the cross product, which says on which side of a heading the
 * direction lies, narrows it to the two neighbouring headings, and the nearer one wins.
 * (Comparing dot products alone can't tell neighbouring headings apart: the table's
 * rounding changes vector lengths by more than one unit of angle changes the dot.)
 * Returns 0 for a zero vector.
 */
export function headingTo(dx: number, dy: number): Heading {
  if (dx === 0 && dy === 0) return 0;
  let best = 0;
  let bestDot = -Infinity;
  for (let h = 0; h < ANGLES; h += COARSE_STEP) {
    const dot = dx * sine(h) - dy * cosine(h);
    if (dot > bestDot) {
      best = h;
      bestDot = dot;
    }
  }
  let lo = best - COARSE_STEP;
  let hi = best + COARSE_STEP;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (clockwiseOf(dx, dy, mid) > 0) lo = mid;
    else hi = mid;
  }
  return normalizeHeading(Math.abs(clockwiseOf(dx, dy, lo)) < Math.abs(clockwiseOf(dx, dy, hi)) ? lo : hi);
}

/** Positive when the direction (dx, dy) lies clockwise of heading h, negative counter-clockwise. */
function clockwiseOf(dx: number, dy: number, h: Heading): number {
  return dx * cosine(h) + dy * sine(h);
}

/** Signed shortest rotation from `from` to `to`, in (-ANGLES/2, ANGLES/2]: positive = clockwise. */
export function headingDelta(from: Heading, to: Heading): number {
  const d = (to - from) & (ANGLES - 1);
  return d > HALF ? d - ANGLES : d;
}
