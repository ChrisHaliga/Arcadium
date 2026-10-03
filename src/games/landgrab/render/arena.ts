/**
 * The arena: a dark void with drifting sparkles, the map blob as a light slab with a
 * smooth outline, a two-tone raised edge and a soft drop shadow, and a dotted floor.
 * The outline is built once per map from the mask with the same contour code as
 * territory. Every layer is drawn so it only rasterises where it shows.
 */
import type { SimState } from '../core/types';
import type { Camera } from './camera';
import { RegionTracer, type PathSink } from './contour';
import type { WorldBounds } from './territory';
import { ARENA, SIZES } from './theme';

/**
 * The map never changes during a round, so its outline gets a much wider blur than
 * territory, for long, calm curves: the mask is averaged into 2 x 2 blocks, then box
 * blurred three times (sigma ~2.8 cells). Being that smooth, it is traced at the block
 * resolution, a quarter of the work of tracing every cell. Cutting below half moves the
 * edge ~0.8 cells outward, so land at the rim never pokes out over it.
 */
const ARENA_BLOCK = 2;
const ARENA_BLUR_RADIUS = 1;
const ARENA_BLUR_PASSES = 3;
const ARENA_THRESHOLD = 0.35;
/** Outline points per piece: edges are stroked only where a piece is on screen. */
const PIECE_POINTS = 48;
/**
 * The drop shadow as stacked translucent strokes below the edge: [offset down, width,
 * alpha]. Their inner halves fall under the floor; outside they build a soft falloff.
 */
const SHADOW_STROKES: readonly (readonly [number, number, number])[] = [
  [5, 13, 0.14],
  [3.5, 6, 0.2],
];
/** Void decoration: one sparkle and two dots per tile (CSS px), drifting slower than the floor. */
const VOID_TILE = 72;
const VOID_PARALLAX = 0.35;

/** A run of outline points (x, y pairs, the last shared with the next run) and its bounding box. */
interface Piece {
  points: Float32Array;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Arena {
  /** The map drawn: a snapshot resync replaces the mask array without changing the map. */
  private seed = -1;
  private round = -1;
  private size = -1;
  private outline: Path2D | null = null;
  private pieces: Piece[] = [];

  /** Rebuilds the outline when the map changed. Returns true on a new map. */
  update(view: SimState): boolean {
    if (view.seed === this.seed && view.round === this.round && view.size === this.size) return false;
    this.seed = view.seed;
    this.round = view.round;
    this.size = view.size;
    const loops = new LoopRecorder(ARENA_BLOCK);
    traceArena(loops, view.mask, view.size);
    this.outline = loops.closedPath();
    this.pieces = loops.pieces(PIECE_POINTS);
    return true;
  }

  /** Void, shadow, rim and floor, leaving ctx in world (cell) space. */
  draw(ctx: CanvasRenderingContext2D, view: SimState, camera: Camera, dpr: number, bounds: WorldBounds): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = ARENA.void;
    ctx.fillRect(0, 0, camera.width, camera.height);
    drawVoidSparkles(ctx, camera, view);
    camera.applyWorld(ctx, dpr);
    if (!this.outline) return;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = ARENA.shadow;
    for (const [dy, width, alpha] of SHADOW_STROKES) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      this.strokeEdge(ctx, bounds, dy, width);
    }
    ctx.globalAlpha = 1;
    // The slab's side: strokes centred half their width below the edge show under the
    // bottom edges (and thinly along the sides); the floor, drawn next, covers the rest.
    ctx.lineWidth = SIZES.arenaRimDeep;
    ctx.strokeStyle = ARENA.rimDeep;
    this.strokeEdge(ctx, bounds, SIZES.arenaRimDeep / 2, SIZES.arenaRimDeep);
    ctx.lineWidth = SIZES.arenaRim;
    ctx.strokeStyle = ARENA.rim;
    this.strokeEdge(ctx, bounds, SIZES.arenaRim / 2, SIZES.arenaRim);
    ctx.fillStyle = ARENA.floor;
    ctx.fill(this.outline);
    drawFloorDots(ctx, view, bounds);
  }

  /**
   * Strokes the on-screen stretches of the outline moved down by dy, as one path so
   * translucent strokes don't double up where pieces meet. Built from stored points
   * each time: offsetting a Path2D would need a new one every frame.
   */
  private strokeEdge(ctx: CanvasRenderingContext2D, b: WorldBounds, dy: number, width: number): void {
    const reach = width / 2 + Math.abs(dy);
    ctx.beginPath();
    for (const piece of this.pieces) {
      if (piece.x1 < b.x0 - reach || piece.x0 > b.x1 + reach || piece.y1 < b.y0 - reach || piece.y0 > b.y1 + reach) continue;
      const pts = piece.points;
      ctx.moveTo(pts[0], pts[1] + dy);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1] + dy);
    }
    ctx.stroke();
  }
}

