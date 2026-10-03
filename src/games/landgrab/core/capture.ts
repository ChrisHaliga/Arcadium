/**
 * Closing loops (tick order step 8) and the "what would I get" risk preview. A capture
 * claims the trail plus every playable cell that the player's land and trail wall off
 * from the outside.
 */
import { isLiving, markDeath, type TickContext } from './context';
import { captureFeats, leaderSlot } from './feats';
import { cellAt, cx, cy } from './grid';
import { removeTrail } from './land';
import { scratchFor, type CellMarks, type Scratch } from './marks';
import { bandRadius, forEachCellInDisc, PROBE_SPACING } from './trail';
import { collectTreasures } from './treasure';
import type { Player, SimState, Slot } from './types';

/** Slot order; anyone who died earlier this tick (including to an earlier capture) is skipped. */
export function runCaptures(state: SimState, ctx: TickContext): void {
  for (let slot = 1; slot < state.players.length; slot++) {
    if (!isLiving(state, ctx, slot)) continue;
    const p = state.players[slot]!;
    if (p.trail.length > 0 && state.owner[cellAt(state.size, p.x, p.y)] === slot) capture(state, slot, ctx);
  }
}

/**
 * Cells the player would gain by closing the loop now with a straight band from their
 * head back to where their trail left their land: the trail, that band, and everything
 * they enclose. Empty when the player is not out of their land.
 */
export function previewCapture(state: SimState, slot: Slot): number[] {
  const p = state.players[slot];
  if (!p || !p.alive || p.trail.length === 0 || p.trailPath.length < 2) return [];
  if (state.owner[cellAt(state.size, p.x, p.y)] === slot) return [];
  return gainedCells(state, slot, p.trail.concat(bandHome(state, slot, p)));
}

/** Playable cells the player doesn't own under a trail band drawn straight from the head to trailPath's start. */
function bandHome(state: SimState, slot: Slot, p: Player): number[] {
  const { mask, owner, size } = state;
  const { seen } = scratchFor(owner.length);
  seen.clear();
  const cells: number[] = [];
  const dx = p.trailPath[0] - p.x;
  const dy = p.trailPath[1] - p.y;
  const parts = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / PROBE_SPACING));
  const radius = bandRadius(state);
  for (let k = 0; k <= parts; k++) {
    const px = p.x + Math.trunc((dx * k) / parts);
    const py = p.y + Math.trunc((dy * k) / parts);
    forEachCellInDisc(size, px, py, radius, (c) => {
      if (seen.has(c) || mask[c] === 0 || owner[c] === slot) return;
      seen.set(c);
      cells.push(c);
    });
  }
  return cells;
}

function capture(state: SimState, slot: Slot, ctx: TickContext): void {
  const p = state.players[slot]!;
  const trail = p.trail;
  const leader = leaderSlot(state, ctx);
  const cells = gainedCells(state, slot, trail);
  const { gained } = scratchFor(state.owner.length);
  gained.clear();
  const { owner, counts } = state;
  const stolen = new Int32Array(state.players.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const prev = owner[c];
    if (prev !== 0) stolen[prev]++;
    owner[c] = slot;
    gained.set(c);
  }
  for (let other = 1; other < stolen.length; other++) {
    if (stolen[other] === 0) continue;
    counts[other] -= stolen[other];
    ctx.lastCapturer[other] = slot;
  }
  counts[slot] += cells.length;
  removeTrail(state, p);
  ctx.events.push({
    t: 'capture',
    slot,
    cells,
    stolen: stolenBySlot(stolen),
    trailLength: trail.length,
    at: cellAt(state.size, p.x, p.y),
  });
  collectTreasures(state, ctx, slot, gained);
  encloseRivals(state, ctx, slot, gained);
  captureFeats(state, ctx, { slot, gained: cells.length, trail, leader, fromLeader: stolen[leader] });
}

/** Rivals whose head or any trail cell just changed hands are swallowed by the capture. */
function encloseRivals(state: SimState, ctx: TickContext, slot: Slot, gained: CellMarks): void {
  for (let other = 1; other < state.players.length; other++) {
    if (other === slot || !isLiving(state, ctx, other)) continue;
    const q = state.players[other]!;
    if (gained.has(cellAt(state.size, q.x, q.y)) || q.trail.some((c) => gained.has(c))) {
      markDeath(ctx, other, slot, 'enclosed');
    }
  }
}

function stolenBySlot(stolen: Int32Array): { slot: Slot; count: number }[] {
  const out: { slot: Slot; count: number }[] = [];
  for (let slot = 1; slot < stolen.length; slot++) if (stolen[slot] > 0) out.push({ slot, count: stolen[slot] });
  return out;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Cells that become the slot's if its land plus `loop` closes now: loop cells it doesn't
 * own yet and every playable cell they enclose. A flood fill from just outside the
 * bounding box of land ∪ loop, through everything that isn't a wall (own land or a loop
 * cell), finds the outside; whatever playable ground it misses is enclosed.
 */
function gainedCells(state: SimState, slot: Slot, loop: readonly number[]): number[] {
  const scratch = scratchFor(state.owner.length);
  const box = markWalls(state, slot, loop, scratch.loop);
  if (!box) return [];
  fillOutside(state, slot, box, scratch);
  const { size, owner, mask } = state;
  const { outside, found } = scratch;
  let count = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let c = y * size + box.x0, end = y * size + box.x1; c <= end; c++) {
      if (mask[c] === 1 && owner[c] !== slot && !outside.has(c)) found[count++] = c;
    }
  }
  // Sized up front: pushing a big capture's cells one at a time costs several times as much.
  const cells = new Array<number>(count);
  for (let i = 0; i < count; i++) cells[i] = found[i];
  return cells;
}

