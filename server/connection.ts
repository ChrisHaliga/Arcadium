/**
 * One player's WebSocket, adapted to the session's PeerLink. Everything here protects the
 * server from a single connection: a rate limit (excess messages are dropped before they
 * are even parsed), a cap on unsent data for clients that stop reading, and a heartbeat
 * that ends connections whose peer vanished without closing.
 */
import type { RawData, WebSocket } from 'ws';
import { NET } from '../src/games/landgrab/config';
import type { PeerLink } from '../src/games/landgrab/net/session';

/** A client that lets this much outgoing data pile up has stopped reading. */
const MAX_BUFFERED_BYTES = 1 << 20;

export class Connection {
  readonly link: PeerLink;
  private alive = true;
  private readonly limiter = new RateLimiter(NET.maxClientMsgsPerSecond);

  constructor(private readonly socket: WebSocket) {
    // Protocol violations (oversized or malformed frames) surface as 'error' and ws then
    // closes the socket itself; without a listener the error would crash the whole server.
    socket.on('error', () => socket.terminate());
    socket.on('pong', () => {
      this.alive = true;
    });
    this.link = {
      send: (text) => {
        if (socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
          socket.terminate();
          return;
        }
        socket.send(text);
      },
      onMessage: (cb) => {
        socket.on('message', (data, isBinary) => {
          if (isBinary || !this.limiter.allow(performance.now())) return;
          let msg: unknown;
          try {
            msg = JSON.parse(text(data));
          } catch {
            return;
          }
          cb(msg);
        });
      },
      onClose: (cb) => {
        socket.once('close', (code, reason) => cb(reason.toString() || `closed (${code})`));
      },
      close: (reason) => socket.close(1000, reason),
    };
  }

  /** Called on an interval: a peer that didn't answer the previous ping is gone. */
  heartbeat(): void {
    if (!this.alive) {
      this.socket.terminate();
      return;
    }
    this.alive = false;
    this.socket.ping();
  }

  /** Closes with "going away" so clients can tell a shutdown from a kick. */
  shutdown(): void {
    this.socket.close(1001, 'server shutting down');
  }

  /** Drops the connection without waiting for the peer's close handshake. */
  terminate(): void {
    this.socket.terminate();
  }
}

/** Token bucket: a steady rate with up to one second's worth of burst. */
class RateLimiter {
  private tokens: number;
  private last = performance.now();

  constructor(private readonly perSecond: number) {
    this.tokens = perSecond;
  }

  allow(nowMs: number): boolean {
    this.tokens = Math.min(this.perSecond, this.tokens + ((nowMs - this.last) * this.perSecond) / 1000);
    this.last = nowMs;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

function text(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data).toString('utf8');
}
