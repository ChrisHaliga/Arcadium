/**
 * A Room together with the connections watching it. Each tick the room's frame is encoded
 * once and goes to every connection, each stamped with that client's own ack. Snapshots,
 * the most expensive message, are built at most once per tick and shared by everyone
 * who needs one then. The match server holds many of these, the local host exactly one;
 * both drive tick() from a timer.
 *
 * A player holds one seat however many connections they open: the newest takes it over.
 */
import { NET } from '../config';
import type { Slot, Snapshot } from '../core/types';
import type { Frame, RoomApi } from '../room/contract';
import { toJson, type Json } from './codec';
import { SEAT_TAKEN_OVER, type HelloProfile } from './protocol';

/**
 * A room serves resyncs at most once per this many ticks, however many members ask (an
 * honest client asks at most once per checksum), so asking can't slow the room down.
 */
const RESYNC_COOLDOWN_TICKS = NET.checksumEvery;

/** One connection's end of the room: what the host needs to feed and drop it. */
export interface RoomMember {
  sendFrame(frame: Json<Frame>): void;
  /** A resync: the state the frame just sent produced. */
  sendSnapshot(snapshot: Json<Snapshot>): void;
  close(reason: string): void;
}

interface Seat {
  member: RoomMember;
  slot: Slot;
}

export class RoomHost {
  private readonly members = new Set<RoomMember>();
  /** Who holds each seat, by player id. */
  private readonly seats = new Map<string, Seat>();
  /** Members waiting for a resync snapshot. */
  private readonly resyncs = new Set<RoomMember>();
  private lastResyncTick = -Infinity;
  /** The latest snapshot and the tick it shows. Only step() changes the state, and it always moves the tick. */
  private latest: { tick: number; json: Json<Snapshot> } | null = null;

  constructor(readonly room: RoomApi) {}

  get tickRate(): number {
    return this.room.sim.config.ticksPerSecond;
  }

  /** Players and spectators currently connected. */
  connections(): number {
    return this.members.size;
  }

  /** Whether this player has a seat here, which their next connection takes over. */
  hasSeat(playerId: string): boolean {
    return this.seats.has(playerId);
  }

  /**
   * Lets `member` in to watch (slot 0) or to play as `profile`. A player who already has a
   * seat (the game open twice, or back before their dropped connection timed out) takes it
   * over as it is, and the connection that held it is closed. null when the room is full.
   */
  enter(member: RoomMember, profile: HelloProfile, spectate: boolean): Slot | null {
    let slot: Slot | null = 0;
    if (!spectate) {
      const held = this.seats.get(profile.id);
      if (held) {
        // Forgotten first, so closing the old connection doesn't give the seat up.
        this.seats.delete(profile.id);
        held.member.close(SEAT_TAKEN_OVER);
      }
      slot = held?.slot ?? this.room.addHuman(profile);
      if (slot === null) return null;
      this.seats.set(profile.id, { member, slot });
    }
    this.members.add(member);
    return slot;
  }

  /** The member's connection ended: their seat goes with it, unless a newer connection took it over. */
  leave(member: RoomMember): void {
    this.members.delete(member);
    this.resyncs.delete(member);
    for (const [playerId, seat] of this.seats) {
      if (seat.member !== member) continue;
      this.seats.delete(playerId);
      this.room.removeHuman(seat.slot);
      return;
    }
  }

  /** The current state, encoded at most once per tick. */
  snapshot(): Json<Snapshot> {
    const { tick } = this.room.sim;
    if (this.latest?.tick !== tick) this.latest = { tick, json: toJson(this.room.snapshot()) };
    return this.latest.json;
  }

  /** The member gets a snapshot right after a coming frame. */
  requestResync(member: RoomMember): void {
    if (this.members.has(member)) this.resyncs.add(member);
  }

  tick(): void {
    const frame = toJson(this.room.tick().frame);
    for (const member of this.members) member.sendFrame(frame);
    this.serveResyncs();
  }

  /** Disconnects everyone, e.g. when the room shuts down. */
  closeAll(reason: string): void {
    for (const member of [...this.members]) member.close(reason);
  }

  private serveResyncs(): void {
    const { tick } = this.room.sim;
    if (this.resyncs.size === 0 || tick - this.lastResyncTick < RESYNC_COOLDOWN_TICKS) return;
    this.lastResyncTick = tick;
    const snapshot = this.snapshot();
    for (const member of this.resyncs) member.sendSnapshot(snapshot);
    this.resyncs.clear();
  }
}
