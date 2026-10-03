/**
 * Camera: smooth follow, zoom that eases out as your land grows, trauma-style shake,
 * and the world (cell units) <-> screen (CSS pixels) mapping everything else uses.
 */
import { CAMERA } from './theme';

export class Camera {
  /** World point at the screen centre, in cells. */
  x = 0;
  y = 0;
  /** CSS pixels per cell. */
  scale: number = CAMERA.phoneScale;
  /** Canvas size in CSS pixels. */
  width = 1;
  height = 1;
  shakeX = 0;
  shakeY = 0;
  private trauma = 0;
  private placed = false;

  /** CSS pixels per cell for this screen size before any land zoom. */
  baseScale(): number {
    const area = Math.max(1, this.width * this.height);
    return CAMERA.phoneScale * Math.pow(area / CAMERA.phoneArea, CAMERA.screenExponent);
  }

  /** Eases toward (tx, ty) at `zoom` x base scale; the first call (or a jump) snaps. */
  follow(tx: number, ty: number, zoom: number, dt: number, followSeconds: number): void {
    const targetScale = this.baseScale() * zoom;
    if (!this.placed) {
      this.x = tx;
      this.y = ty;
      this.scale = targetScale;
      this.placed = true;
      return;
    }
    const k = 1 - Math.exp(-dt / followSeconds);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.scale += (targetScale - this.scale) * (1 - Math.exp(-dt / CAMERA.zoomSeconds));
  }

  /** Next follow() snaps instead of easing (new round, first frame). */
  unplace(): void {
    this.placed = false;
  }

  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Shake is the square of trauma (small knocks barely move, big ones rattle), decaying over ~0.6 s. */
  updateShake(dt: number, timeS: number, enabled: boolean): void {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const amount = enabled ? this.trauma * this.trauma * CAMERA.shakePx : 0;
    this.shakeX = amount * Math.sin(timeS * 71.3) * Math.cos(timeS * 23.1);
    this.shakeY = amount * Math.sin(timeS * 59.7 + 1.3) * Math.cos(timeS * 31.9);
  }

  screenX(wx: number): number {
    return (wx - this.x) * this.scale + this.width / 2 + this.shakeX;
  }

  screenY(wy: number): number {
    return (wy - this.y) * this.scale + this.height / 2 + this.shakeY;
  }

  worldX(sx: number): number {
    return (sx - this.width / 2 - this.shakeX) / this.scale + this.x;
  }

  worldY(sy: number): number {
    return (sy - this.height / 2 - this.shakeY) / this.scale + this.y;
  }

  /** Sets ctx to draw in cell units for this camera. */
  applyWorld(ctx: CanvasRenderingContext2D, dpr: number): void {
    const k = this.scale * dpr;
    ctx.setTransform(k, 0, 0, k, dpr * (this.width / 2 + this.shakeX) - this.x * k, dpr * (this.height / 2 + this.shakeY) - this.y * k);
  }
}
