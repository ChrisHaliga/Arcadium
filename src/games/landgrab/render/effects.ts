/**
 * One-shot effects for confirmed events: capture cosmetics, kill cosmetics, death pops
 * with the trail fading away, treasure sparkles and spawn rings. Most become particles;
 * the few with custom drawing (lightning, black holes, fading trails, popping heads) live
 * in small lists here. Everything is in world (cell) space.
 */
import { clamp, easeOutCubic, TAU } from './geometry';
import { headPath, type CaptureStyle, type KillStyle, type Look } from './looks';
import { SHAPE, type Particles } from './particles';
import { softSprite } from './sprites';
import { ARENA, FX_COLORS, SIZES, WAVE } from './theme';

interface Bolt {
  points: Float32Array;
  age: number;
  life: number;
}

interface Hole {
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
}

interface Ghost {
  /** Trail points in cells, x/y pairs. */
  points: Float32Array;
  color: string;
  core: string;
  age: number;
  life: number;
}

interface Pop {
  x: number;
  y: number;
  angle: number;
  size: number;
  color: string;
  age: number;
}

interface Firework {
  x: number;
  y: number;
  delay: number;
  color: string;
}

const POP_SECONDS = 0.32;
const GHOST_SECONDS = 0.5;

export class Effects {
  private readonly bolts: Bolt[] = [];
  private readonly holes: Hole[] = [];
  private readonly ghosts: Ghost[] = [];
  private readonly pops: Pop[] = [];
  private readonly fireworks: Firework[] = [];

  constructor(private readonly particles: Particles) {}

  clear(): void {
    this.bolts.length = 0;
    this.holes.length = 0;
    this.ghosts.length = 0;
    this.pops.length = 0;
    this.fireworks.length = 0;
    this.particles.clear();
  }

  /**
   * The capture cosmetic, from the cell where the loop closed. `reach` is how far the
   * captured area extends from there (cells); `sample` picks captured cells for effects
   * that land around the area.
   */
  capture(style: CaptureStyle, look: Look, x: number, y: number, reach: number, sample: () => [number, number]): void {
    const P = this.particles;
    const { light, base } = look.color;
    switch (style) {
      case 'wave': {
        // A bright rim racing out with the land reveal, a softer one behind it.
        const life = Math.min(WAVE.maxMs, Math.max(WAVE.minMs, WAVE.baseMs + reach * WAVE.msPerCell)) / 1000;
        let i = P.spawn(SHAPE.ring, x, y, 0, 0, life + 0.12, 1, reach + 2, '#ffffff');
        P.width[i] = 3;
        P.alpha[i] = 0.85;
        i = P.spawn(SHAPE.ring, x, y, 0, 0, life + 0.3, 1, reach * 0.8 + 2, light);
        P.width[i] = 2.2;
        P.alpha[i] = 0.7;
        P.burst(SHAPE.star, 12, x, y, 9, 20, 0.7, 1.5, '#ffffff');
        return;
      }
      case 'ripple': {
        const r = Math.min(reach + 10, 54);
        for (let k = 0; k < 3; k++) {
          const i = P.spawn(SHAPE.ring, x, y, 0, 0, 0.8 + k * 0.15, 1 + k, r * (0.55 + k * 0.25), k === 1 ? '#ffffff' : light);
          P.width[i] = 2.4 - k * 0.4;
          P.alpha[i] = 0.85;
          P.age[i] = -k * 0.14;
        }
        return;
      }
      case 'confetti': {
        const colors = FX_COLORS.confetti;
        for (let k = 0; k < 70; k++) {
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
          const v = 22 + Math.random() * 28;
          const i = P.spawn(SHAPE.confetti, x, y, Math.cos(a) * v, Math.sin(a) * v, 1.4 + Math.random() * 0.6, 2.2, 1.8, k % 4 === 0 ? base : colors[k % colors.length]);
          P.gravity[i] = 38;
          P.drag[i] = 1.5;
          P.spin[i] = (Math.random() - 0.5) * 14;
        }
        return;
      }
      case 'shockwave': {
        let i = P.spawn(SHAPE.ring, x, y, 0, 0, 0.45, 2, Math.min(reach + 14, 56), '#ffffff');
        P.width[i] = 4;
        i = P.spawn(SHAPE.ring, x, y, 0, 0, 0.65, 1, Math.min(reach + 6, 40), light);
        P.width[i] = 2.6;
        i = P.spawn(SHAPE.puff, x, y, 0, 0, 0.3, 7, 18, '#ffffff');
        P.alpha[i] = 0.85;
        P.burst(SHAPE.spark, 18, x, y, 34, 56, 0.45, 1.8, '#ffffff');
        return;
      }
      case 'fireworks': {
        const shots = 6;
        for (let k = 0; k < shots; k++) {
          const [fx, fy] = k === 0 ? [x, y] : sample();
          this.fireworks.push({ x: fx, y: fy, delay: k * 0.15 + Math.random() * 0.1, color: k % 2 === 0 ? light : ARENA.treasure });
        }
        return;
      }
    }
  }

