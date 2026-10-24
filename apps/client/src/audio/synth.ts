/**
 * Tiny procedural synthesizer (in the spirit of zzfx): every default sound of the game is
 * described here as a few tones and rendered to samples on first use. No file, no licence.
 * Rendering is pure and deterministic (seeded noise), so it is unit-tested.
 */

export type Wave = 'sine' | 'triangle' | 'square' | 'saw' | 'noise' | 'pluck';

export interface Tone {
  wave: Wave;
  /** Start frequency (Hz); ignored by noise. */
  freq: number;
  /** End frequency (exponential slide over the tone). */
  freqEnd?: number;
  /** Start time in seconds. */
  start?: number;
  attack: number;
  /** Time held at full level after the attack. */
  hold?: number;
  decay: number;
  gain?: number;
  /** Vibrato: rate (Hz) and depth (semitones). */
  vibrato?: [rate: number, depth: number];
  /** Tremolo: rate (Hz) and depth (0..1). */
  tremolo?: [rate: number, depth: number];
  /** One-pole low-pass cutoff (Hz), optionally sliding to `lowpassEnd`. */
  lowpass?: number;
  lowpassEnd?: number;
}

export interface Preset {
  tones: Tone[];
  /** Fixed length in seconds (default: until the last tone ends). */
  length?: number;
  /** Made seamless for looping (the tail is cross-faded into the head). */
  loop?: boolean;
  /** Peak level after normalisation. */
  peak?: number;
}

/** The night loop is long enough for the crickets' silences not to repeat audibly. */
const NIGHT_LOOP_S = 20;

const note = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
// Handy pitches (A4 = 0).
const C5 = note(3);
const D5 = note(5);
const E5 = note(7);
const G5 = note(10);
const A5 = note(12);
const C6 = note(15);
const E6 = note(19);

/**
 * Night crickets: short trills of a high tone, two voices at different pitches. Chantier 20:
 * rare (3 to 8 s of silence between two trills of a voice); they were tiring.
 */
function crickets(seed: number, length: number): Tone[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const out: Tone[] = [];
  for (const f of [4400, 5000]) {
    let t = rand() * 3;
    while (t < length - 0.5) {
      out.push({
        wave: 'sine',
        freq: f * (0.98 + rand() * 0.04),
        start: t,
        attack: 0.01,
        hold: 0.18 + rand() * 0.2,
        decay: 0.05,
        gain: 0.25 + rand() * 0.2,
        tremolo: [32, 0.9],
      });
      t += 3 + rand() * 5;
    }
  }
  return out;
}

function chirps(seed: number, count: number, length: number, gain: number): Tone[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  const out: Tone[] = [];
  for (let i = 0; i < count; i++) {
    const start = 0.3 + rand() * (length - 1);
    const f = 2200 + rand() * 1600;
    const notes = 1 + Math.floor(rand() * 3);
    for (let n = 0; n < notes; n++)
      out.push({
        wave: 'sine',
        freq: f * (1 + n * 0.08),
        freqEnd: f * (1.25 + n * 0.08),
        start: start + n * 0.09,
        attack: 0.006,
        decay: 0.07,
        gain: gain * (0.5 + rand() * 0.5),
        vibrato: [28, 0.6],
      });
  }
  return out;
}

