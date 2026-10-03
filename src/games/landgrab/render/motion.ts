/**
 * Where each head is drawn between ticks. The sim moves heads 20 times a second; drawing
 * extrapolates each head's coming tick, planned by core's planHeadMove exactly as the sim
 * will move it (turning, edge slides, the edge U-turn, staying put when blocked), so
 * heads glide at the display rate with no added latency and a blocked head stands still.
 *
 * Two kinds of smoothing hide what the view itself does in jumps:
 *   draw time    runs on at the tick rate and is pulled toward the client's tick + alpha,
 *                so frames arriving a little early or late don't make heads stutter; it
 *                never falls behind the view's tick or runs past the planned next tick
 *   corrections  when a tick lands somewhere other than its plan said (a server
 *                correction, someone steering differently), the difference becomes an
 *                offset that melts away over a few frames. Remote heads are predicted
 *                several ticks ahead online, so a turn can put them a few cells off their
 *                plan: the whole error melts, up to MAX_CORRECTION; past that it is a teleport
 */
import { planHeadMove, type HeadMove } from '../core';
import { SUB, type SimState } from '../core/types';
import { angleDelta, clamp, headingRadians } from './geometry';

/** Draw time closes its gap to the client's tick + alpha with this time constant (seconds). */
const TIME_PULL_SECONDS = 0.12;
/** Prediction errors decay with this time constant (seconds). */
const CORRECTION_SECONDS = 0.075;
const TURN_SMOOTH_SECONDS = 0.045;
/** Errors larger than this (cells) are teleports: snap instead of smoothing. */
const MAX_CORRECTION = 4;
/** More ticks than this between frames (a stall, a resync) restarts the draw time. */
const MAX_TICK_GAP = 4;
/** How fast the measured tick length follows new samples; samples off by 2x are stalls, not ticks. */
const TICK_LENGTH_GAIN = 0.1;

export class Motion {
  /** Drawn head centre, in cells. Kept after death so effects know where the head was. */
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** Drawn facing, canvas radians (0 = up, clockwise). */
  readonly angle: Float64Array;
  /** 1 while the slot's head is drawn this frame. */
  readonly visible: Uint8Array;
  /** 1 once the slot has been drawn this round, i.e. x, y, angle and trailCopy mean something. */
  readonly seen: Uint8Array;
  /** Renderer clock (seconds) when the current life started, for the spawn pop. */
  readonly bornAt: Float64Array;
  /** The last trail each slot had while alive, in cells (x, y pairs), for the death fade. */
  readonly trailCopy: Float32Array[];
  readonly trailLen: Int32Array;

  /** Each head's position at `tick` and its planned move over the coming tick, in cells. */
  private readonly baseX: Float64Array;
  private readonly baseY: Float64Array;
  private readonly stepX: Float64Array;
  private readonly stepY: Float64Array;
  private readonly offX: Float64Array;
  private readonly offY: Float64Array;
  private readonly wasAlive: Uint8Array;
  /** Scratch for planHeadMove: no allocation per head per frame. */
  private readonly next: HeadMove = { x: 0, y: 0, heading: 0, moveHeading: 0, slideSide: 0, moved: false };
  private round = -1;
  private seed = -1;
  /** The view's tick last frame. */
  private tick = 0;
  /** Draw time, in ticks: `tick` plus how far into the coming tick heads are drawn. */
  private time = 0;
  /** Measured real length of a tick (seconds), which can differ from the config (the hub art plays slower). */
  private tickSeconds = 0;
  private lastStepAt = -1;

  constructor(slots: number) {
    this.x = new Float64Array(slots);
    this.y = new Float64Array(slots);
    this.angle = new Float64Array(slots);
    this.visible = new Uint8Array(slots);
    this.seen = new Uint8Array(slots);
    this.bornAt = new Float64Array(slots);
    this.trailCopy = Array.from({ length: slots }, () => new Float32Array(256));
    this.trailLen = new Int32Array(slots);
    this.baseX = new Float64Array(slots);
    this.baseY = new Float64Array(slots);
    this.stepX = new Float64Array(slots);
    this.stepY = new Float64Array(slots);
    this.offX = new Float64Array(slots);
    this.offY = new Float64Array(slots);
    this.wasAlive = new Uint8Array(slots);
  }

  get slots(): number {
    return this.x.length;
  }