  /** The killer's cosmetic at the victim's head, over a white flash every kill gets. */
  kill(style: KillStyle, victim: Look, killer: Look, x: number, y: number): void {
    const P = this.particles;
    const { base, light, dark } = victim.color;
    const flash = P.spawn(SHAPE.puff, x, y, 0, 0, 0.22, 4, 11, '#ffffff');
    P.alpha[flash] = 0.95;
    switch (style) {
      case 'burst': {
        P.burst(SHAPE.dot, 28, x, y, 16, 36, 0.65, 1.4, base);
        P.burst(SHAPE.dot, 14, x, y, 10, 24, 0.55, 1.1, light);
        P.burst(SHAPE.spark, 14, x, y, 34, 56, 0.4, 1.6, '#ffffff');
        const i = P.spawn(SHAPE.ring, x, y, 0, 0, 0.5, 2, 17, killer.color.light);
        P.width[i] = 2.6;
        return;
      }
      case 'poof': {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * TAU;
          const v = 6 + Math.random() * 8;
          const i = P.spawn(SHAPE.puff, x, y, Math.cos(a) * v, Math.sin(a) * v - 1.5, 1 + Math.random() * 0.4, 3, 6.5, FX_COLORS.smoke);
          P.drag[i] = 2.2;
          P.alpha[i] = 0.9;
        }
        P.burst(SHAPE.dot, 12, x, y, 8, 16, 0.55, 1, light);
        return;
      }
      case 'shatter': {
        for (let k = 0; k < 22; k++) {
          const a = (k / 22) * TAU + Math.random() * 0.4;
          const v = 14 + Math.random() * 24;
          const i = P.spawn(SHAPE.shard, x, y, Math.cos(a) * v, Math.sin(a) * v - 8, 0.85 + Math.random() * 0.35, 1.6 + Math.random(), 0.9, k % 3 === 0 ? dark : base);
          P.gravity[i] = 34;
          P.drag[i] = 1.1;
          P.spin[i] = (Math.random() - 0.5) * 16;
        }
        P.burst(SHAPE.spark, 10, x, y, 30, 50, 0.35, 1.4, '#ffffff');
        return;
      }
      case 'lightning': {
        this.bolts.push({ points: boltPoints(x, y), age: 0, life: 0.45 });
        const i = P.spawn(SHAPE.puff, x, y, 0, 0, 0.35, 6, 12, FX_COLORS.bolt);
        P.alpha[i] = 0.9;
        P.burst(SHAPE.spark, 16, x, y, 30, 52, 0.45, 1.5, FX_COLORS.bolt);
        P.burst(SHAPE.dot, 12, x, y, 12, 24, 0.55, 1.1, base);
        return;
      }
      case 'blackhole': {
        this.holes.push({ x, y, age: 0, life: 1.05, color: killer.color.light });
        // Debris spiralling in: tangential speed plus a pull toward the centre.
        for (let k = 0; k < 30; k++) {
          const a = (k / 30) * TAU;
          const r = 8 + Math.random() * 6;
          const i = P.spawn(SHAPE.dot, x + Math.cos(a) * r, y + Math.sin(a) * r, -Math.sin(a) * 16 - Math.cos(a) * 10, Math.cos(a) * 16 - Math.sin(a) * 10, 0.85, 1, 0.15, k % 2 ? base : light);
          P.drag[i] = 1.4;
        }
        return;
      }
    }
  }

  /** Every death: the head pops and the trail fades out where it lay. */
  death(look: Look, x: number, y: number, angle: number, trail: Float32Array, trailLen: number, hx: number, hy: number): void {
    this.pops.push({ x, y, angle, size: look.headSize, color: look.color.base, age: 0 });
    this.particles.burst(SHAPE.dot, 14, x, y, 10, 20, 0.5, 1.1, look.color.light);
    if (trailLen >= 2) {
      const points = new Float32Array(trailLen + 2);
      points.set(trail.subarray(0, trailLen));
      points[trailLen] = hx;
      points[trailLen + 1] = hy;
      this.ghosts.push({ points, color: look.color.base, core: look.color.light, age: 0, life: GHOST_SECONDS });
    }
  }

  treasure(x: number, y: number): void {
    const P = this.particles;
    P.burst(SHAPE.star, 14, x, y, 10, 22, 0.8, 1.3, ARENA.treasure);
    P.burst(SHAPE.star, 6, x, y, 4, 10, 0.6, 0.9, '#ffffff');
    const i = P.spawn(SHAPE.ring, x, y, 0, 0, 0.5, 1, 9, ARENA.treasure);
    P.width[i] = 1.4;
  }

  spawn(look: Look, x: number, y: number): void {
    const i = this.particles.spawn(SHAPE.ring, x, y, 0, 0, 0.55, 3, 17, look.color.light);
    this.particles.width[i] = 1.6;
    this.particles.burst(SHAPE.star, 8, x, y, 8, 16, 0.6, 1, '#ffffff');
  }

  update(dt: number): void {
    age(this.bolts, dt);
    age(this.holes, dt);
    age(this.ghosts, dt);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].age += dt;
      if (this.pops[i].age >= POP_SECONDS) this.pops.splice(i, 1);
    }
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const f = this.fireworks[i];
      f.delay -= dt;
      if (f.delay > 0) continue;
      this.fireworks.splice(i, 1);
      const P = this.particles;
      for (let k = 0; k < 30; k++) {
        const a = (k / 30) * TAU;
        const v = 16 + Math.random() * 12;
        const j = P.spawn(k % 2 ? SHAPE.star : SHAPE.spark, f.x, f.y, Math.cos(a) * v, Math.sin(a) * v, 1, 1.6, 0.3, k % 3 === 0 ? '#ffffff' : f.color);
        P.gravity[j] = 9;
        P.drag[j] = 1.6;
        P.width[j] = 0.6;
      }
      const j = P.spawn(SHAPE.puff, f.x, f.y, 0, 0, 0.32, 4, 10, f.color);
      P.alpha[j] = 0.9;
    }
  }

  /** Effects that belong under trails and heads: fading trails and black holes. */
  drawUnder(ctx: CanvasRenderingContext2D, clock: number): void {
    for (const g of this.ghosts) drawGhost(ctx, g);
    for (const h of this.holes) drawHole(ctx, h, clock);
  }

  /** Effects over everything in the world: popping heads, lightning, particles. */
  drawOver(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pops) {
      const t = p.age / POP_SECONDS;
      ctx.globalAlpha = 1 - t;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      headPath(ctx, p.size * (1 + 0.7 * easeOutCubic(t)));
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const b of this.bolts) drawBolt(ctx, b);
    this.particles.draw(ctx);
  }
}

