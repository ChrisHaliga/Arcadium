/**
 * The world as every Landgrab canvas draws it, the match and the hub's art scenes alike:
 * arena, territory slabs, treasure, trails, heads and the event effects, in layer order,
 * with heads gliding between ticks. Its owners only differ in how they place the camera
 * and in the layers they add between these: the match adds the capture ghost, names and
 * flying coins; the art fades out, under the territory, the land a looping scene leaves
 * behind.
 */
import type { CosmeticDef } from '../../../shared/services';
import { SUB, type SimEvent, type SimState, type Slot } from '../core/types';
import { Arena } from './arena';
import { Camera } from './camera';
import { Effects } from './effects';
import { drawGems } from './gems';
import { drawHead, drawLabel, spawnScale } from './heads';
import { Looks, type Look } from './looks';
import { Motion } from './motion';
import { Particles } from './particles';
import { Territory, type WorldBounds } from './territory';
import { ARENA, MAX_DPR } from './theme';
import { Trails } from './trails';

/** World margin (cells) drawn beyond the screen edges, for lips, glows and big heads. */
const BOUNDS_MARGIN = 12;
const NO_TRAIL = new Float32Array(0);

/** Canvas pixels per CSS pixel on this screen, capped at MAX_DPR. */
export function deviceRatio(): number {
  return Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
}

export class World {
  readonly camera = new Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly looks: Looks;
  private readonly arena = new Arena();
  private readonly particles = new Particles();
  private readonly effects = new Effects(this.particles);
  private size = 0;
  private territory = new Territory(0, 0);
  private heads = new Motion(0);
  private trails = new Trails(0);
  /** Look per slot for the current frame; index = slot. */
  private slotLooks: (Look | null)[] = [];
  /** Scratch for drawing heads front to back. */
  private order = new Int32Array(0);
  /** The world rectangle (cells) the camera frames, plus a margin. */
  private readonly bounds: WorldBounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private dprNow: number;
  private seconds = 0;

  constructor(ctx: CanvasRenderingContext2D, cosmetics: (id: string) => CosmeticDef | undefined) {
    this.ctx = ctx;
    this.dprNow = deviceRatio();
    this.looks = new Looks(ctx, cosmetics, this.dprNow);
  }

  /** Where heads are drawn this frame. */
  get motion(): Motion {
    return this.heads;
  }

  /** Seconds of world time, the clock every animation runs on. */
  get clock(): number {
    return this.seconds;
  }

  get dpr(): number {
    return this.dprNow;
  }

  set dpr(ratio: number) {
    if (ratio === this.dprNow) return;
    this.dprNow = ratio;
    this.looks.reset(ratio);
  }

  /** Redraws the cached name labels and skins (after web fonts load). */
  refreshLooks(): void {
    this.looks.reset(this.dprNow);
  }

  /** A slot's look this frame, or null when nobody is in it. */
  lookOf(slot: Slot): Look | null {
    return this.slotLooks[slot] ?? null;
  }

  /**
   * Moves the world on `dt` seconds to `view`: looks, land and where heads are drawn
   * (alpha = progress toward the next tick). Call before placing the camera. Returns true
   * when `view` is on a new map, which starts land and effects over.
   */
  update(view: SimState, alpha: number, dt: number): boolean {
    this.seconds += dt;
    this.fit(view);
    for (let s = 0; s < this.slotLooks.length; s++) {
      const p = s < view.players.length ? view.players[s] : null;
      this.slotLooks[s] = p ? this.looks.get(p.profile) : null;
    }
    const newMap = this.arena.update(view);
    if (newMap) {
      this.territory.reset(view);
      this.effects.clear();
    } else {
      this.territory.sync(view, this.seconds * 1000);
    }
    this.heads.update(view, alpha, dt, this.seconds);
    return newMap;
  }

  /** After the camera is placed: effects, and the particles trails shed on screen. */
  animate(view: SimState, dt: number): void {
    const { heads } = this;
    this.frameBounds();
    this.effects.update(dt);
    this.particles.update(dt);
    for (let s = 1; s < view.players.length; s++) {
      const p = view.players[s];
      const look = this.slotLooks[s];
      if (!p || !look || !heads.visible[s] || !this.onScreen(heads.x[s], heads.y[s])) continue;
      this.trails.emit(this.particles, s, p, look, heads.x[s], heads.y[s], dt);
    }
  }

  /** Shows the sim's land as it is now, without capture waves. */
  resetLand(view: SimState): void {
    this.territory.reset(view);
  }

  /** The bottom layer: void and the arena slab. Leaves the context in world space. */
  drawArena(view: SimState): void {
    this.frameBounds();
    this.arena.draw(this.ctx, view, this.camera, this.dprNow, this.bounds);
  }

  /** The territory slabs that go over the arena, onto any context already in world space. */
  paintTerritory(ctx: CanvasRenderingContext2D): void {
    this.territory.draw(ctx, this.bounds, this.lipOf, this.topOf);
  }

