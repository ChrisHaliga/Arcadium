/**
 * The map edge as movement feels it. The mask's outline is a staircase of cells; sliding
 * along it cell by cell catches on every step, so the head would stop, shudder or zig-zag.
 * Instead, void cells near a point add up to a smooth field that rises toward the void.
 * Its gradient gives a steady outward normal even on a stair-stepped edge, and slides run
 * along one level of it, STANDOFF inside the outline, clear of the steps.
 */
import { headingTo } from './trig';
import { SUB, type Heading, type SimState } from './types';

/**
 * How far (cells) the field looks for void: wide enough that the outline's stair steps
 * tilt the normal by only a degree or two.
 */
const EDGE_RADIUS = 8;
const REACH = EDGE_RADIUS * SUB;
const REACH_SQ = REACH * REACH;
const SUB2 = SUB * SUB;
const SUB3 = SUB2 * SUB;
const SUB4 = SUB2 * SUB2;

/** How far inside a straight edge's outline slides run, in subunits. */
const STANDOFF = SUB;
/** The gradient is divided by this before headingTo multiplies it by sines, so those products stay exact. */
const GRADIENT_SCALE = 1024;

export interface Edge {
  /** Sum of (R² - r²)² over void and off-grid cells within EDGE_RADIUS (r, R in subunits): 0 far from the edge. */
  field: number;
  /**
   * Sum of (R² - r²) * offset over the same cells: a quarter of the field's gradient,
   * pointing toward the void. Zero when no void is near or it surrounds the point evenly.
   */
  gx: number;
  gy: number;
}

/**
 * HALF_WIDTH[|oy|]: how far across (subunits) a cell centre |oy| above or below a point
 * may lie and still be within reach of it, the largest s with s² + oy² < REACH². The
 * floored square root of an integer this small is exact.
 */
const HALF_WIDTH = Int32Array.from({ length: REACH }, (_, oy) => Math.floor(Math.sqrt(REACH_SQ - oy * oy - 1)));

/**
 * Power sums of the column offsets u a cell in reach can have (from the point's own column,
 * at most EDGE_RADIUS either way): entry i is the sum of u^k over u < i - EDGE_RADIUS, so a
 * run of columns sums with one subtraction.
 */
function powerSums(k: number): Float64Array {
  const sums = new Float64Array(2 * EDGE_RADIUS + 2);
  for (let i = 1; i < sums.length; i++) {
    const u = i - 1 - EDGE_RADIUS;
    let power = u;
    for (let e = 1; e < k; e++) power *= u;
    sums[i] = sums[i - 1] + power;
  }
  return sums;
}
const U1 = powerSums(1);
const U2 = powerSums(2);
const U3 = powerSums(3);
const U4 = powerSums(4);

/**
 * Fills `out` with the field and its gradient at (x, y), in subunits, and returns it.
 * Allocation-free: movement plans call this for every head and bot look-ahead step.
 *
 * The cells in reach are summed a row at a time. In a row, the cell u columns over from
 * the point's own lies SUB * u + d across from it, so its weight R² - r² is a quadratic
 * in u and each sum is a polynomial in u: a run of void cells adds up from power sums of
 * its columns instead of cell by cell. Every term is an integer below 2^53 (a weight is at
 * most 2^22, an offset under 2^11, |u| at most EDGE_RADIUS), so the sums are exact: the
 * same numbers on every engine as adding the cells one by one.
 */
export function edgeAt(state: SimState, x: number, y: number, out: Edge): Edge {
  const { size, mask } = state;
  const { nearVoid, runEnd } = maskIndex(state);
  out.field = 0;
  out.gx = 0;
  out.gy = 0;
  const onGrid = x >= 0 && y >= 0 && x < size * SUB && y < size * SUB;
  if (onGrid && nearVoid[Math.floor(y / SUB) * size + Math.floor(x / SUB)] === 0) return out;
  const column = Math.floor(x / SUB);
  const d = column * SUB + SUB / 2 - x;
  let field = 0;
  let gx = 0;
  let gy = 0;
  for (let cy = Math.floor((y - REACH) / SUB), y1 = Math.floor((y + REACH) / SUB); cy <= y1; cy++) {
    const oy = cy * SUB + SUB / 2 - y;
    if (oy >= REACH || oy <= -REACH) continue;
    const half = HALF_WIDTH[oy < 0 ? -oy : oy];
    // The row's cells in reach run from `first` to `last`; off the grid counts as void.
    const first = column + Math.ceil((-half - d) / SUB);
    const last = column + Math.floor((half - d) / SUB);
    const rowOnGrid = cy >= 0 && cy < size;
    const row = cy * size;
    let m0 = 0;
    let m1 = 0;
    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (let c = first; c <= last; ) {
      let next = last + 1;
      let empty = true;
      if (rowOnGrid && c < 0) {
        next = Math.min(next, 0);
      } else if (rowOnGrid && c < size) {
        next = Math.min(next, runEnd[row + c]);
        empty = mask[row + c] === 0;
      }
      if (empty) {
        const i = c - column + EDGE_RADIUS;
        const j = next - column + EDGE_RADIUS;
        m0 += j - i;
        m1 += U1[j] - U1[i];
        m2 += U2[j] - U2[i];
        m3 += U3[j] - U3[i];
        m4 += U4[j] - U4[i];
      }
      c = next;
    }
    if (m0 === 0) continue;
    // A void cell's weight is b - 2 SUB d u - SUB² u²; expanded, its sums over the row's void cells.
    const b = REACH_SQ - oy * oy - d * d;
    field += b * b * m0 - 4 * b * SUB * d * m1 + (4 * SUB2 * d * d - 2 * b * SUB2) * m2 + 4 * SUB3 * d * m3 + SUB4 * m4;
    gx += b * d * m0 + (b * SUB - 2 * SUB * d * d) * m1 - 3 * SUB2 * d * m2 - SUB3 * m3;
    gy += oy * (b * m0 - 2 * SUB * d * m1 - SUB2 * m2);
  }
  out.field = field;
  out.gx = gx;
  out.gy = gy;
  return out;
}

