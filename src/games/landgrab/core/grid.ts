/**
 * Raster addressing. Cells are indexed y * size + x; positions are in subunits (SUB per
 * cell). Anything off the grid behaves exactly like a void cell.
 */
import { SUB, type SimState } from './types';

export function idx(size: number, x: number, y: number): number {
  return y * size + x;
}

export function cx(size: number, i: number): number {
  return i % size;
}

export function cy(size: number, i: number): number {
  return Math.floor(i / size);
}

/** The cell containing the subunit position (x, y), or -1 when it lies off the grid. */
export function cellAt(size: number, x: number, y: number): number {
  const gx = Math.floor(x / SUB);
  const gy = Math.floor(y / SUB);
  return gx < 0 || gy < 0 || gx >= size || gy >= size ? -1 : gy * size + gx;
}

/** Subunit position of a cell's centre along one axis. */
export function cellCentre(v: number): number {
  return v * SUB + SUB / 2;
}

export function isPlayableAt(state: SimState, x: number, y: number): boolean {
  const c = cellAt(state.size, x, y);
  return c >= 0 && state.mask[c] === 1;
}

/** True when some cell within `radius` cells (Euclidean, centre to centre) of cell `centre` is owned by `slot`. */
export function ownsNear(state: SimState, slot: number, centre: number, radius: number): boolean {
  const { size, owner } = state;
  const x0 = cx(size, centre);
  const y0 = cy(size, centre);
  const limit = radius * radius;
  for (let y = Math.max(0, y0 - radius); y <= Math.min(size - 1, y0 + radius); y++) {
    const dy = y - y0;
    for (let x = Math.max(0, x0 - radius); x <= Math.min(size - 1, x0 + radius); x++) {
      const dx = x - x0;
      if (dx * dx + dy * dy <= limit && owner[y * size + x] === slot) return true;
    }
  }
  return false;
}
