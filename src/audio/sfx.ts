/**
 * One recipe per SfxId, all synthesized: bright, toy-like and a little bouncy. Recipes
 * schedule nodes on the voice and never touch the clock themselves, so the same recipe
 * renders identically live or offline.
 */
import type { SfxId } from '../shared/services';
import { bell, brass, hz, noise, sparkle, tone, type Voice } from './synth';

export interface SfxDef {
  play(v: Voice): void;
  /** Copies allowed to ring at once; one more cuts the oldest. */
  max?: number;
  /** Seconds before the same sound may start again; closer triggers are dropped. */
  gap?: number;
}

export const SFX: Record<SfxId, SfxDef> = {
  // --- UI ---
  click: {
    play(v) {
      tone(v, { freq: 900, to: 320, glide: 0.05, dur: 0.08, attack: 0.002, gain: 0.22 });
      noise(v, { dur: 0.015, attack: 0.001, gain: 0.05, filter: { type: 'highpass', freq: 5000 } });
    },
  },
  hover: {
    max: 2,
    gap: 0.05,
    play(v) {
      tone(v, { wave: 'triangle', freq: 2400, dur: 0.03, attack: 0.001, gain: 0.06 });
    },
  },
  whoosh: {
    max: 2,
    gap: 0.08,
    play(v) {
      noise(v, { dur: 0.42, attack: 0.16, gain: 0.3, filter: { type: 'bandpass', freq: 350, to: 3500, q: 1.4 } });
      tone(v, { freq: 180, to: 520, dur: 0.3, attack: 0.1, gain: 0.05 });
    },
  },
  error: {
    max: 1,
    gap: 0.15,
    play(v) {
      // Falling tritone: unmistakably "nope", but soft enough not to sting.
      for (const [at, note] of [[0, 64], [0.11, 58]] as const) {
        tone(v, { wave: 'square', freq: hz(note), at, dur: 0.16, gain: 0.08, filter: { type: 'lowpass', freq: 1400 } });
        tone(v, { wave: 'triangle', freq: hz(note - 12), at, dur: 0.18, gain: 0.2 });
      }
    },
  },

  // --- Coins and captures ---
  coin: {
    max: 6,
    gap: 0.035,
    play(v) {
      // A little random detune per coin, so a shower of them shimmers instead of phasing.
      const detune = (Math.random() - 0.5) * 30;
      chime(v, 83, 0, 0.12, detune);
      chime(v, 88, 0.07, 0.38, detune);
    },
  },
  coinBig: {
    max: 3,
    gap: 0.06,
    play(v) {
      const detune = (Math.random() - 0.5) * 20;
      chime(v, 88, 0, 0.1, detune);
      chime(v, 92, 0.06, 0.1, detune);
      chime(v, 95, 0.12, 0.5, detune, 0.3);
      tone(v, { freq: 220, to: 110, dur: 0.12, gain: 0.22 });
      sparkle(v, { at: 0.12, dur: 0.35, count: 5 });
    },
  },
  capture: {
    max: 3,
    gap: 0.05,
    play(v) {
      // Callers raise opts.pitch with capture size and combo; every layer follows it.
      tone(v, {
        wave: 'triangle',
        freq: 330,
        to: 990,
        glide: 0.2,
        dur: 0.34,
        attack: 0.01,
        gain: 0.26,
        filter: { type: 'lowpass', freq: 1500, to: 6000 },
      });
      tone(v, { freq: 660, to: 1980, glide: 0.2, dur: 0.3, attack: 0.01, gain: 0.1 });
      bell(v, 88, { at: 0.18, dur: 0.4, gain: 0.12 });
      noise(v, { dur: 0.22, attack: 0.08, gain: 0.06, filter: { type: 'bandpass', freq: 900, to: 5000, q: 1.5 } });
    },
  },
  bigCapture: {
    max: 2,
    gap: 0.1,
    play(v) {
      tone(v, { freq: 150, to: 50, glide: 0.2, dur: 0.3, attack: 0.003, gain: 0.55 });
      tone(v, {
        wave: 'sawtooth',
        freq: 220,
        to: 880,
        glide: 0.32,
        dur: 0.45,
        attack: 0.02,
        gain: 0.12,
        filter: { type: 'lowpass', freq: 700, to: 6000, q: 2 },
      });
      tone(v, { wave: 'triangle', freq: 440, to: 1320, glide: 0.32, dur: 0.42, gain: 0.14 });
      for (const note of [76, 81, 85, 88]) bell(v, note, { at: 0.3, dur: 0.9, gain: 0.09 });
      sparkle(v, { at: 0.3, dur: 0.6, count: 10 });
    },
  },
  combo: {
    max: 2,
    gap: 0.06,
    play(v) {
      arpeggio(v, [72, 76, 79, 84], { step: 0.045, dur: 0.14 });
    },
  },
  treasure: {
    max: 2,
    gap: 0.1,
    play(v) {
      [79, 84, 86, 88, 91, 96].forEach((note, i) => {
        bell(v, note, { at: i * 0.05, dur: 0.5, gain: 0.13, pan: (i / 5) * 0.8 - 0.4 });
      });
      tone(v, { freq: 196, to: 98, dur: 0.2, gain: 0.22 });
      sparkle(v, { at: 0.25, dur: 0.6, count: 8 });
    },
  },

  // --- Combat ---
  kill: {
    max: 3,
    gap: 0.05,
    play(v) {
      tone(v, { freq: 190, to: 42, glide: 0.18, dur: 0.28, attack: 0.002, gain: 0.85 });
      noise(v, { dur: 0.06, attack: 0.001, gain: 0.3, filter: { type: 'highpass', freq: 1800 } });
      tone(v, {
        wave: 'sawtooth',
        freq: 2400,
        to: 160,
        glide: 0.16,
        at: 0.01,
        dur: 0.18,
        gain: 0.14,
        filter: { type: 'lowpass', freq: 7000, to: 900 },
      });
      tone(v, { wave: 'square', freq: 1600, to: 400, glide: 0.1, at: 0.02, dur: 0.12, gain: 0.05 });
    },
  },
  death: {
    max: 1,
    gap: 0.2,
    play(v) {
      const wobble = { rate: 7, depth: 70 };
      tone(v, {
        wave: 'triangle',
        freq: 523,
        to: 131,
        glide: 0.85,
        dur: 0.95,
        attack: 0.01,
        hold: 0.1,
        gain: 0.3,
        vibrato: wobble,
        filter: { type: 'lowpass', freq: 3000, to: 500 },
      });
      tone(v, {
        wave: 'square',
        freq: 262,
        to: 65,
        glide: 0.85,
        dur: 0.95,
        attack: 0.01,
        hold: 0.1,
        gain: 0.07,
        vibrato: wobble,
        filter: { type: 'lowpass', freq: 1200, to: 300 },
      });
      noise(v, { dur: 0.25, gain: 0.08, filter: { type: 'lowpass', freq: 1200 } });
    },
  },
  closeCall: {
    max: 1,
    gap: 0.3,
    play(v) {
      noise(v, { dur: 0.32, attack: 0.04, gain: 0.22, filter: { type: 'bandpass', freq: 3200, to: 400, q: 2 } });
      tone(v, {
        wave: 'triangle',
        freq: hz(81),
        to: hz(88),
        glide: 0.06,
        at: 0.05,
        dur: 0.14,
        gain: 0.12,
        vibrato: { rate: 30, depth: 40 },
      });
      tone(v, { wave: 'triangle', freq: hz(88), to: hz(93), glide: 0.06, at: 0.16, dur: 0.22, gain: 0.12 });
    },
  },
  revive: {
    max: 1,
    gap: 0.3,
    play(v) {
      tone(v, { freq: 196, to: 1568, glide: 0.8, dur: 1, attack: 0.15, gain: 0.16, vibrato: { rate: 6, depth: 18 } });
      tone(v, {
        wave: 'triangle',
        freq: 196,
        to: 1568,
        glide: 0.8,
        detune: 10,
        dur: 1,
        attack: 0.15,
        gain: 0.08,
        filter: { type: 'lowpass', freq: 800, to: 6000 },
      });
      [72, 76, 79, 84, 88, 91].forEach((note, i) => {
        bell(v, note, { at: 0.1 + i * 0.11, dur: 0.5, gain: 0.08, pan: i % 2 ? 0.3 : -0.3 });
      });
      sparkle(v, { at: 0.75, dur: 0.5, count: 10 });
    },
  },

  // --- Celebrations ---
  feat: {
    max: 2,
    gap: 0.15,
    play(v) {
      brass(v, [67], { dur: 0.12, gain: 0.1 });
      brass(v, [72, 76, 79], { at: 0.11, dur: 0.55, hold: 0.15, gain: 0.16 });
      bell(v, 91, { at: 0.11, dur: 0.5, gain: 0.1 });
      sparkle(v, { at: 0.15, dur: 0.4, count: 6 });
    },
  },
  milestone: {
    max: 1,
    gap: 0.3,
    play(v) {
      arpeggio(v, [72, 76, 79, 84], { step: 0.075, dur: 0.18 });
      brass(v, [72, 76, 79, 84], { at: 0.3, dur: 0.8, hold: 0.2, gain: 0.17 });
      shimmer(v, 0.3, 0.8);
      sparkle(v, { at: 0.3, dur: 0.7, count: 10 });
    },
  },
  levelUp: {
    max: 1,
    gap: 0.5,
    play(v) {
      arpeggio(v, [67, 72, 76, 79, 84], { step: 0.06, dur: 0.2 });
      brass(v, [72, 76, 79, 84], { at: 0.32, dur: 1.1, hold: 0.35, gain: 0.18 });
      bell(v, 96, { at: 0.32, dur: 1, gain: 0.1 });
      shimmer(v, 0.32, 1.1);
      sparkle(v, { at: 0.32, dur: 1, count: 14 });
    },
  },
  win: {
    max: 1,
    gap: 0.5,
    play(v) {
      // Ta-ta-ta-taaa.
      for (const at of [0, 0.12, 0.24]) brass(v, [67, 72], { at, dur: 0.1, gain: 0.12 });
      brass(v, [72, 76, 79, 84], { at: 0.36, dur: 1.4, hold: 0.5, gain: 0.2 });
      boom(v, 0.36);
      arpeggio(v, [84, 88, 91, 96, 100], { at: 0.42, step: 0.07, dur: 0.2, gain: 0.7 });
      shimmer(v, 0.36, 1.4);
      sparkle(v, { at: 0.36, dur: 1.4, count: 18 });
    },
  },

  // --- Reels and chests ---
  reelSpin: {
    max: 3,
    gap: 0.05,
    play(v) {
      // About 1.2 s of ticks that slow down like a reel coasting to a stop.
      let at = 0;
      for (let gap = 0.03; at < 1.2; gap *= 1.07) {
        tick(v, at);
        at += gap;
      }
    },
  },
  reelStop: {
    max: 3,
    gap: 0.02,
    play(v) {
      tone(v, { freq: 210, to: 70, glide: 0.1, dur: 0.18, attack: 0.002, gain: 0.45 });
      tone(v, { wave: 'triangle', freq: 520, dur: 0.07, attack: 0.001, gain: 0.16 });
      noise(v, { dur: 0.05, attack: 0.001, gain: 0.22, filter: { type: 'lowpass', freq: 1800 } });
    },
  },
  jackpot: {
    max: 1,
    gap: 0.5,
    play(v) {
      const run = [72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96];
      const step = 0.035;
      run.forEach((note, i) => {
        tone(v, {
          wave: 'square',
          freq: hz(note),
          at: i * step,
          dur: 0.1,
          attack: 0.002,
          gain: 0.07,
          pan: (i / (run.length - 1)) * 1.2 - 0.6,
          filter: { type: 'lowpass', freq: 4000 },
        });
      });
      const hit = run.length * step;
      boom(v, hit);
      brass(v, [60, 64, 67, 72, 76], { at: hit, dur: 1.3, hold: 0.4, gain: 0.2 });
      for (const note of [84, 88, 91, 96]) bell(v, note, { at: hit, dur: 1.1, gain: 0.08 });
      for (let i = 0; i < 5; i++) {
        const at = hit + 0.1 + i * 0.16;
        chime(v, 83, at, 0.08, 0, 0.16);
        chime(v, 88, at + 0.06, 0.25, 0, 0.18);
      }
      shimmer(v, hit, 1.2);
      sparkle(v, { at: hit, dur: 1.2, count: 22, gain: 0.07 });
    },
  },
  chestShake: {
    max: 2,
    gap: 0.05,
    play(v) {
      for (let i = 0; i < 6; i++) {
        const at = i * 0.055 + Math.random() * 0.02;
        const pan = Math.random() * 0.8 - 0.4;
        noise(v, {
          at,
          dur: 0.035,
          attack: 0.001,
          gain: 0.16,
          pan,
          filter: { type: 'bandpass', freq: 1400 + Math.random() * 1200, q: 4 },
        });
        tone(v, { wave: 'triangle', freq: 280 + Math.random() * 180, at, dur: 0.05, attack: 0.001, gain: 0.12, pan });
      }
    },
  },
  chestOpen: {
    max: 1,
    gap: 0.3,
    play(v) {
      noise(v, { dur: 0.4, attack: 0.3, gain: 0.25, filter: { type: 'bandpass', freq: 300, to: 5000, q: 1.2 } });
      tone(v, { freq: 110, to: 55, at: 0.32, dur: 0.35, gain: 0.45 });
      for (const note of [84, 88, 91]) bell(v, note, { at: 0.34, dur: 1, gain: 0.1 });
      sparkle(v, { at: 0.34, dur: 0.7, count: 20, gain: 0.08 });
      shimmer(v, 0.34, 0.9);
    },
  },
  reward: {
    max: 2,
    gap: 0.15,
    play(v) {
      bell(v, 79, { dur: 0.5, gain: 0.16 });
      bell(v, 84, { at: 0.09, dur: 0.8, gain: 0.18 });
      tone(v, { wave: 'triangle', freq: hz(72), at: 0.09, dur: 0.5, gain: 0.1 });
      sparkle(v, { at: 0.12, dur: 0.5, count: 7 });
    },
  },
  countdown: {
    max: 2,
    gap: 0.2,
    play(v) {
      tone(v, { freq: 1250, dur: 0.06, attack: 0.001, gain: 0.28 });
      tone(v, { wave: 'triangle', freq: 2500, dur: 0.025, attack: 0.001, gain: 0.07 });
      noise(v, { dur: 0.015, attack: 0.001, gain: 0.08, filter: { type: 'bandpass', freq: 3000, q: 3 } });
    },
  },
};