/**
 * Marks the loop cells and returns the bounding box of land ∪ loop grown by one cell
 * (clamped to the grid; past a clamped side lies off-grid void, which is outside anyway).
 * Null when there is neither land nor loop.
 */
function markWalls(state: SimState, slot: Slot, loop: readonly number[], inLoop: CellMarks): Box | null {
  const { size, owner } = state;
  inLoop.clear();
  let minX = size;
  let minY = size;
  let maxX = -1;
  let maxY = -1;
  for (const c of loop) {
    inLoop.set(c);
    const x = cx(size, c);
    const y = cy(size, c);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  // The land's extent from each row's first and last owned cell: the typed array's own
  // searches run far faster than a loop over every cell of a big territory.
  const first = state.counts[slot] > 0 ? owner.indexOf(slot) : -1;
  if (first >= 0) {
    const lastRow = cy(size, owner.lastIndexOf(slot));
    if (cy(size, first) < minY) minY = cy(size, first);
    if (lastRow > maxY) maxY = lastRow;
    for (let row = cy(size, first); row <= lastRow; row++) {
      const start = row * size;
      const left = owner.indexOf(slot, start);
      // No land on this row: carry on from the row holding the next owned cell.
      if (left >= start + size) {
        row = cy(size, left) - 1;
        continue;
      }
      if (left - start < minX) minX = left - start;
      const right = owner.lastIndexOf(slot, start + size - 1) - start;
      if (right > maxX) maxX = right;
    }
  }
  if (maxX < 0) return null;
  return { x0: Math.max(0, minX - 1), y0: Math.max(0, minY - 1), x1: Math.min(size - 1, maxX + 1), y1: Math.min(size - 1, maxY + 1) };
}

/**
 * Marks in scratch.outside every playable box cell reachable from outside the box or from
 * void without crossing a wall: void counts as outside, so the map edge (or a hole in a
 * hand-made map) never helps close a loop. Rather than flooding the void itself, the
 * fill starts from the open cells on the box border and on the map's rim. It works a
 * horizontal run at a time, and marks each cell when queueing it, so none is queued twice.
 */
function fillOutside(state: SimState, slot: Slot, box: Box, scratch: Scratch): void {
  const { size } = state;
  const { outside, queue } = scratch;
  const { x0, y0, x1, y1 } = box;
  outside.clear();
  let top = queueRuns(state, slot, scratch, y0 * size + x0, y0 * size + x1, 0);
  top = queueRuns(state, slot, scratch, y1 * size + x0, y1 * size + x1, top);
  for (let y = y0 + 1; y < y1; y++) {
    top = queueRuns(state, slot, scratch, y * size + x0, y * size + x0, top);
    top = queueRuns(state, slot, scratch, y * size + x1, y * size + x1, top);
  }
  for (const c of rimOf(state)) {
    const x = c % size;
    if (x >= x0 && x <= x1 && c >= y0 * size && c < (y1 + 1) * size) top = queueRuns(state, slot, scratch, c, c, top);
  }
  while (top > 0) {
    const c = queue[--top];
    const rowStart = c - (c % size);
    const y = rowStart / size;
    let left = c;
    while (left > rowStart + x0 && isOpen(state, slot, scratch, left - 1)) outside.set(--left);
    let right = c;
    while (right < rowStart + x1 && isOpen(state, slot, scratch, right + 1)) outside.set(++right);
    if (y > y0) top = queueRuns(state, slot, scratch, left - size, right - size, top);
    if (y < y1) top = queueRuns(state, slot, scratch, left + size, right + size, top);
  }
}

/**
 * Marks and queues the first cell of every open run among cells from..to of one row; returns
 * the new queue length. A plain function passing `top` along: the fill is the hot loop of
 * every capture and preview, and closures writing to a shared `top` ran it at half speed.
 */
function queueRuns(state: SimState, slot: Slot, scratch: Scratch, from: number, to: number, top: number): number {
  let inRun = false;
  for (let c = from; c <= to; c++) {
    const open = isOpen(state, slot, scratch, c);
    if (open && !inRun) {
      scratch.outside.set(c);
      scratch.queue[top++] = c;
    }
    inRun = open;
  }
  return top;
}

/** A cell the outside fill may enter: playable, not the slot's land or loop, and not reached yet. */
function isOpen(state: SimState, slot: Slot, scratch: Scratch, c: number): boolean {
  return state.mask[c] === 1 && state.owner[c] !== slot && !scratch.loop.has(c) && !scratch.outside.has(c);
}

const rims = new WeakMap<Uint8Array, Int32Array>();

/**
 * Playable cells with a void 4-neighbour or on the grid edge. Cached per mask: a mask is
 * never mutated in place (a new round allocates a new one).
 */
function rimOf(state: SimState): Int32Array {
  const { mask, size } = state;
  let rim = rims.get(mask);
  if (rim) return rim;
  const cells: number[] = [];
  for (let y = 0, c = 0; y < size; y++) {
    for (let x = 0; x < size; x++, c++) {
      if (mask[c] === 0) continue;
      const edge = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (edge || mask[c - 1] === 0 || mask[c + 1] === 0 || mask[c - size] === 0 || mask[c + size] === 0) cells.push(c);
    }
  }
  rim = Int32Array.from(cells);
  rims.set(mask, rim);
  return rim;
}
