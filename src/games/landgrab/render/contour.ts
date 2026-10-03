/**
 * Smooth outlines for raster regions (territory, the arena, the capture ghost).
 *
 * The sim stores land as a fine grid of cells. Drawing cells would look blocky, so each
 * region is blurred (a 9-cell triangle kernel) and cut at an iso level with marching
 * squares, interpolating crossings between cell centres, then traced into closed loops.
 * The outline follows the raster to within a fraction of a cell but reads as soft,
 * rounded curves at any zoom, and a path holds only the outline itself (a few points
 * per cell of edge), which keeps fills cheap.
 *
 * Territory is split into CHUNK x CHUNK chunks so a capture only rebuilds the chunks it
 * touched. A chunk traces its region over its own squares plus one square of overlap,
 * closing loops just outside that range; whatever a closure cuts off lies inside the
 * neighbouring chunk's exact area, so opaque fills of neighbouring chunks join without
 * a seam.
 */

/** Squares per chunk side. */
export const CHUNK = 32;

/**
 * Triangle blur [1 2 3 4 5 4 3 2 1] (two 5-wide box passes, sigma ~1.6 cells): wide
 * enough to melt the raster's stair-steps and the flat runs of rasterised circles into
 * round curves, narrow enough to keep every feature a head can make (a trail band is 5
 * cells wide). Box passes are running sums, so the cost per sample is constant.
 */
const BOX = 5;
const BLUR_REACH = BOX - 1;
/** Blurred indicator of a cell fully inside a region (25 per axis). */
export const FIELD_ONE = BOX * BOX * BOX * BOX;
/** Squares a chunk covers beyond its own edges. */
const OVERLAP = 1;

/** The subset of Path2D an outline is written into (Path2D satisfies it; tests can record calls). */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/**
 * Traces regions into closed loops, reusing its scratch buffers between calls (they
 * grow to the largest area traced).
 */
export class RegionTracer {
  /** Indicator per cell (0/1); Int32Array like the blur buffers, so the box passes read one array type. */
  private cells = new Int32Array(0);
  private rows = new Int32Array(0);
  private field = new Float64Array(0);
  private next = new Int32Array(0);
  private visited = new Uint8Array(0);

