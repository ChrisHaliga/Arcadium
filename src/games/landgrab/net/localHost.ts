/**
 * Offline play and the hub's background match: a Room in this process, ticked by a timer
 * and reached through a loopback transport. The game connects to it with an ordinary
 * MatchClient, so offline runs exactly the online code path (same session, same
 * validation, same JSON messages).
 */
import { createRoom } from '../room';
import type { CreateLocalMatch } from './contract';
import { createLoopbackPair } from './loopback';
import { RoomHost } from './roomHost';
import { openSession, type Lobby } from './session';
import { startTicker, type Ticker, type Visibility } from './ticker';

const LOCAL_REGION = 'local';
/**
 * A resumed room ticks again no sooner than this after its last tick, so its first frame
 * comes 300 ms behind schedule. The client's clock (net/clock.ts) takes a frame that late
 * for a pause and restarts its timing from it; a frame only a little late would look like
 * network jitter, and the client would keep drawing ahead of the room and catch up in jerks.
 */
const RESUME_GAP_MS = 350;

/** The page's visibility; outside a browser (tests) nothing is ever hidden. */
const pageVisibility: Visibility | undefined =
  typeof document === 'undefined'
    ? undefined
    : {
        get hidden() {
          return document.hidden;
        },
        onChange(cb) {
          document.addEventListener('visibilitychange', cb);
          return () => document.removeEventListener('visibilitychange', cb);
        },
      };

/** Starts the room right away. */
export const createLocalMatch: CreateLocalMatch = (opts = {}) => {
  const room = createRoom({
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 32),
    minPopulation: opts.minPopulation,
    // Host and client share this tab and every message, so they can't drift apart.
    checksums: false,
  });
  const host = new RoomHost(room);
  const lobby: Lobby = { region: LOCAL_REGION, roomFor: () => host };
  const { client, host: link } = createLoopbackPair();
  openSession(link, lobby);

  const intervalMs = 1000 / host.tickRate;
  let lastTickAt = performance.now();
  const tick = () => {
    lastTickAt = performance.now();
    host.tick();
  };
  // Pausing with the page means offline play stops while the tab or app is in the background.
  const startTicking = () => startTicker(intervalMs, tick, { pauseWhenHidden: pageVisibility });
  let ticker: Ticker | null = startTicking();
  let resuming: ReturnType<typeof setTimeout> | null = null;

  const halt = () => {
    ticker?.stop();
    ticker = null;
    if (resuming !== null) clearTimeout(resuming);
    resuming = null;
  };

  return {
    transport: client,
    setPaused(paused) {
      if (paused) {
        halt();
        return;
      }
      if (ticker || resuming !== null) return;
      // A ticker's first tick comes one interval after it starts.
      const wait = Math.max(0, lastTickAt + RESUME_GAP_MS - intervalMs - performance.now());
      resuming = setTimeout(() => {
        resuming = null;
        ticker = startTicking();
      }, wait);
    },
    dispose() {
      halt();
      client.close();
    },
  };
};
