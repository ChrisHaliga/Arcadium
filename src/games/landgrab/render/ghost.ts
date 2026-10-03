/**
 * The capture ghost: a soft translucent fill over the area you would capture by closing
 * your loop right now. It is translucent, so it is traced as one path (chunk overlaps
 * would show as darker seams), rebuilt only when the cell set changes.
 */
import { FIELD_ONE, RegionTracer } from './contour';

const GHOST_ALPHA = 0.26;
/** Samples traced beyond the cells' bounding box: the blurred edge stays within it. */
const MARGIN = 2;

export class CaptureGhost {
  private readonly size: number;
  private readonly raster: Uint8Array;
  private cells = new Int32Array(0);
  private count = 0;
  private path: Path2D | null = null;
  private readonly tracer = new RegionTracer();

  constructor(size: number) {
    this.size = size;
    this.raster = new Uint8Array(size * size);
  }

  set(cells: readonly number[] | null): void {
    if (!cells || cells.length === 0) {
      this.clear();
      return;
    }
    if (this.same(cells)) return;
    const { raster, size } = this;
    for (let i = 0; i < this.count; i++) raster[this.cells[i]] = 0;
    if (this.cells.length < cells.length) this.cells = new Int32Array(cells.length * 2);
    let x0 = size;
    let y0 = size;
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      raster[c] = 1;
      this.cells[i] = c;
      const x = c % size;
      const y = (c / size) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    this.count = cells.length;
    const path = new Path2D();
    this.tracer.region(path, raster, size, 1, x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN, FIELD_ONE / 2);
    this.path = path;
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) this.raster[this.cells[i]] = 0;
    this.count = 0;
    this.path = null;
  }

  /** Draws in world space, gently pulsing. */
  draw(ctx: CanvasRenderingContext2D, color: string, clock: number): void {
    if (!this.path) return;
    ctx.globalAlpha = GHOST_ALPHA + 0.07 * Math.sin(clock * 5);
    ctx.fillStyle = color;
    ctx.fill(this.path);
    ctx.globalAlpha = 1;
  }

  private same(cells: readonly number[]): boolean {
    if (cells.length !== this.count) return false;
    for (let i = 0; i < cells.length; i++) if (cells[i] !== this.cells[i]) return false;
    return true;
  }
}
