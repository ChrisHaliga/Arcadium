/**
 * Synth building blocks every sound is made from: enveloped oscillators and filtered
 * noise, plus a few instrument shortcuts (bells, sparkles, brass chords). Times in the
 * options are seconds relative to the voice's start; frequencies are scaled by its pitch.
 */

export interface Voice {
  readonly ctx: BaseAudioContext;
  /** Every node of this sound ends up here. */
  readonly out: AudioNode;
  /** Shared looping white noise. */
  readonly noise: AudioBuffer;
  /** Start time on the audio clock. */
  readonly t: number;
  /** Multiplies every oscillator and filter frequency. */
  readonly pitch: number;
  /** Latest stop time of any node scheduled so far; the voice is finished after it. */
  end: number;
}

export interface FilterOpts {
  type: BiquadFilterType;
  freq: number;
  /** Sweep target (exponential over the sound's duration). */
  to?: number;
  q?: number;
}

interface Shape {
  /** Offset from the voice start. */
  at?: number;
  /** Total length; the envelope has decayed to silence by then. */
  dur: number;
  attack?: number;
  /** Time spent at peak before the decay starts. */
  hold?: number;
  gain?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
  filter?: FilterOpts;
}

export interface ToneOpts extends Shape {
  wave?: OscillatorType;
  freq: number;
  /** Glide target frequency. */
  to?: number;
  /** Glide length, default the whole duration. */
  glide?: number;
  /** Cents. */
  detune?: number;
  /** Pitch wobble: rate in Hz, depth in cents. */
  vibrato?: { rate: number; depth: number };
}

export interface NoiseOpts extends Shape {
  filter: FilterOpts;
}

/** MIDI note number to Hz (69 = A4 = 440 Hz). */
export const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);

/** Exponential ramps and envelopes can't reach zero, so they aim here instead. */
const SILENT = 0.0001;
/** Sources run a touch past their envelope so they never stop mid-sample. */
const TAIL = 0.02;

export function tone(v: Voice, o: ToneOpts): void {
  const { ctx } = v;
  const start = v.t + (o.at ?? 0);
  const stop = start + o.dur + TAIL;
  const osc = ctx.createOscillator();
  osc.type = o.wave ?? 'sine';
  osc.frequency.setValueAtTime(freq(ctx, o.freq * v.pitch), start);
  if (o.to !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(freq(ctx, o.to * v.pitch), start + (o.glide ?? o.dur));
  }
  if (o.detune) osc.detune.setValueAtTime(o.detune, start);
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = o.vibrato.rate;
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth);
    depth.connect(osc.detune);
    lfo.start(start);
    lfo.stop(stop);
  }
  osc.connect(shape(v, o, start));
  osc.start(start);
  osc.stop(stop);
  v.end = Math.max(v.end, stop);
}

export function noise(v: Voice, o: NoiseOpts): void {
  const start = v.t + (o.at ?? 0);
  const stop = start + o.dur + TAIL;
  const src = v.ctx.createBufferSource();
  src.buffer = v.noise;
  src.loop = true;
  src.connect(shape(v, o, start));
  // A random read position keeps rapid repeats (hats, rattles) from sounding identical.
  src.start(start, Math.random() * v.noise.duration);
  src.stop(stop);
  v.end = Math.max(v.end, stop);
}

/** Glockenspiel-style strike: a sine plus the instrument's inharmonic overtones. */
export function bell(v: Voice, note: number, o: { at?: number; dur?: number; gain?: number; pan?: number } = {}): void {
  const f = hz(note);
  const dur = o.dur ?? 0.6;
  const gain = o.gain ?? 0.2;
  const base = { at: o.at, pan: o.pan, attack: 0.002 };
  tone(v, { ...base, freq: f, dur, gain });
  tone(v, { ...base, freq: f * 2.76, dur: dur * 0.45, gain: gain * 0.35 });
  tone(v, { ...base, freq: f * 5.4, dur: dur * 0.2, gain: gain * 0.15 });
}

const PENTATONIC = [0, 2, 4, 7, 9];

/** Scattered high pings across the stereo field: the "glitter" on rewards. */
export function sparkle(v: Voice, o: { at?: number; dur: number; count: number; gain?: number; low?: number }): void {
  const low = o.low ?? 84;
  for (let i = 0; i < o.count; i++) {
    const octave = Math.floor(Math.random() * 2);
    const step = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    tone(v, {
      at: (o.at ?? 0) + Math.random() * o.dur,
      freq: hz(low + 12 * octave + step),
      dur: 0.15 + Math.random() * 0.2,
      attack: 0.002,
      gain: (o.gain ?? 0.06) * (0.5 + Math.random() * 0.5),
      pan: Math.random() * 1.6 - 0.8,
    });
  }
}

/** Bright, slightly detuned saw stack that opens up as it plays: fanfare brass. */
export function brass(v: Voice, notes: readonly number[], o: { at?: number; dur: number; gain?: number; hold?: number }): void {
  const gain = (o.gain ?? 0.12) / Math.sqrt(notes.length);
  notes.forEach((note, i) => {
    const pan = notes.length > 1 ? (i / (notes.length - 1)) * 0.6 - 0.3 : 0;
    for (const detune of [-6, 6]) {
      tone(v, {
        wave: 'sawtooth',
        freq: hz(note),
        detune,
        at: o.at,
        dur: o.dur,
        hold: o.hold,
        attack: 0.015,
        gain,
        pan,
        filter: { type: 'lowpass', freq: 900, to: 4200, q: 1 },
      });
    }
    tone(v, { wave: 'triangle', freq: hz(note + 12), at: o.at, dur: o.dur, hold: o.hold, gain: gain * 0.6, pan });
  });
}

/** Optional filter -> envelope -> optional pan -> voice output; returns the chain's input. */
function shape(v: Voice, o: Shape, start: number): AudioNode {
  const { ctx } = v;
  const env = ctx.createGain();
  envelope(env.gain, start, o.attack ?? 0.004, o.hold ?? 0, o.dur, o.gain ?? 0.3);
  if (o.pan) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = o.pan;
    env.connect(panner);
    panner.connect(v.out);
  } else {
    env.connect(v.out);
  }
  if (!o.filter) return env;
  const f = o.filter;
  const filter = ctx.createBiquadFilter();
  filter.type = f.type;
  filter.Q.value = f.q ?? 1;
  filter.frequency.setValueAtTime(freq(ctx, f.freq * v.pitch), start);
  if (f.to !== undefined) filter.frequency.exponentialRampToValueAtTime(freq(ctx, f.to * v.pitch), start + o.dur);
  filter.connect(env);
  return filter;
}

/** Click-free attack, optional hold, then an exponential decay that is silent by `dur`. */
function envelope(param: AudioParam, start: number, attack: number, hold: number, dur: number, peak: number): void {
  const end = start + dur;
  const peakAt = Math.min(start + attack, end - 0.001);
  param.setValueAtTime(0, start);
  param.linearRampToValueAtTime(peak, peakAt);
  if (hold > 0) param.setValueAtTime(peak, Math.min(peakAt + hold, end - 0.001));
  param.exponentialRampToValueAtTime(SILENT, end);
}

/** Keeps pitch-scaled frequencies inside what oscillators and filters accept. */
function freq(ctx: BaseAudioContext, f: number): number {
  return Math.min(Math.max(f, 20), ctx.sampleRate * 0.45);
}
