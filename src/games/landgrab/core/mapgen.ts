/**
 * Arena generation: a smooth, lumpy, roughly round blob. Everything is integer
 * fixed-point math so the same seed yields the same map on every engine.
 *
 * A map is generated at every round start, synchronously, on the match server's shared
 * thread and on every client mid-match, so each pass is a flat sweep over typed arrays,
 * and the working buffers are kept between calls rather than allocated afresh each round.
 */

/** Fixed-point 1.0 for noise values and the radial term. */
const NOISE_ONE = 1 << 16;
/** Fixed-point 1.0 for interpolation weights; a power of two so rescaling is a shift. */
const WEIGHT_BITS = 10;
const WEIGHT_ONE = 1 << WEIGHT_BITS;

/**
 * Share of the grid the raw blob covers, in thousandths. The radius is solved per map so
 * every seed fills about the same area; removing necks afterwards trims a little.
 */
const TARGET_FILL_PERMILLE = 670;
/** How far noise pushes the edge in or out, in 64ths of the radial term. */
const NOISE_GAIN = 112;
/**
 * Lattice spacing of the two noise octaves, as divisors of the grid size. Both are wide
 * (120 and 80 cells at 480 x 480), so the outline is a few big lumps rather than ripples.
 */
const COARSE_DIVISOR = 4;
const FINE_DIVISOR = 6;
/**
 * A soft round wall, as thousandths of the grid size from the centre: noise may push the
 * edge out freely up to WALL_START, then ever harder against a penalty that makes
 * everything past WALL_END void. Bulges flatten into the round wall instead of being cut
 * off by the square grid border, and the blob keeps some void around it.
 */
const WALL_START_PERMILLE = 400;
const WALL_END_PERMILLE = 490;
/**
 * Half the narrowest neck that survives, in cells: about 1.5 head widths, so every
 * passage is at least three heads wide. Smaller grids scale it down.
 */
const NECK_RADIUS = 11;
/** The radius search counts coverage on every SAMPLE_STRIDE-th cell of every SAMPLE_STRIDE-th row. */
const SAMPLE_STRIDE = 4;

export function generateMap(size: number, seed: number): { mask: Uint8Array; playable: number } {
  const work = workFor(size);
  const blob = thresholdBlob(size, seed >>> 0, work);
  const mask = removeNecks(blob, size, Math.min(NECK_RADIUS, Math.floor(size / 24)), work);
  keepLargestComponent(mask, size, work);
  const playable = fillHoles(mask, size, work);
  return { mask, playable };
}

/**
 * Buffers one generation works in. Only the finished mask is handed out (freshly
 * allocated, as the state takes ownership of it); everything here is overwritten by the
 * next call, so it never carries anything from one map to the next.
 */
interface MapWork {
  /** Squared doubled distance from the grid centre, per cell: the same for every seed. */
  distSq: Int32Array;
  /** The round wall's penalty per cell (see wallPenalty): also the same for every seed. */
  wall: Int32Array;
  /** Noise, then each cell's offset against the radial term. */
  offset: Int32Array;
  blob: Uint8Array;
  rowDist: Uint8Array;
  /** Disc centres of the opening in removeNecks. */
  centres: Uint8Array;
  label: Int32Array;
  queue: Int32Array;
}

const workBySize = new Map<number, MapWork>();

function workFor(size: number): MapWork {
  let work = workBySize.get(size);
  if (work) return work;
  const cells = size * size;
  const distSq = new Int32Array(cells);
  const wall = new Int32Array(cells);
  // Doubled coordinates keep the centre of an even-sized grid on an integer.
  const wallStartRadius = Math.floor((2 * size * WALL_START_PERMILLE) / 1000);
  const wallEndRadius = Math.floor((2 * size * WALL_END_PERMILLE) / 1000);
  const wallStart = wallStartRadius * wallStartRadius;
  const wallEnd = wallEndRadius * wallEndRadius;
  for (let y = 0, i = 0; y < size; y++) {
    const dy = 2 * y - (size - 1);
    for (let x = 0; x < size; x++, i++) {
      const dx = 2 * x - (size - 1);
      const d = dx * dx + dy * dy;
      distSq[i] = d;
      wall[i] = d > wallStart ? wallPenalty(d, wallStart, wallEnd) : 0;
    }
  }
  work = {
    distSq,
    wall,
    offset: new Int32Array(cells),
    blob: new Uint8Array(cells),
    rowDist: new Uint8Array(cells),
    centres: new Uint8Array(cells),
    label: new Int32Array(cells),
    queue: new Int32Array(cells),
  };
  workBySize.set(size, work);
  return work;
}

