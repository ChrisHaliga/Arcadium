/** Treasure: bobbing faceted gems with a warm glow and a twinkling glint. */
import { TAU } from './geometry';
import { softSprite } from './sprites';
import { ARENA, SIZES } from './theme';

const FACET_LIGHT = '#fff1a6';
const FACET_DARK = '#e0a100';
const GEM_SHADOW = 'rgba(27, 20, 64, 0.2)';

export function drawGems(ctx: CanvasRenderingContext2D, treasure: readonly number[], size: number, clock: number): void {
  const s = SIZES.gem;
  for (let i = 0; i < treasure.length; i++) {
    const cell = treasure[i];
    const x = (cell % size) + 0.5;
    const y = ((cell / size) | 0) + 0.5;
    const t = clock * 2.6 + i * 1.3;
    const bob = Math.sin(t) * 0.35;

    ctx.globalAlpha = 0.5 + 0.15 * Math.sin(t * 1.4);
    const g = s * 2.2;
    ctx.drawImage(softSprite(ARENA.treasure), x - g, y - g, g * 2, g * 2);
    ctx.globalAlpha = 1;

    ctx.fillStyle = GEM_SHADOW;
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.62, s * (0.45 - bob * 0.05), s * 0.14, 0, 0, TAU);
    ctx.fill();

    const top = y - s * 0.5 + bob;
    const girdle = y - s * 0.12 + bob;
    const tip = y + s * 0.55 + bob;
    // Pavilion (lower half): two facets, the right one in shade.
    ctx.fillStyle = ARENA.treasure;
    tri(ctx, x - s * 0.5, girdle, x, girdle, x, tip);
    ctx.fillStyle = FACET_DARK;
    tri(ctx, x, girdle, x + s * 0.5, girdle, x, tip);
    // Crown (upper half): a light table between darker sides.
    ctx.fillStyle = FACET_LIGHT;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.28, top);
    ctx.lineTo(x + s * 0.28, top);
    ctx.lineTo(x + s * 0.5, girdle);
    ctx.lineTo(x - s * 0.5, girdle);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = ARENA.treasure;
    tri(ctx, x + s * 0.28, top, x + s * 0.5, girdle, x + s * 0.12, girdle);

    const tw = Math.max(0, Math.sin(t * 1.9));
    if (tw > 0.1) {
      ctx.globalAlpha = tw;
      ctx.fillStyle = '#ffffff';
      sparkle(ctx, x - s * 0.18, top + s * 0.12, s * 0.32 * tw);
      ctx.globalAlpha = 1;
    }
  }
}

function tri(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}
