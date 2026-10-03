/**
 * In-memory connection between a MatchClient and a host in the same process (offline
 * play, the hub's background match). It behaves like a WebSocket so offline runs the
 * online code path: messages travel as JSON text, delivery is asynchronous and in order,
 * and closing either end closes both.
 */
import { parseServerMsg } from './codec';
import type { Transport } from './protocol';
import type { PeerLink } from './session';

export function createLoopbackPair(): { client: Transport; host: PeerLink } {
  const toHost = new Channel();
  const toClient = new Channel();
  const close = (reason: string) => {
    toHost.end(reason);
    toClient.end(reason);
  };
  const client: Transport = {
    send: (msg) => toHost.post(JSON.stringify(msg)),
    onMessage: (cb) =>
      toClient.listen((text) => {
        const msg = parseServerMsg(text);
        if (msg) cb(msg);
      }),
    onClose: (cb) => toClient.onEnd(cb),
    close: () => close('closed'),
  };
  const host: PeerLink = {
    send: (text) => toClient.post(text),
    onMessage: (cb) => toHost.listen((text) => cb(JSON.parse(text))),
    onClose: (cb) => toHost.onEnd(cb),
    close,
  };
  return { client, host };
}

type Delivery = { text: string } | { endReason: string };

/** One direction of the connection. */
class Channel {
  private readonly queue: Delivery[] = [];
  private readonly listeners: ((text: string) => void)[] = [];
  private readonly endListeners: ((reason: string) => void)[] = [];
  private scheduled = false;
  private ended = false;

  listen(cb: (text: string) => void): void {
    this.listeners.push(cb);
  }

  onEnd(cb: (reason: string) => void): void {
    this.endListeners.push(cb);
  }

  post(text: string): void {
    if (!this.ended) this.enqueue({ text });
  }

  /** Messages already sent still arrive, then the end. */
  end(reason: string): void {
    if (this.ended) return;
    this.ended = true;
    this.enqueue({ endReason: reason });
  }

  private enqueue(delivery: Delivery): void {
    this.queue.push(delivery);
    this.schedule();
  }

  private schedule(): void {
    if (this.scheduled || this.queue.length === 0) return;
    this.scheduled = true;
    setTimeout(() => this.drain(), 0);
  }

  private drain(): void {
    this.scheduled = false;
    try {
      while (this.queue.length > 0) {
        const delivery = this.queue.shift()!;
        if ('endReason' in delivery) {
          for (const cb of this.endListeners) cb(delivery.endReason);
        } else {
          for (const cb of this.listeners) cb(delivery.text);
        }
      }
    } finally {
      // A throwing listener must not stall everything queued behind it.
      this.schedule();
    }
  }
}
