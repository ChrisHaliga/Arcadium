/**
 * Checks everything a client sends before the match authority sees it. Messages arrive
 * as untrusted JSON (a modified client, a fuzzer), so shapes, ranges and string sizes are
 * verified and only known fields are copied out. The local host runs the same checks, so
 * a client bug shows up offline exactly as it would online.
 */
import { cleanName } from '../../../shared/names';
import { NET } from '../config';
import { COSMETICS, DEFAULT_LOADOUT } from '../content';
import { ANGLES, type Loadout } from '../core/types';
import { HUMAN_COLORS } from '../palette';
import type { ClientMsg, HelloProfile } from './protocol';

const MAX_ID_LENGTH = 64;
/** Longest raw name accepted before sanitizing, so huge strings are refused rather than trimmed. */
const MAX_RAW_NAME_LENGTH = 64;
const MAX_COSMETIC_ID_LENGTH = 64;
const FALLBACK_NAME = 'Player';

/** Why a hello was refused; any other bad message is just dropped. */
export type HelloRejection = 'version' | 'bad-hello';

export type ClientMsgCheck = { ok: true; msg: ClientMsg } | { ok: false; reject?: HelloRejection };

const DROP: ClientMsgCheck = { ok: false };
const BAD_HELLO: ClientMsgCheck = { ok: false, reject: 'bad-hello' };

export function parseClientMsg(raw: unknown): ClientMsgCheck {
  if (!isRecord(raw)) return DROP;
  switch (raw.t) {
    case 'hello':
      return parseHello(raw);
    case 'steer': {
      const { heading, seq } = raw;
      if (!isIntIn(heading, 0, ANGLES - 1) || !isIntIn(seq, 1, Number.MAX_SAFE_INTEGER)) return DROP;
      return { ok: true, msg: { t: 'steer', heading, seq } };
    }
    case 'ping':
      return typeof raw.at === 'number' && Number.isFinite(raw.at) ? { ok: true, msg: { t: 'ping', at: raw.at } } : DROP;
    case 'revive':
    case 'respawn':
    case 'resync':
      return { ok: true, msg: { t: raw.t } };
    default:
      return DROP;
  }
}

function parseHello(raw: Record<string, unknown>): ClientMsgCheck {
  // The version is checked first: a newer client may have changed everything else.
  if (typeof raw.v !== 'number') return BAD_HELLO;
  if (raw.v !== NET.protocolVersion) return { ok: false, reject: 'version' };
  if (raw.spectate !== undefined && typeof raw.spectate !== 'boolean') return BAD_HELLO;
  const profile = parseProfile(raw.profile);
  if (!profile) return BAD_HELLO;
  return { ok: true, msg: { t: 'hello', v: raw.v, profile, spectate: raw.spectate === true } };
}

function parseProfile(raw: unknown): HelloProfile | null {
  if (!isRecord(raw)) return null;
  const { id, name, color } = raw;
  if (typeof id !== 'string' || !/^[\x21-\x7e]+$/.test(id) || id.length > MAX_ID_LENGTH) return null;
  if (typeof name !== 'string' || name.length > MAX_RAW_NAME_LENGTH) return null;
  if (!isIntIn(color, 0, HUMAN_COLORS.length - 1)) return null;
  const cosmetics = parseLoadout(raw.cosmetics);
  if (!cosmetics) return null;
  // The hub's rule, so a name the hub saved arrives unchanged; only a hand-made hello can end up empty.
  return { id, name: cleanName(name) || FALLBACK_NAME, color, cosmetics };
}

/** Unknown cosmetic ids become the default for that slot, so renderers only ever see catalog items. */
function parseLoadout(raw: unknown): Loadout | null {
  if (!isRecord(raw)) return null;
  const loadout: Loadout = { ...DEFAULT_LOADOUT };
  for (const kind of Object.keys(DEFAULT_LOADOUT) as (keyof Loadout)[]) {
    const id = raw[kind];
    if (typeof id !== 'string' || id.length > MAX_COSMETIC_ID_LENGTH) return null;
    if (COSMETICS.some((c) => c.kind === kind && c.id === id)) loadout[kind] = id;
  }
  return loadout;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIntIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}
