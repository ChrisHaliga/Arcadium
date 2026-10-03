/**
 * MatchClient (contract in net/contract.ts): the game's view of a match, online or offline.
 *
 * Confirmed state advances only by host frames and is checked against the host's
 * checksums; a mismatch asks for a fresh snapshot. The view is confirmed state predicted
 * a round trip ahead (MatchClock): this player's sent steers are replayed on the ticks the
 * host is expected to apply them, everyone else keeps steering as last seen. Because a
 * steer lands in the prediction where it will land for real, confirmed state catching up
 * agrees with what was drawn instead of pulling the head back.
 */
import { NET } from '../config';
import {
  checksum,
  cloneState,
  copyState,
  deserialize,
  normalizeHeading,
  step,
  type Command,
  type Heading,
  type SimEvent,
  type SimState,
  type Slot,
  type Snapshot,
} from '../core';
import type { Frame } from '../room/contract';
import { MatchClock } from './clock';
import type { CreateMatchClient, MatchClient, MatchStatus } from './contract';
import type { ServerMsg, Transport } from './protocol';

const PING_INTERVAL_MS = 2000;
const JOIN_TIMEOUT_MS = 10_000;
/** Weight of each new round-trip sample in the smoothed RTT. */
const RTT_GAIN = 0.2;

/** Why joining failed: a host rejection ('full', 'version', 'bad-hello'), 'timeout', or the connection's close reason. */
export class JoinError extends Error {
  constructor(readonly reason: string) {
    super(`could not join the match: ${reason}`);
  }
}

type Welcome = Extract<ServerMsg, { t: 'welcome' }>;

/** Joins (or watches) the match behind `transport`; resolves once the welcome snapshot arrives. */
export const createMatchClient: CreateMatchClient = (transport, profile, spectate = false) =>
  new Promise((resolve, reject) => {
    let client: Client | null = null;
    let settled = false;
    let rtt: number | null = null;
    const fail = (reason: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      transport.close();
      reject(new JoinError(reason));
    };
    const timer = setTimeout(() => fail('timeout'), JOIN_TIMEOUT_MS);
    transport.onMessage((msg) => {
      if (client) {
        client.receive(msg);
      } else if (msg.t === 'pong') {
        rtt = performance.now() - msg.at;
      } else if (msg.t === 'reject') {
        fail(msg.reason);
      } else if (msg.t === 'welcome' && !settled) {
        settled = true;
        clearTimeout(timer);
        client = new Client(transport, msg, rtt);
        resolve(client);
      }
    });
    transport.onClose((reason) => (client ? client.closed(reason) : fail(reason)));
    // Pinging first gives the clock a round trip before the first frame arrives.
    transport.send({ t: 'ping', at: performance.now() });
    transport.send({ t: 'hello', v: NET.protocolVersion, profile, spectate });
  });

/** A steer sent to the host, with the tick it is predicted to take effect on. */
interface SentSteer {
  seq: number;
  heading: Heading;
  tick: number;
}

const NO_COMMANDS: readonly Command[] = [];

class Client implements MatchClient {
  readonly mySlot: Slot;
  readonly region: string;
  readonly roundEndTicks: number;
  private state: SimState;
  /** The view buffer, rebuilt from confirmed state in place. */
  private predicted: SimState;
  /** Confirmed state has moved since `predicted` was built from it. */
  private stale = true;
  private readonly clock: MatchClock;
  private rtt: number | null;
  private status: MatchStatus = { kind: 'playing' };
  private awaitingSnapshot = false;
  private disposed = false;
  private readonly pingTimer: ReturnType<typeof setInterval>;

  /** The heading the player wants now, and the last one sent (sends are throttled to one per tick). */
  private wanted: Heading | null = null;
  private lastSent: Heading | null = null;
  private sentThisTick = false;
  private seq = 0;
  /** Sent but not yet acknowledged, oldest first. */
  private readonly unacked: SentSteer[] = [];
  /** The newest acknowledged heading. The room re-applies it whenever this player's target differs (e.g. after a respawn). */
  private hostHeading: Heading | null = null;
  /** My real target in `predicted` while the view shows `wanted` in its place. */
  private shownOver: Heading | null = null;
  private readonly ownSteer: { t: 'steer'; slot: Slot; heading: Heading };
  private readonly ownCommands: readonly Command[];

