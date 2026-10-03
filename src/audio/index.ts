/**
 * The hub's AudioService: synthesized sound effects, generative music and the in-match
 * tension layer, all made with WebAudio so the app ships no audio files. Where WebAudio
 * is missing (Node, tests, ancient browsers) every call is a silent no-op.
 */
import type { AudioService, SettingsService } from '../shared/services';
import { createMixer } from './mixer';
import { createMusic, type Music } from './music';
import { createTension, type Tension } from './tension';
import { createSfxPlayer, type SfxPlayer } from './voices';

export interface AudioOptions {
  /** The host lets audio start without a user gesture (the Electron build turns the policy off). */
  autoplay: boolean;
}

const SILENT: AudioService = {
  play() {},
  setTension() {},
  setMusic() {},
  unlock() {},
};

/** Inputs browsers accept as the user gesture that may start audio. */
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

interface Engine {
  ctx: AudioContext;
  playSfx: SfxPlayer;
  music: Music;
  tension: Tension;
}

export function createAudio(settings: SettingsService, { autoplay }: AudioOptions): AudioService {
  const Context = contextClass();
  if (!Context) return SILENT;

  // Browsers log a warning for every context created or resumed before the first user
  // gesture, so unless the host allows autoplay the engine is only built on that gesture.
  // Until then nobody has interacted, so sounds are dropped; the music request is kept.
  let engine: Engine | null = null;
  let failed = false;
  let musicOn = false;
  /** Audio may play: a gesture has happened, or the host allows autoplay. */
  let allowed = autoplay;

  const start = (): Engine | null => {
    if (engine || failed) return engine;
    engine = createEngine(Context, settings);
    failed = engine === null;
    engine?.music.setOn(musicOn);
    return engine;
  };

  const unlock = () => {
    // Some events in the gesture list (a touch's pointerdown, Escape) don't count as one.
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    allowed = true;
    const ctx = start()?.ctx;
    if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(warn);
  };

  // Every gesture, not just the first: iOS can suspend the context again after a call or Siri.
  for (const type of GESTURES) window.addEventListener(type, unlock, { capture: true, passive: true });

  // Silence in the background (and save the battery); pick up where it left off on return.
  document.addEventListener('visibilitychange', () => {
    const ctx = engine?.ctx;
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(warn);
    else if (allowed) ctx.resume().catch(warn);
  });

  if (autoplay) start();

  return {
    play(id, opts) {
      // Sounds queued on a suspended clock would all fire at once when it resumes.
      if (engine?.ctx.state !== 'running') return;
      try {
        engine.playSfx(id, opts);
      } catch (err) {
        warn(err);
      }
    },
    setTension: (level) => engine?.tension.set(level),
    setMusic(on) {
      musicOn = on;
      engine?.music.setOn(on);
    },
    unlock,
  };
}

function createEngine(Context: typeof AudioContext, settings: SettingsService): Engine | null {
  let ctx: AudioContext;
  try {
    ctx = new Context({ latencyHint: 'interactive' });
  } catch (err) {
    // Some browsers cap the number of contexts or throw when no output device exists.
    warn(err);
    return null;
  }
  const mixer = createMixer(ctx, settings);
  return { ctx, playSfx: createSfxPlayer(mixer), music: createMusic(mixer), tension: createTension(mixer) };
}

function contextClass(): typeof AudioContext | undefined {
  return globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function warn(err: unknown): void {
  console.warn('[audio]', err);
}
