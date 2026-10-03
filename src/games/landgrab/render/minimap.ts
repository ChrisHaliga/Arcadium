/**
 * Minimap: the arena and everyone's land sampled into a small image, smoothed when scaled
 * up, with heads as dots and your own marked. Sampling the raster is by far the costliest
 * part, so the image is only redone when land changed hands (which always moves someone's
 * cell count), and then at most a few times a second.
 */
import { SUB, type SimState } from '../core/types';
import { playerColor } from '../palette';
import { parseHex, type Rgb } from './colors';
import type { DrawMinimap } from './contract';
import { TAU } from './geometry';
import { ARENA } from './theme';

/** Pixels across the minimap image (~3.3 cells each on the default map). */
const RES = 144;
/** Samples per pixel along each axis: averaged, so edges come out smooth rather than pixelated. */
const SUPER = 2;
/** Fewest sim ticks between two refreshes of the land image (4 = five times a second). */
const REFRESH_TICKS = 4;

interface MinimapCache {
  canvas: HTMLCanvasElement;
  image: ImageData;
  /** Colour components per raster value: 0 = floor, slot = that player's land. */
  red: Uint8Array;
  green: Uint8Array;
  blue: Uint8Array;
  /** The tick, map and cell counts the image was sampled at. */
  tick: number;
  mask: Uint8Array | null;
  counts: Int32Array;
}

const caches = new WeakMap<CanvasRenderingContext2D, MinimapCache>();
const FLOOR_ALPHA = 235;

export const drawMinimap: DrawMinimap = (ctx, view, mySlot, width, height) => {
  const cache = cacheFor(ctx);
  if (cache.mask !== view.mask || (Math.abs(view.tick - cache.tick) >= REFRESH_TICKS && !sameCounts(cache.counts, view.counts))) {
    refresh(cache, view);
  }

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const side = Math.min(width, height);
  const ox = (width - side) / 2;
  const oy = (height - side) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cache.canvas, ox, oy, side, side);

  const k = side / (view.size * SUB);
  for (let s = 1; s < view.players.length; s++) {
    const p = view.players[s];
    if (!p || !p.alive || s === mySlot) continue;
    ctx.fillStyle = playerColor(p.profile.kind, p.profile.color).dark;
    ctx.beginPath();
    ctx.arc(ox + p.x * k, oy + p.y * k, Math.max(1.5, side * 0.013), 0, TAU);
    ctx.fill();
  }
  const me = view.players[mySlot];
  if (me && me.alive) {
    const x = ox + me.x * k;
    const y = oy + me.y * k;
    const r = Math.max(2.5, side * 0.024);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = playerColor(me.profile.kind, me.profile.color).base;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
};

function cacheFor(ctx: CanvasRenderingContext2D): MinimapCache {
  let cache = caches.get(ctx);
  if (!cache) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = RES;
    cache = {
      canvas,
      image: new ImageData(RES, RES),
      red: new Uint8Array(256),
      green: new Uint8Array(256),
      blue: new Uint8Array(256),
      tick: 0,
      mask: null,
      counts: new Int32Array(0),
    };
    caches.set(ctx, cache);
  }
  return cache;
}

function refresh(cache: MinimapCache, view: SimState): void {
  const { red, green, blue, image } = cache;
  setColor(cache, 0, ARENA.floor);
  for (let s = 1; s < view.players.length && s < red.length; s++) {
    const p = view.players[s];
    setColor(cache, s, p ? playerColor(p.profile.kind, p.profile.color).base : ARENA.floor);
  }
  const { size, mask, owner } = view;
  const data = image.data;
  const step = size / (RES * SUPER);
  const samples = SUPER * SUPER;
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      // Alpha-weighted average, so void samples soften the edge without darkening it.
      let r = 0;
      let g = 0;
      let b = 0;
      let inside = 0;
      for (let sy = 0; sy < SUPER; sy++) {
        const cy = Math.min(size - 1, Math.floor((j * SUPER + sy + 0.5) * step));
        for (let sx = 0; sx < SUPER; sx++) {
          const c = cy * size + Math.min(size - 1, Math.floor((i * SUPER + sx + 0.5) * step));
          if (mask[c] === 0) continue;
          const v = owner[c];
          r += red[v];
          g += green[v];
          b += blue[v];
          inside++;
        }
      }
      const o = (j * RES + i) * 4;
      data[o] = inside ? r / inside : 0;
      data[o + 1] = inside ? g / inside : 0;
      data[o + 2] = inside ? b / inside : 0;
      data[o + 3] = (inside * FLOOR_ALPHA) / samples;
    }
  }
  cache.canvas.getContext('2d')!.putImageData(image, 0, 0);
  cache.tick = view.tick;
  cache.mask = view.mask;
  if (cache.counts.length !== view.counts.length) cache.counts = new Int32Array(view.counts.length);
  cache.counts.set(view.counts);
}

function sameCounts(a: Int32Array, b: Int32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function setColor(cache: MinimapCache, v: number, hex: string): void {
  const [r, g, b] = rgbOf(hex);
  cache.red[v] = r;
  cache.green[v] = g;
  cache.blue[v] = b;
}

const parsed = new Map<string, Rgb>();

/** Palette colours parsed once each. */
function rgbOf(hex: string): Rgb {
  let rgb = parsed.get(hex);
  if (!rgb) {
    rgb = parseHex(hex);
    parsed.set(hex, rgb);
  }
  return rgb;
}