  private alphaTick = -1;
  private lastAlpha = 0;

  private readonly eventListeners = new Set<(e: SimEvent, s: SimState) => void>();
  private readonly tickListeners = new Set<(s: SimState) => void>();
  private readonly statusListeners = new Set<(status: MatchStatus) => void>();
  private readonly reviveDeniedListeners = new Set<() => void>();

  constructor(
    private readonly transport: Transport,
    welcome: Welcome,
    rtt: number | null,
  ) {
    this.mySlot = welcome.slot;
    this.region = welcome.region;
    this.roundEndTicks = welcome.roundEndTicks;
    this.state = deserialize(welcome.snapshot);
    this.predicted = cloneState(this.state);
    this.clock = new MatchClock(1000 / welcome.tickRate, NET.maxPredictTicks);
    this.clock.arrived(this.state.tick, performance.now());
    this.rtt = rtt;
    if (rtt !== null) this.clock.rttMeasured(rtt);
    this.ownSteer = { t: 'steer', slot: this.mySlot, heading: 0 };
    this.ownCommands = [this.ownSteer];
    this.pingTimer = setInterval(() => this.transport.send({ t: 'ping', at: performance.now() }), PING_INTERVAL_MS);
  }

  get confirmed(): SimState {
    return this.state;
  }

  view(): SimState {
    const base = this.state.tick;
    const ahead = Math.floor(this.clock.renderTime(performance.now()));
    let target = Math.min(Math.max(ahead, base), base + this.clock.maxAhead());
    // Never show an older tick than last time, even if the lead just shrank.
    target = Math.max(target, Math.min(this.predicted.tick, base + NET.maxPredictTicks));
    this.unshowWanted();
    if (this.stale) {
      copyState(this.predicted, this.state);
      this.stale = false;
    }
    while (this.predicted.tick < target) this.stepPredicted();
    this.showWanted();
    return this.predicted;
  }

  alpha(nowMs: number): number {
    const tick = this.predicted.tick;
    let a = Math.min(1, Math.max(0, this.clock.renderTime(nowMs) - tick));
    if (tick === this.alphaTick) a = Math.max(a, this.lastAlpha);
    this.alphaTick = tick;
    this.lastAlpha = a;
    return a;
  }

  steer(heading: Heading): void {
    if (this.mySlot === 0 || !Number.isFinite(heading)) return;
    const wanted = normalizeHeading(Math.round(heading));
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    this.flushSteer();
  }

  revive(): void {
    if (this.mySlot !== 0) this.transport.send({ t: 'revive' });
  }

  respawn(): void {
    if (this.mySlot !== 0) this.transport.send({ t: 'respawn' });
  }

  onEvent(cb: (e: SimEvent, s: SimState) => void): () => void {
    return subscribe(this.eventListeners, cb);
  }

  onTick(cb: (s: SimState) => void): () => void {
    return subscribe(this.tickListeners, cb);
  }

  /** Called with the current status right away, then on every change. */
  onStatus(cb: (status: MatchStatus) => void): () => void {
    cb(this.status);
    return subscribe(this.statusListeners, cb);
  }

  onReviveDenied(cb: () => void): () => void {
    return subscribe(this.reviveDeniedListeners, cb);
  }

