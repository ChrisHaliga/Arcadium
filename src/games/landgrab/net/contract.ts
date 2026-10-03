/**
 * MatchClient: the game client's single view of a match, online or offline.
 * It keeps an authoritative copy of the simulation (advanced only by server frames),
 * plus a predicted copy that applies this player's unacknowledged turns immediately
 * so controls feel instant. Rendering reads view(); gameplay feedback (sounds,
 * coins, callouts) listens to confirmed events only, so nothing is ever "taken back".
 *
 * CONTRACT FILE: implemented in net/client.ts.
 */
import type { Heading, SimEvent, SimState, Slot } from '../core/types';
import type { HelloProfile, Transport } from './protocol';

export type MatchStatus =
  | { kind: 'connecting' }
  | { kind: 'playing' }
  | { kind: 'disconnected'; reason: string };

export interface MatchClient {
  readonly mySlot: Slot;
  readonly region: string;
  /** The host's wait from a round's end to the next map, in ticks. */
  readonly roundEndTicks: number;
  /** Authoritative state, advanced by server frames only. */
  readonly confirmed: SimState;
  /** State to draw: confirmed + local prediction (reused buffers — don't keep references across frames). */
  view(): SimState;
  /** 0..1 progress from view().tick toward the next tick, for smooth movement. Never goes backwards within a tick. */
  alpha(nowMs: number): number;
  /** Target heading in [0, ANGLES). Cheap to call every frame; only changes are sent. */
  steer(heading: Heading): void;
  revive(): void;
  respawn(): void;
  /** Confirmed simulation events, in order. Returns an unsubscribe function. */
  onEvent(cb: (e: SimEvent, s: SimState) => void): () => void;
  /** Called after each confirmed frame is applied. */
  onTick(cb: (s: SimState) => void): () => void;
  onStatus(cb: (status: MatchStatus) => void): () => void;
  onReviveDenied(cb: () => void): () => void;
  rttMs(): number;
  dispose(): void;
}

/** How the room is set up. Who joins it, and whether they play or watch, goes in their hello like online. */
export interface LocalMatchOptions {
  seed?: number;
  /** Bots fill up to this many players. Defaults to ROOM.minPopulation. */
  minPopulation?: number;
}

/** A match hosted in this process: the transport a MatchClient joins it through, and the room's clock. */
export interface LocalMatch {
  transport: Transport;
  /**
   * Stops the room (nothing moves, revive windows and the next-map countdown hold) or starts
   * it again. Only a local match can pause: online, the others play on.
   */
  setPaused(paused: boolean): void;
  dispose(): void;
}

/**
 * Factories exported from net/index.ts:
 *   createLocalMatch(opts?)           in-process Room on a timer + loopback Transport (offline, attract mode), pausable
 *   createMatchClient(transport, profile, spectate?)  resolves once the welcome snapshot arrives
 *   connectOnline(servers, profile)   pings each server URL, joins the fastest; rejects if none answer
 *   gameServers()                     server URLs from VITE_GAME_SERVERS (comma separated) or NET.defaultServers
 */
export type CreateLocalMatch = (opts?: LocalMatchOptions) => LocalMatch;
export type CreateMatchClient = (transport: Transport, profile: HelloProfile, spectate?: boolean) => Promise<MatchClient>;
export type ConnectOnline = (servers: readonly string[], profile: HelloProfile) => Promise<MatchClient>;
