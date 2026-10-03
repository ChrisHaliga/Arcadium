/**
 * Starts sound effects with voice limiting. Games fire sounds per coin and per capture,
 * sometimes dozens in one frame; without limits that turns into a wall of noise and
 * thousands of live audio nodes. Each sound has a minimum retrigger gap and a cap on
 * copies ringing at once (the oldest copy is faded out to make room), and there is a
 * cap on all voices together.
 */
import type { AudioService, SfxId } from '../shared/services';
import type { Mixer } from './mixer';
import { SFX } from './sfx';

type PlayOptions = Parameters<AudioService['play']>[1];

interface Playing {
  id: SfxId;
  out: GainNode;
  /** Audio-clock time after which every node of the voice has stopped. */
  end: number;
  /** Being faded out to make room; no longer counts against the limits. */
  released: boolean;
}

const MAX_VOICES = 24;
const DEFAULT_MAX = 3;
const DEFAULT_GAP = 0.03;
/** Long enough to avoid a click when a voice is cut, short enough to free the slot at once. */
const RELEASE = 0.03;
/** Scheduling a hair ahead keeps the first envelope point from landing in the past. */
const START_DELAY = 0.005;
const MIN_PITCH = 0.25;
const MAX_PITCH = 4;

export type SfxPlayer = (id: SfxId, opts?: PlayOptions) => void;

export function createSfxPlayer(mixer: Mixer): SfxPlayer {
  const { ctx } = mixer;
  const playing: Playing[] = [];
  const lastStart = new Map<SfxId, number>();

  return (id, opts) => {
    const volume = clamp(opts?.volume, 0, 1);
    if (volume === 0 || !mixer.sfxAudible()) return;
    const now = ctx.currentTime;
    const def = SFX[id];
    const last = lastStart.get(id);
    if (last !== undefined && now - last < (def.gap ?? DEFAULT_GAP)) return;

    finishEnded(playing, now);
    const live = playing.filter((p) => !p.released);
    const same = live.filter((p) => p.id === id);
    if (same.length >= (def.max ?? DEFAULT_MAX)) release(same[0], now);
    else if (live.length >= MAX_VOICES) release(live[0], now);

    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(mixer.sfx);
    const t = now + START_DELAY;
    const voice = { ctx, out, noise: mixer.noise, t, pitch: clamp(opts?.pitch, MIN_PITCH, MAX_PITCH), end: t };
    def.play(voice);
    playing.push({ id, out, end: voice.end, released: false });
    lastStart.set(id, now);
  };
}

function finishEnded(playing: Playing[], now: number): void {
  for (let i = playing.length - 1; i >= 0; i--) {
    if (playing[i].end > now) continue;
    playing[i].out.disconnect();
    playing.splice(i, 1);
  }
}

function release(voice: Playing, now: number): void {
  voice.released = true;
  voice.out.gain.setValueAtTime(voice.out.gain.value, now);
  voice.out.gain.linearRampToValueAtTime(0, now + RELEASE);
  voice.end = Math.min(voice.end, now + RELEASE);
}

/** Missing or non-finite values (say, a pitch computed from a division by zero) fall back to 1. */
function clamp(value: number | undefined, min: number, max: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : 1;
}