  /**
   * Outline of {cells == value} over the cell-centre samples [sx0, sx1] x [sy0, sy1],
   * blurred, cut at `threshold` (0..FIELD_ONE). Loops close just outside the range.
   */
  region(out: PathSink, raster: Uint8Array, size: number, value: number, sx0: number, sy0: number, sx1: number, sy1: number, threshold: number): void {
    const nx = sx1 - sx0 + 1;
    const ny = sy1 - sy0 + 1;
    const cw = nx + 2 * BLUR_REACH;
    const ch = ny + 2 * BLUR_REACH;
    // Padded sample grid: a ring of empty samples around the range closes every loop.
    const w = nx + 2;
    const h = ny + 2;
    this.ensure(cw * ch, ch * cw, w * h);
    const { cells, rows, field } = this;

    const cx0 = sx0 - BLUR_REACH;
    const cy0 = sy0 - BLUR_REACH;
    for (let j = 0; j < ch; j++) {
      const y = cy0 + j;
      const inY = y >= 0 && y < size;
      for (let i = 0; i < cw; i++) {
        const x = cx0 + i;
        cells[j * cw + i] = inY && x >= 0 && x < size && raster[y * size + x] === value ? 1 : 0;
      }
    }
    // Horizontal: two box passes along every cell row. The first leaves cw - 4 values per
    // row, the second nx (one per sample column), both written in place from the left.
    for (let j = 0; j < ch; j++) {
      const row = j * cw;
      boxPass(cells, rows, row, row, 1, cw);
      boxPass(rows, rows, row, row, 1, cw - BLUR_REACH);
    }
    // Vertical: the same down every sample column, then into the padded field.
    for (let i = 0; i < nx; i++) {
      boxPass(rows, rows, i, i, cw, ch);
      boxPass(rows, rows, i, i, cw, ch - BLUR_REACH);
    }
    field.fill(0, 0, w * h);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) field[(j + 1) * w + i + 1] = rows[j * cw + i];
    }
    this.loops(out, field, w, h, sx0 - 1, sy0 - 1, threshold);
  }

  /**
   * Marching squares over a sample field (row stride w) whose outer ring is below the
   * threshold, writing every iso-line as a closed loop. Sample (i, j) sits at the centre
   * of grid cell (ox + i, oy + j). Loops keep the inside on the same side (outer edges
   * clockwise, holes anticlockwise), so the default nonzero fill renders holes.
   */
  loops(out: PathSink, field: Float64Array, w: number, h: number, ox: number, oy: number, threshold: number): void {
    const horizontal = (w - 1) * h;
    const total = horizontal + w * (h - 1);
    this.ensure(0, 0, 0, total);
    const { next, visited } = this;
    next.fill(-1, 0, total);
    visited.fill(0, 0, total);

    for (let j = 0; j < h - 1; j++) {
      for (let i = 0; i < w - 1; i++) {
        const fa = field[j * w + i];
        const fb = field[j * w + i + 1];
        const fc = field[(j + 1) * w + i + 1];
        const fd = field[(j + 1) * w + i];
        const a = fa >= threshold;
        const b = fb >= threshold;
        const c = fc >= threshold;
        const d = fd >= threshold;
        if (a === b && b === c && c === d) continue;
        // Edges in clockwise order: top (a->b), right (b->c), bottom (c->d), left (d->a).
        const top = j * (w - 1) + i;
        const bottom = top + (w - 1);
        const left = horizontal + j * w + i;
        const right = left + 1;
        if (a === c && b === d) {
          // Saddle: the centre decides whether the two inside corners connect.
          const joined = (fa + fb + fc + fd) / 4 >= threshold;
          if (a) {
            next[top] = joined ? right : left;
            next[bottom] = joined ? left : right;
          } else {
            next[right] = joined ? bottom : top;
            next[left] = joined ? top : bottom;
          }
          continue;
        }
        // One stretch of outline: from where the clockwise walk leaves the region to
        // where it re-enters. The neighbour across that edge continues from there.
        const exit = a && !b ? top : b && !c ? right : c && !d ? bottom : left;
        const entry = !a && b ? top : !b && c ? right : !c && d ? bottom : left;
        next[exit] = entry;
      }
    }

    for (let start = 0; start < total; start++) {
      if (next[start] < 0 || visited[start] === 1) continue;
      let e = start;
      let first = true;
      do {
        visited[e] = 1;
        let x: number;
        let y: number;
        if (e < horizontal) {
          const j = (e / (w - 1)) | 0;
          const i = e - j * (w - 1);
          const f0 = field[j * w + i];
          x = ox + i + 0.5 + (threshold - f0) / (field[j * w + i + 1] - f0);
          y = oy + j + 0.5;
        } else {
          const v = e - horizontal;
          const j = (v / w) | 0;
          const i = v - j * w;
          const f0 = field[j * w + i];
          x = ox + i + 0.5;
          y = oy + j + 0.5 + (threshold - f0) / (field[(j + 1) * w + i] - f0);
        }
        if (first) out.moveTo(x, y);
        else out.lineTo(x, y);
        first = false;
        e = next[e];
      } while (e !== start && e >= 0);
      out.closePath();
    }
  }

  private ensure(cells: number, rows: number, field: number, edges = 0): void {
    if (this.cells.length < cells) this.cells = new Int32Array(cells);
    if (this.rows.length < rows) this.rows = new Int32Array(rows);
    if (this.field.length < field) this.field = new Float64Array(field);
    if (this.next.length < edges) {
      this.next = new Int32Array(edges);
      this.visited = new Uint8Array(edges);
    }
  }
}

/**
 * One 5-wide box sum along a line of n values (stride apart) from src into dst, leaving
 * n - 4 outputs at the line's start: output k sums inputs k..k+4. A running sum, so it
 * may write over its own input (each input is read before its slot is overwritten).
 */
function boxPass(src: Int32Array, dst: Int32Array, srcStart: number, dstStart: number, stride: number, n: number): void {
  let sum = 0;
  for (let k = 0; k < BOX - 1; k++) sum += src[srcStart + k * stride];
  for (let k = 0; k + BOX - 1 < n; k++) {
    const add = src[srcStart + (k + BOX - 1) * stride];
    sum += add;
    const drop = src[srcStart + k * stride];
    dst[dstStart + k * stride] = sum;
    sum -= drop;
  }
}

export interface ChunkShape {
  value: number;
  path: Path2D;
  /** The value covers the chunk's whole neighbourhood: path is just its rectangle, with no edge of the region in it. */
  solid: boolean;
}

/**
 * A raster of small integer values (0 = empty) and the smooth outline of every value's
 * region, kept per chunk and rebuilt only where the raster changed.
 */
export class ContourLayer {
  readonly size: number;
  readonly raster: Uint8Array;
  readonly perSide: number;
  /** Index = chunk (ky * perSide + kx); shapes in ascending value order. */
  readonly shapes: ChunkShape[][];
  private readonly dirty: Uint8Array;
  private dirtyCount = 0;
  private readonly threshold: number;
  private readonly tracer = new RegionTracer();
  private readonly present = new Int32Array(256);