/** Coin-style ping: sine body with a quiet triangle an octave up for the glint. */
function chime(v: Voice, note: number, at: number, dur: number, detune: number, gain = 0.26): void {
  tone(v, { freq: hz(note), at, dur, detune, attack: 0.002, gain });
  tone(v, { wave: 'triangle', freq: hz(note + 12), at, dur: dur * 0.5, detune, attack: 0.002, gain: gain * 0.25 });
}

/** Chiptune-flavoured run of notes (square for bite, triangle for body). */
function arpeggio(v: Voice, notes: readonly number[], o: { at?: number; step: number; dur: number; gain?: number }): void {
  const scale = o.gain ?? 1;
  notes.forEach((note, i) => {
    const at = (o.at ?? 0) + i * o.step;
    const f = hz(note);
    tone(v, { wave: 'square', freq: f, at, dur: o.dur * 0.8, attack: 0.002, gain: 0.07 * scale, filter: { type: 'lowpass', freq: 3500 } });
    tone(v, { wave: 'triangle', freq: f, at, dur: o.dur, attack: 0.002, gain: 0.12 * scale });
  });
}

/** Airy high tremolo that swells behind big moments. */
function shimmer(v: Voice, at: number, dur: number): void {
  for (const detune of [-8, 8]) {
    tone(v, { freq: hz(96), to: hz(103), at, dur, attack: dur * 0.3, gain: 0.025, detune, vibrato: { rate: 11, depth: 30 } });
  }
}

/** Low drop that gives celebrations their weight. */
function boom(v: Voice, at: number): void {
  tone(v, { freq: 130, to: 45, glide: 0.25, at, dur: 0.4, attack: 0.003, gain: 0.55 });
}

function tick(v: Voice, at: number): void {
  const detune = (Math.random() - 0.5) * 80;
  tone(v, { wave: 'triangle', freq: 1900, detune, at, dur: 0.025, attack: 0.001, gain: 0.1 });
  noise(v, { at, dur: 0.012, attack: 0.001, gain: 0.05, filter: { type: 'highpass', freq: 3500 } });
}