export const SYNTH_PRESETS = {
  // Intro (chantier 22): a short, muffled swish, the flesh giving way (a low wet tear and a
  // soft thump), then a splash sliding down — no ring, the cut is organic.
  slice: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.05,
        decay: 0.16,
        gain: 0.45,
        lowpass: 700,
        lowpassEnd: 2600,
      },
      // The flesh gives way: a low, wet tear.
      {
        wave: 'noise',
        freq: 0,
        start: 0.12,
        attack: 0.01,
        hold: 0.05,
        decay: 0.22,
        gain: 0.7,
        lowpass: 520,
        lowpassEnd: 180,
        tremolo: [38, 0.6],
      },
      { wave: 'sine', freq: 120, freqEnd: 55, start: 0.13, attack: 0.008, decay: 0.32, gain: 0.55 },
      // Splash: a wet burst sliding down.
      {
        wave: 'noise',
        freq: 0,
        start: 0.24,
        attack: 0.006,
        decay: 0.3,
        gain: 0.5,
        lowpass: 1800,
        lowpassEnd: 400,
      },
      ...[0.34, 0.43, 0.55].map((start, i) => ({
        wave: 'sine' as const,
        freq: 420 + i * 70,
        freqEnd: 820 + i * 110,
        start,
        attack: 0.003,
        decay: 0.05,
        gain: 0.18 - i * 0.03,
      })),
    ],
    peak: 0.6,
  },
  // Intro (chantier 22): the strands of juice between the halves break and drip.
  juice: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.01,
        decay: 0.18,
        gain: 0.35,
        lowpass: 900,
        lowpassEnd: 300,
        tremolo: [26, 0.7],
      },
      ...[0.05, 0.16, 0.24, 0.37, 0.52, 0.7].map((start, i) => ({
        wave: 'sine' as const,
        freq: 380 + ((i * 137) % 260),
        freqEnd: 900 + ((i * 211) % 500),
        start,
        attack: 0.002,
        decay: 0.045,
        gain: 0.26 - i * 0.025,
      })),
    ],
    peak: 0.45,
  },
  click: {
    tones: [{ wave: 'triangle', freq: 1400, freqEnd: 900, attack: 0.002, decay: 0.035 }],
    peak: 0.45,
  },
  tick: {
    tones: [{ wave: 'sine', freq: 1900, freqEnd: 1600, attack: 0.001, decay: 0.03 }],
    peak: 0.3,
  },
  open: {
    tones: [
      { wave: 'sine', freq: 520, freqEnd: 820, attack: 0.005, decay: 0.09 },
      { wave: 'sine', freq: 780, freqEnd: 1240, start: 0.045, attack: 0.005, decay: 0.1 },
    ],
    peak: 0.35,
  },
  close: {
    tones: [
      { wave: 'sine', freq: 820, freqEnd: 520, attack: 0.005, decay: 0.09 },
      { wave: 'sine', freq: 600, freqEnd: 400, start: 0.045, attack: 0.005, decay: 0.1 },
    ],
    peak: 0.3,
  },
  error: {
    tones: [
      { wave: 'square', freq: 240, freqEnd: 200, attack: 0.004, decay: 0.09, lowpass: 1600 },
      { wave: 'square', freq: 200, freqEnd: 170, start: 0.11, attack: 0.004, decay: 0.11 },
    ],
    peak: 0.3,
  },
  notify: {
    tones: [
      { wave: 'sine', freq: E6, attack: 0.004, decay: 0.25 },
      { wave: 'sine', freq: A5 * 2, start: 0.08, attack: 0.004, decay: 0.3 },
    ],
    peak: 0.3,
  },
  place: {
    tones: [
      { wave: 'sine', freq: 190, freqEnd: 70, attack: 0.003, decay: 0.2, gain: 1 },
      { wave: 'noise', freq: 0, attack: 0.002, decay: 0.07, gain: 0.5, lowpass: 1400 },
      { wave: 'pluck', freq: C5, start: 0.05, attack: 0.001, decay: 0.3, gain: 0.35 },
    ],
    peak: 0.6,
  },
  complete: {
    tones: [
      { wave: 'pluck', freq: C5, attack: 0.001, decay: 0.6 },
      { wave: 'pluck', freq: E5, start: 0.08, attack: 0.001, decay: 0.6 },
      { wave: 'pluck', freq: G5, start: 0.16, attack: 0.001, decay: 0.7 },
      { wave: 'pluck', freq: C6, start: 0.24, attack: 0.001, decay: 0.9 },
      { wave: 'sine', freq: C6 * 2, start: 0.24, attack: 0.01, decay: 0.8, gain: 0.25 },
    ],
    peak: 0.55,
  },
  upgrade: {
    tones: [
      { wave: 'pluck', freq: D5, attack: 0.001, decay: 0.5 },
      { wave: 'pluck', freq: G5, start: 0.07, attack: 0.001, decay: 0.5 },
      { wave: 'pluck', freq: A5, start: 0.14, attack: 0.001, decay: 0.6 },
      { wave: 'pluck', freq: D5 * 2, start: 0.21, attack: 0.001, decay: 0.8 },
      { wave: 'sine', freq: G5 * 2, start: 0.3, attack: 0.02, decay: 0.9, gain: 0.3 },
      { wave: 'sine', freq: D5 * 4, start: 0.36, attack: 0.02, decay: 0.8, gain: 0.15 },
    ],
    peak: 0.55,
  },
  // Chantier 16: the land wakes up — a soft rising chime that spreads like the wave, over a
  // light breath of leaves.
  awaken: {
    tones: [
      { wave: 'sine', freq: C5, start: 0, attack: 0.03, decay: 0.9, gain: 0.22 },
      { wave: 'sine', freq: E5, start: 0.16, attack: 0.03, decay: 0.9, gain: 0.2 },
      { wave: 'sine', freq: G5, start: 0.32, attack: 0.03, decay: 1, gain: 0.18 },
      { wave: 'sine', freq: C6, start: 0.48, attack: 0.03, decay: 1.2, gain: 0.16 },
      { wave: 'triangle', freq: E6, start: 0.6, attack: 0.05, decay: 1.2, gain: 0.06 },
      {
        wave: 'noise',
        freq: 0,
        attack: 0.35,
        decay: 0.9,
        gain: 0.06,
        lowpass: 2500,
        lowpassEnd: 700,
      },
    ],
    peak: 0.35,
  },
  remove: {
    tones: [
      { wave: 'sine', freq: 320, freqEnd: 110, attack: 0.003, decay: 0.18 },
      { wave: 'noise', freq: 0, attack: 0.002, decay: 0.12, gain: 0.4, lowpass: 900 },
    ],
    peak: 0.45,
  },
  egg: {
    tones: [
      { wave: 'sine', freq: 300, freqEnd: 680, attack: 0.004, decay: 0.12 },
      { wave: 'sine', freq: 680, freqEnd: 900, start: 0.1, attack: 0.004, decay: 0.15, gain: 0.5 },
    ],
    peak: 0.45,
  },
  hatch: {
    tones: [
      { wave: 'noise', freq: 0, attack: 0.001, decay: 0.03, lowpass: 5000 },
      { wave: 'noise', freq: 0, start: 0.09, attack: 0.001, decay: 0.03, lowpass: 5000 },
      { wave: 'noise', freq: 0, start: 0.15, attack: 0.001, decay: 0.05, lowpass: 4000 },
      ...chirps(7, 2, 1.4, 0.8).map((t, i) => ({ ...t, start: 0.3 + i * 0.12 })),
    ],
    peak: 0.5,
  },
  levelUp: {
    tones: [
      { wave: 'triangle', freq: C5, attack: 0.005, decay: 0.25, gain: 0.7 },
      { wave: 'triangle', freq: E5, start: 0.09, attack: 0.005, decay: 0.25, gain: 0.7 },
      { wave: 'triangle', freq: G5, start: 0.18, attack: 0.005, decay: 0.3, gain: 0.7 },
      { wave: 'pluck', freq: C6, start: 0.27, attack: 0.001, decay: 0.9 },
      {
        wave: 'sine',
        freq: E6,
        start: 0.3,
        attack: 0.02,
        decay: 0.9,
        gain: 0.25,
        vibrato: [6, 0.3],
      },
    ],
    peak: 0.5,
  },
  mastery: {
    tones: [
      { wave: 'pluck', freq: G5, attack: 0.001, decay: 0.4 },
      { wave: 'pluck', freq: C6, start: 0.1, attack: 0.001, decay: 0.6 },
    ],
    peak: 0.4,
  },
  // Chantier 38: a piece leaves the Forge — two hammer strikes on an anvil, a bright ring.
  anvil: {
    tones: [
      { wave: 'noise', freq: 0, attack: 0.001, decay: 0.04, gain: 0.5, lowpass: 7000 },
      { wave: 'sine', freq: 1870, attack: 0.001, decay: 0.35, gain: 0.5 },
      { wave: 'sine', freq: 2630, attack: 0.001, decay: 0.25, gain: 0.3 },
      { wave: 'noise', freq: 0, start: 0.22, attack: 0.001, decay: 0.04, gain: 0.5, lowpass: 7000 },
      { wave: 'sine', freq: 1870, start: 0.22, attack: 0.001, decay: 0.7, gain: 0.55 },
      { wave: 'sine', freq: 3410, start: 0.22, attack: 0.001, decay: 0.4, gain: 0.2 },
    ],
    peak: 0.4,
  },
  // Chantier 08: a technology is researched — a bright rising idea with a soft shimmer.
  discovery: {
    tones: [
      { wave: 'pluck', freq: C5, attack: 0.001, decay: 0.35 },
      { wave: 'pluck', freq: G5, start: 0.09, attack: 0.001, decay: 0.4 },
      { wave: 'sine', freq: C6, start: 0.18, attack: 0.004, decay: 0.8, vibrato: [6, 0.15] },
      { wave: 'noise', freq: 0, start: 0.18, attack: 0.1, decay: 0.5, gain: 0.08, lowpass: 8000 },
    ],
    peak: 0.4,
  },
  // A new age: a short brass-like fanfare over a low drum.
  fanfare: {
    tones: [
      { wave: 'sine', freq: 90, freqEnd: 50, attack: 0.005, decay: 0.5, gain: 0.8 },
      {
        wave: 'saw',
        freq: C5,
        start: 0.05,
        attack: 0.02,
        hold: 0.12,
        decay: 0.2,
        lowpass: 2200,
        gain: 0.35,
      },
      {
        wave: 'saw',
        freq: G5,
        start: 0.25,
        attack: 0.02,
        hold: 0.12,
        decay: 0.2,
        lowpass: 2400,
        gain: 0.35,
      },
      {
        wave: 'saw',
        freq: C6,
        start: 0.45,
        attack: 0.02,
        hold: 0.35,
        decay: 0.9,
        lowpass: 2600,
        gain: 0.4,
      },
      { wave: 'triangle', freq: E5, start: 0.45, attack: 0.02, hold: 0.35, decay: 0.9, gain: 0.3 },
      { wave: 'noise', freq: 0, start: 0.45, attack: 0.3, decay: 1.2, gain: 0.1, lowpass: 9000 },
    ],
    peak: 0.5,
  },
  shiny: {
    tones: [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
        wave: 'sine' as const,
        freq: [C6, E6, G5 * 2, C6 * 2][i % 4]!,
        start: i * 0.07,
        attack: 0.003,
        decay: 0.5,
        gain: 0.5 - i * 0.03,
        vibrato: [9, 0.2] as [number, number],
      })),
      { wave: 'noise', freq: 0, start: 0.05, attack: 0.2, decay: 0.8, gain: 0.12, lowpass: 9000 },
    ],
    peak: 0.5,
  },
  chirp: {
    tones: [
      {
        wave: 'sine',
        freq: 2500,
        freqEnd: 3400,
        attack: 0.005,
        decay: 0.06,
        vibrato: [30, 0.5],
      },
      {
        wave: 'sine',
        freq: 2700,
        freqEnd: 3600,
        start: 0.1,
        attack: 0.005,
        decay: 0.07,
        vibrato: [30, 0.5],
      },
    ],
    peak: 0.35,
  },
  // Kiwi "speech": three babble variants; the engine shifts the pitch per kiwi.
  voice1: {
    tones: [
      { wave: 'triangle', freq: 620, freqEnd: 760, attack: 0.01, decay: 0.07, vibrato: [18, 1] },
      {
        wave: 'triangle',
        freq: 700,
        freqEnd: 600,
        start: 0.1,
        attack: 0.01,
        decay: 0.08,
        vibrato: [18, 1],
      },
      {
        wave: 'triangle',
        freq: 660,
        freqEnd: 880,
        start: 0.21,
        attack: 0.01,
        decay: 0.09,
        vibrato: [18, 1],
      },
    ],
    peak: 0.35,
  },
  voice2: {
    tones: [
      { wave: 'triangle', freq: 740, freqEnd: 640, attack: 0.01, decay: 0.06, vibrato: [20, 1] },
      {
        wave: 'triangle',
        freq: 620,
        freqEnd: 820,
        start: 0.09,
        attack: 0.01,
        decay: 0.12,
        vibrato: [20, 1],
      },
    ],
    peak: 0.35,
  },
  voice3: {
    tones: [
      { wave: 'triangle', freq: 600, freqEnd: 700, attack: 0.01, decay: 0.05, vibrato: [16, 1] },
      {
        wave: 'triangle',
        freq: 680,
        freqEnd: 720,
        start: 0.08,
        attack: 0.01,
        decay: 0.05,
        vibrato: [16, 1],
      },
      {
        wave: 'triangle',
        freq: 760,
        freqEnd: 560,
        start: 0.16,
        attack: 0.01,
        decay: 0.06,
        vibrato: [16, 1],
      },
      {
        wave: 'triangle',
        freq: 640,
        freqEnd: 900,
        start: 0.25,
        attack: 0.01,
        decay: 0.1,
        vibrato: [16, 1],
      },
    ],
    peak: 0.35,
  },
  gather: {
    tones: [
      { wave: 'pluck', freq: E5, attack: 0.001, decay: 0.25 },
      { wave: 'pluck', freq: A5, start: 0.07, attack: 0.001, decay: 0.35 },
    ],
    peak: 0.45,
  },
  // Chantier 30: a warehouse reserve poured back into the stock (a rising little cascade).
  collect: {
    tones: [
      { wave: 'pluck', freq: C5, attack: 0.001, decay: 0.2 },
      { wave: 'pluck', freq: E5, start: 0.06, attack: 0.001, decay: 0.22 },
      { wave: 'pluck', freq: G5, start: 0.12, attack: 0.001, decay: 0.26 },
      { wave: 'pluck', freq: C6, start: 0.18, attack: 0.001, decay: 0.4 },
    ],
    peak: 0.45,
  },
  full: {
    tones: [
      { wave: 'triangle', freq: 330, attack: 0.005, decay: 0.15 },
      { wave: 'triangle', freq: 262, start: 0.14, attack: 0.005, decay: 0.25 },
    ],
    peak: 0.4,
  },
  launch: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.5,
        decay: 0.7,
        lowpass: 300,
        lowpassEnd: 3500,
      },
      { wave: 'sine', freq: 90, freqEnd: 220, attack: 0.4, decay: 0.6, gain: 0.5 },
    ],
    peak: 0.5,
  },
  arrive: {
    tones: [
      { wave: 'saw', freq: 220, attack: 0.05, hold: 0.2, decay: 0.3, lowpass: 900 },
      { wave: 'saw', freq: 330, start: 0.25, attack: 0.05, hold: 0.25, decay: 0.4, lowpass: 900 },
    ],
    peak: 0.4,
  },
  return: {
    tones: [
      { wave: 'pluck', freq: G5, attack: 0.001, decay: 0.5 },
      { wave: 'pluck', freq: E5, start: 0.09, attack: 0.001, decay: 0.5 },
      { wave: 'pluck', freq: C5, start: 0.18, attack: 0.001, decay: 0.7 },
      { wave: 'pluck', freq: G5, start: 0.3, attack: 0.001, decay: 0.9 },
      {
        wave: 'noise',
        freq: 0,
        attack: 0.3,
        decay: 0.5,
        gain: 0.3,
        lowpass: 2500,
        lowpassEnd: 400,
      },
    ],
    peak: 0.5,
  },
  paint: {
    tones: [{ wave: 'noise', freq: 0, attack: 0.01, decay: 0.06, lowpass: 2500 }],
    peak: 0.25,
  },
  // A soft falling call: the colony is hungry.
  hunger: {
    tones: [
      { wave: 'triangle', freq: 392, attack: 0.02, hold: 0.1, decay: 0.3 },
      { wave: 'triangle', freq: 311, start: 0.3, attack: 0.02, hold: 0.15, decay: 0.5 },
      { wave: 'triangle', freq: 262, start: 0.65, attack: 0.02, decay: 0.7, gain: 0.7 },
    ],
    peak: 0.4,
  },
  warning: {
    tones: [0, 0.22, 0.44].flatMap((start) => [
      { wave: 'square' as const, freq: 660, start, attack: 0.005, decay: 0.09, lowpass: 2000 },
      { wave: 'square' as const, freq: 440, start: start + 0.1, attack: 0.005, decay: 0.09 },
    ]),
    peak: 0.35,
  },
  // Chantier 06: predators and gifts from the sky.
  strike: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.02,
        decay: 0.6,
        gain: 0.6,
        lowpass: 500,
        lowpassEnd: 2400,
      },
      { wave: 'saw', freq: 220, freqEnd: 110, attack: 0.01, decay: 0.5, gain: 0.35, lowpass: 1200 },
      {
        wave: 'saw',
        freq: 233,
        freqEnd: 116,
        start: 0.05,
        attack: 0.01,
        decay: 0.5,
        gain: 0.25,
        lowpass: 1200,
      },
    ],
    peak: 0.5,
  },
  victory: {
    tones: [
      { wave: 'triangle', freq: 523, attack: 0.01, hold: 0.08, decay: 0.2 },
      { wave: 'triangle', freq: 659, start: 0.12, attack: 0.01, hold: 0.08, decay: 0.2 },
      { wave: 'triangle', freq: 784, start: 0.24, attack: 0.01, hold: 0.2, decay: 0.6 },
      { wave: 'sine', freq: 1047, start: 0.24, attack: 0.01, decay: 0.7, gain: 0.3 },
    ],
    peak: 0.45,
  },
  defeat: {
    tones: [
      { wave: 'triangle', freq: 330, attack: 0.02, hold: 0.15, decay: 0.3 },
      { wave: 'triangle', freq: 277, start: 0.3, attack: 0.02, hold: 0.15, decay: 0.3 },
      { wave: 'triangle', freq: 220, start: 0.6, attack: 0.02, hold: 0.2, decay: 0.9, gain: 0.8 },
    ],
    peak: 0.4,
  },
  shot: {
    tones: [
      { wave: 'noise', freq: 0, attack: 0.002, decay: 0.08, gain: 0.5, lowpass: 3000 },
      { wave: 'sine', freq: 900, freqEnd: 300, attack: 0.002, decay: 0.12, gain: 0.3 },
    ],
    peak: 0.3,
  },
  meteor: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.6,
        decay: 0.3,
        gain: 0.4,
        lowpass: 400,
        lowpassEnd: 4000,
      },
      { wave: 'sine', freq: 1800, freqEnd: 300, attack: 0.05, hold: 0.5, decay: 0.3, gain: 0.2 },
      { wave: 'noise', freq: 0, start: 0.9, attack: 0.005, decay: 0.7, gain: 0.7, lowpass: 700 },
      { wave: 'sine', freq: 90, freqEnd: 40, start: 0.9, attack: 0.005, decay: 0.6, gain: 0.6 },
    ],
    peak: 0.55,
  },
  // Chantier 13: a comet in the sky (soft shimmer), then stardust raining down (a cascade).
  cometSeen: {
    tones: [
      { wave: 'sine', freq: 1320, freqEnd: 1760, attack: 0.4, hold: 0.3, decay: 1.2, gain: 0.16 },
      { wave: 'sine', freq: 1980, freqEnd: 2640, start: 0.2, attack: 0.4, decay: 1.2, gain: 0.1 },
      {
        wave: 'noise',
        freq: 0,
        attack: 0.8,
        decay: 1,
        gain: 0.08,
        lowpass: 6000,
        lowpassEnd: 2000,
      },
    ],
    peak: 0.3,
  },
  comet: {
    tones: [
      { wave: 'sine', freq: 1568, start: 0, attack: 0.005, decay: 0.9, gain: 0.18 },
      { wave: 'sine', freq: 1976, start: 0.09, attack: 0.005, decay: 0.9, gain: 0.18 },
      { wave: 'sine', freq: 2349, start: 0.18, attack: 0.005, decay: 0.9, gain: 0.18 },
      { wave: 'sine', freq: 2637, start: 0.27, attack: 0.005, decay: 0.9, gain: 0.18 },
      { wave: 'sine', freq: 3136, start: 0.36, attack: 0.005, decay: 0.9, gain: 0.18 },
      { wave: 'sine', freq: 3951, start: 0.45, attack: 0.005, decay: 0.9, gain: 0.18 },
      {
        wave: 'noise',
        freq: 0,
        attack: 0.3,
        decay: 1.2,
        gain: 0.12,
        lowpass: 8000,
        lowpassEnd: 3000,
      },
    ],
    peak: 0.4,
  },
  // Ambience loops.
  wind: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.01,
        hold: 8,
        decay: 0.01,
        lowpass: 380,
        tremolo: [0.25, 0.6],
      },
      {
        wave: 'noise',
        freq: 0,
        attack: 0.01,
        hold: 8,
        decay: 0.01,
        gain: 0.5,
        lowpass: 900,
        tremolo: [0.375, 0.8],
      },
    ],
    length: 8,
    loop: true,
    peak: 0.5,
  },
  nature: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.01,
        hold: 8,
        decay: 0.01,
        gain: 0.25,
        lowpass: 1800,
        tremolo: [0.5, 0.5],
      },
      ...chirps(42, 7, 8, 0.6),
    ],
    length: 8,
    loop: true,
    peak: 0.4,
  },
  night: {
    tones: [
      {
        wave: 'noise',
        freq: 0,
        attack: 0.01,
        hold: NIGHT_LOOP_S,
        decay: 0.01,
        gain: 0.15,
        lowpass: 500,
        tremolo: [0.2, 0.5],
      },
      ...crickets(7, NIGHT_LOOP_S),
    ],
    length: NIGHT_LOOP_S,
    loop: true,
    peak: 0.25,
  },
} satisfies Record<string, Preset>;