  /**
   * Everything standing on the land: treasure, effects under and over the players, and
   * trails and heads, with names above them when `names` is set. Expects world space and
   * leaves the context in it.
   */
  drawOnLand(view: SimState, names: boolean): void {
    const { ctx, heads, order, slotLooks } = this;
    const clock = this.seconds;
    drawGems(ctx, view.treasure, view.size, clock);
    this.effects.drawUnder(ctx, clock);
    let n = 0;
    for (let s = 1; s < view.players.length; s++) {
      const p = view.players[s];
      const look = slotLooks[s];
      if (!p || !look || !heads.visible[s]) continue;
      if (p.trailPath.length >= 2) this.trails.draw(ctx, p, look, heads.x[s], heads.y[s], clock);
      if (this.onScreen(heads.x[s], heads.y[s])) order[n++] = s;
    }
    // Lower heads overlap higher ones, as if seen from above and in front.
    for (let i = 1; i < n; i++) {
      const s = order[i];
      let j = i - 1;
      while (j >= 0 && heads.y[order[j]] > heads.y[s]) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = s;
    }
    for (let i = 0; i < n; i++) {
      const s = order[i];
      drawHead(ctx, slotLooks[s]!, heads.x[s], heads.y[s], heads.angle[s], spawnScale(clock, heads.bornAt[s]), clock, s);
    }
    if (names) {
      ctx.setTransform(this.dprNow, 0, 0, this.dprNow, 0, 0);
      for (let i = 0; i < n; i++) {
        const s = order[i];
        drawLabel(ctx, this.camera, slotLooks[s]!, heads.x[s], heads.y[s], spawnScale(clock, heads.bornAt[s]), this.dprNow);
      }
      this.camera.applyWorld(ctx, this.dprNow);
    }
    this.effects.drawOver(ctx);
  }

  /** Plays a sim event's effect: capture and kill cosmetics, death pops, treasure sparkles, spawn rings. */
  playEvent(e: SimEvent, state: SimState): void {
    const size = this.size;
    if (state.size !== size) return;
    const lookOf = (slot: Slot): Look | null => {
      const p = state.players[slot];
      return p ? this.looks.get(p.profile) : null;
    };
    const centre = (cell: number): [number, number] => [(cell % size) + 0.5, Math.floor(cell / size) + 0.5];
    const { effects, heads } = this;
    switch (e.t) {
      case 'capture': {
        const look = lookOf(e.slot);
        if (!look) return;
        const [x, y] = centre(e.at);
        let reach = 0;
        for (const c of e.cells) reach = Math.max(reach, Math.hypot((c % size) + 0.5 - x, Math.floor(c / size) + 0.5 - y));
        effects.capture(look.capture, look, x, y, reach, () => centre(e.cells[(Math.random() * e.cells.length) | 0]));
        return;
      }
      case 'death': {
        const victim = lookOf(e.slot);
        if (!victim) return;
        const s = e.slot;
        // Where the head was drawn, with the trail it had; a head never drawn pops where the sim says.
        const known = s < heads.slots && heads.seen[s] === 1;
        const [x, y] = known ? [heads.x[s], heads.y[s]] : centre(e.at);
        effects.death(victim, x, y, known ? heads.angle[s] : 0, known ? heads.trailCopy[s] : NO_TRAIL, known ? heads.trailLen[s] : 0, x, y);
        const killer = e.killer !== 0 ? lookOf(e.killer) : null;
        if (killer) effects.kill(killer.kill, victim, killer, x, y);
        return;
      }
      case 'treasure':
        effects.treasure(...centre(e.cell));
        return;
      case 'spawn': {
        const look = lookOf(e.slot);
        if (look) effects.spawn(look, e.x / SUB, e.y / SUB);
        return;
      }
      case 'newRound':
        effects.clear();
        return;
      default:
        return;
    }
  }

  dispose(): void {
    this.effects.clear();
  }

  /** Bounds follow the camera, which its owner may have moved or resized since the last frame. */
  private frameBounds(): void {
    const { camera, bounds } = this;
    bounds.x0 = camera.worldX(0) - BOUNDS_MARGIN;
    bounds.y0 = camera.worldY(0) - BOUNDS_MARGIN;
    bounds.x1 = camera.worldX(camera.width) + BOUNDS_MARGIN;
    bounds.y1 = camera.worldY(camera.height) + BOUNDS_MARGIN;
  }

  private onScreen(x: number, y: number): boolean {
    const b = this.bounds;
    return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }

  /** Sizes the per-cell and per-slot buffers for `view`. */
  private fit(view: SimState): void {
    if (view.size !== this.size) {
      this.size = view.size;
      this.territory = new Territory(view.size, view.players.length);
    }
    if (view.players.length > this.heads.slots) {
      this.heads = new Motion(view.players.length);
      this.trails = new Trails(view.players.length);
      this.slotLooks = new Array<Look | null>(view.players.length).fill(null);
      this.order = new Int32Array(view.players.length);
    }
  }

  // Land whose owner has left (no look) shows in the arena's rim colour until it is cleared.
  private readonly lipOf = (v: number): string => this.slotLooks[v]?.color.dark ?? ARENA.rim;
  private readonly topOf = (v: number): string | CanvasPattern => this.slotLooks[v]?.land ?? ARENA.rim;
}
