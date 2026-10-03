/**
 * Generative background music: a light, upbeat loop of bass, offbeat chord stabs, hats,
 * a soft kick and a bell melody. Chords, patterns and melody are re-rolled every four
 * bars, so it never loops exactly but always stays in the same happy key.
 *
 * Notes are placed on the audio clock a little ahead of time; the timer only decides
 * when to schedule more. That keeps the groove tight even while the main thread is
 * busy drawing a match.
 */
import type { Mixer } from './mixer';
import { bell, hz, noise, tone, type Voice } from './synth';

export interface Music {
  setOn(on: boolean): void;
}

const BPM = 112;
/** One 16th note, in seconds. */
const STEP = 60 / BPM / 4;
const STEPS_PER_BAR = 16;
const BARS_PER_PHRASE = 4;
const PHRASE_STEPS = STEPS_PER_BAR * BARS_PER_PHRASE;
/** Seconds of music kept scheduled ahead of the clock. */
const LOOKAHEAD = 0.12;
const PUMP_MS = 25;
const START_DELAY = 0.05;
/** Fader time constants: quick in, gentle out. */
const FADE_IN = 0.08;
const FADE_OUT = 0.3;
/** Highest melody degree: two octaves of chord tones. */
const MAX_DEGREE = 5;

type ChordName = 'C' | 'G' | 'Am' | 'F' | 'Em' | 'Dm';

interface Chord {
  /** MIDI note of the bass root. */
  bass: number;
  /** Close-voiced triad around middle C. */
  tones: readonly [number, number, number];
}

const CHORDS: Record<ChordName, Chord> = {
  C: { bass: 48, tones: [60, 64, 67] },
  G: { bass: 43, tones: [59, 62, 67] },
  Am: { bass: 45, tones: [60, 64, 69] },
  F: { bass: 41, tones: [60, 65, 69] },
  Em: { bass: 40, tones: [59, 64, 67] },
  Dm: { bass: 38, tones: [62, 65, 69] },
};

const PROGRESSIONS: readonly (readonly ChordName[])[] = [
  ['C', 'G', 'Am', 'F'],
  ['Am', 'F', 'C', 'G'],
  ['F', 'G', 'Em', 'Am'],
  ['C', 'Am', 'Dm', 'G'],
];

/** [step in bar, semitones above the root, length in steps]. */
type BassNote = readonly [number, number, number];

const BASS_PATTERNS: readonly (readonly BassNote[])[] = [
  [[0, 0, 2], [3, 12, 1], [6, 0, 2], [8, 0, 2], [11, 12, 1], [14, 7, 2]],
  [[0, 0, 3], [4, 0, 1], [6, 12, 1], [8, 0, 3], [12, 7, 1], [14, 12, 1]],
  [[0, 0, 1], [2, 12, 1], [4, 0, 1], [6, 12, 1], [8, 0, 1], [10, 12, 1], [12, 7, 1], [14, 12, 1]],
];

/** Steps that get a chord stab; landing on the offbeats is what makes it bounce. */
const STAB_PATTERNS: readonly (readonly number[])[] = [
  [2, 6, 10, 14],
  [2, 6, 9, 12, 14],
  [3, 6, 10, 13],
];

interface MotifNote {
  /** Step within a two-bar motif (0..31). */
  step: number;
  /** Index into the current chord's tones, counting up through octaves, so the melody follows the chords. */
  degree: number;
}

interface Phrase {
  chords: readonly ChordName[];
  bass: readonly BassNote[];
  stabs: readonly number[];
  /** Played twice per phrase; empty phrases let the loop breathe. */
  motif: readonly MotifNote[];
}