/** Pseudo-random lattice value in [0, NOISE_ONE). */
function latticeValue(seed: number, ix: number, iy: number): number {
  let h = seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) & (NOISE_ONE - 1);
}

/** 3w² - 2w³ in fixed point: eases between lattice values so the blob edge has no creases. */
function smoothstep(w: number): number {
  return Math.floor((w * w * (3 * WEIGHT_ONE - 2 * w)) / (WEIGHT_ONE * WEIGHT_ONE));
}

/** (b - a) * w stays far inside 32 bits, so the shift is an exact floor division. */
function lerp(a: number, b: number, w: number): number {
  return a + (((b - a) * w) >> WEIGHT_BITS);
}

/**
 * Adds weight * value noise in [0, NOISE_ONE) with lattice spacing `period` cells to every
 * cell of `into`. Per row, the lattice is first eased down to that row, so each cell costs
 * a single interpolation along the row.
 */
function addNoise(into: Int32Array, size: number, seed: number, period: number, weight: number): void {
  const points = Math.floor((size - 1) / period) + 2;
  const lattice = new Int32Array(points * points);
  for (let iy = 0; iy < points; iy++) {
    for (let ix = 0; ix < points; ix++) lattice[iy * points + ix] = latticeValue(seed, ix, iy);
  }
  const cell = new Int32Array(size);
  const ease = new Int32Array(size);
  for (let v = 0; v < size; v++) {
    cell[v] = Math.floor(v / period);
    ease[v] = smoothstep(Math.floor(((v - cell[v] * period) * WEIGHT_ONE) / period));
  }
  const column = new Int32Array(points);
  for (let y = 0; y < size; y++) {
    const top = cell[y] * points;
    for (let ix = 0; ix < points; ix++) column[ix] = lerp(lattice[top + ix], lattice[top + points + ix], ease[y]);
    // One lattice span at a time: its two end values are shared by every cell in it.
    for (let x0 = 0, ix = 0; x0 < size; x0 += period, ix++) {
      const left = column[ix];
      const right = column[ix + 1];
      for (let x = x0, i = y * size + x0, end = Math.min(size, x0 + period); x < end; x++, i++) {
        into[i] += weight * lerp(left, right, ease[x]);
      }
    }
  }
}

/** Playable where (dx² + dy²)/R² + noise * k + wall < 1 around the grid centre, with R solved for the target fill. */
function thresholdBlob(size: number, seed: number, work: MapWork): Uint8Array {
  const cells = size * size;
  const { distSq, wall, offset, blob } = work;
  // Coarse lumps weigh three times as much as the finer ones; the weights sum to 4.
  offset.fill(0);
  addNoise(offset, size, seed, Math.max(4, Math.floor(size / COARSE_DIVISOR)), 3);
  addNoise(offset, size, Math.imul(seed ^ 0x5bd1e995, 0x2c1b3c6d) >>> 0, Math.max(3, Math.floor(size / FINE_DIVISOR)), 1);
  for (let i = 0; i < cells; i++) {
    const centred = (offset[i] >> 2) - NOISE_ONE / 2;
    offset[i] = ((centred * NOISE_GAIN) >> 6) + wall[i];
  }
  const sampled = Math.ceil(size / SAMPLE_STRIDE) * Math.ceil(size / SAMPLE_STRIDE);
  const target = Math.floor((sampled * TARGET_FILL_PERMILLE) / 1000);
  // Coverage only grows with the radius, so binary-search the smallest diameter that reaches the target.
  let lo = 1;
  let hi = 4 * size;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (countSampledInside(size, distSq, offset, mid * mid) >= target) hi = mid;
    else lo = mid + 1;
  }
  const radiusSq = lo * lo;
  for (let i = 0; i < cells; i++) blob[i] = isInside(distSq[i], offset[i], radiusSq) ? 1 : 0;
  return blob;
}

