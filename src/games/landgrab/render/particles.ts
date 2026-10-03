/**
 * Particle pool for every effect. Fields live in typed arrays and spawn() takes plain
 * numbers, so emitters running every frame (fire trails, sparkles) never allocate.
 * Positions and sizes are in cells; particles are drawn in world space.
 */
import { softSprite } from './sprites';
import { TAU } from './geometry';

export const SHAPE = {
  dot: 0,
  star: 1,
  ring: 2,
  shard: 3,
  puff: 4,
  confetti: 5,
  flame: 6,
  spark: 7,
  bubble: 8,
} as const;
export type Shape = (typeof SHAPE)[keyof typeof SHAPE];

const CAPACITY = 1400;
const FLAME_COLORS = ['#fff3a8', '#ffb020', '#ff5a2a', '#c4123a'] as const;

export class Particles {
  readonly x = new Float32Array(CAPACITY);
  readonly y = new Float32Array(CAPACITY);
  readonly vx = new Float32Array(CAPACITY);
  readonly vy = new Float32Array(CAPACITY);
  /** Acceleration along +y (screen down), cells/s². */
  readonly gravity = new Float32Array(CAPACITY);
  /** Velocity decay rate, 1/s. */
  readonly drag = new Float32Array(CAPACITY);
  readonly age = new Float32Array(CAPACITY);
  readonly life = new Float32Array(CAPACITY);
  readonly size0 = new Float32Array(CAPACITY);
  readonly size1 = new Float32Array(CAPACITY);
  readonly rot = new Float32Array(CAPACITY);
  readonly spin = new Float32Array(CAPACITY);
  readonly alpha = new Float32Array(CAPACITY);
  /** Stroke width for rings and bubbles, cells. */
  readonly width = new Float32Array(CAPACITY);
  readonly shape = new Uint8Array(CAPACITY);
  readonly color: string[] = new Array<string>(CAPACITY).fill('#ffffff');
  count = 0;

  /** Adds a particle and returns its index for setting the optional fields. When full it replaces a random one. */
  spawn(shape: Shape, x: number, y: number, vx: number, vy: number, life: number, size0: number, size1: number, color: string): number {
    const i = this.count < CAPACITY ? this.count++ : (Math.random() * CAPACITY) | 0;
    this.shape[i] = shape;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.age[i] = 0;
    this.size0[i] = size0;
    this.size1[i] = size1;
    this.color[i] = color;
    this.gravity[i] = 0;
    this.drag[i] = 0;
    this.rot[i] = Math.random() * TAU;
    this.spin[i] = 0;
    this.alpha[i] = 1;
    this.width[i] = 0.35;
    return i;
  }

  /** Radial burst helper: n particles leaving (x, y) at speed in [lo, hi] cells/s. */
  burst(shape: Shape, n: number, x: number, y: number, lo: number, hi: number, life: number, size: number, color: string): void {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.random() * 0.6;
      const v = lo + Math.random() * (hi - lo);
      const i = this.spawn(shape, x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.7 + Math.random() * 0.5), size, 0, color);
      this.drag[i] = 2.2;
    }
  }

  clear(): void {
    this.count = 0;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; ) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.moveLast(i);
        continue;
      }
      const damp = this.drag[i] > 0 ? Math.exp(-this.drag[i] * dt) : 1;
      this.vx[i] *= damp;
      this.vy[i] = this.vy[i] * damp + this.gravity[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    let lastFill = '';
    for (let i = 0; i < this.count; i++) {
      const t = this.age[i] / this.life[i];
      // A negative age is a delayed start.
      if (t < 0) continue;
      const size = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      if (size <= 0.01) continue;
      // Quick fade-in, long fade-out.
      ctx.globalAlpha = this.alpha[i] * Math.min(1, t * 12) * (1 - t * t);
      const x = this.x[i];
      const y = this.y[i];
      const shape = this.shape[i] as Shape;
      const color = shape === SHAPE.flame ? FLAME_COLORS[Math.min(3, (t * 4) | 0)] : this.color[i];
      if (shape === SHAPE.puff || shape === SHAPE.flame) {
        ctx.drawImage(softSprite(color), x - size, y - size, size * 2, size * 2);
        continue;
      }
      if (shape === SHAPE.ring || shape === SHAPE.bubble || shape === SHAPE.spark) {
        ctx.strokeStyle = color;
        this.stroke(ctx, i, shape, x, y, size, t);
        continue;
      }
      if (color !== lastFill) {
        ctx.fillStyle = color;
        lastFill = color;
      }
      ctx.beginPath();
      this.outline(ctx, shape, x, y, size, this.rot[i]);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private stroke(ctx: CanvasRenderingContext2D, i: number, shape: Shape, x: number, y: number, size: number, t: number): void {
    ctx.beginPath();
    if (shape === SHAPE.spark) {
      ctx.lineWidth = this.width[i];
      ctx.lineCap = 'round';
      ctx.moveTo(x, y);
      ctx.lineTo(x - this.vx[i] * 0.05 * size, y - this.vy[i] * 0.05 * size);
    } else {
      ctx.lineWidth = shape === SHAPE.ring ? this.width[i] * (1 - t * 0.7) : this.width[i];
      ctx.arc(x, y, size, 0, TAU);
    }
    ctx.stroke();
    if (shape === SHAPE.bubble) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - size * 0.35, y - size * 0.35, size * 0.22, 0, TAU);
      ctx.fill();
    }
  }

  private outline(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, s: number, rot: number): void {
    const c = Math.cos(rot);
    const n = Math.sin(rot);
    switch (shape) {
      case SHAPE.star: {
        // Four sharp points with curved sides, the classic sparkle.
        ctx.moveTo(x + c * s, y + n * s);
        ctx.quadraticCurveTo(x, y, x - n * s, y + c * s);
        ctx.quadraticCurveTo(x, y, x - c * s, y - n * s);
        ctx.quadraticCurveTo(x, y, x + n * s, y - c * s);
        ctx.quadraticCurveTo(x, y, x + c * s, y + n * s);
        return;
      }
      case SHAPE.shard: {
        ctx.moveTo(x + c * s, y + n * s);
        ctx.lineTo(x - c * s * 0.5 - n * s * 0.6, y - n * s * 0.5 + c * s * 0.6);
        ctx.lineTo(x - c * s * 0.4 + n * s * 0.5, y - n * s * 0.4 - c * s * 0.5);
        ctx.closePath();
        return;
      }
      case SHAPE.confetti: {
        // A paper strip tumbling: its visible width swings with the spin.
        const w = s * Math.abs(Math.cos(rot * 1.7)) * 0.5 + 0.08;
        const h = s * 0.32;
        ctx.moveTo(x + c * w - n * h, y + n * w + c * h);
        ctx.lineTo(x - c * w - n * h, y - n * w + c * h);
        ctx.lineTo(x - c * w + n * h, y - n * w - c * h);
        ctx.lineTo(x + c * w + n * h, y + n * w - c * h);
        ctx.closePath();
        return;
      }
      default:
        ctx.moveTo(x + s, y);
        ctx.arc(x, y, s, 0, TAU);
    }
  }

  private moveLast(i: number): void {
    const j = --this.count;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.gravity[i] = this.gravity[j];
    this.drag[i] = this.drag[j];
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.size0[i] = this.size0[j];
    this.size1[i] = this.size1[j];
    this.rot[i] = this.rot[j];
    this.spin[i] = this.spin[j];
    this.alpha[i] = this.alpha[j];
    this.width[i] = this.width[j];
    this.shape[i] = this.shape[j];
    this.color[i] = this.color[j];
  }
}
