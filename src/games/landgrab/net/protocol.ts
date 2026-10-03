/**
 * Wire protocol between game clients and the match server (JSON over WebSocket).
 * Offline play uses the exact same messages over an in-process loopback transport.
 *
 * CONTRACT FILE.
 */
import type { Heading, Slot, Snapshot } from '../core/types';
import type { Loadout } from '../core/types';
import type { Frame } from '../room/contract';

export interface HelloProfile {
  id: string;
  name: string;
  color: number;
  cosmetics: Loadout;
}

export type ClientMsg =
  /**
   * spectate: watch without taking a seat (welcome.slot is then 0). Used for the hub's offline
   * background match; the match server takes no spectators and answers 'full'.
   */
  | { t: 'hello'; v: number; profile: HelloProfile; spectate?: boolean }
  /** Sent only when the target heading changes, at most once per tick. */
  | { t: 'steer'; heading: Heading; seq: number }
  | { t: 'revive' }
  | { t: 'respawn' }
  | { t: 'ping'; at: number }
  /** Client detected a checksum mismatch and wants a fresh snapshot. */
  | { t: 'resync' };

export type ServerMsg =
  /** roundEndTicks: the room's wait from a round's end to the next map, for the countdown. */
  | { t: 'welcome'; slot: Slot; snapshot: Snapshot; tickRate: number; roundEndTicks: number; region: string }
  /** ack = highest steer seq from this client applied so far (0 if none). */
  | { t: 'frame'; f: Frame; ack: number }
  | { t: 'snapshot'; snapshot: Snapshot }
  | { t: 'pong'; at: number }
  | { t: 'reviveDenied' }
  | { t: 'reject'; reason: 'full' | 'version' | 'bad-hello' };

/**
 * Why the host closed a connection: the same player connected again (the game open twice,
 * or a reconnect) and the newer connection took over their seat.
 */
export const SEAT_TAKEN_OVER = 'seat taken over by a newer connection';

/** Message-level transport. WebSocket online, loopback offline. */
export interface Transport {
  send(msg: ClientMsg): void;
  onMessage(cb: (msg: ServerMsg) => void): void;
  onClose(cb: (reason: string) => void): void;
  close(): void;
}
