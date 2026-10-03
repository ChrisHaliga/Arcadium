/**
 * Server messages as JSON text, the form every transport carries. What a whole room
 * receives (each tick's frame, a snapshot) is encoded once per room and spliced into each
 * member's message, so a room's JSON work doesn't grow with its connections.
 */
import type { Snapshot } from '../core/types';
import type { Frame } from '../room/contract';
import type { ServerMsg } from './protocol';

/** JSON text of a T. */
export type Json<T> = string & { readonly __json: T };

type Msg<T extends ServerMsg['t']> = Extract<ServerMsg, { t: T }>;

export function toJson<T>(value: T): Json<T> {
  return JSON.stringify(value) as Json<T>;
}

export function encode(msg: ServerMsg): Json<ServerMsg> {
  return toJson(msg);
}

export function frameMsg(frame: Json<Frame>, ack: number): Json<ServerMsg> {
  return splice<'frame', 'f'>({ t: 'frame', ack }, 'f', frame);
}

export function snapshotMsg(snapshot: Json<Snapshot>): Json<ServerMsg> {
  return splice<'snapshot', 'snapshot'>({ t: 'snapshot' }, 'snapshot', snapshot);
}

export function welcomeMsg(welcome: Omit<Msg<'welcome'>, 'snapshot'>, snapshot: Json<Snapshot>): Json<ServerMsg> {
  return splice<'welcome', 'snapshot'>(welcome, 'snapshot', snapshot);
}

/** The server's JSON text as a message, or null if it isn't one. The server is trusted to speak the protocol. */
export function parseServerMsg(data: unknown): ServerMsg | null {
  if (typeof data !== 'string') return null;
  try {
    const msg: unknown = JSON.parse(data);
    return typeof msg === 'object' && msg !== null && typeof (msg as { t?: unknown }).t === 'string' ? (msg as ServerMsg) : null;
  } catch {
    return null;
  }
}

/** The message `fields` plus its field `key`, whose value is already JSON text. */
function splice<T extends ServerMsg['t'], K extends keyof Msg<T> & string>(
  fields: Omit<Msg<T>, K>,
  key: K,
  value: Json<Msg<T>[K]>,
): Json<ServerMsg> {
  const head = JSON.stringify(fields);
  return `${head.slice(0, -1)},${JSON.stringify(key)}:${value}}` as Json<ServerMsg>;
}
