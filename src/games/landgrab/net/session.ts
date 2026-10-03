/**
 * The host side of one client connection: turns validated client messages into Room
 * requests and sends back the welcome, frames, snapshots and replies. The match server
 * and the local host both use it, so online and offline matches behave identically.
 *
 * Lifecycle: answer pings at any time (server probing measures RTT before joining);
 * the first valid hello takes a seat (or watches) in the room the lobby picks; closing
 * the connection gives the seat up, unless a newer connection of the same player took it.
 */
import type { Slot, Snapshot } from '../core/types';
import type { Frame } from '../room/contract';
import { encode, frameMsg, snapshotMsg, welcomeMsg, type Json } from './codec';
import type { HelloProfile, ServerMsg } from './protocol';
import type { RoomHost, RoomMember } from './roomHost';
import { parseClientMsg } from './validate';

/** The host's end of a connection. What arrives is untrusted and unchecked. */
export interface PeerLink {
  send(msg: Json<ServerMsg>): void;
  onMessage(cb: (raw: unknown) => void): void;
  /** Fires once when the connection ends, whichever side ended it. */
  onClose(cb: (reason: string) => void): void;
  close(reason: string): void;
}

/** Where newcomers go: the server's matchmaker, or the single room of a local match. */
export interface Lobby {
  readonly region: string;
  /** The room a newcomer should enter (the one holding their seat, if any), or null when none can take them. */
  roomFor(playerId: string, spectate: boolean): RoomHost | null;
}

/** What the owner of a connection can see of its session. */
export interface SessionState {
  /** Nothing has answered a hello yet: no seat, no watch, no refusal. */
  readonly awaitingHello: boolean;
}

type RejectReason = Extract<ServerMsg, { t: 'reject' }>['reason'];

export function openSession(link: PeerLink, lobby: Lobby): SessionState {
  const session = new Session(link, lobby);
  link.onMessage((raw) => session.receive(raw));
  link.onClose(() => session.leave());
  return session;
}

class Session implements RoomMember, SessionState {
  private host: RoomHost | null = null;
  /** 0 while spectating or before joining. */
  private slot: Slot = 0;
  /** Highest steer seq handed to the room; every frame carries it as the ack. */
  private ack = 0;
  private ended = false;

  constructor(
    private readonly link: PeerLink,
    private readonly lobby: Lobby,
  ) {}

  get awaitingHello(): boolean {
    return !this.host && !this.ended;
  }

  receive(raw: unknown): void {
    if (this.ended) return;
    const check = parseClientMsg(raw);
    if (!check.ok) {
      if (check.reject && !this.host) this.refuse(check.reject);
      return;
    }
    const msg = check.msg;
    if (msg.t === 'ping') {
      this.link.send(encode({ t: 'pong', at: msg.at }));
      return;
    }
    if (msg.t === 'hello') {
      if (!this.host) this.join(msg.profile, msg.spectate === true);
      return;
    }
    const { host, slot } = this;
    if (!host) return;
    switch (msg.t) {
      case 'steer':
        // Seqs only grow; anything older was superseded by a heading already applied.
        if (slot === 0 || msg.seq <= this.ack) return;
        host.room.setSteer(slot, msg.heading);
        this.ack = msg.seq;
        return;
      case 'revive':
        if (slot !== 0 && !host.room.requestRevive(slot)) this.link.send(encode({ t: 'reviveDenied' }));
        return;
      case 'respawn':
        if (slot !== 0) host.room.requestRespawn(slot);
        return;
      case 'resync':
        host.requestResync(this);
        return;
    }
  }

  sendFrame(frame: Json<Frame>): void {
    this.link.send(frameMsg(frame, this.ack));
  }

  sendSnapshot(snapshot: Json<Snapshot>): void {
    this.link.send(snapshotMsg(snapshot));
  }

  close(reason: string): void {
    this.leave();
    this.link.close(reason);
  }

  leave(): void {
    if (this.ended) return;
    this.ended = true;
    this.host?.leave(this);
  }

  private join(profile: HelloProfile, spectate: boolean): void {
    const host = this.lobby.roomFor(profile.id, spectate);
    const slot = host?.enter(this, profile, spectate) ?? null;
    if (!host || slot === null) {
      this.refuse('full');
      return;
    }
    this.host = host;
    this.slot = slot;
    // A new seat is taken on the room's next tick, which is the first frame this client receives.
    const { tickRate, room } = host;
    const { region } = this.lobby;
    this.link.send(welcomeMsg({ t: 'welcome', slot, tickRate, roundEndTicks: room.roundEndTicks, region }, host.snapshot()));
  }

  private refuse(reason: RejectReason): void {
    this.link.send(encode({ t: 'reject', reason }));
    this.ended = true;
    this.link.close(reason);
  }
}
