/**
 * The in-match tension layer: a pumping, filtered synth drone in the music's key that
 * fades in while the player is out of their land. Higher tension pumps faster, opens
 * the filter and plays louder. Its nodes only exist while tension is above zero.
 */
import type { Mixer } from './mixer';
import { hz } from './synth';

export interface Tension {
  /** 0..1; may be called every frame. */
  set(level: number): void;
}

interface Layer {
  update(level: number): void;
  release(): void;
}

/** Smaller changes are ignored so per-frame calls don't flood the automation timeline. */
const MIN_CHANGE = 0.01;
const SMOOTHING = 0.25;
/** setTarget decay reaches silence after ~7 time constants; stop the nodes after that. */
const STOP_AFTER = SMOOTHING * 8;
const MAX_GAIN = 0.16;

export function createTension(mixer: Mixer): Tension {
  let level = 0;
  let layer: Layer | null = null;
  return {
    set(next) {
      // With music muted the layer is dropped entirely; games call this every frame, so it
      // comes back on its own as soon as the slider is raised.
      const target = mixer.musicAudible() && Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : 0;
      if (Math.abs(target - level) < MIN_CHANGE && (target > 0 || level === 0)) return;
      level = target;
      if (level > 0) {
        layer ??= startLayer(mixer);
        layer.update(level);
      } else if (layer) {
        layer.release();
        layer = null;
      }
    },
  };
}

function startLayer(mixer: Mixer): Layer {
  const { ctx } = mixer;
  const now = ctx.currentTime;

  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(mixer.music);

  // The pump: a ramp-down LFO pulls the gain from 1 to 0 each cycle, like sidechain
  // ducking. Smoothing the ramp's reset keeps each pulse from clicking.
  const pump = ctx.createGain();
  pump.gain.value = 0.5;
  pump.connect(out);
  const lfo = ctx.createOscillator();
  lfo.type = 'sawtooth';
  const lfoSmooth = ctx.createBiquadFilter();
  lfoSmooth.type = 'lowpass';
  lfoSmooth.frequency.value = 40;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = -0.5;
  lfo.connect(lfoSmooth);
  lfoSmooth.connect(lfoDepth);
  lfoDepth.connect(pump.gain);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 6;
  filter.connect(pump);

  // Root, fifth and a sub octave in C, the music's key.
  const sources: OscillatorNode[] = [lfo];
  for (const [wave, note, detune, gain] of [
    ['sawtooth', 48, 0, 0.5],
    ['sawtooth', 55, 7, 0.4],
    ['square', 36, 0, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = hz(note);
    osc.detune.value = detune;
    const mix = ctx.createGain();
    mix.gain.value = gain;
    osc.connect(mix);
    mix.connect(filter);
    sources.push(osc);
  }
  for (const source of sources) source.start(now);
  lfo.onended = () => out.disconnect();

  return {
    update(level) {
      const t = ctx.currentTime;
      out.gain.setTargetAtTime(MAX_GAIN * level, t, SMOOTHING);
      filter.frequency.setTargetAtTime(280 + 3200 * level * level, t, SMOOTHING);
      lfo.frequency.setTargetAtTime(1.6 + 6.4 * level, t, SMOOTHING);
    },
    release() {
      const t = ctx.currentTime;
      out.gain.setTargetAtTime(0, t, SMOOTHING);
      for (const source of sources) source.stop(t + STOP_AFTER);
    },
  };
}
