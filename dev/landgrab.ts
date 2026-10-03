/**
 * Dev-only harness for the Landgrab renderer and input (not part of the production
 * build): a local sim with a few scripted players looping out of their land, capturing,
 * and one hunter cutting trails, drawn through the real renderer at the display rate.
 *
 * Open http://localhost:5173/dev/landgrab.html. URL parameters:
 *   seed=N        map + script seed (default 7)
 *   players=N     scripted players besides you (default 7)
 *   ffwd=N        simulate N ticks before the first frame (default 0)
 *   skin=, trail=, capture=, kill=   your cosmetics by style id (e.g. skin=galaxy)
 *   attract=1     hub background mode (camera follows the leader)
 *   focus=N       slot the camera follows (default 1, you; 3 is the trail hunter)
 *   pause=N       freeze the sim at tick N (for still screenshots)
 *   flush=1       read a pixel back after each draw, so draw time includes rasterising
 * Steer with the mouse, touch, arrow keys/WASD or a gamepad; Escape pauses.
 * window.__perf holds draw-time statistics, window.__input what the input layer reported.
 */
import '@fontsource/fredoka/600.css';
import { COSMETICS, DEFAULT_LOADOUT } from '../src/games/landgrab/content';
import { SIM_CONFIG } from '../src/games/landgrab/config';
import {
  ANGLES,
  cellAt,
  createSim,
  headingTo,
  normalizeHeading,
  previewCapture,
  step,
  type Command,
  type Heading,
  type Loadout,
  type PlayerProfile,
  type SimState,
  SUB,
} from '../src/games/landgrab/core';
import { createInput } from '../src/games/landgrab/input';
import { createRenderer, drawMinimap } from '../src/games/landgrab/render';

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number) => {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? v : fallback;
};
const SEED = num('seed', 7);
const OTHERS = num('players', 7);
const FFWD = num('ffwd', 0);
const PAUSE_AT = num('pause', -1);
const ATTRACT = params.get('attract') === '1';
const FOCUS = num('focus', 1);
const FLUSH = params.get('flush') === '1';
const ME = 1;
const TICK_MS = 1000 / SIM_CONFIG.ticksPerSecond;
const RESPAWN_TICKS = 30;
/** Cells behind the trail's start that a returning script aims for. */
const HOME_AIM_CELLS = 30;

// --- Players ----------------------------------------------------------------------------

const byId = new Map(COSMETICS.map((c) => [c.id, c]));
const styleId = (kind: keyof Loadout, style: string | null) =>
  COSMETICS.find((c) => c.kind === kind && (c.style === style || c.id.endsWith(`.${style}`)))?.id ?? DEFAULT_LOADOUT[kind];

const myLoadout: Loadout = {
  skin: styleId('skin', params.get('skin')),
  trail: styleId('trail', params.get('trail')),
  capture: styleId('capture', params.get('capture')),
  kill: styleId('kill', params.get('kill')),
};

/** Rival humans show off the cosmetics; bots wear the defaults like real ones do. */
const RIVALS: { name: string; color: number; look: Partial<Record<keyof Loadout, string>> }[] = [
  { name: 'Mika', color: 0, look: { skin: 'stripes', trail: 'fire', capture: 'confetti', kill: 'shatter' } },
  { name: 'Juno', color: 3, look: { skin: 'neon', trail: 'comet', capture: 'shockwave', kill: 'lightning' } },
  { name: 'Pip', color: 7, look: { skin: 'galaxy', trail: 'rainbow', capture: 'fireworks', kill: 'blackhole' } },
];
const BOT_NAMES = ['Bolt', 'Nori', 'Taco', 'Zed', 'Kiwi', 'Moss', 'Rex', 'Lulu', 'Fizz', 'Bean', 'Ozzy', 'Wren'];

function profiles(): PlayerProfile[] {
  const list: PlayerProfile[] = [
    { id: 'me', name: 'You', kind: 'human', color: 5, cosmetics: myLoadout },
  ];
  for (let i = 0; i < OTHERS; i++) {
    const rival = RIVALS[i];
    if (rival) {
      const pick = (kind: keyof Loadout) => {
        const id = rival.look[kind];
        return id ? `landgrab.${kind}.${id}` : DEFAULT_LOADOUT[kind];
      };
      list.push({
        id: `rival-${i}`,
        name: rival.name,
        kind: 'human',
        color: rival.color,
        cosmetics: { skin: pick('skin'), trail: pick('trail'), capture: pick('capture'), kill: pick('kill') },
      });
    } else {
      list.push({ id: `bot-${i}`, name: BOT_NAMES[i % BOT_NAMES.length], kind: 'bot', color: i, cosmetics: { ...DEFAULT_LOADOUT } });
    }
  }
  return list;
}