  /** threshold: iso level in 0..FIELD_ONE; below half grows regions slightly, so neighbours overlap instead of showing a gap. */
  constructor(size: number, threshold: number) {
    this.size = size;
    this.raster = new Uint8Array(size * size);
    this.perSide = Math.ceil(size / CHUNK);
    this.shapes = Array.from({ length: this.perSide * this.perSide }, () => []);
    this.dirty = new Uint8Array(this.perSide * this.perSide);
    this.threshold = threshold;
  }

  /** Sets one cell, marking every chunk whose outline depends on it. */
  set(cell: number, value: number): void {
    if (this.raster[cell] === value) return;
    this.raster[cell] = value;
    this.markCell(cell % this.size, (cell / this.size) | 0);
  }

  markCell(x: number, y: number): void {
    // A chunk reads cells up to overlap + blur reach past its own squares (plus the far
    // sample of its last square), so a cell near an edge affects the neighbour too.
    const reach = OVERLAP + BLUR_REACH + 1;
    const last = this.perSide - 1;
    const kx0 = Math.max(0, Math.floor((x - reach) / CHUNK));
    const kx1 = Math.min(last, Math.floor((x + reach) / CHUNK));
    const ky0 = Math.max(0, Math.floor((y - reach) / CHUNK));
    const ky1 = Math.min(last, Math.floor((y + reach) / CHUNK));
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) this.markChunk(ky * this.perSide + kx);
    }
  }

  markAll(): void {
    for (let k = 0; k < this.dirty.length; k++) this.markChunk(k);
  }

  /**
   * Rebuilds marked chunks: every one in the chunk range [kx0, kx1] x [ky0, ky1] (what is
   * on screen must be right this frame), then up to `budget` others, so a big change off
   * screen is spread over several frames instead of one long one.
   */
  rebuild(kx0: number, ky0: number, kx1: number, ky1: number, budget: number): void {
    if (this.dirtyCount === 0) return;
    const { perSide, dirty } = this;
    for (let ky = Math.max(0, ky0); ky <= Math.min(perSide - 1, ky1); ky++) {
      for (let kx = Math.max(0, kx0); kx <= Math.min(perSide - 1, kx1); kx++) {
        const k = ky * perSide + kx;
        if (dirty[k] === 1) this.rebuildChunk(k);
      }
    }
    for (let k = 0; k < dirty.length && budget > 0 && this.dirtyCount > 0; k++) {
      if (dirty[k] === 0) continue;
      this.rebuildChunk(k);
      budget--;
    }
  }

  private rebuildChunk(k: number): void {
    this.dirty[k] = 0;
    this.dirtyCount--;
    this.buildChunk(k);
  }

  private markChunk(k: number): void {
    if (this.dirty[k] === 1) return;
    this.dirty[k] = 1;
    this.dirtyCount++;
  }

  private buildChunk(k: number): void {
    const { size, perSide, raster, present } = this;
    const kx = k % perSide;
    const ky = (k / perSide) | 0;
    // Samples covered: the chunk's own squares plus the overlap; the edge chunks also
    // reach half a cell off the grid so regions touching the border still close.
    const sx0 = Math.max(-1, (kx === 0 ? -1 : kx * CHUNK) - OVERLAP);
    const sx1 = Math.min(size, (kx === perSide - 1 ? size : (kx + 1) * CHUNK) + OVERLAP);
    const sy0 = Math.max(-1, (ky === 0 ? -1 : ky * CHUNK) - OVERLAP);
    const sy1 = Math.min(size, (ky === perSide - 1 ? size : (ky + 1) * CHUNK) + OVERLAP);
    const list = this.shapes[k];
    list.length = 0;

    // Count the values under the chunk and its blur margin.
    present.fill(0);
    let area = 0;
    for (let y = sy0 - BLUR_REACH; y <= sy1 + BLUR_REACH; y++) {
      for (let x = sx0 - BLUR_REACH; x <= sx1 + BLUR_REACH; x++) {
        present[x >= 0 && y >= 0 && x < size && y < size ? raster[y * size + x] : 0]++;
        area++;
      }
    }
    for (let v = 1; v < 256; v++) {
      if (present[v] === 0) continue;
      const path = new Path2D();
      const solid = present[v] === area;
      if (solid) path.rect(sx0 + 0.5, sy0 + 0.5, sx1 - sx0, sy1 - sy0);
      else this.tracer.region(path, raster, size, v, sx0, sy0, sx1, sy1, this.threshold);
      list.push({ value: v, path, solid });
    }
  }
}