/** The heading straight out toward the void, or null when no void is near enough to tell. */
export function outwardNormal(edge: Edge): Heading | null {
  const gx = Math.trunc(edge.gx / GRADIENT_SCALE);
  const gy = Math.trunc(edge.gy / GRADIENT_SCALE);
  return gx === 0 && gy === 0 ? null : headingTo(gx, gy);
}

/**
 * The field a head feels at `distance` subunits from a long straight edge running along the
 * grid (the head level with a row of cell centres). Edges at other angles read within a
 * hair of it: the kernel is wide and smooth next to a cell.
 */
function straightEdgeField(distance: number): number {
  let field = 0;
  for (let row = -EDGE_RADIUS; row <= EDGE_RADIUS; row++) {
    for (let column = 0; column <= EDGE_RADIUS; column++) {
      const ox = distance + column * SUB + SUB / 2;
      const oy = row * SUB;
      const w = REACH_SQ - ox * ox - oy * oy;
      if (w > 0) field += w * w;
    }
  }
  return field;
}

/** The level slides keep to. A straight move may not push the field past it either. */
export const STANDOFF_FIELD = straightEdgeField(STANDOFF);

/**
 * How far the point is inside the standoff level, in subunits (negative: still short of
 * it), from the field's excess over that level and its slope. Linear in a field that
 * isn't, so slides close the gap over a few ticks rather than at once.
 */
export function depthPastStandoff(edge: Edge): number {
  const slope = 4 * Math.sqrt(edge.gx * edge.gx + edge.gy * edge.gy);
  return slope > 0 ? (edge.field - STANDOFF_FIELD) / slope : 0;
}

/** What edgeAt works out once per map. */
interface MaskIndex {
  /**
   * 1 for every cell with void or the grid border within EDGE_RADIUS cells along both axes:
   * everywhere else the field is 0 without looking, and most heads are far from the edge.
   */
  nearVoid: Uint8Array;
  /** Per cell, the column just past the run of equal mask values it lies in, along its row. */
  runEnd: Uint16Array;
}

const indexByMask = new WeakMap<Uint8Array, MaskIndex>();
/** The last mask looked up, so the many calls on one map skip the WeakMap. */
let lastMask: Uint8Array | null = null;
let lastIndex: MaskIndex | null = null;

/** Cached per mask, which is never mutated in place. */
function maskIndex(state: SimState): MaskIndex {
  if (state.mask === lastMask) return lastIndex!;
  const { size, mask } = state;
  let index = indexByMask.get(mask);
  if (!index) {
    index = {
      nearVoid: withinReach(withinReach(mask, size, 0, 1, size), size, 1, size, 1),
      runEnd: runEnds(mask, size),
    };
    indexByMask.set(mask, index);
  }
  lastMask = mask;
  lastIndex = index;
  return index;
}

/**
 * Marks the cells with a `target`-valued cell, or the grid border, within EDGE_RADIUS steps
 * along one axis: `stride` steps along it and `lineStride` from one line of cells to the
 * next. A forward and a backward sweep carry the distance from the last target seen.
 */
function withinReach(grid: Uint8Array, size: number, target: number, stride: number, lineStride: number): Uint8Array {
  const out = new Uint8Array(grid.length);
  for (let line = 0; line < size; line++) {
    const first = line * lineStride;
    const last = first + (size - 1) * stride;
    // Just past either end of the line is off the grid, which counts as a target.
    let since = 0;
    for (let c = first; c <= last; c += stride) {
      since = grid[c] === target ? 0 : since + 1;
      if (since <= EDGE_RADIUS) out[c] = 1;
    }
    since = 0;
    for (let c = last; c >= first; c -= stride) {
      since = grid[c] === target ? 0 : since + 1;
      if (since <= EDGE_RADIUS) out[c] = 1;
    }
  }
  return out;
}

function runEnds(mask: Uint8Array, size: number): Uint16Array {
  const out = new Uint16Array(mask.length);
  for (let row = 0; row < mask.length; row += size) {
    let end = size;
    for (let x = size - 1; x >= 0; x--) {
      if (x < size - 1 && mask[row + x] !== mask[row + x + 1]) end = x + 1;
      out[row + x] = end;
    }
  }
  return out;
}
