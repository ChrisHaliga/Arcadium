/**
 * Territory: the owner raster as smooth raised slabs.
 *
 * The renderer keeps its own "displayed" copy of the owner grid and follows the sim's
 * with a twist: land a living player gains is revealed cell by cell, delayed by its
 * distance from that player's head, so a capture (or a spawn) sweeps outward as a wave.
 * Cells that were the player's own trail appear at once, so the trail turns straight
 * into land. Losses (deaths, cleared land) apply immediately. Driving this from the
 * grid rather than from events keeps it right under prediction, snapshots and resyncs.
 */
import { SUB, type SimState } from '../core/types';
import { CHUNK, ContourLayer, FIELD_ONE } from './contour';
import { SIZES, WAVE } from './theme';

/** Slightly under half: neighbouring territories overlap by a hair instead of showing a seam. */
const LAND_THRESHOLD = Math.round(FIELD_ONE * 0.45);
/** Off-screen chunks rebuilt per frame, so they are ready before the camera gets there. */
const OFFSCREEN_REBUILDS = 3;

export interface WorldBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Territory {
  readonly layer: ContourLayer;
  private readonly size: number;
  /** Time (draw's nowMs) at which a pending cell syncs to the sim; 0 = not pending. */
  private readonly revealAt: Float64Array;
  private readonly pending: Int32Array;
  private pendingCount = 0;
  /** The sim's trail grid as of the last sync: gained cells that were your trail skip the wave. */
  private readonly prevTrail: Uint8Array;
  private readonly changed: Int32Array;
  private readonly maxDist: Float64Array;
  private lastTick = -1;
  private lastOwner: Uint8Array | null = null;
  private ownerWords: Uint32Array | null = null;
  private readonly shownWords: Uint32Array | null;

  constructor(size: number, slots: number) {
    this.size = size;
    this.layer = new ContourLayer(size, LAND_THRESHOLD);
    const cells = size * size;
    this.revealAt = new Float64Array(cells);
    this.pending = new Int32Array(cells);
    this.prevTrail = new Uint8Array(cells);
    this.changed = new Int32Array(cells);
    this.maxDist = new Float64Array(slots);
    this.shownWords = cells % 4 === 0 ? new Uint32Array(this.layer.raster.buffer) : null;
  }

  /** Show the sim's land as it is, without waves (first frame, new map). */
  reset(view: SimState): void {
    this.layer.raster.set(view.owner);
    this.prevTrail.set(view.trail);
    this.layer.markAll();
    this.revealAt.fill(0);
    this.pendingCount = 0;
    this.lastTick = view.tick;
    this.lastOwner = view.owner;
  }

  /** Follow the sim: diff when it moved on, reveal due cells. Outlines are rebuilt when drawn. */
  sync(view: SimState, nowMs: number): void {
    if (view.tick !== this.lastTick || view.owner !== this.lastOwner) {
      this.diff(view, nowMs);
      this.prevTrail.set(view.trail);
      this.lastTick = view.tick;
      this.lastOwner = view.owner;
    }
    this.reveal(view, nowMs);
  }

  private diff(view: SimState, nowMs: number): void {
    const count = this.collectChanges(view.owner);
    if (count === 0) return;
    const { changed, revealAt, prevTrail, maxDist, size } = this;
    const owner = view.owner;
    maxDist.fill(0);
    // Pass 1: losses and trail cells apply now; note how far each gainer's wave must reach.
    let waves = 0;
    for (let i = 0; i < count; i++) {
      const c = changed[i];
      const v = owner[c];
      const head = v !== 0 ? view.players[v] : null;
      if (!head || !head.alive || prevTrail[c] === v || v >= maxDist.length) {
        this.layer.set(c, v);
        continue;
      }
      const d = cellDistance(size, c, head.x, head.y);
      if (d > maxDist[v]) maxDist[v] = d;
      changed[waves++] = c;
    }
    // Pass 2: schedule the rest by distance from the gainer's head.
    for (let i = 0; i < waves; i++) {
      const c = changed[i];
      const v = owner[c];
      const head = view.players[v]!;
      const reach = maxDist[v];
      const duration = Math.min(WAVE.maxMs, Math.max(WAVE.minMs, WAVE.baseMs + reach * WAVE.msPerCell));
      // Revealed in WAVE.stepMs steps: each chunk on the front is rebuilt once per step
      // rather than every frame, and the front still advances faster than the sim ticks.
      const delay = reach > 0 ? (cellDistance(size, c, head.x, head.y) / reach) * duration : 0;
      revealAt[c] = nowMs + Math.ceil(delay / WAVE.stepMs) * WAVE.stepMs + 1;
      this.pending[this.pendingCount++] = c;
    }
  }

