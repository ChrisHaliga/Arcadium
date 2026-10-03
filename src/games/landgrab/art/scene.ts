/**
 * A small self-playing Landgrab scene for the hub (card art, cosmetic previews), drawn by
 * the same World as a match, so it looks and plays its effects exactly like one. Only the
 * camera differs: it holds a fixed frame instead of following a player.
 *
 * The real simulation runs from an authored opening state with scripted pilots, and
 * starts over from it once `loopTicks` have passed and everyone is back home: the land
 * the loop won fades back to how it started, while heads at home carry on from where
 * they are, so nothing jumps. Players whose timing the script depends on (`inSync`) also
 * wait to glide through their opening spot, so their loops replay exactly.
 */
import type { CosmeticDef } from '../../../shared/services';
import { cloneState, copyState, headingDelta, step, SUB, type SimState, type Slot } from '../core';
import { deviceRatio, World } from '../render/world';
import type { Pilot } from './pilot';
import { steer } from './stage';

export interface SceneSpec {
  /** The opening state, replayed every loop. */
  start: SimState;
  pilots: readonly Pilot[];
  /** Sim ticks before the scene may start over; Infinity plays on without restarting. */
  loopTicks: number;
  /** Players the restart waits for to pass their opening spot. */
  inSync: readonly Slot[];
  /** Real seconds per sim tick. */
  tickSeconds: number;
  /** The world point (cells) at the canvas centre, and how many cells fit across its shorter side. */
  view: { x: number; y: number; span: number };
  cosmetics(id: string): CosmeticDef | undefined;
}

const DISSOLVE_SECONDS = 0.5;
/** How close (cells, heading units) an in-sync head must pass its opening spot. */
const POSE_CELLS = 1.5;
const POSE_HEADING = 24;
/** Restart anyway this many ticks after `loopTicks` if the scene never lines up. */
const RESTART_WAIT_TICKS = 60;

export class Scene {
  private readonly canvas: HTMLCanvasElement;
  private readonly spec: SceneSpec;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly live: SimState;
  private readonly world: World;
  /**
   * The land as it was before the last restart, painted once at full strength and faded
   * out as an image (translucent territory fills would show seams where their chunks
   * overlap). It fades under the restored land, so only what the restart took away
   * dissolves; over it, the old and new outlines would show at once.
   */
  private leaving: HTMLCanvasElement | null = null;
  private leavingLeft = 0;
  private sinceTick = 0;
  private loopTick = 0;

  constructor(canvas: HTMLCanvasElement, spec: SceneSpec) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is not available');
    this.canvas = canvas;
    this.spec = spec;
    this.ctx = ctx;
    this.live = cloneState(spec.start);
    this.world = new World(ctx, spec.cosmetics);
    this.world.update(this.live, 0, 0);
    this.resize();
  }

  /** Matches the canvas to its CSS size. That clears it: draw() again after. */
  resize(): void {
    const { canvas, spec, world } = this;
    const { camera } = world;
    const dpr = deviceRatio();
    camera.width = Math.max(1, canvas.clientWidth);
    camera.height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(camera.width * dpr);
    canvas.height = Math.round(camera.height * dpr);
    world.dpr = dpr;
    camera.x = spec.view.x;
    camera.y = spec.view.y;
    camera.scale = Math.min(camera.width, camera.height) / spec.view.span;
    // The outgoing land was painted for the old size.
    this.leavingLeft = 0;
  }

  /** Plays `dt` seconds: sim ticks, head motion, land reveal, effects. */
  advance(dt: number): void {
    const { live, spec, world } = this;
    this.sinceTick += dt;
    while (this.sinceTick >= spec.tickSeconds) {
      this.sinceTick -= spec.tickSeconds;
      this.tick();
    }
    world.update(live, this.sinceTick / spec.tickSeconds, dt);
    world.animate(live, dt);
    this.leavingLeft = Math.max(0, this.leavingLeft - dt);
  }

  draw(): void {
    const { ctx, live, world } = this;
    world.drawArena(live);
    if (this.leaving && this.leavingLeft > 0) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = this.leavingLeft / DISSOLVE_SECONDS;
      ctx.drawImage(this.leaving, 0, 0);
      ctx.restore();
    }
    world.paintTerritory(ctx);
    world.drawOnLand(live, false);
  }

  dispose(): void {
    this.world.dispose();
    this.leaving = null;
  }

  private tick(): void {
    const { loopTicks } = this.spec;
    if (this.loopTick >= loopTicks && (this.readyToRestart() || this.loopTick >= loopTicks + RESTART_WAIT_TICKS)) this.restart();
    this.loopTick++;
    for (const e of step(this.live, steer(this.spec.pilots, this.live))) this.world.playEvent(e, this.live);
  }

  /** Nobody is out on a trail, and every in-sync player is passing its opening spot. */
  private readyToRestart(): boolean {
    const { live, spec } = this;
    for (const p of live.players) if (p?.alive && p.trailPath.length > 0) return false;
    return spec.inSync.every((slot) => {
      const p = live.players[slot];
      const opening = spec.start.players[slot];
      if (!p?.alive || !opening) return true;
      return (
        Math.abs(headingDelta(p.moveHeading, opening.moveHeading)) <= POSE_HEADING &&
        Math.hypot(p.x - opening.x, p.y - opening.y) <= POSE_CELLS * SUB
      );
    });
  }

  /** Back to the opening state, except that players at home keep their place and heading. */
  private restart(): void {
    const { live } = this;
    this.paintLeaving();
    const kept = live.players.map((p) =>
      p?.alive && p.trailPath.length === 0
        ? { x: p.x, y: p.y, heading: p.heading, targetHeading: p.targetHeading, moveHeading: p.moveHeading }
        : null,
    );
    copyState(live, this.spec.start);
    kept.forEach((place, slot) => {
      const p = live.players[slot];
      if (place && p?.alive) Object.assign(p, place);
    });
    for (const pilot of this.spec.pilots) pilot.reset();
    this.loopTick = 0;
    this.world.resetLand(live);
  }

  /** Paints the land as it is now onto the layer that fades out after a restart. */
  private paintLeaving(): void {
    const { canvas, world } = this;
    const layer = this.leaving ?? document.createElement('canvas');
    layer.width = canvas.width;
    layer.height = canvas.height;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    world.camera.applyWorld(ctx, world.dpr);
    world.paintTerritory(ctx);
    this.leaving = layer;
    this.leavingLeft = DISSOLVE_SECONDS;
  }
}
