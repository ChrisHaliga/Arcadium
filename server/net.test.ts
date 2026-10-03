/**
 * Proves online play stays in lockstep: a real server on a free port, real WebSocket
 * clients steering at random, and every client's confirmed state matching the server
 * room's checksum on the same ticks (frames carry checksum(room.sim) every
 * NET.checksumEvery ticks; the tap below records them before the client sees them).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NET } from '../src/games/landgrab/config';
import { DEFAULT_LOADOUT } from '../src/games/landgrab/content';
import { ANGLES, checksum } from '../src/games/landgrab/core';
import { createMatchClient, type MatchClient } from '../src/games/landgrab/net';
import { SEAT_TAKEN_OVER, type Transport } from '../src/games/landgrab/net/protocol';
import { openWebSocket, wsTransport } from '../src/games/landgrab/net/wsTransport';
import { createServer, PLAY_PATH, type GameServer } from './server';

interface Player {
  client: MatchClient;
  /** checksum(room.sim) the server sent, by tick. */
  serverSums: Map<number, number>;
  /** checksum(client.confirmed) after each confirmed tick. */
  clientSums: Map<number, number>;
  /** Slots that had steer commands in the frames this client received. */
  steeredSlots: Set<number>;
  resyncs: number;
  stop(): void;
}

let server: GameServer;
let url: string;
const players: Player[] = [];

beforeAll(async () => {
  server = await createServer({ port: 0, region: 'test' });
  url = `ws://127.0.0.1:${server.port}${PLAY_PATH}`;
});

afterAll(async () => {
  for (const p of players) p.stop();
  await server.close();
});

describe('match server', () => {
  it('keeps two randomly steering WebSocket clients in lockstep with the server room', async () => {
    const a = await join('a');
    const b = await join('b');
    expect(a.client.mySlot).toBeGreaterThan(0);
    expect(b.client.mySlot).toBeGreaterThan(0);
    expect(a.client.mySlot).not.toBe(b.client.mySlot);
    expect(server.stats()).toMatchObject({ region: 'test', rooms: 1, humans: 2 });

    await sleep(3000);
    const end = await nextServerChecksumTick([a, b]);

    for (const p of [a, b]) {
      expect(p.clientSums.get(end)).toBe(p.serverSums.get(end));
      expectAgreement(p);
      expect(p.resyncs).toBe(0);
    }
    expect(a.clientSums.get(end)).toBe(b.clientSums.get(end));
    // The random steering really went through the room into the frames.
    for (const p of [a, b]) expect(p.steeredSlots.has(p.client.mySlot)).toBe(true);
  });

  it('brings a client joining mid-match to the same state', async () => {
    const c = await join('c');
    await sleep(1500);
    const end = await nextServerChecksumTick(players);

    for (const p of players) {
      expect(p.clientSums.get(end)).toBe(p.serverSums.get(end));
      expectAgreement(p);
      expect(p.resyncs).toBe(0);
    }
    expect(c.clientSums.size).toBeGreaterThan(0);
    expect(server.stats().humans).toBe(3);
  });

  it('hands a player who connects again their own seat instead of a second one', async () => {
    const first = players[0];
    const replaced = new Promise<string>((resolve) =>
      first.client.onStatus((status) => status.kind === 'disconnected' && resolve(status.reason)),
    );
    const again = await join('a');

    expect(await replaced).toBe(SEAT_TAKEN_OVER);
    expect(again.client.mySlot).toBe(first.client.mySlot);
    await nextServerChecksumTick([again]);
    expect(server.stats().humans).toBe(3);
    const seats = again.client.confirmed.players.filter((p) => p?.profile.id === 'test-a');
    expect(seats).toHaveLength(1);
  });
});

/** Connects over WebSocket, records checksums, steers randomly and respawns after every death. */
async function join(name: string): Promise<Player> {
  const socket = await openWebSocket(url, 2000);
  const serverSums = new Map<number, number>();
  const steeredSlots = new Set<number>();
  const inner = wsTransport(socket);
  inner.onMessage((msg) => {
    if (msg.t !== 'frame') return;
    if (msg.f.checksum !== undefined) serverSums.set(msg.f.tick, msg.f.checksum);
    for (const cmd of msg.f.cmds) if (cmd.t === 'steer') steeredSlots.add(cmd.slot);
  });
  let resyncs = 0;
  const transport: Transport = {
    ...inner,
    send(msg) {
      if (msg.t === 'resync') resyncs++;
      inner.send(msg);
    },
  };
  const client = await createMatchClient(transport, {
    id: `test-${name}`,
    name,
    color: players.length,
    cosmetics: { ...DEFAULT_LOADOUT },
  });
  const clientSums = new Map<number, number>();
  client.onTick((s) => clientSums.set(s.tick, checksum(s)));
  client.onEvent((e) => {
    if (e.t === 'death' && e.slot === client.mySlot) client.respawn();
  });
  // Turn somewhere new every 50-250 ms, and draw (predict) every frame like the game does.
  let steering = setTimeout(function turn() {
    client.steer(Math.floor(Math.random() * ANGLES));
    steering = setTimeout(turn, 50 + Math.random() * 200);
  }, 0);
  const drawing = setInterval(() => {
    client.view();
    client.alpha(performance.now());
  }, 16);
  const player: Player = {
    client,
    serverSums,
    clientSums,
    steeredSlots,
    get resyncs() {
      return resyncs;
    },
    stop() {
      clearTimeout(steering);
      clearInterval(drawing);
      client.dispose();
    },
  };
  players.push(player);
  return player;
}

/** Every tick both the server and this client fingerprinted must match. */
function expectAgreement(p: Player): void {
  let compared = 0;
  for (const [tick, sum] of p.serverSums) {
    if (!p.clientSums.has(tick)) continue;
    expect(p.clientSums.get(tick), `tick ${tick}`).toBe(sum);
    compared++;
  }
  expect(compared).toBeGreaterThan(0);
}

/** Waits until every player has confirmed a tick the server sent a checksum for, and returns it. */
async function nextServerChecksumTick(group: readonly Player[]): Promise<number> {
  const from = Math.max(...group.map((p) => p.client.confirmed.tick));
  const target = (Math.floor(from / NET.checksumEvery) + 1) * NET.checksumEvery;
  await waitFor(() => group.every((p) => p.client.confirmed.tick >= target && p.serverSums.has(target)));
  return target;
}

async function waitFor(done: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (!done()) {
    if (performance.now() > deadline) throw new Error('timed out');
    await sleep(10);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
