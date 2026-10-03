/**
 * Small pre-rendered images reused every frame: soft glows (radial gradients are costly
 * to build per draw) and the coin. Cached per colour; colours come from fixed palettes,
 * so the caches stay small.
 */
import { rgba } from './colors';
import { FX_COLORS } from './theme';

const SOFT_PX = 64;
const softCache = new Map<string, HTMLCanvasElement>();

/** A soft round glow: the colour at the centre fading to transparent at the edge. */
export function softSprite(color: string): HTMLCanvasElement {
  let sprite = softCache.get(color);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = SOFT_PX;
  const ctx = sprite.getContext('2d')!;
  const r = SOFT_PX / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  const solid = color.startsWith('#') ? color : '#ffffff';
  g.addColorStop(0, rgba(solid, 1));
  g.addColorStop(0.35, rgba(solid, 0.55));
  g.addColorStop(1, rgba(solid, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SOFT_PX, SOFT_PX);
  softCache.set(color, sprite);
  return sprite;
}

const COIN_PX = 48;
let coin: HTMLCanvasElement | null = null;

/** A shiny gold coin with a rim and a star stamp, COIN_PX square. */
export function coinSprite(): HTMLCanvasElement {
  if (coin) return coin;
  coin = document.createElement('canvas');
  coin.width = coin.height = COIN_PX;
  const ctx = coin.getContext('2d')!;
  const r = COIN_PX / 2;
  ctx.translate(r, r);
  ctx.fillStyle = FX_COLORS.coinRim;
  ctx.beginPath();
  ctx.arc(0, 1.5, r - 1.5, 0, Math.PI * 2);
  ctx.fill();
  const face = ctx.createLinearGradient(0, -r, 0, r);
  face.addColorStop(0, FX_COLORS.coinShine);
  face.addColorStop(0.45, FX_COLORS.coin);
  face.addColorStop(1, FX_COLORS.coinRim);
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(0, -0.5, r - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = FX_COLORS.coinRim;
  ctx.globalAlpha = 0.55;
  star(ctx, 0, 0, r * 0.45, r * 0.2);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.18, r * 0.1, -0.7, 0, Math.PI * 2);
  ctx.fill();
  return coin;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number): void {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? outer : inner;
    if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}
