/**
 * Trails: one smooth thick curve per player through trailPath (one point per tick) and
 * on to the interpolated head, stroked as an owner-coloured edge around a light core.
 * Longer trails glow hotter (risk), and trail cosmetics decorate the line and emit
 * particles from the head.
 */
import { SUB, type Player } from '../core/types';
import { mix, RAINBOW } from './colors';
import { clamp, TAU } from './geometry';
import type { Look } from './looks';
import { SHAPE, type Particles } from './particles';
import { FX_COLORS, SIZES, TRAIL_HEAT } from './theme';

/** Heat glow colours from warm to hot, precomputed so frames only index them. */
const HEAT_STEPS = 8;
const HEAT_COLORS: readonly string[] = Array.from({ length: HEAT_STEPS }, (_, i) =>
  mix(FX_COLORS.heatWarm, FX_COLORS.heatHot, i / (HEAT_STEPS - 1)),
);

/** Particles per second each trail cosmetic emits. */
const EMIT_RATE = { plain: 0, sparkle: 14, bubbles: 9, glitter: 22, comet: 34, fire: 42, rainbow: 10 } as const;
/** Glitter flecks twinkle in this many groups, each one path, so a long trail costs a few fills. */
const GLITTER_GROUPS = 3;

export class Trails {
  /** Fractional particles owed per slot, so emission is smooth at any frame rate. */
  private readonly owed: Float64Array;

  constructor(slots: number) {
    this.owed = new Float64Array(slots);
  }