export function createMusic(mixer: Mixer): Music {
  const { ctx } = mixer;
  const fader = ctx.createGain();
  fader.gain.value = 0;
  fader.connect(mixer.music);

  let timer: ReturnType<typeof setInterval> | undefined;
  let step = 0;
  let next = 0;
  let phrase = nextPhrase(null);

  const pump = () => {
    const now = ctx.currentTime;
    // Timers stall in background tabs; skip what was missed instead of playing it all at once.
    if (next < now) next = now + START_DELAY;
    while (next < now + LOOKAHEAD) {
      if (step > 0 && step % PHRASE_STEPS === 0) phrase = nextPhrase(phrase);
      if (mixer.musicAudible()) {
        playStep({ ctx, out: fader, noise: mixer.noise, t: next, pitch: 1, end: next }, step, phrase);
      }
      next += STEP;
      step++;
    }
  };

  return {
    setOn(on) {
      if (on === (timer !== undefined)) return;
      const now = ctx.currentTime;
      fader.gain.setTargetAtTime(on ? 1 : 0, now, on ? FADE_IN : FADE_OUT);
      if (on) {
        step = 0;
        next = now + START_DELAY;
        phrase = nextPhrase(phrase);
        timer = setInterval(pump, PUMP_MS);
        pump();
      } else {
        // What is already scheduled (a fraction of a second) rings out under the fade.
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}

function playStep(v: Voice, n: number, phrase: Phrase): void {
  const s = n % STEPS_PER_BAR;
  const bar = Math.floor(n / STEPS_PER_BAR) % BARS_PER_PHRASE;
  const chord = CHORDS[phrase.chords[bar]];

  if (s % 8 === 0) tone(v, { freq: 120, to: 45, glide: 0.12, dur: 0.22, attack: 0.002, gain: 0.4 });
  hats(v, s, bar === BARS_PER_PHRASE - 1);
  for (const [at, interval, length] of phrase.bass) {
    if (at === s) bassNote(v, chord.bass + interval, length * STEP);
  }
  if (phrase.stabs.includes(s)) stab(v, chord.tones);
  const motifStep = (bar % 2) * STEPS_PER_BAR + s;
  for (const note of phrase.motif) {
    if (note.step === motifStep) bell(v, melodyNote(chord, note.degree), { dur: 0.5, gain: 0.07 });
  }
}

/** Accented offbeat 8ths, random ghost 16ths, and a roll into the next phrase. */
function hats(v: Voice, s: number, lastBar: boolean): void {
  const hat = (gain: number, dur: number) =>
    noise(v, { dur, attack: 0.001, gain, filter: { type: 'highpass', freq: 7000 } });
  if (s % 2 === 0) {
    const open = s === 14 && Math.random() < 0.3;
    hat(s % 4 === 2 ? 0.09 : 0.05, open ? 0.16 : 0.03);
  } else if ((lastBar && s >= 12) || Math.random() < 0.15) {
    hat(0.03, 0.025);
  }
}

function bassNote(v: Voice, note: number, length: number): void {
  const f = hz(note);
  const dur = length * 0.9 + 0.05;
  tone(v, { wave: 'square', freq: f, dur, attack: 0.005, gain: 0.08, filter: { type: 'lowpass', freq: 700, q: 2 } });
  tone(v, { wave: 'triangle', freq: f, dur, attack: 0.005, gain: 0.22 });
}

function stab(v: Voice, tones: readonly number[]): void {
  tones.forEach((note, i) => {
    const pan = (i - 1) * 0.25;
    const f = hz(note);
    tone(v, { wave: 'triangle', freq: f, dur: 0.16, attack: 0.004, gain: 0.07, pan });
    tone(v, { wave: 'square', freq: f, dur: 0.1, attack: 0.004, gain: 0.025, pan, filter: { type: 'lowpass', freq: 2200 } });
  });
}

/** Degrees 0..5 walk up the chord tones from an octave above the stabs. */
function melodyNote(chord: Chord, degree: number): number {
  return chord.tones[degree % 3] + 12 * (1 + Math.floor(degree / 3));
}

function nextPhrase(previous: Phrase | null): Phrase {
  return {
    chords: pick(PROGRESSIONS.filter((p) => p !== previous?.chords)),
    bass: pick(BASS_PATTERNS),
    stabs: pick(STAB_PATTERNS),
    motif: Math.random() < 0.3 ? [] : randomMotif(),
  };
}

/** A small random walk over the chord tones on the 8th-note grid. */
function randomMotif(): MotifNote[] {
  const notes: MotifNote[] = [];
  let degree = 2 + Math.floor(Math.random() * 2);
  for (let step = 0; step < 2 * STEPS_PER_BAR; step += 2) {
    if (Math.random() > 0.4) continue;
    degree = Math.min(MAX_DEGREE, Math.max(0, degree + pick([-2, -1, 1, 1, 2])));
    notes.push({ step, degree });
  }
  return notes;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