function age(list: { age: number; life: number }[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].age += dt;
    if (list[i].age >= list[i].life) list.splice(i, 1);
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost): void {
  const t = g.age / g.life;
  const pts = g.points;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = g.color;
  ctx.lineWidth = SIZES.trailEdge * (1 - t * 0.8);
  ctx.stroke();
  ctx.strokeStyle = g.core;
  ctx.lineWidth = SIZES.trailCore * (1 - t * 0.8);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHole(ctx: CanvasRenderingContext2D, h: Hole, clock: number): void {
  const t = h.age / h.life;
  // Opens fast, holds, then collapses.
  const r = 6.5 * (t < 0.25 ? easeOutCubic(t / 0.25) : t > 0.75 ? 1 - easeOutCubic((t - 0.75) / 0.25) : 1);
  if (r <= 0.05) return;
  ctx.globalAlpha = 0.8;
  ctx.drawImage(softSprite(h.color), h.x - r * 2, h.y - r * 2, r * 4, r * 4);
  ctx.globalAlpha = 1;
  ctx.fillStyle = FX_COLORS.hole;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = FX_COLORS.holeRim;
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    const a = clock * 7 + (k * TAU) / 3;
    ctx.beginPath();
    ctx.arc(h.x, h.y, r * 0.78, a, a + 1.3);
    ctx.stroke();
  }
}

/** A jagged bolt from high above down to (x, y). */
function boltPoints(x: number, y: number): Float32Array {
  const n = 9;
  const pts = new Float32Array(n * 2 + 2);
  const height = 36;
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const jitter = k === 0 || k === n ? 0 : (Math.random() - 0.5) * 6;
    pts[k * 2] = x + jitter + (1 - t) * 4;
    pts[k * 2 + 1] = y - height * (1 - t);
  }
  return pts;
}

function drawBolt(ctx: CanvasRenderingContext2D, b: Bolt): void {
  const t = b.age / b.life;
  // Flickers, then fades.
  const flicker = t < 0.5 ? (Math.floor(b.age * 30) % 2 === 0 ? 1 : 0.55) : 1 - (t - 0.5) * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(b.points[0], b.points[1]);
  for (let i = 2; i < b.points.length; i += 2) ctx.lineTo(b.points[i], b.points[i + 1]);
  ctx.globalAlpha = 0.45 * flicker;
  ctx.strokeStyle = FX_COLORS.bolt;
  ctx.lineWidth = 3.4;
  ctx.stroke();
  ctx.globalAlpha = clamp(flicker, 0, 1);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
