/**
 * Online matchmaking from the client's side: which match servers exist, and joining the
 * one with the lowest round trip (players land in the nearest region without choosing).
 */
import { NET } from '../config';
import { createMatchClient, JoinError } from './client';
import { parseServerMsg } from './codec';
import type { ConnectOnline } from './contract';
import type { ClientMsg } from './protocol';
import { openWebSocket, wsTransport } from './wsTransport';

/** A server that hasn't answered a ping within this long counts as unreachable. */
const PROBE_TIMEOUT_MS = 1500;

/** Server URLs from VITE_GAME_SERVERS (comma separated) when the build sets it, else NET.defaultServers. */
export function gameServers(): string[] {
  // import.meta.env only exists in Vite builds; the server bundle and plain Node have none.
  const configured: unknown = import.meta.env?.VITE_GAME_SERVERS;
  const urls = typeof configured === 'string' ? configured.split(',').map((url) => url.trim()).filter(Boolean) : [];
  return urls.length > 0 ? urls : [...NET.defaultServers];
}

/** Pings every server at once and joins the one that answers fastest; rejects if none answer. */
export const connectOnline: ConnectOnline = async (servers, profile) => {
  const answers = await Promise.all(servers.map((url) => probe(url)));
  const reachable = answers.filter((a): a is Probe => a !== null).sort((a, b) => a.rttMs - b.rttMs);
  const [best, ...rest] = reachable;
  for (const other of rest) other.socket.close();
  if (!best) throw new JoinError('no game server answered');
  return createMatchClient(wsTransport(best.socket), profile);
};

interface Probe {
  socket: WebSocket;
  rttMs: number;
}

/** Connects and times one ping; the open socket is kept so the winner joins without reconnecting. */
async function probe(url: string): Promise<Probe | null> {
  const deadline = performance.now() + PROBE_TIMEOUT_MS;
  let socket: WebSocket;
  try {
    socket = await openWebSocket(url, PROBE_TIMEOUT_MS);
  } catch {
    return null;
  }
  return new Promise((resolve) => {
    const sentAt = performance.now();
    const finish = (result: Probe | null) => {
      clearTimeout(timer);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('close', onClose);
      if (!result) socket.close();
      resolve(result);
    };
    const onMessage = (e: MessageEvent) => {
      const msg = parseServerMsg(e.data);
      if (msg?.t === 'pong' && msg.at === sentAt) finish({ socket, rttMs: performance.now() - sentAt });
    };
    const onClose = () => finish(null);
    const timer = setTimeout(() => finish(null), Math.max(0, deadline - sentAt));
    socket.addEventListener('message', onMessage);
    socket.addEventListener('close', onClose);
    const ping: ClientMsg = { t: 'ping', at: sentAt };
    socket.send(JSON.stringify(ping));
  });
}
