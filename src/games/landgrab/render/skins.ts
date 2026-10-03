/**
 * Skin cosmetics: one painter per style, used for the seamless territory pattern tiles
 * and for the head sprites, so a player's land and head always match.
 */
import type { CosmeticDef } from '../../../shared/services';
import type { PlayerColor } from '../palette';
import { mix, rgba } from './colors';
import { FX_COLORS } from './theme';

export type SkinStyleName = 'solid' | 'stripes' | 'dots' | 'checker' | 'gradient' | 'glow' | 'galaxy';

export interface SkinStyle {
  name: SkinStyleName;
  /** Gradient end colour (gradient). */
  to: string;
  /** Optional middle colour (gradient). */
  via: string | null;
}

const SKIN_NAMES: readonly SkinStyleName[] = ['solid', 'stripes', 'dots', 'checker', 'gradient', 'glow', 'galaxy'];

export function skinStyle(def: CosmeticDef | undefined, color: PlayerColor): SkinStyle {
  const name = SKIN_NAMES.find((s) => s === def?.style) ?? 'solid';
  const param = (key: string) => (typeof def?.params?.[key] === 'string' ? (def.params[key] as string) : null);
  return { name, to: param('to') ?? color.light, via: param('via') };
}

/** Repeat length of each style's pattern, in cells (also the pattern tile size). */
const PERIOD: Record<SkinStyleName, number> = {
  solid: 1,
  stripes: 7,
  dots: 7,
  checker: 10,
  gradient: 48,
  glow: 8,
  galaxy: 36,
};

/** Tile resolution, pixels per cell: smooth styles need fewer. */
const TILE_RES: Record<SkinStyleName, number> = {
  solid: 1,
  stripes: 10,
  dots: 10,
  checker: 10,
  gradient: 3,
  glow: 10,
  galaxy: 8,
};

/**
 * Territory fill for a skin: the plain base colour for solid, otherwise a pattern whose
 * transform maps one tile pixel to 1 / TILE_RES cells, so it lines up in world space
 * across every chunk and every frame.
 */
export function landFill(ctx: CanvasRenderingContext2D, skin: SkinStyle, color: PlayerColor): string | CanvasPattern {
  if (skin.name === 'solid') return color.base;
  const res = TILE_RES[skin.name];
  const period = PERIOD[skin.name];
  const tile = document.createElement('canvas');
  tile.width = tile.height = Math.round(period * res);
  const tctx = tile.getContext('2d')!;
  tctx.scale(res, res);
  paintSkin(tctx, skin, color, period, period, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return color.base;
  pattern.setTransform(new DOMMatrix([1 / res, 0, 0, 1 / res, 0, 0]));
  return pattern;
}

/**
 * Paints a skin over [0, w] x [0, h] in cell units. Every style repeats seamlessly with
 * period PERIOD[style] when w and h are that period. `seed` varies the random styles.
 */
export function paintSkin(
  ctx: CanvasRenderingContext2D,
  skin: SkinStyle,
  color: PlayerColor,
  w: number,
  h: number,
  seed: number,
): void {
  switch (skin.name) {
    case 'solid':
      fill(ctx, color.base, w, h);
      return;
    case 'stripes':
      paintStripes(ctx, color, w, h);
      return;
    case 'dots':
      paintDots(ctx, color, w, h);
      return;
    case 'checker':
      paintChecker(ctx, color, w, h);
      return;
    case 'gradient':
      paintGradient(ctx, skin, color, w, h);
      return;
    case 'glow':
      paintNeon(ctx, color, w, h);
      return;
    case 'galaxy':
      paintGalaxy(ctx, color, w, h, seed);
      return;
  }
}

function fill(ctx: CanvasRenderingContext2D, style: string | CanvasGradient, w: number, h: number): void {
  ctx.fillStyle = style;
  ctx.fillRect(0, 0, w, h);
}

/** 45 degree bands; copies one period either side cover the tile corners. */
function paintStripes(ctx: CanvasRenderingContext2D, color: PlayerColor, w: number, h: number): void {
  const p = PERIOD.stripes;
  fill(ctx, color.base, w, h);
  ctx.strokeStyle = mix(color.base, color.light, 0.75);
  ctx.lineWidth = p * 0.32;
  ctx.beginPath();
  for (let k = -Math.ceil(h / p) - 1; k <= Math.ceil(w / p) + 1; k++) {
    ctx.moveTo(k * p, h + p);
    ctx.lineTo(k * p + h + 2 * p, -p);
  }
  ctx.stroke();
}

function paintDots(ctx: CanvasRenderingContext2D, color: PlayerColor, w: number, h: number): void {
  const p = PERIOD.dots;
  fill(ctx, color.base, w, h);
  ctx.fillStyle = mix(color.base, color.light, 0.85);
  ctx.beginPath();
  for (let y = 0; y < h + p; y += p) {
    for (let x = 0; x < w + p; x += p) {
      dot(ctx, x + p * 0.25, y + p * 0.25, p * 0.16);
      dot(ctx, x + p * 0.75, y + p * 0.75, p * 0.16);
    }
  }
  ctx.fill();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Soft rounded tiles rather than hard squares, so the skin reads as a print, not as pixels. */
function paintChecker(ctx: CanvasRenderingContext2D, color: PlayerColor, w: number, h: number): void {
  const p = PERIOD.checker;
  const q = p / 2;
  fill(ctx, color.base, w, h);
  ctx.fillStyle = mix(color.base, color.light, 0.7);
  ctx.beginPath();
  for (let y = 0; y < h; y += p) {
    for (let x = 0; x < w; x += p) {
      roundedSquare(ctx, x + q * 0.08, y + q * 0.08, q * 0.84, q * 0.25);
      roundedSquare(ctx, x + q * 1.08, y + q * 1.08, q * 0.84, q * 0.25);
    }
  }
  ctx.fill();
}

function roundedSquare(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y, x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r);
  ctx.arcTo(x, y, x + s, y, r);
  ctx.closePath();
}

/**
 * Diagonal gradient that repeats every period along both axes: the gradient runs over
 * x + y in [0, 2 * period] and its stops repeat twice, so opposite tile edges match.
 */
function paintGradient(ctx: CanvasRenderingContext2D, skin: SkinStyle, color: PlayerColor, w: number, h: number): void {
  const p = PERIOD.gradient;
  const g = ctx.createLinearGradient(0, 0, p, p);
  const stops = skin.via ? [color.base, skin.via, skin.to, skin.via] : [color.base, skin.to];
  const n = stops.length * 2;
  for (let i = 0; i <= n; i++) g.addColorStop(i / n, stops[i % stops.length]);
  for (let y = 0; y < h; y += p) {
    for (let x = 0; x < w; x += p) {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, Math.min(p, w - x), Math.min(p, h - y));
      ctx.restore();
    }
  }
}

