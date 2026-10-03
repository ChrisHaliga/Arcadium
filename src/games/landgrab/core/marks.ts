/**
 * Reusable per-cell scratch space for flood fills. Captures and previews run often on a
 * 230k-cell raster, so they borrow these buffers instead of allocating and clearing fresh
 * arrays each time. Nothing here is simulation state.
 */

/** Per-cell flags that clear in O(1): a cell is marked when its stamp equals the current generation. */
export class CellMarks {
  private readonly stamps: Uint32Array;
  private gen = 1;

  constructor(cells: number) {
    this.stamps = new Uint32Array(cells);
  }

  clear(): void {
    this.gen++;
    if (this.gen === 0xffffffff) {
      this.stamps.fill(0);
      this.gen = 1;
    }
  }

  set(i: number): void {
    this.stamps[i] = this.gen;
  }

  has(i: number): boolean {
    return this.stamps[i] === this.gen;
  }
}

export interface Scratch {
  /** Cells treated as already owned while computing a capture (trail, plus the band home for previews). */
  loop: CellMarks;
  /** Cells the enclosure flood fill reached from outside. */
  outside: CellMarks;
  /** Cells that changed hands in the capture being applied. */
  gained: CellMarks;
  /** Cells already collected for a preview's band home. */
  seen: CellMarks;
  /** Work list for flood fills; every cell enters at most once per run. */
  queue: Int32Array;
  /** The cells a capture or preview gains, gathered before they are copied out into an array of the right size. */
  found: Int32Array;
}

const byCellCount = new Map<number, Scratch>();

/** Scratch buffers for grids of `cells` cells. Callers must not hold them across calls to other core functions. */
export function scratchFor(cells: number): Scratch {
  let s = byCellCount.get(cells);
  if (!s) {
    s = {
      loop: new CellMarks(cells),
      outside: new CellMarks(cells),
      gained: new CellMarks(cells),
      seen: new CellMarks(cells),
      queue: new Int32Array(cells),
      found: new Int32Array(cells),
    };
    byCellCount.set(cells, s);
  }
  return s;
}
