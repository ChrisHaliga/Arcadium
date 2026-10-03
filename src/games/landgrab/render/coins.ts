/**
 * Coin bursts in screen space: coins pop out of the captured land, hang for a beat, then
 * swoop into the coin counter, each one reporting its arrival so the counter can tick up
 * coin by coin.
 */
import type { ScreenPoint } from './contract';
import { coinSprite } from './sprites';

const CAPACITY = 400;
/** Pop phase: outward speed (CSS px/s) range and how fast it bleeds off. */
const POP_SPEED_MIN = 110;
const POP_SPEED_MAX = 260;
const POP_DRAG = 5.5;
const POP_SECONDS = 0.34;
const FLY_SECONDS = 0.55;
const STAGGER_SECONDS = 0.022;
const MAX_STAGGER = 0.6;
const COIN_PX = 20;

export class Coins {
  private readonly x0 = new Float32Array(CAPACITY);
  private readonly y0 = new Float32Array(CAPACITY);
  private readonly vx = new Float32Array(CAPACITY);
  private readonly vy = new Float32Array(CAPACITY);
  private readonly tx = new Float32Array(CAPACITY);
  private readonly ty = new Float32Array(CAPACITY);
  private readonly age = new Float32Array(CAPACITY);
  private readonly spin = new Float32Array(CAPACITY);
  private readonly arrive: ((() => void) | undefined)[] = new Array(CAPACITY).fill(undefined);
  private count = 0;

  /** Launches `count` coins from the given screen points; coins beyond capacity land at once. */
  burst(from: (i: number) => ScreenPoint, count: number, to: ScreenPoint, onArrive?: () => void): void {
    for (let n = 0; n < count; n++) {
      if (this.count >= CAPACITY) {
        onArrive?.();
        continue;
      }
      const i = this.count++;
      const p = from(n);
      const a = Math.random() * Math.PI * 2;
      const v = POP_SPEED_MIN + Math.random() * (POP_SPEED_MAX - POP_SPEED_MIN);
      this.x0[i] = p.x;
      this.y0[i] = p.y;
      this.vx[i] = Math.cos(a) * v;
      this.vy[i] = Math.sin(a) * v - 60;
      this.tx[i] = to.x;
      this.ty[i] = to.y;
      this.age[i] = -Math.min(MAX_STAGGER, n * STAGGER_SECONDS);
      this.spin[i] = 8 + Math.random() * 6;
      this.arrive[i] = onArrive;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; ) {
      this.age[i] += dt;
      if (this.age[i] < POP_SECONDS + FLY_SECONDS) {
        i++;
        continue;
      }
      const done = this.arrive[i];
      this.remove(i);
      done?.();
    }
  }

  /** Draws in CSS pixel space (ctx scaled by the device pixel ratio). */
  draw(ctx: CanvasRenderingContext2D): void {
    const sprite = coinSprite();
    for (let i = 0; i < this.count; i++) {
      const t = this.age[i];
      if (t < 0) continue;
      // Pop: decelerating drift out of the land.
      const pt = Math.min(t, POP_SECONDS);
      const k = (1 - Math.exp(-POP_DRAG * pt)) / POP_DRAG;
      let x = this.x0[i] + this.vx[i] * k;
      let y = this.y0[i] + this.vy[i] * k;
      let size = COIN_PX * Math.min(1, t / 0.08);
      if (t > POP_SECONDS) {
        // Swoop: an accelerating curve that keeps some of the pop's direction.
        const w = (t - POP_SECONDS) / FLY_SECONDS;
        const e = w * w;
        const cx = x + this.vx[i] * 0.12;
        const cy = y + this.vy[i] * 0.12;
        const u = 1 - e;
        x = u * u * x + 2 * u * e * cx + e * e * this.tx[i];
        y = u * u * y + 2 * u * e * cy + e * e * this.ty[i];
        size *= 1 - 0.3 * e;
      }
      const squash = 0.3 + 0.7 * Math.abs(Math.cos(t * this.spin[i]));
      ctx.drawImage(sprite, x - (size * squash) / 2, y - size / 2, size * squash, size);
    }
  }

  private remove(i: number): void {
    const j = --this.count;
    this.x0[i] = this.x0[j];
    this.y0[i] = this.y0[j];
    this.vx[i] = this.vx[j];
    this.vy[i] = this.vy[j];
    this.tx[i] = this.tx[j];
    this.ty[i] = this.ty[j];
    this.age[i] = this.age[j];
    this.spin[i] = this.spin[j];
    this.arrive[i] = this.arrive[j];
    this.arrive[j] = undefined;
  }
}