/**
 * distSq/R² + offset < 1 in fixed point, multiplied through by R² instead of dividing:
 * both products are whole numbers far below 2^53, so the comparison is exact.
 */
function isInside(distSq: number, offset: number, radiusSq: number): boolean {
  return distSq * NOISE_ONE < (NOISE_ONE - offset) * radiusSq;
}

function countSampledInside(size: number, distSq: Int32Array, offset: Int32Array, radiusSq: number): number {
  let count = 0;
  for (let y = 0; y < size; y += SAMPLE_STRIDE) {
    for (let i = y * size, end = i + size; i < end; i += SAMPLE_STRIDE) {
      if (isInside(distSq[i], offset[i], radiusSq)) count++;
    }
  }
  return count;
}

/**
 * Past wallStart, grows quadratically to two NOISE_ONEs at wallEnd (both squared doubled
 * distances), which no noise can overcome: past it is always void, and so is the grid
 * border. t * t stays below 2^31 on any grid this game uses, so the shift is exact.
 */
function wallPenalty(distSq: number, wallStart: number, wallEnd: number): number {
  const t = Math.floor(((distSq - wallStart) * WEIGHT_ONE) / (wallEnd - wallStart));
  return (t * t) >> (2 * WEIGHT_BITS - 17);
}

/**
 * Morphological opening with a disc of `radius` cells: keep the union of every disc that
 * fits inside the blob. Necks narrower than the disc and thin spikes vanish, and convex
 * bumps come out rounded. Both halves are exact Euclidean disc tests, done separably.
 * Returns a newly allocated mask, the one generateMap hands out.
 */
function removeNecks(blob: Uint8Array, size: number, radius: number, work: MapWork): Uint8Array {
  if (radius <= 0) return blob.slice();
  const halfWidth = discHalfWidths(radius);
  const { rowDist, centres } = work;
  // Disc centres are the cells with no void (off-grid included) within radius: 0 in `centres`.
  rowDistances(blob, size, 0, radius, true, rowDist);
  withinRadius(rowDist, size, radius, halfWidth, true, centres);
  // The opened blob: cells within radius of a centre (always inside the blob, as each centre's disc is).
  rowDistances(centres, size, 0, radius, false, rowDist);
  return withinRadius(rowDist, size, radius, halfWidth, false, new Uint8Array(blob.length));
}

/** halfWidth[k] = floor(sqrt(r² - k²)) for k = 0..r: how far a disc of radius r reaches at offset k from its centre. */
function discHalfWidths(r: number): Int32Array {
  const widths = new Int32Array(r + 1);
  for (let k = 0; k <= r; k++) {
    let w = 0;
    while ((w + 1) * (w + 1) + k * k <= r * r) w++;
    widths[k] = w;
  }
  return widths;
}

/**
 * Sets `out` to 1 on every cell that has a target cell within `radius` (Euclidean) and 0
 * elsewhere, given each cell's distance along its row to the nearest target (capped above
 * radius). A cell at row distance v from a target reaches halfWidth[v] rows up and down,
 * so one sweep down and one sweep up, carrying per column how far the reach extends, cover
 * the whole grid. With offGridTargets, the rows just above and below the grid count as all
 * targets. Returns `out`.
 */
function withinRadius(
  rowDist: Uint8Array,
  size: number,
  radius: number,
  halfWidth: Int32Array,
  offGridTargets: boolean,
  out: Uint8Array,
): Uint8Array {
  const reach = new Int32Array(size);
  reach.fill(offGridTargets ? radius - 1 : -1);
  for (let y = 0, i = 0; y < size; y++) {
    for (let x = 0; x < size; x++, i++) {
      const v = rowDist[i];
      if (v <= radius && y + halfWidth[v] > reach[x]) reach[x] = y + halfWidth[v];
      out[i] = reach[x] >= y ? 1 : 0;
    }
  }
  reach.fill(offGridTargets ? size - radius : size);
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0, i = y * size; x < size; x++, i++) {
      const v = rowDist[i];
      if (v <= radius && y - halfWidth[v] < reach[x]) reach[x] = y - halfWidth[v];
      if (reach[x] <= y) out[i] = 1;
    }
  }
  return out;
}

