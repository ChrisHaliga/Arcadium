/**
 * The master signal chain every sound goes through:
 *
 *   sfx bus ───┬──────────────────────────┐
 *              └─ send ─┐                 ├─ glue compressor ─ limiter ─ soft clipper ─ speakers
 *   music bus ─┬────────┼─────────────────┤
 *              └─ send ─┴─ room reverb ───┘
 *
 * The buses follow the player's volume settings live. The compressor/limiter/clipper
 * stack is what lets a dozen coin chimes, a capture sweep and a fanfare land in the same
 * frame without the output ever clipping.
 */
import { effect } from '@preact/signals';
import type { SettingsService } from '../shared/services';

export interface Mixer {
  readonly ctx: BaseAudioContext;
  /** Input for sound effects. */
  readonly sfx: AudioNode;
  /** Input for the music and the tension layer. */
  readonly music: AudioNode;
  /** One second of white noise shared by every noise source. */
  readonly noise: AudioBuffer;
  /** False while a volume slider is at zero, so callers can skip building silent sounds. */
  sfxAudible(): boolean;
  musicAudible(): boolean;
}

/** Music sits under the effects so gameplay feedback always reads clearly. */
const MUSIC_LEVEL = 0.55;
const SFX_REVERB = 0.2;
const MUSIC_REVERB = 0.12;
/** Smoothing for volume changes, so dragging a slider doesn't crackle. */
const VOLUME_SMOOTHING = 0.03;

export function createMixer(ctx: BaseAudioContext, settings: SettingsService): Mixer {
  const output = createMasterChain(ctx);
  const reverb = createReverb(ctx, output);

  const sfx = ctx.createGain();
  const music = ctx.createGain();
  // Start at the saved levels rather than gliding there from full volume.
  sfx.gain.value = loudness(settings.sfxVolume.peek());
  music.gain.value = loudness(settings.musicVolume.peek()) * MUSIC_LEVEL;
  sfx.connect(output);
  music.connect(output);
  send(ctx, sfx, reverb, SFX_REVERB);
  send(ctx, music, reverb, MUSIC_REVERB);

  // Lives as long as the app; the mixer is never torn down.
  effect(() => setLevel(ctx, sfx.gain, loudness(settings.sfxVolume.value)));
  effect(() => setLevel(ctx, music.gain, loudness(settings.musicVolume.value) * MUSIC_LEVEL));

  return {
    ctx,
    sfx,
    music,
    noise: whiteNoise(ctx),
    sfxAudible: () => settings.sfxVolume.peek() > 0,
    musicAudible: () => settings.musicVolume.peek() > 0,
  };
}

/** Glue compression, then limiting, then a soft clipper as the final guarantee. */
function createMasterChain(ctx: BaseAudioContext): AudioNode {
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 10;
  glue.ratio.value = 3.5;
  glue.attack.value = 0.004;
  glue.release.value = 0.18;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  // The shaper's curve covers inputs -1..1, so halve the signal and draw the curve for
  // -2..2: anything the limiter lets through up to 2x full scale still bends smoothly.
  const headroom = ctx.createGain();
  headroom.gain.value = 0.5;
  const clipper = ctx.createWaveShaper();
  clipper.curve = softClipCurve(2);
  clipper.oversample = '2x';

  glue.connect(limiter);
  limiter.connect(headroom);
  headroom.connect(clipper);
  clipper.connect(ctx.destination);
  return glue;
}

/** Linear below 0.7, then eases toward 1.0 instead of clipping flat. */
function softClipCurve(range: number): Float32Array<ArrayBuffer> {
  const knee = 0.7;
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * range;
    const ax = Math.abs(x);
    const y = ax <= knee ? ax : knee + (1 - knee) * Math.tanh((ax - knee) / (1 - knee));
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/** A small bright room, generated so there are no impulse-response files to ship. Returns its input. */
function createReverb(ctx: BaseAudioContext, destination: AudioNode): AudioNode {
  const seconds = 1.4;
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  // Low end in the reverb turns the mix to mud; the room only gets the sparkle.
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 350;
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  highpass.connect(convolver);
  convolver.connect(destination);
  return highpass;
}

function send(ctx: BaseAudioContext, from: AudioNode, to: AudioNode, amount: number): void {
  const gain = ctx.createGain();
  gain.gain.value = amount;
  from.connect(gain);
  gain.connect(to);
}

function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Squared so the slider feels even: half way sounds about half as loud. */
function loudness(volume: number): number {
  return volume * volume;
}

function setLevel(ctx: BaseAudioContext, param: AudioParam, value: number): void {
  param.setTargetAtTime(value, ctx.currentTime, VOLUME_SMOOTHING);
}