/**
 * Collects traced loops as point lists, to build both the closed outline and culled rim
 * pieces, scaling coordinates from the traced grid's units to cells.
 */
class LoopRecorder implements PathSink {
  readonly loops: number[][] = [];

  constructor(private readonly scale: number) {}

  moveTo(x: number, y: number): void {
    this.loops.push([x * this.scale, y * this.scale]);
  }

  lineTo(x: number, y: number): void {
    this.loops[this.loops.length - 1].push(x * this.scale, y * this.scale);
  }

  closePath(): void {
    const loop = this.loops[this.loops.length - 1];
    loop.push(loop[0], loop[1]);
  }

  closedPath(): Path2D {
    const path = new Path2D();
    for (const loop of this.loops) {
      path.moveTo(loop[0], loop[1]);
      for (let i = 2; i < loop.length; i += 2) path.lineTo(loop[i], loop[i + 1]);
      path.closePath();
    }
    return path;
  }

  /** Open runs of `points` points (each sharing its last point with the next), with bounding boxes. */
  pieces(points: number): Piece[] {
    const out: Piece[] = [];
    for (const loop of this.loops) {
      for (let start = 0; start < loop.length - 2; start += (points - 1) * 2) {
        const run = new Float32Array(loop.slice(start, Math.min(loop.length, start + points * 2)));
        const piece: Piece = { points: run, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
        for (let i = 0; i < run.length; i += 2) {
          piece.x0 = Math.min(piece.x0, run[i]);
          piece.y0 = Math.min(piece.y0, run[i + 1]);
          piece.x1 = Math.max(piece.x1, run[i]);
          piece.y1 = Math.max(piece.y1, run[i + 1]);
        }
        out.push(piece);
      }
    }
    return out;
  }
}

/**
 * Traces the playable blob at block resolution. Block (i, j) averages cells
 * [2i, 2i + 1] x [2j, 2j + 1], so its sample sits at cell coordinates (2i + 1, 2j + 1);
 * with `pad` blocks of margin, traced unit u maps to u * 2 cells. The outermost ring is
 * forced empty so every loop closes, even for a blob touching the border.
 */
function traceArena(out: PathSink, mask: Uint8Array, size: number): void {
  const blocks = Math.ceil(size / ARENA_BLOCK);
  const pad = ARENA_BLUR_RADIUS * ARENA_BLUR_PASSES + 1;
  const n = blocks + pad * 2;
  const field = new Float64Array(n * n);
  const spare = new Float64Array(n * n);
  const share = 1 / (ARENA_BLOCK * ARENA_BLOCK);
  for (let y = 0; y < size; y++) {
    const row = ((y / ARENA_BLOCK) | 0) + pad;
    for (let x = 0; x < size; x++) field[row * n + ((x / ARENA_BLOCK) | 0) + pad] += mask[y * size + x] * share;
  }
  for (let pass = 0; pass < ARENA_BLUR_PASSES; pass++) {
    boxBlur(field, spare, n, 1, n, ARENA_BLUR_RADIUS);
    boxBlur(spare, field, n, n, 1, ARENA_BLUR_RADIUS);
  }
  for (let i = 0; i < n; i++) {
    field[i] = 0;
    field[(n - 1) * n + i] = 0;
    field[i * n] = 0;
    field[i * n + n - 1] = 0;
  }
  new RegionTracer().loops(out, field, n, n, -pad, -pad, ARENA_THRESHOLD);
}

/**
 * Running-sum box blur of an n x n grid along one axis (`step` between taps, `stride`
 * between lines), treating everything off the grid as 0.
 */
function boxBlur(src: Float64Array, dst: Float64Array, n: number, step: number, stride: number, r: number): void {
  const norm = 1 / (2 * r + 1);
  for (let line = 0; line < n; line++) {
    const base = line * stride;
    let sum = 0;
    for (let k = 0; k <= r && k < n; k++) sum += src[base + k * step];
    for (let i = 0; i < n; i++) {
      dst[base + i * step] = sum * norm;
      const add = i + r + 1;
      const drop = i - r;
      if (add < n) sum += src[base + add * step];
      if (drop >= 0) sum -= src[base + drop * step];
    }
  }
}

/**
 * Soft four-point sparkles and dots on the void, in screen space with a slow parallax.
 * One vector path (image patterns are costly to fill where the canvas is rasterised on
 * the CPU), skipping decorations that land on the arena, which the floor would cover.
 */
function drawVoidSparkles(ctx: CanvasRenderingContext2D, camera: Camera, view: SimState): void {
  const ox = -mod(camera.x * camera.scale * VOID_PARALLAX, VOID_TILE);
  const oy = -mod(camera.y * camera.scale * VOID_PARALLAX, VOID_TILE);
  ctx.fillStyle = ARENA.voidPattern;
  ctx.beginPath();
  for (let ty = oy; ty < camera.height; ty += VOID_TILE) {
    for (let tx = ox; tx < camera.width; tx += VOID_TILE) {
      if (onFloor(view, camera, tx + VOID_TILE / 2, ty + VOID_TILE / 2)) continue;
      sparkle(ctx, tx + VOID_TILE * 0.25, ty + VOID_TILE * 0.3, 7);
      circle(ctx, tx + VOID_TILE * 0.75, ty + VOID_TILE * 0.78, 3.2);
      circle(ctx, tx + VOID_TILE * 0.8, ty + VOID_TILE * 0.18, 1.8);
    }
  }
  ctx.fill();
}

/** True when a whole void tile centred on screen point (sx, sy) lies well inside the arena. */
function onFloor(view: SimState, camera: Camera, sx: number, sy: number): boolean {
  const x = Math.floor(camera.worldX(sx));
  const y = Math.floor(camera.worldY(sy));
  // Half a tile plus the rim, in cells, checked at the four corners.
  const r = Math.ceil(VOID_TILE / 2 / camera.scale) + Math.ceil(SIZES.arenaRimDeep);
  return playable(view, x - r, y - r) && playable(view, x + r, y - r) && playable(view, x - r, y + r) && playable(view, x + r, y + r);
}

function playable(view: SimState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < view.size && y < view.size && view.mask[y * view.size + x] === 1;
}

function mod(v: number, m: number): number {
  return ((v % m) + m) % m;
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Faint staggered dots on the visible floor, skipping any too close to the edge. */
function drawFloorDots(ctx: CanvasRenderingContext2D, view: SimState, b: WorldBounds): void {
  const sp = SIZES.floorDotSpacing;
  const r = SIZES.floorDotRadius;
  const { size, mask } = view;
  const gy0 = Math.max(0, Math.floor(b.y0 / sp));
  const gy1 = Math.min(Math.floor((size - 1) / sp), Math.ceil(b.y1 / sp));
  ctx.fillStyle = ARENA.floorAlt;
  ctx.beginPath();
  for (let gy = gy0; gy <= gy1; gy++) {
    const shift = gy % 2 === 0 ? 0 : sp / 2;
    const y = gy * sp + sp / 2;
    const gx0 = Math.max(0, Math.floor((b.x0 - shift) / sp));
    const gx1 = Math.ceil((b.x1 - shift) / sp);
    for (let gx = gx0; gx <= gx1; gx++) {
      const x = gx * sp + shift + sp / 2;
      const cx = x | 0;
      const cy = y | 0;
      if (cx < 3 || cy < 3 || cx >= size - 3 || cy >= size - 3) continue;
      const c = cy * size + cx;
      if (!mask[c] || !mask[c - 3] || !mask[c + 3] || !mask[c - 3 * size] || !mask[c + 3 * size]) continue;
      circle(ctx, x, y, r);
    }
  }
  ctx.fill();
}
