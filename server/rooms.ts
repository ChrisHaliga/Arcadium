/**
 * Matchmaking and room lifetimes for one server. New players go to the room with the most
 * humans that still has a seat for them, so people meet each other instead of spreading
 * out over bot-filled rooms; a room opens only when every room is full of humans. A room
 * nobody is connected to is shut down after ROOM.emptyRoomTimeoutMs, so an idle server
 * costs next to nothing.
 */
import { randomInt } from 'node:crypto';
import { ROOM, SIM_CONFIG } from '../src/games/landgrab/config';
import type { SimConfig } from '../src/games/landgrab/core';
import { createRoom } from '../src/games/landgrab/room';
import { RoomHost } from '../src/games/landgrab/net/roomHost';
import type { Lobby } from '../src/games/landgrab/net/session';

export interface RoomManagerOptions {
  region: string;
  /** Tuning for new rooms; tests and tools use a smaller map. */
  simConfig?: SimConfig;
  emptyRoomTimeoutMs?: number;
}

export interface RoomCounts {
  rooms: number;
  humans: number;
  bots: number;
}

interface ManagedRoom {
  host: RoomHost;
  /** When the last connection left, null while anyone is connected. */
  emptySince: number | null;
}

export class RoomManager implements Lobby {
  readonly region: string;
  readonly simConfig: SimConfig;
  private readonly capacity: number;
  private readonly emptyRoomTimeoutMs: number;
  /** Oldest first, so ties go to the room that has been running longest. */
  private rooms: ManagedRoom[] = [];

  constructor(opts: RoomManagerOptions) {
    this.region = opts.region;
    this.simConfig = opts.simConfig ?? SIM_CONFIG;
    this.capacity = Math.min(ROOM.capacity, this.simConfig.maxSlots);
    this.emptyRoomTimeoutMs = opts.emptyRoomTimeoutMs ?? ROOM.emptyRoomTimeoutMs;
  }

  /**
   * The room holding the player's seat, else the busiest room with a seat left. Nobody
   * watches online (only the hub's offline background match spectates), so spectators are
   * turned away rather than allowed to pile up in a room at a player's cost each.
   */
  roomFor(playerId: string, spectate: boolean): RoomHost | null {
    if (spectate) return null;
    const seated = this.rooms.find((managed) => managed.host.hasSeat(playerId));
    if (seated) return seated.host;
    let best: ManagedRoom | null = null;
    let bestHumans = -1;
    for (const managed of this.rooms) {
      const humans = managed.host.room.humanCount();
      if (humans >= this.capacity) continue;
      if (humans > bestHumans) {
        best = managed;
        bestHumans = humans;
      }
    }
    return (best ?? this.open()).host;
  }

  /** Advances every room by one tick and shuts the ones that have stood empty too long. */
  tick(nowMs: number): void {
    this.rooms = this.rooms.filter((managed) => this.advance(managed, nowMs));
  }

  counts(): RoomCounts {
    let humans = 0;
    let bots = 0;
    for (const { host } of this.rooms) {
      humans += host.room.humanCount();
      for (const p of host.room.sim.players) if (p?.profile.kind === 'bot') bots++;
    }
    return { rooms: this.rooms.length, humans, bots };
  }

  /** Ticks one room; false when it should close. */
  private advance(managed: ManagedRoom, nowMs: number): boolean {
    try {
      managed.host.tick();
    } catch (err) {
      // A bug in one match must not take every other match on the server down with it.
      console.error('room crashed; closing it', err);
      managed.host.closeAll('room error');
      return false;
    }
    if (managed.host.connections() > 0) {
      managed.emptySince = null;
      return true;
    }
    managed.emptySince ??= nowMs;
    return nowMs - managed.emptySince < this.emptyRoomTimeoutMs;
  }

  private open(): ManagedRoom {
    const room = createRoom({ seed: randomInt(2 ** 32), capacity: this.capacity }, this.simConfig);
    const managed: ManagedRoom = { host: new RoomHost(room), emptySince: null };
    this.rooms.push(managed);
    return managed;
  }
}