  /** Lists cells where the sim differs from what is shown and no reveal is already queued. */
  private collectChanges(owner: Uint8Array): number {
    const shown = this.layer.raster;
    const { changed, revealAt } = this;
    let count = 0;
    const words = this.wordsOf(owner);
    if (words && this.shownWords) {
      // Four cells per comparison: most of the grid is unchanged from tick to tick.
      const shownWords = this.shownWords;
      for (let w = 0; w < words.length; w++) {
        if (words[w] === shownWords[w]) continue;
        for (let c = w * 4; c < w * 4 + 4; c++) {
          if (owner[c] !== shown[c] && revealAt[c] === 0) changed[count++] = c;
        }
      }
      return count;
    }
    for (let c = 0; c < owner.length; c++) {
      if (owner[c] !== shown[c] && revealAt[c] === 0) changed[count++] = c;
    }
    return count;
  }

  private wordsOf(owner: Uint8Array): Uint32Array | null {
    if (owner.byteOffset % 4 !== 0 || owner.length % 4 !== 0) return null;
    if (!this.ownerWords || this.ownerWords.buffer !== owner.buffer || this.ownerWords.byteOffset !== owner.byteOffset) {
      this.ownerWords = new Uint32Array(owner.buffer, owner.byteOffset, owner.length / 4);
    }
    return this.ownerWords;
  }

  private reveal(view: SimState, nowMs: number): void {
    const { pending, revealAt } = this;
    for (let i = 0; i < this.pendingCount; ) {
      const c = pending[i];
      if (revealAt[c] > nowMs) {
        i++;
        continue;
      }
      revealAt[c] = 0;
      this.layer.set(c, view.owner[c]);
      pending[i] = pending[--this.pendingCount];
    }
  }

  /**
   * Draws every visible chunk in two passes so slabs stack correctly: all the darker
   * lips first, then all the tops. A lip is a stroke centred half its width below the
   * outline, so it shows under bottom edges (and as a thin side along steep ones) while
   * tops cover the rest; it only shows over the floor or the arena's own edge, like the
   * side of a tile resting on a table. Stroking costs far less fill than a second,
   * offset copy of every slab.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    bounds: WorldBounds,
    lipStyle: (value: number) => string,
    topStyle: (value: number) => string | CanvasPattern,
  ): void {
    const { perSide, shapes } = this.layer;
    const kx0 = clampChunk(Math.floor((bounds.x0 - 1) / CHUNK), perSide);
    const kx1 = clampChunk(Math.floor((bounds.x1 + 1) / CHUNK), perSide);
    const ky0 = clampChunk(Math.floor((bounds.y0 - SIZES.landLip - 1) / CHUNK), perSide);
    const ky1 = clampChunk(Math.floor((bounds.y1 + 1) / CHUNK), perSide);
    this.layer.rebuild(kx0, ky0, kx1, ky1, OFFSCREEN_REBUILDS);

    ctx.save();
    ctx.translate(0, SIZES.landLip / 2);
    ctx.lineWidth = SIZES.landLip;
    ctx.lineJoin = 'round';
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        for (const shape of shapes[ky * perSide + kx]) {
          if (shape.solid) continue;
          ctx.strokeStyle = lipStyle(shape.value);
          ctx.stroke(shape.path);
        }
      }
    }
    ctx.restore();
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        for (const shape of shapes[ky * perSide + kx]) {
          ctx.fillStyle = topStyle(shape.value);
          ctx.fill(shape.path);
        }
      }
    }
  }
}

function clampChunk(k: number, perSide: number): number {
  return k < 0 ? 0 : k >= perSide ? perSide - 1 : k;
}

/** Distance in cells from cell c's centre to a subunit position. */
function cellDistance(size: number, c: number, x: number, y: number): number {
  const dx = (c % size) + 0.5 - x / SUB;
  const dy = ((c / size) | 0) + 0.5 - y / SUB;
  return Math.sqrt(dx * dx + dy * dy);
}
