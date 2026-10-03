/**
 * Client-side match timing, in ticks. Frames arrive on the host's schedule plus network
 * delay and jitter; this turns their arrival times into one smooth, never-reversing render
 * time so heads glide instead of stuttering.
 *
 *   arrival time   continuous estimate of the newest confirmed tick, fitted to when frames
 *                  arrive (an average, so individual frames land a little early or late)
 *   render time    arrival time, minus a jitter margin so late frames rarely leave nothing
 *                  to show, plus a lead of about one round trip: that is how far ahead the
 *                  view is predicted, so a steer sent now shows up where the host will
 *                  apply it and confirmed state later agrees instead of snapping back
 */

/** How strongly each frame pulls the arrival fit. */
const ARRIVAL_GAIN = 0.1;
/** A frame this far off the fit means a pause (hidden tab, stall): start timing afresh. */
const RESET_MS = 250;
/** Render time stays this many average deviations behind the arrival fit. */
const JITTER_MARGIN = 2;
/** Deviation assumed until frames show the real one: timers alone wander a few ms. */
const INITIAL_DEVIATION_MS = 5;
/**
 * Round trips shorter than this (in ticks) aren't worth predicting. It also keeps the local
 * host, whose measured round trip is only main-thread busyness, at no prediction.
 */
const MIN_LEAD_TICKS = 0.5;
/** The lead eases toward a new round trip by at most this many ticks per tick of time (a 5% time warp). */
const LEAD_RATE = 0.05;

export class MatchClock {
  /** Local time (ms) at which tick 0 would have arrived, by the fit. */
  private origin = 0;
  /** Mean absolute distance of arrivals from the fit, in ms. */
  private deviation = INITIAL_DEVIATION_MS;
  private rttTicks = 0;
  private lead = 0;
  private leadTarget = 0;
  /** Arrivals seen; the first two place the clock outright. */
  private arrivals = 0;
  private measured = false;
  private lastNow = -Infinity;
  private lastRender = -Infinity;

  constructor(
    private readonly tickMs: number,
    /** Furthest the view may run ahead of confirmed, in ticks. */
    private readonly maxLead: number,
  ) {}

  /**
   * Confirmed state reached `tick` at nowMs. The first call (the welcome snapshot, sent
   * whenever the hello arrived rather than on a tick) only roughly places the clock; the
   * first frame places it exactly.
   */
  arrived(tick: number, nowMs: number): void {
    const sample = nowMs - tick * this.tickMs;
    const off = sample - this.origin;
    if (++this.arrivals <= 2 || Math.abs(off) > RESET_MS) {
      // Render time may step back here: after a pause the old schedule means nothing.
      this.origin = sample;
      this.deviation = INITIAL_DEVIATION_MS;
      this.lastRender = -Infinity;
      return;
    }
    this.origin += off * ARRIVAL_GAIN;
    this.deviation += (Math.abs(off) - this.deviation) * ARRIVAL_GAIN;
  }

  rttMeasured(rttMs: number): void {
    this.rttTicks = rttMs / this.tickMs;
    this.leadTarget = this.rttTicks < MIN_LEAD_TICKS ? 0 : Math.min(this.rttTicks, this.maxLead);
    if (!this.measured) this.lead = this.leadTarget;
    this.measured = true;
  }

  /** Continuous tick to draw at nowMs (the view's tick plus alpha). Never decreases between resets. */
  renderTime(nowMs: number): number {
    if (this.lastNow !== -Infinity) {
      const ease = (LEAD_RATE * Math.max(0, nowMs - this.lastNow)) / this.tickMs;
      this.lead += Math.max(-ease, Math.min(ease, this.leadTarget - this.lead));
    }
    this.lastNow = nowMs;
    const t = (nowMs - this.origin - JITTER_MARGIN * this.deviation) / this.tickMs + this.lead;
    this.lastRender = Math.max(this.lastRender, t);
    return this.lastRender;
  }

  /** Most ticks the view may be predicted past confirmed right now. */
  maxAhead(): number {
    return this.lead === 0 ? 0 : Math.min(this.maxLead, Math.ceil(this.lead));
  }

  /** The tick on which the host should apply a steer sent at nowMs: one round trip past the confirmed arrival fit. */
  applyTick(nowMs: number): number {
    return Math.floor((nowMs - this.origin) / this.tickMs + this.rttTicks) + 1;
  }
}