  /** Strokes one player's trail. Assumes trailPath has at least one point. */
  draw(ctx: CanvasRenderingContext2D, p: Player, look: Look, hx: number, hy: number, clock: number): void {
    const path = p.trailPath;
    const points = path.length / 2;
    const heat = clamp((points - TRAIL_HEAT.start) / (TRAIL_HEAT.full - TRAIL_HEAT.start), 0, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    tracePath(ctx, path, 0, points, hx, hy);

    if (heat > 0) {
      // Risk: an opaque rim (translucent ones turn muddy over land) that warms from gold
      // to red, widens and throbs faster the longer you stay out.
      const pulse = 0.5 + 0.5 * Math.sin(clock * (4 + heat * 10));
      ctx.strokeStyle = HEAT_COLORS[Math.round(heat * (HEAT_STEPS - 1))];
      ctx.lineWidth = SIZES.trailEdge + 0.5 + heat * (1 + 0.6 * pulse);
      ctx.stroke();
    }
    ctx.strokeStyle = look.trailEdge;
    ctx.lineWidth = SIZES.trailEdge;
    ctx.stroke();

    if (look.trail === 'rainbow') {
      drawRainbowCore(ctx, path, points, hx, hy, clock);
    } else {
      ctx.strokeStyle = look.trailCore;
      ctx.lineWidth = SIZES.trailCore;
      ctx.stroke();
    }
    decorate(ctx, look, path, points, hx, hy, clock);
  }

  /** Emits the trail cosmetic's particles around the head and the newest part of the trail. */
  emit(particles: Particles, slot: number, p: Player, look: Look, hx: number, hy: number, dt: number): void {
    const rate = EMIT_RATE[look.trail];
    if (rate === 0 || p.trailPath.length < 2) {
      this.owed[slot] = 0;
      return;
    }
    this.owed[slot] += rate * dt;
    const path = p.trailPath;
    const points = path.length / 2;
    while (this.owed[slot] >= 1) {
      this.owed[slot] -= 1;
      // Somewhere along the last few points, so emission keeps up with the head.
      const back = Math.min(points - 1, (Math.random() * 6) | 0);
      const k = points - 1 - back;
      const t = Math.random();
      const x = back === 0 ? hx + (path[k * 2] / SUB - hx) * t : path[k * 2] / SUB;
      const y = back === 0 ? hy + (path[k * 2 + 1] / SUB - hy) * t : path[k * 2 + 1] / SUB;
      spawnTrailParticle(particles, look, x, y);
    }
  }
}

/**
 * Builds the smooth curve: straight to the first midpoint, then quadratic curves through
 * each point to the next midpoint, ending at the head. Points are one tick apart and turn
 * at most ~14 degrees per tick, so this reads as one continuous curve.
 */
function tracePath(ctx: CanvasRenderingContext2D, path: readonly number[], from: number, to: number, hx: number, hy: number): void {
  ctx.beginPath();
  ctx.moveTo(path[from * 2] / SUB, path[from * 2 + 1] / SUB);
  for (let i = from + 1; i < to; i++) {
    const x = path[i * 2] / SUB;
    const y = path[i * 2 + 1] / SUB;
    const nx = i + 1 < to ? path[i * 2 + 2] / SUB : hx;
    const ny = i + 1 < to ? path[i * 2 + 3] / SUB : hy;
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  ctx.lineTo(hx, hy);
}

/** Rainbow Road: the core cycles through hues in bands that slide toward the head. */
function drawRainbowCore(ctx: CanvasRenderingContext2D, path: readonly number[], points: number, hx: number, hy: number, clock: number): void {
  const band = 4;
  ctx.lineWidth = SIZES.trailCore;
  const shift = Math.floor(clock * 8);
  for (let from = 0; from < points; from += band) {
    const to = Math.min(points, from + band + 1);
    tracePath(ctx, path, from, to, to === points ? hx : path[(to - 1) * 2] / SUB, to === points ? hy : path[(to - 1) * 2 + 1] / SUB);
    ctx.strokeStyle = RAINBOW[(((from / band) | 0) - shift + 1200) % RAINBOW.length];
    ctx.stroke();
  }
}

/** Static decorations along the line for the cosmetic trails. */
function decorate(ctx: CanvasRenderingContext2D, look: Look, path: readonly number[], points: number, hx: number, hy: number, clock: number): void {
  switch (look.trail) {
    case 'sparkle': {
      ctx.fillStyle = '#ffffff';
      for (let i = 1; i < points; i += 3) {
        const tw = 0.5 + 0.5 * Math.sin(clock * 7 + i * 1.7);
        if (tw < 0.25) continue;
        ctx.globalAlpha = tw;
        star(ctx, path[i * 2] / SUB, path[i * 2 + 1] / SUB, 0.55 + tw * 0.55, clock + i);
      }
      ctx.globalAlpha = 1;
      return;
    }
    case 'bubbles': {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.22;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (let i = 2; i < points; i += 4) {
        const r = 0.45 + 0.25 * Math.sin(clock * 3 + i);
        const x = path[i * 2] / SUB + Math.sin(i * 2.3) * 0.7;
        const y = path[i * 2 + 1] / SUB + Math.cos(i * 1.9) * 0.7;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    case 'glitter': {
      // Round flecks scattered over the line, each group twinkling in its own beat.
      ctx.fillStyle = '#ffffff';
      for (let g = 0; g < GLITTER_GROUPS; g++) {
        ctx.globalAlpha = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(clock * 5 + g * 2.1));
        ctx.beginPath();
        for (let i = 1 + g * 2; i < points; i += GLITTER_GROUPS * 2) {
          const r = 0.2 + 0.1 * ((i * 7) % 3);
          const x = path[i * 2] / SUB + (((i * 37) % 7) - 3) * 0.4;
          const y = path[i * 2 + 1] / SUB + (((i * 53) % 7) - 3) * 0.4;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    case 'comet': {
      // A white-hot core over the newest stretch, fading toward the tail.
      const from = Math.max(0, points - 16);
      tracePath(ctx, path, from, points, hx, hy);
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = SIZES.trailCore * 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    default:
      return;
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot: number): void {
  const c = Math.cos(rot) * s;
  const n = Math.sin(rot) * s;
  ctx.beginPath();
  ctx.moveTo(x + c, y + n);
  ctx.quadraticCurveTo(x, y, x - n, y + c);
  ctx.quadraticCurveTo(x, y, x - c, y - n);
  ctx.quadraticCurveTo(x, y, x + n, y - c);
  ctx.quadraticCurveTo(x, y, x + c, y + n);
  ctx.fill();
}

/** Random offset in (-1.2, 1.2) cells. */
function j(): number {
  return (Math.random() - 0.5) * 2.4;
}

function spawnTrailParticle(particles: Particles, look: Look, x: number, y: number): void {
  switch (look.trail) {
    case 'sparkle': {
      const i = particles.spawn(SHAPE.star, x + j(), y + j(), 0, -1.5, 0.7, 1.1, 0, Math.random() < 0.5 ? '#ffffff' : look.color.light);
      particles.spin[i] = 3;
      return;
    }
    case 'bubbles': {
      const i = particles.spawn(SHAPE.bubble, x + j(), y + j(), j(), -2.5 + j(), 1.2, 0.35, 1.3, look.color.light);
      particles.width[i] = 0.2;
      return;
    }
    case 'glitter': {
      // Flecks that drift down and shrink away, in white and the player's colours.
      const pick = Math.random();
      const color = pick < 0.45 ? '#ffffff' : pick < 0.75 ? look.color.light : look.color.base;
      const i = particles.spawn(SHAPE.dot, x + j(), y + j(), j() * 0.8, j() * 0.8, 0.9, 0.3 + Math.random() * 0.3, 0, color);
      particles.gravity[i] = 3;
      particles.drag[i] = 1.5;
      return;
    }
    case 'comet': {
      const i = particles.spawn(SHAPE.puff, x + j() * 0.5, y + j() * 0.5, j(), j(), 0.5, 1.5, 0.2, Math.random() < 0.6 ? look.color.light : '#ffffff');
      particles.alpha[i] = 0.8;
      return;
    }
    case 'fire': {
      const i = particles.spawn(SHAPE.flame, x + j() * 0.7, y + j() * 0.7, j() * 0.8, -5 - Math.random() * 3, 0.55, 1.7, 0.4, '');
      particles.alpha[i] = 0.9;
      return;
    }
    case 'rainbow': {
      const i = particles.spawn(SHAPE.star, x + j(), y + j(), 0, -1, 0.6, 0.9, 0, RAINBOW[(Math.random() * RAINBOW.length) | 0]);
      particles.spin[i] = 4;
      return;
    }
    default:
      return;
  }
}