/**
 * Fills `dist` with each cell's distance along its row to the nearest cell holding `value`,
 * capped at cap + 1 (anything farther is out of every disc anyway). With offGridTargets,
 * the cells just past each end of the row count as holding it.
 */
function rowDistances(grid: Uint8Array, size: number, value: number, cap: number, offGridTargets: boolean, dist: Uint8Array): void {
  const far = cap + 1;
  // Distance at the virtual cell just off each end of the row.
  const edge = offGridTargets ? 0 : far;
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let d = edge;
    for (let x = 0; x < size; x++) {
      d = grid[row + x] === value ? 0 : d < far ? d + 1 : far;
      dist[row + x] = d;
    }
    d = edge;
    for (let x = size - 1; x >= 0; x--) {
      d = grid[row + x] === value ? 0 : d < far ? d + 1 : far;
      if (d < dist[row + x]) dist[row + x] = d;
    }
  }
}

/** Turns every playable cell outside the largest 4-connected region into void. */
function keepLargestComponent(mask: Uint8Array, size: number, work: MapWork): void {
  const { label, queue } = work;
  label.fill(0);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || label[start] !== 0) continue;
    next++;
    const cells = markRegion(mask, size, 1, label, next, start, queue);
    if (cells > bestSize) {
      bestSize = cells;
      best = next;
    }
  }
  for (let i = 0; i < mask.length; i++) if (label[i] !== best) mask[i] = 0;
}

/**
 * Makes playable every void cell that cannot reach the grid border through void, and
 * returns how many cells are playable then. The corner cell is always void (the round
 * wall leaves the corners empty), so the outside is everything void reachable from it.
 */
function fillHoles(mask: Uint8Array, size: number, work: MapWork): number {
  const { label, queue } = work;
  label.fill(0);
  const outside = markRegion(mask, size, 0, label, 1, 0, queue);
  for (let i = 0; i < mask.length; i++) mask[i] = label[i] === 1 ? 0 : 1;
  return mask.length - outside;
}

/**
 * Sets `marks` to `mark` on every cell 4-connected to `start` through unmarked cells that
 * hold `value` in `grid`, a horizontal run at a time (on regions this big, far cheaper
 * than cell by cell). Returns how many cells it marked.
 */
function markRegion(grid: Uint8Array, size: number, value: number, marks: Int32Array, mark: number, start: number, queue: Int32Array): number {
  const lastRow = grid.length - size;
  marks[start] = mark;
  queue[0] = start;
  let top = 1;
  let count = 0;
  while (top > 0) {
    const c = queue[--top];
    const rowStart = c - (c % size);
    let left = c;
    while (left > rowStart && grid[left - 1] === value && marks[left - 1] === 0) marks[--left] = mark;
    let right = c;
    while (right < rowStart + size - 1 && grid[right + 1] === value && marks[right + 1] === 0) marks[++right] = mark;
    count += right - left + 1;
    if (rowStart > 0) top = queueRunStarts(grid, value, marks, mark, left - size, right - size, queue, top);
    if (rowStart < lastRow) top = queueRunStarts(grid, value, marks, mark, left + size, right + size, queue, top);
  }
  return count;
}

/** Marks and queues the first cell of every run of unmarked `value` cells among from..to; returns the new queue length. */
function queueRunStarts(
  grid: Uint8Array,
  value: number,
  marks: Int32Array,
  mark: number,
  from: number,
  to: number,
  queue: Int32Array,
  top: number,
): number {
  let inRun = false;
  for (let c = from; c <= to; c++) {
    const open = grid[c] === value && marks[c] === 0;
    if (open && !inRun) {
      marks[c] = mark;
      queue[top++] = c;
    }
    inRun = open;
  }
  return top;
}