export type SynthPresetId = keyof typeof SYNTH_PRESETS;
export const SYNTH_PRESET_IDS = Object.keys(SYNTH_PRESETS) as SynthPresetId[];

function presetLength(p: Preset): number {
  if (p.length !== undefined) return p.length;
  return Math.max(...p.tones.map((t) => (t.start ?? 0) + t.attack + (t.hold ?? 0) + t.decay));
}

function envelope(t: number, tone: Tone): number {
  if (t < 0) return 0;
  if (t < tone.attack) return t / tone.attack;
  const afterHold = t - tone.attack - (tone.hold ?? 0);
  if (afterHold < 0) return 1;
  if (afterHold >= tone.decay) return 0;
  const x = 1 - afterHold / tone.decay;
  return x * x;
}

function renderTone(out: Float32Array, tone: Tone, sampleRate: number, seed: number): void {
  const start = Math.floor((tone.start ?? 0) * sampleRate);
  const length = Math.ceil((tone.attack + (tone.hold ?? 0) + tone.decay) * sampleRate);
  const gain = tone.gain ?? 1;
  const f0 = tone.freq;
  const f1 = tone.freqEnd ?? tone.freq;
  let noise = seed >>> 0 || 1;
  const nextNoise = () => {
    noise = (noise * 1664525 + 1013904223) >>> 0;
    return (noise / 2 ** 32) * 2 - 1;
  };
  // Karplus-Strong string for plucks.
  let ring: Float32Array | null = null;
  if (tone.wave === 'pluck') {
    ring = new Float32Array(Math.max(2, Math.round(sampleRate / f0)));
    for (let i = 0; i < ring.length; i++) ring[i] = nextNoise();
  }
  let phase = 0;
  let lp = 0;
  const lpEnd = tone.lowpassEnd ?? tone.lowpass ?? 0;
  const lpFixed = 1 - Math.exp((-2 * Math.PI * (tone.lowpass ?? 0)) / sampleRate);
  for (let i = 0; i < length && start + i < out.length; i++) {
    const t = i / sampleRate;
    const k = length > 1 ? i / (length - 1) : 0;
    let f = f1 === f0 ? f0 : f0 * (f1 / f0) ** k;
    if (tone.vibrato)
      f *= 2 ** ((Math.sin(2 * Math.PI * tone.vibrato[0] * t) * tone.vibrato[1]) / 12);
    phase += f / sampleRate;
    phase -= Math.floor(phase);
    let s: number;
    switch (tone.wave) {
      case 'sine':
        s = Math.sin(2 * Math.PI * phase);
        break;
      case 'triangle':
        s = 1 - 4 * Math.abs(phase - 0.5);
        break;
      case 'square':
        s = phase < 0.5 ? 0.6 : -0.6;
        break;
      case 'saw':
        s = (2 * phase - 1) * 0.6;
        break;
      case 'noise':
        s = nextNoise();
        break;
      case 'pluck': {
        const r = ring!;
        const j = i % r.length;
        const next = r[(j + 1) % r.length]!;
        s = r[j]!;
        r[j] = (s + next) * 0.5 * 0.996;
        break;
      }
    }
    if (tone.lowpass) {
      const a =
        lpEnd === tone.lowpass
          ? lpFixed
          : 1 - Math.exp((-2 * Math.PI * tone.lowpass * (lpEnd / tone.lowpass) ** k) / sampleRate);
      lp += a * (s - lp);
      s = lp;
    }
    let amp = envelope(t, tone) * gain;
    if (tone.tremolo)
      amp *= 1 - tone.tremolo[1] * 0.5 * (1 + Math.sin(2 * Math.PI * tone.tremolo[0] * t));
    out[start + i]! += s * amp;
  }
}