// --- Scripted steering ------------------------------------------------------------------

/** Tiny seeded RNG so the same URL plays the same match. */
let rngState = SEED * 2654435761;
function rand(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

type Phase = 'home' | 'out' | 'side' | 'back';
interface Script {
  phase: Phase;
  ticks: number;
  dir: Heading;
  turn: 1 | -1;
  out: number;
  side: number;
  hunter: boolean;
}

const scripts = new Map<number, Script>();

/**
 * A loop: leave home, run out, turn 90 degrees, run along, then head straight back to
 * where the trail started. The hunter goes for any trail it can reach instead.
 */
function think(state: SimState, slot: number): Heading | null {
  const p = state.players[slot];
  if (!p || !p.alive) return null;
  let s = scripts.get(slot);
  if (!s) {
    s = { phase: 'home', ticks: 0, dir: p.heading, turn: 1, out: 0, side: 0, hunter: slot === 3 };
    scripts.set(slot, s);
  }
  s.ticks++;
  if (s.hunter) {
    const prey = nearestTrail(state, slot, 70);
    if (prey) return headingTo(prey[0] - p.x, prey[1] - p.y);
  }
  const home = state.owner[cellAt(state.size, p.x, p.y)] === slot;
  switch (s.phase) {
    case 'home':
      if (home && s.ticks > 8) {
        s.dir = normalizeHeading(p.heading + Math.floor((rand() - 0.5) * ANGLES * 0.5));
        s.turn = rand() < 0.5 ? 1 : -1;
        s.out = 18 + Math.floor(rand() * 40);
        s.side = 16 + Math.floor(rand() * 40);
        s.phase = 'out';
        s.ticks = 0;
      }
      return s.dir;
    case 'out':
      if (home) return s.dir;
      if (s.ticks > s.out) {
        s.phase = 'side';
        s.ticks = 0;
      }
      return s.dir;
    case 'side':
      if (s.ticks > s.side) {
        s.phase = 'back';
        s.ticks = 0;
      }
      return normalizeHeading(s.dir + (s.turn * ANGLES) / 4);
    case 'back': {
      if (p.trailPath.length === 0) {
        s.phase = 'home';
        s.ticks = 0;
        return p.heading;
      }
      // Aim well behind where the trail left home: aiming at that point itself would
      // clip the first leg's band just before getting back in.
      const ux = Math.sin((s.dir / ANGLES) * Math.PI * 2);
      const uy = -Math.cos((s.dir / ANGLES) * Math.PI * 2);
      const tx = p.trailPath[0] - ux * HOME_AIM_CELLS * SUB;
      const ty = p.trailPath[1] - uy * HOME_AIM_CELLS * SUB;
      return headingTo(tx - p.x, ty - p.y);
    }
  }
}

function nearestTrail(state: SimState, slot: number, maxCells: number): [number, number] | null {
  const me = state.players[slot]!;
  let best: [number, number] | null = null;
  let bestD = (maxCells * SUB) ** 2;
  for (const q of state.players) {
    if (!q || !q.alive || q.slot === slot || q.trailPath.length < 8) continue;
    for (let i = 2; i < q.trailPath.length - 4; i += 4) {
      const dx = q.trailPath[i] - me.x;
      const dy = q.trailPath[i + 1] - me.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = [q.trailPath[i], q.trailPath[i + 1]];
      }
    }
  }
  return best;
}

// --- Match ------------------------------------------------------------------------------

const state = createSim(SIM_CONFIG, SEED);
const deadSince = new Map<number, number>();
let myHeading: Heading | null = null;
let manual = false;
let paused = false;
let coins = 0;

function tickCommands(): Command[] {
  const cmds: Command[] = [];
  if (state.tick === 0) profiles().forEach((profile, i) => cmds.push({ t: 'join', slot: i + 1, profile }));
  for (let slot = 1; slot < state.players.length; slot++) {
    const p = state.players[slot];
    if (!p) continue;
    if (!p.alive) {
      const since = deadSince.get(slot) ?? state.tick;
      deadSince.set(slot, since);
      if (state.tick - since >= RESPAWN_TICKS && !p.spawnPending) {
        cmds.push({ t: 'spawn', slot });
        deadSince.delete(slot);
      }
      continue;
    }
    const h = slot === ME && manual ? myHeading : think(state, slot);
    if (h !== null && h !== p.targetHeading) cmds.push({ t: 'steer', slot, heading: h });
  }
  return cmds;
}

