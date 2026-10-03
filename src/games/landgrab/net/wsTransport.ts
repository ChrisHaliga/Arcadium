/**
 * Transport over the platform WebSocket (browsers, Electron, Capacitor web views, and
 * Node 22's global WebSocket in tests). Messages are JSON text frames.
 */
import { parseServerMsg } from './codec';
import type { Transport } from './protocol';

/**
 * A connected server sends a frame every tick and answers the client's pings every two
 * seconds. Hearing nothing for this long means the connection died without closing (a
 * Wi-Fi to cellular handover, a NAT timeout, a hung server), which the socket itself may
 * not notice for minutes.
 */
const SILENCE_LIMIT_MS = 5000;
const SILENCE_CHECK_MS = 1000;

/** Opens a socket and resolves once it is connected; rejects on error or after timeoutMs. */
export function openWebSocket(url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`timed out connecting to ${url}`));
    }, timeoutMs);
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer);
        resolve(socket);
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error(`could not connect to ${url}`));
      },
      { once: true },
    );
  });
}

/** Wraps a connected socket. The connection ends when the socket closes or the server goes silent. */
export function wsTransport(socket: WebSocket): Transport {
  const closeListeners: ((reason: string) => void)[] = [];
  let ended = false;
  const end = (reason: string) => {
    if (ended) return;
    ended = true;
    clearInterval(watchdog);
    for (const cb of closeListeners) cb(reason);
  };

  let heardAt = performance.now();
  let checkedAt = heardAt;
  const watchdog = setInterval(() => {
    const now = performance.now();
    // A check this late means the page was frozen (an app in the background), not that the
    // server went quiet: whatever it sent meanwhile is still waiting to be read.
    if (now - checkedAt > 2 * SILENCE_CHECK_MS) heardAt = now;
    checkedAt = now;
    if (now - heardAt <= SILENCE_LIMIT_MS) return;
    socket.close(1000, 'server silent');
    end('connection lost');
  }, SILENCE_CHECK_MS);
  socket.addEventListener('message', () => {
    heardAt = performance.now();
  });
  socket.addEventListener('close', (e: CloseEvent) => end(e.reason || `connection closed (${e.code})`), { once: true });

  return {
    send(msg) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    },
    onMessage(cb) {
      socket.addEventListener('message', (e: MessageEvent) => {
        const msg = parseServerMsg(e.data);
        if (msg) cb(msg);
      });
    },
    onClose(cb) {
      closeListeners.push(cb);
    },
    close() {
      socket.close(1000, 'closed');
      end('closed');
    },
  };
}