/** Renders a preset to mono samples, normalised to its peak level. */
export function renderPreset(preset: Preset, sampleRate: number): Float32Array<ArrayBuffer> {
  const length = presetLength(preset);
  const fade = preset.loop ? Math.min(0.5, length / 4) : 0;
  const total = Math.ceil((length + fade) * sampleRate);
  const raw = new Float32Array(total);
  preset.tones.forEach((tone, i) => {
    // Loop textures run for the whole buffer, fade included.
    const t = preset.loop && (tone.hold ?? 0) >= length ? { ...tone, hold: length + fade } : tone;
    renderTone(raw, t, sampleRate, 0x9e3779b1 ^ (i * 7919));
  });
  let out = raw;
  if (preset.loop) {
    // Cross-fade the extra tail into the head so the loop point is seamless.
    const n = Math.ceil(length * sampleRate);
    const f = total - n;
    out = raw.slice(0, n);
    for (let i = 0; i < f; i++) {
      const x = i / f;
      out[i] = raw[i]! * Math.sqrt(x) + raw[n + i]! * Math.sqrt(1 - x);
    }
  }
  let max = 0;
  for (const v of out) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? (preset.peak ?? 0.5) / max : 0;
  for (let i = 0; i < out.length; i++) out[i]! *= scale;
  return out;
}
