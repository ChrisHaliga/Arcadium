/**
 * Renderer: draws a SimState on a canvas and plays the visual effects.
 * The game client calls draw() every animation frame with MatchClient.view() and
 * feeds it confirmed events; DOM overlays (HUD, callouts) ask it where things are.
 *
 * CONTRACT FILE: implemented in render/index.ts as createRenderer / drawMinimap.
 */
import type { CosmeticDef } from '../../../shared/services';
import type { SimEvent, SimState, Slot } from '../core/types';

export interface RendererOptions {
  /** Cosmetic lookup by id (from CosmeticsService.get); unknown ids fall back to defaults. */
  cosmetics: (id: string) => CosmeticDef | undefined;
  /** Read each frame so the settings toggle applies live. */
  screenShake: () => boolean;
  /** Hub background mode: camera drifts after the leader, no UI-oriented effects. */
  attract?: boolean;
}

export interface ScreenPoint {
  /** CSS pixels relative to the canvas's top-left corner. */
  x: number;
  y: number;
}

export interface Renderer {
  /** Draw one frame. alpha = MatchClient.alpha(now). focus = slot the camera follows (0 = the leader). */
  draw(view: SimState, alpha: number, nowMs: number, focus: Slot): void;
  /** Confirmed simulation events, for capture waves, kill bursts, death pops, treasure sparkles. */
  onEvent(e: SimEvent, state: SimState, mySlot: Slot): void;
  /** Ghost of the area the player would capture right now (previewCapture), or null to hide it. */
  setPreview(cells: readonly number[] | null): void;
  /** Where a cell currently appears on screen. */
  cellToScreen(cell: number): ScreenPoint;
  /** Where a player's head currently appears on screen (interpolated). */
  headToScreen(slot: Slot): ScreenPoint | null;
  /** Fly `count` coins from the given cells to a screen point; onArrive fires once per coin as it lands. */
  coinBurst(fromCells: readonly number[], count: number, to: ScreenPoint, onArrive?: () => void): void;
  /** Add camera shake (ignored when the setting is off). strength ~0.2 small .. 1 huge. */
  shake(strength: number): void;
  /** Call when the canvas's CSS size changes. */
  resize(): void;
  dispose(): void;
}

export type CreateRenderer = (canvas: HTMLCanvasElement, opts: RendererOptions) => Renderer;
/** Small overview map: land, heads, and your position. */
export type DrawMinimap = (ctx: CanvasRenderingContext2D, view: SimState, mySlot: Slot, width: number, height: number) => void;
