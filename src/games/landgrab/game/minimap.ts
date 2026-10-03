/**
 * The HUD minimap's canvas. Its size comes from a ResizeObserver: reading the box in the
 * frame loop would force a style and layout pass every tick, right after the HUD's own
 * updates.
 */
import type { SimState, Slot } from '../core';
import { drawMinimap } from '../render';
import { deviceRatio } from '../render/world';

export class MinimapCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  /** CSS size of the canvas; 0 until measured. */
  private width = 0;
  private height = 0;
  private readonly observer = new ResizeObserver((entries) => {
    const box = entries[entries.length - 1].contentRect;
    this.resize(box.width, box.height);
  });

  /** Draws `view` into `canvas`, the HUD's minimap, which is a new element whenever the HUD remounts. */
  draw(canvas: HTMLCanvasElement | null, view: SimState, mySlot: Slot): void {
    if (canvas !== this.canvas) this.attach(canvas);
    if (!this.ctx || this.width === 0 || this.height === 0) return;
    drawMinimap(this.ctx, view, mySlot, this.width, this.height);
  }

  dispose(): void {
    this.observer.disconnect();
  }

  private attach(canvas: HTMLCanvasElement | null): void {
    this.observer.disconnect();
    this.canvas = canvas;
    this.ctx = canvas?.getContext('2d') ?? null;
    this.width = 0;
    this.height = 0;
    if (canvas) this.observer.observe(canvas);
  }

  private resize(width: number, height: number): void {
    const { canvas, ctx } = this;
    if (!canvas || !ctx) return;
    const dpr = deviceRatio();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    // Resizing resets the context, so the scale goes back on here, once, not every tick.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
  }
}