for (let i = 0; i < FFWD; i++) step(state, tickCommands());

// --- Rendering --------------------------------------------------------------------------

const canvas = document.getElementById('game') as HTMLCanvasElement;
const coinsEl = document.getElementById('coins')!;
const minimap = (document.getElementById('minimap') as HTMLCanvasElement).getContext('2d')!;
const perfEl = document.getElementById('perf')!;

const renderer = createRenderer(canvas, {
  cosmetics: (id) => byId.get(id),
  screenShake: () => true,
  attract: ATTRACT,
});
addEventListener('resize', () => renderer.resize());
/** The renderer's own context (getContext returns the existing one). */
const gameContext = canvas.getContext('2d')!;

/** What the input layer reported, for checking it from the browser console or a test. */
const inputLog = { steers: 0, heading: -1, actions: [] as string[] };
(window as unknown as { __input: typeof inputLog }).__input = inputLog;

const input = createInput({
  target: document.getElementById('stage')!,
  headScreenPos: () => renderer.headToScreen(ME),
  onSteer: (h) => {
    manual = true;
    myHeading = h;
    inputLog.steers++;
    inputLog.heading = h;
  },
  onAction: (a) => {
    inputLog.actions.push(a);
    if (a === 'pause') paused = !paused;
  },
});
addEventListener('pagehide', () => input.dispose());

function coinTarget() {
  const r = coinsEl.getBoundingClientRect();
  return { x: r.left + 17, y: r.top + r.height / 2 };
}

function advance(): void {
  const events = step(state, tickCommands());
  for (const e of events) {
    renderer.onEvent(e, state, ME);
    if (e.t === 'capture' && e.slot === ME) {
      const count = Math.min(40, Math.max(3, Math.ceil(e.cells.length / 80)));
      renderer.coinBurst(e.cells, count, coinTarget(), () => {
        coins += 5;
        coinsEl.textContent = String(coins);
      });
    }
  }
  renderer.setPreview(previewCapture(state, ME));
}

// Draw-time statistics: a ring of recent frames.
const samples = new Float64Array(240);
const intervals = new Float64Array(240);
let sampleCount = 0;
let lastFrame = 0;
let lastTickAt = performance.now();
let lastReport = 0;

function stats(values: Float64Array, n: number): { avg: number; p95: number; max: number } {
  const sorted = Array.from(values.subarray(0, n)).sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, n);
  return { avg, p95: sorted[Math.floor(n * 0.95)] ?? 0, max: sorted[n - 1] ?? 0 };
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  const frozen = paused || (PAUSE_AT >= 0 && state.tick >= PAUSE_AT);
  if (frozen) lastTickAt = now;
  while (!frozen && now - lastTickAt >= TICK_MS) {
    advance();
    lastTickAt += TICK_MS;
    if (now - lastTickAt > TICK_MS * 5) lastTickAt = now;
  }
  const alpha = frozen ? 0 : Math.min(1, (now - lastTickAt) / TICK_MS);
  const t0 = performance.now();
  renderer.draw(state, alpha, now, ATTRACT ? 0 : FOCUS);
  if (FLUSH) gameContext.getImageData(0, 0, 1, 1);
  const drawMs = performance.now() - t0;
  drawMinimap(minimap, state, ME, minimap.canvas.width, minimap.canvas.height);

  const i = sampleCount++ % samples.length;
  samples[i] = drawMs;
  intervals[i] = lastFrame ? now - lastFrame : 16.7;
  lastFrame = now;
  if (now - lastReport > 1000 && sampleCount >= 30) {
    lastReport = now;
    const n = Math.min(sampleCount, samples.length);
    const draw = stats(samples, n);
    const gap = stats(intervals, n);
    const perf = { drawAvg: draw.avg, drawP95: draw.p95, drawMax: draw.max, fps: 1000 / gap.avg, frames: sampleCount, tick: state.tick };
    (window as unknown as { __perf: typeof perf }).__perf = perf;
    perfEl.textContent = `draw ${draw.avg.toFixed(2)} ms avg, ${draw.p95.toFixed(2)} p95 | ${perf.fps.toFixed(0)} fps | tick ${state.tick}`;
  }
}
requestAnimationFrame(frame);
