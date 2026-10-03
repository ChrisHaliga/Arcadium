/**
 * The Landgrab match server: plain HTTP for health and stats, and a WebSocket endpoint
 * where each connection gets a session in a room picked by the RoomManager. All rooms
 * tick together on one fixed-rate timer. Stateless by design (no accounts, no storage),
 * so a region is just this program on a small machine.
 *
 * Nothing a client sends may take the process down: every room on the server would go
 * with it.
 */
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { SimConfig } from '../src/games/landgrab/core';
import { openSession } from '../src/games/landgrab/net/session';
import { startTicker } from '../src/games/landgrab/net/ticker';
import { Admission, clientAddress } from './admission';
import { Connection } from './connection';
import { RoomManager, type RoomCounts } from './rooms';

export const PLAY_PATH = '/play';
/** Client messages are tiny; the largest, a hello, is well under this. */
const MAX_MESSAGE_BYTES = 4096;
/** A peer that answers no ping for this long is gone (mobile handover, NAT timeout), and its seat is freed. */
const HEARTBEAT_MS = 5000;
/** Clients say hello right after connecting; a socket still silent after this only holds a place. */
const HELLO_TIMEOUT_MS = 5000;
/** How long shutdown waits for clients to finish the close handshake. */
const SHUTDOWN_GRACE_MS = 1000;

export interface ServerOptions {
  /** 0 picks a free port (tests). */
  port: number;
  /** Reported to clients and in /stats, e.g. 'us' or 'eu'. */
  region: string;
  /** Tuning for new rooms; tests and tools use a smaller map. */
  simConfig?: SimConfig;
}

export interface ServerStats extends RoomCounts {
  region: string;
}

export interface GameServer {
  /** The port actually listened on. */
  readonly port: number;
  stats(): ServerStats;
  /** Stops ticking, disconnects everyone and stops listening. */
  close(): Promise<void>;
}

export async function createServer(opts: ServerOptions): Promise<GameServer> {
  const rooms = new RoomManager({ region: opts.region, simConfig: opts.simConfig });
  const stats = (): ServerStats => ({ region: opts.region, ...rooms.counts() });
  const connections = new Set<Connection>();
  const admission = new Admission();

  const http = createHttpServer((req, res) => respond(req, res, stats));
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  http.on('upgrade', (req, socket, head) => {
    if (req.method !== 'GET' || pathOf(req) !== PLAY_PATH) {
      refuseUpgrade(socket, '404 Not Found');
      return;
    }
    const address = clientAddress(req);
    const refusal = admission.refusal(address);
    if (refusal) {
      refuseUpgrade(socket, refusal);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const release = admission.admit(address);
      const connection = new Connection(ws);
      connections.add(connection);
      const session = openSession(connection.link, rooms);
      const helloDeadline = setTimeout(() => {
        if (session.awaitingHello) connection.terminate();
      }, HELLO_TIMEOUT_MS);
      ws.once('close', () => {
        clearTimeout(helloDeadline);
        connections.delete(connection);
        release();
      });
    });
  });

  const ticker = startTicker(1000 / rooms.simConfig.ticksPerSecond, () => rooms.tick(performance.now()));
  const heartbeat = setInterval(() => {
    for (const connection of connections) connection.heartbeat();
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port, () => {
      http.off('error', reject);
      resolve();
    });
  });

  let closing: Promise<void> | null = null;
  const close = async () => {
    ticker.stop();
    clearInterval(heartbeat);
    for (const connection of connections) connection.shutdown();
    await waitUntil(() => connections.size === 0, SHUTDOWN_GRACE_MS);
    for (const connection of connections) connection.terminate();
    wss.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  };

  return {
    port: (http.address() as AddressInfo).port,
    stats,
    close: () => (closing ??= close()),
  };
}

function respond(req: IncomingMessage, res: ServerResponse, stats: () => ServerStats): void {
  const path = pathOf(req);
  if (path === null) {
    res.writeHead(400, { 'Content-Type': 'text/plain' }).end('bad request');
  } else if (req.method === 'GET' && path === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  } else if (req.method === 'GET' && path === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(stats()));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
  }
}

/**
 * Answers an upgrade the server won't take. Until ws takes a socket over, nothing listens
 * for its errors, and a client resetting the connection mid-answer would be an uncaught
 * error that ends the process.
 */
function refuseUpgrade(socket: Duplex, status: string): void {
  socket.on('error', () => socket.destroy());
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
}

/** The request's path, or null when its target isn't a URL at all (clients can send anything). */
function pathOf(req: IncomingMessage): string | null {
  return URL.parse(req.url ?? '/', 'http://server')?.pathname ?? null;
}

function waitUntil(done: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => (done() || performance.now() >= deadline ? resolve() : setTimeout(check, 20));
    check();
  });
}