  rttMs(): number {
    return this.rtt ?? 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.pingTimer);
    this.eventListeners.clear();
    this.tickListeners.clear();
    this.statusListeners.clear();
    this.reviveDeniedListeners.clear();
    this.transport.close();
  }

  receive(msg: ServerMsg): void {
    if (this.disposed) return;
    switch (msg.t) {
      case 'frame':
        return this.applyFrame(msg.f, msg.ack);
      case 'snapshot':
        return this.replaceState(msg.snapshot);
      case 'pong':
        return this.measureRtt(performance.now() - msg.at);
      case 'reviveDenied':
        for (const cb of this.reviveDeniedListeners) cb();
        return;
    }
  }

  closed(reason: string): void {
    clearInterval(this.pingTimer);
    if (this.disposed || this.status.kind === 'disconnected') return;
    this.status = { kind: 'disconnected', reason };
    for (const cb of this.statusListeners) cb(this.status);
  }

  private applyFrame(frame: Frame, ack: number): void {
    this.clock.arrived(frame.tick, performance.now());
    this.acknowledge(ack);
    this.sentThisTick = false;
    this.flushSteer();
    const { state } = this;
    // While a snapshot is on its way, frames would only build on a state known to be wrong.
    if (this.awaitingSnapshot || frame.tick <= state.tick) return;
    if (frame.tick !== state.tick + 1) {
      this.requestResync();
      return;
    }
    const events = step(state, frame.cmds);
    this.stale = true;
    for (const e of events) for (const cb of this.eventListeners) cb(e, state);
    for (const cb of this.tickListeners) cb(state);
    if (frame.checksum !== undefined && checksum(state) !== frame.checksum) this.requestResync();
  }

  private replaceState(snapshot: Snapshot): void {
    const next = deserialize(snapshot);
    if (next.owner.length === this.state.owner.length && next.players.length === this.state.players.length) {
      // In place, so anyone holding `confirmed` keeps a live reference.
      copyState(this.state, next);
    } else {
      this.state = next;
      this.predicted = cloneState(next);
      this.shownOver = null;
    }
    this.awaitingSnapshot = false;
    this.stale = true;
    for (const cb of this.tickListeners) cb(this.state);
  }

  private requestResync(): void {
    if (this.awaitingSnapshot) return;
    this.awaitingSnapshot = true;
    this.transport.send({ t: 'resync' });
  }

  private measureRtt(sample: number): void {
    if (sample < 0) return;
    this.rtt = this.rtt === null ? sample : this.rtt + (sample - this.rtt) * RTT_GAIN;
    this.clock.rttMeasured(this.rtt);
  }

  private acknowledge(ack: number): void {
    while (this.unacked.length > 0 && this.unacked[0].seq <= ack) this.hostHeading = this.unacked.shift()!.heading;
  }

  private flushSteer(): void {
    const { wanted } = this;
    if (this.sentThisTick || wanted === null || wanted === this.lastSent || this.disposed) return;
    const now = performance.now();
    const last = this.unacked[this.unacked.length - 1];
    // Not before the next tick to be predicted (what is already drawn stays drawn), and in send order.
    const tick = Math.max(this.predicted.tick + 1, this.clock.applyTick(now), last ? last.tick : 0);
    this.seq++;
    this.unacked.push({ seq: this.seq, heading: wanted, tick });
    this.lastSent = wanted;
    this.sentThisTick = true;
    this.transport.send({ t: 'steer', heading: wanted, seq: this.seq });
  }

  private stepPredicted(): void {
    const heading = this.headingOn(this.predicted.tick + 1);
    if (heading === null) {
      step(this.predicted, NO_COMMANDS);
      return;
    }
    this.ownSteer.heading = heading;
    step(this.predicted, this.ownCommands);
  }

  /** The heading the host will have for this player on `tick`: the newest sent steer due by then, else the acknowledged one. */
  private headingOn(tick: number): Heading | null {
    for (let i = this.unacked.length - 1; i >= 0; i--) if (this.unacked[i].tick <= tick) return this.unacked[i].heading;
    return this.hostHeading;
  }

  /**
   * The view shows the player's wanted heading as their target at once, even before it is
   * sent or due; it is display only and is taken back out before predicting further.
   */
  private showWanted(): void {
    const me = this.predicted.players[this.mySlot];
    if (this.mySlot === 0 || this.wanted === null || !me?.alive || me.targetHeading === this.wanted) return;
    this.shownOver = me.targetHeading;
    me.targetHeading = this.wanted;
  }

  private unshowWanted(): void {
    const me = this.predicted.players[this.mySlot];
    if (this.shownOver !== null && me) me.targetHeading = this.shownOver;
    this.shownOver = null;
  }
}

function subscribe<T>(set: Set<T>, cb: T): () => void {
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}
