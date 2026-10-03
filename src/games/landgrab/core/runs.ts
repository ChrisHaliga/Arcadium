/**
 * Runs of equal cells in a grid, the shape snapshots encode grids in and checksums hash
 * them in. Most of a grid is long runs (open void, big territories), so runs are skipped
 * a whole 32-bit word of cells at a time: a word equals its first cell's value repeated
 * only when all its cells hold that value, whatever the byte order. Grids start on a
 * word boundary, as every grid of a SimState has a buffer of its own.
 */

/** Calls visit(value, length) for each run of equal cells, in order. */
export function forEachRun(grid: Uint8Array | Uint16Array, visit: (value: number, length: number) => void): void {
  const n = grid.length;
  // Cells per word, as a shift: 4 bytes or 2 uint16s.
  const shift = grid.BYTES_PER_ELEMENT === 1 ? 2 : 1;
  const inWord = (1 << shift) - 1;
  const repeat = shift === 2 ? 0x01010101 : 0x00010001;
  const words = new Uint32Array(grid.buffer, grid.byteOffset, n >> shift);
  for (let start = 0; start < n; ) {
    const value = grid[start];
    let end = start + 1;
    while (end < n && (end & inWord) !== 0 && grid[end] === value) end++;
    if ((end & inWord) === 0) {
      const whole = Math.imul(value, repeat) >>> 0;
      let w = end >> shift;
      while (w < words.length && words[w] === whole) w++;
      end = w << shift;
      while (end < n && grid[end] === value) end++;
    }
    visit(value, end - start);
    start = end;
  }
}