  /** `alpha` is the client's progress toward the next tick; `clock` the renderer's time in seconds. */
  update(view: SimState, alpha: number, dt: number, clock: number): void {
    const fresh = view.round !== this.round || view.seed !== this.seed;
    this.round = view.round;
    this.seed = view.seed;
    if (fresh) {
      this.seen.fill(0);
      this.tickSeconds = 1 / view.config.ticksPerSecond;
    }
    const steps = view.tick - this.tick;
    this.measureTick(steps, clock);
    const jumped = fresh || steps < 0 || steps > MAX_TICK_GAP;

    // This frame in the previous frame's tick, had the draw time just run on: old plans
    // are known up to the end of their tick.
    const runOn = this.time + dt / this.tickSeconds;
    const oldPhase = jumped ? 0 : Math.min(runOn, this.tick + 1) - this.tick;
    // The old and new plans meet at the start of the new tick; within one tick, at this frame.
    const newPhase = steps === 0 ? oldPhase : 0;
    const reported = view.tick + alpha;
    const ran = Math.max(runOn, view.tick);
    const time = jumped ? reported : ran + (reported - ran) * (1 - Math.exp(-dt / TIME_PULL_SECONDS));
    this.time = clamp(time, view.tick, view.tick + 1);
    this.tick = view.tick;
    const phase = this.time - view.tick;

    const decay = Math.exp(-dt / CORRECTION_SECONDS);
    const turnEase = 1 - Math.exp(-dt / TURN_SMOOTH_SECONDS);
    const next = this.next;
    const n = Math.min(view.players.length, this.slots);
    for (let s = 1; s < n; s++) {
      const p = view.players[s];
      if (!p || !p.alive) {
        this.visible[s] = 0;
        this.wasAlive[s] = 0;
        continue;
      }
      planHeadMove(view, p, next);
      const bx = p.x / SUB;
      const by = p.y / SUB;
      const sx = next.moved ? (next.x - p.x) / SUB : 0;
      const sy = next.moved ? (next.y - p.y) / SUB : 0;
      const born = this.wasAlive[s] === 0 || fresh;

      if (this.wasAlive[s] === 0) this.bornAt[s] = clock;
      if (born || jumped) {
        this.offX[s] = 0;
        this.offY[s] = 0;
      } else {
        const ex = this.baseX[s] + oldPhase * this.stepX[s] - (bx + newPhase * sx);
        const ey = this.baseY[s] + oldPhase * this.stepY[s] - (by + newPhase * sy);
        if (ex * ex + ey * ey > MAX_CORRECTION * MAX_CORRECTION) {
          this.offX[s] = 0;
          this.offY[s] = 0;
        } else {
          this.offset(s, this.offX[s] + ex, this.offY[s] + ey);
        }
      }
      this.baseX[s] = bx;
      this.baseY[s] = by;
      this.stepX[s] = sx;
      this.stepY[s] = sy;
      this.offX[s] *= decay;
      this.offY[s] *= decay;
      this.x[s] = bx + phase * sx + this.offX[s];
      this.y[s] = by + phase * sy + this.offY[s];

      // Facing turns from the last move's direction to the coming one's as the tick plays out.
      const from = headingRadians(p.moveHeading);
      const target = next.moved ? from + angleDelta(from, headingRadians(next.moveHeading)) * phase : from;
      this.angle[s] = born ? target : this.angle[s] + angleDelta(this.angle[s], target) * turnEase;
      this.visible[s] = 1;
      this.seen[s] = 1;
      this.wasAlive[s] = 1;
      if (born || steps !== 0) this.copyTrail(s, p.trailPath);
    }
    for (let s = n; s < this.slots; s++) this.visible[s] = 0;
  }

  /** Sets a slot's correction; errors piling up past MAX_CORRECTION give up their excess at once rather than lag on. */
  private offset(s: number, ox: number, oy: number): void {
    const len = Math.sqrt(ox * ox + oy * oy);
    const k = len > MAX_CORRECTION ? MAX_CORRECTION / len : 1;
    this.offX[s] = ox * k;
    this.offY[s] = oy * k;
  }

  /** Learns the real tick length from single-tick steps, which the draw time runs on at. */
  private measureTick(steps: number, clock: number): void {
    if (steps === 1 && this.lastStepAt >= 0) {
      const sample = clock - this.lastStepAt;
      if (sample > this.tickSeconds / 2 && sample < this.tickSeconds * 2) {
        this.tickSeconds += (sample - this.tickSeconds) * TICK_LENGTH_GAIN;
      }
    }
    if (steps !== 0) this.lastStepAt = clock;
  }

  private copyTrail(s: number, path: readonly number[]): void {
    if (this.trailCopy[s].length < path.length) this.trailCopy[s] = new Float32Array(path.length * 2);
    const out = this.trailCopy[s];
    for (let i = 0; i < path.length; i++) out[i] = path[i] / SUB;
    this.trailLen[s] = path.length;
  }
}