/** Neon: a deep version of the colour with a glowing diamond lattice. */
function paintNeon(ctx: CanvasRenderingContext2D, color: PlayerColor, w: number, h: number): void {
  const p = PERIOD.glow;
  fill(ctx, mix(color.dark, '#120a30', 0.35), w, h);
  ctx.save();
  ctx.shadowColor = color.light;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color.light;
  ctx.lineWidth = 0.38;
  ctx.beginPath();
  for (let k = -Math.ceil(h / p) - 1; k <= Math.ceil(w / p) + 1; k++) {
    ctx.moveTo(k * p, h + p);
    ctx.lineTo(k * p + h + 2 * p, -p);
    ctx.moveTo(k * p, -p);
    ctx.lineTo(k * p + h + 2 * p, h + p);
  }
  ctx.stroke();
  ctx.restore();
}

/** Night sky tinted with the player's colour: nebula clouds plus stars, wrapped at the tile edges. */
function paintGalaxy(ctx: CanvasRenderingContext2D, color: PlayerColor, w: number, h: number, seed: number): void {
  fill(ctx, mix(FX_COLORS.galaxyBase, color.dark, 0.3), w, h);
  const rand = seededRandom(seed * 7919 + 17);
  const clouds = [color.base, '#9b3dff', color.light, '#1fb4ff'];
  for (let i = 0; i < 7; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = (0.18 + rand() * 0.22) * Math.min(w, h);
    const tint = clouds[i % clouds.length];
    forWrapped(w, h, x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, rgba(tint, 0.42));
      g.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  const stars = Math.round(w * h * 0.09);
  for (let i = 0; i < stars; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 0.07 + rand() * rand() * 0.32;
    ctx.globalAlpha = 0.55 + rand() * 0.45;
    ctx.fillStyle = rand() < 0.3 ? color.light : '#ffffff';
    forWrapped(w, h, x, y, r, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.globalAlpha = 1;
}

/** Calls draw at (x, y) and at every copy shifted by the tile size that still overlaps the tile. */
function forWrapped(w: number, h: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const px = x + ox * w;
      const py = y + oy * h;
      if (px + r < 0 || py + r < 0 || px - r > w || py - r > h) continue;
      draw(px, py);
    }
  }
}

/** mulberry32: decorative randomness that looks the same every time a tile is rebuilt. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
