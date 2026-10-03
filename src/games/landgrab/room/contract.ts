/**
 * Room: the match authority. Owns one simulation plus everything around it that
 * isn't a rule of the game: bots, filling empty seats, respawn/revive requests,
 * round transitions. It runs on the server for online play and in-process for
 * offline play and the hub's background match. It never touches the network,
 * timers or the DOM; callers drive it by calling tick() at SIM_CONFIG.ticksPerSecond.
 *
 * CONTRACT FILE: implemented in room/room.ts.
 */
import type { Command, Heading, PlayerProfile, SimEvent, SimState, Slot, Snapshot } from '../core/types';

/** One step of the match: the exact commands every client must apply to stay in sync. */
export interface Frame {
  /** state.tick after applying this frame. */
  tick: number;
  cmds: Command[];
  /** checksum(state) after applying, present every NET.checksumEvery ticks unless the room was made without checksums. */
  checksum?: number;
}

export interface RoomOptions {
  /** Seeds the first map and the room's own RNG (bot names, bot decisions, later map seeds). */
  seed: number;
  /** Defaults to ROOM.capacity. */
  capacity?: number;
  /** Defaults to ROOM.minPopulation. 0 disables bots. */
  minPopulation?: number;
  /** Defaults to ROOM.roundEndTicks. */
  roundEndTicks?: number;
  /**
   * Stamp frames with checksums so clients can catch a desync (default true). A room in the
   * client's own tab, reached through a loopback, can't drift from it and goes without.
   */
  checksums?: boolean;
}

export interface RoomTickResult {
  frame: Frame;
  events: SimEvent[];
}

export interface RoomApi {
  readonly sim: SimState;
  /** Ticks from a round's end to the next map. */
  readonly roundEndTicks: number;
  /** Reserve a slot for a human; they join on the next tick. null when full. */
  addHuman(profile: Omit<PlayerProfile, 'kind'>): Slot | null;
  removeHuman(slot: Slot): void;
  /** Latest call before the next tick wins; emitted as a steer command only when it changed. */
  setSteer(slot: Slot, heading: Heading): void;
  /** True if accepted (dead, revive window open, revives left, land left, round not over). Applied next tick. */
  requestRevive(slot: Slot): boolean;
  /** Start a new life for a dead human (also used after a round ends). Applied next tick. */
  requestRespawn(slot: Slot): boolean;
  humanCount(): number;
  tick(): RoomTickResult;
  snapshot(): Snapshot;
}
