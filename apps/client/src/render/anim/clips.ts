import { blendPoses, restPose, type Pose, type PropId } from './pose';

/**
 * Chantier 34: the clips of the kiwis — procedural, mixable animations. A clip writes a pose
 * for a time `t` (seconds since it started) over the rest pose. Looping clips are periodic;
 * one-shot clips (fall, get up) hold their last pose. The rig (`kiwiRig.ts`) draws the pose;
 * `KiwisView` picks the clip from the job and crossfades between two (`ClipPlayer`).
 */

export const CLIP_IDS = [
  // Moving and resting.
  'idle',
  'walk',
  'sleep',
  // Work.
  'peck',
  'hammer',
  'read',
  'write',
  'sit',
  'listen',
  'teach',
  // Life.
  'joy',
  'dance',
  'clap',
  'eat',
  'stretch',
  'chat',
  'look',
  // Combat.
  'sword',
  'spell',
  'sling',
  'mace',
  // States.
  'hurt',
  'fall',
  'getUp',
] as const;
export type ClipId = (typeof CLIP_IDS)[number];

export type ClipGroup = 'move' | 'work' | 'life' | 'combat' | 'state';

export interface Clip {
  group: ClipGroup;
  /** One-shot clips last this long, then hold; looping clips ignore it. */
  once?: number;
  /** Accessory held for the whole clip. */
  prop?: PropId;
  apply(t: number, p: Pose): void;
}

const TAU = Math.PI * 2;
const s = Math.sin;
const pos = (x: number) => Math.max(0, x);
/** 0 → 1 → 0 bump over a cycle of length 1 (u in [0, 1)). */
const bump = (u: number) => 0.5 - 0.5 * Math.cos(u * TAU);
const frac = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};

export const CLIPS: Record<ClipId, Clip> = {
  idle: {
    group: 'move',
    apply(t, p) {
      p.yaw = s(t * 0.8) * 0.35;
      p.headYaw = s(t * 0.53 + 1) * 0.45;
      p.headPitch = s(t * 0.31) * 0.12;
      p.bob = pos(s(t * 2.5)) * 0.004;
    },
  },
  walk: {
    group: 'move',
    // `t` runs at the step pace (the view scales it with the speed).
    apply(t, p) {
      const ph = t * 13;
      p.bob = Math.abs(s(ph)) * 0.045;
      p.roll = s(ph) * 0.18;
      p.legL = s(ph) * 0.7;
      p.legR = -s(ph) * 0.7;
      p.headPitch = -Math.abs(s(ph)) * 0.08;
      p.wingL = p.wingR = 0.08 + Math.abs(s(ph)) * 0.08;
    },
  },
  sleep: {
    group: 'move',
    apply(t, p) {
      p.sit = 1;
      p.roll = 1.2;
      p.bob = -0.05 + s(t * 1.5) * 0.008;
      p.headPitch = 0.4;
    },
  },

  peck: {
    group: 'work',
    apply(t, p) {
      const k = pos(s(t * 9.6));
      p.pitch = k * 0.55;
      p.headPitch = k * 0.35;
      p.wingL = p.wingR = 0.1 + k * 0.15;
    },
  },
  hammer: {
    group: 'work',
    prop: 'hammer',
    apply(t, p) {
      // Wind up slowly, strike fast.
      const u = frac(t * 1.6);
      const lift = u < 0.7 ? smooth(u / 0.7) : 1 - smooth((u - 0.7) / 0.3);
      p.wingRF = -0.2 + lift * 2;
      p.wingR = 0.25;
      p.propSwing = lift * 0.6;
      p.pitch = 0.1 + (1 - lift) * 0.25;
      p.bob = pos(u > 0.9 ? 0.02 - (u - 0.9) * 0.2 : 0);
      p.headPitch = 0.25;
      p.wingL = 0.3 + lift * 0.2;
    },
  },
  read: {
    group: 'work',
    prop: 'book',
    apply(t, p) {
      p.headPitch = 0.45 + s(t * 0.7) * 0.05;
      // The eyes go along the lines, a page turns now and then.
      p.headYaw = (frac(t * 0.4) - 0.5) * 0.4;
      const turn = frac(t / 5.5) > 0.92 ? bump((frac(t / 5.5) - 0.92) / 0.08) : 0;
      p.wingL = 0.35 + turn * 0.6;
      p.wingLF = 0.9 + turn * 0.3;
      p.wingR = 0.35;
      p.wingRF = 0.9;
      p.bob = s(t * 1.4) * 0.004;
    },
  },
  write: {
    group: 'work',
    prop: 'quill',
    apply(t, p) {
      p.sit = 0.6;
      p.pitch = 0.22;
      p.headPitch = 0.5;
      p.headRoll = s(t * 0.5) * 0.12;
      p.wingRF = 0.9 + s(t * 11) * 0.12 + s(t * 2.1) * 0.15;
      p.wingR = 0.3 + s(t * 7) * 0.06;
      p.wingLF = 0.6;
      p.wingL = 0.25;
    },
  },
  sit: {
    group: 'work',
    apply(t, p) {
      p.sit = 1;
      p.bob = s(t * 1.6) * 0.006;
      p.headYaw = s(t * 0.4) * 0.3;
      p.headPitch = 0.1;
    },
  },
  listen: {
    group: 'work',
    apply(t, p) {
      p.sit = 1;
      p.headPitch = -0.15 + pos(s(t * 1.3)) * 0.12; // nodding
      p.headRoll = s(t * 0.6) * 0.15;
      p.bob = s(t * 1.6) * 0.005;
    },
  },
  teach: {
    group: 'work',
    apply(t, p) {
      p.yaw = s(t * 0.5) * 0.6;
      p.headPitch = -0.15;
      const g = bump(frac(t * 0.7));
      p.wingR = 0.4 + g * 0.6;
      p.wingRF = 0.6 + g * 0.9;
      p.headYaw = s(t * 0.9) * 0.3;
      p.bob = pos(s(t * 2.2)) * 0.012;
    },
  },

  joy: {
    group: 'life',
    apply(t, p) {
      const u = frac(t * 1.8);
      const air = s(u * Math.PI);
      p.bob = air * 0.12;
      p.squash = u < 0.12 ? 0.82 : 1 + air * 0.08;
      p.wingL = p.wingR = 0.6 + air * 0.9;
      p.headPitch = -0.35;
      p.legL = p.legR = air * 0.4;
    },
  },
  dance: {
    group: 'life',
    apply(t, p) {
      const ph = t * 4.5;
      p.yaw = s(t * 1.1) * 1.4;
      p.roll = s(ph) * 0.3;
      p.bob = Math.abs(s(ph)) * 0.05;
      p.wingL = 0.6 + s(ph) * 0.5;
      p.wingR = 0.6 - s(ph) * 0.5;
      p.headRoll = -s(ph) * 0.25;
      p.legL = pos(s(ph)) * 0.6;
      p.legR = pos(-s(ph)) * 0.6;
    },
  },
  clap: {
    group: 'life',
    apply(t, p) {
      const c = Math.abs(s(t * 9));
      p.wingLF = p.wingRF = 1.2;
      p.wingL = p.wingR = 0.1 + c * 0.7;
      p.headPitch = -0.25;
      p.bob = (1 - c) * 0.01;
    },
  },
  eat: {
    group: 'life',
    prop: 'basket',
    apply(t, p) {
      const u = frac(t * 0.8);
      const dip = u < 0.35 ? bump(u / 0.35) : 0;
      p.pitch = dip * 0.6;
      p.headPitch = dip * 0.4 - (u > 0.35 ? 0.1 : 0);
      // Chewing.
      p.headRoll = u > 0.35 ? s(t * 18) * 0.06 : 0;
      p.sit = 0.5;
    },
  },
  stretch: {
    group: 'life',
    apply(t, p) {
      const u = frac(t / 3.2);
      const k = u < 0.5 ? smooth(u / 0.5) : 1 - smooth((u - 0.5) / 0.5);
      p.wingL = p.wingR = k * 1.6;
      p.wingLF = p.wingRF = k * 0.4;
      p.pitch = -k * 0.35;
      p.headPitch = -k * 0.5;
      p.squash = 1 + k * 0.1;
    },
  },
  chat: {
    group: 'life',
    apply(t, p) {
      const talk = frac(t / 4) < 0.5;
      p.headPitch = talk ? s(t * 6) * 0.1 - 0.05 : pos(s(t * 1.5)) * 0.15;
      p.headRoll = talk ? 0 : s(t * 0.8) * 0.2;
      const g = talk ? bump(frac(t * 0.9)) : 0;
      p.wingR = 0.15 + g * 0.6;
      p.wingRF = g * 0.8;
      p.bob = talk ? Math.abs(s(t * 6)) * 0.008 : 0;
    },
  },
  look: {
    group: 'life',
    apply(t, p) {
      // Stands tall and scans the horizon (guards on their round).
      p.squash = 1.06;
      p.headPitch = -0.15;
      p.headYaw = s(t * 0.6) * 0.9;
      p.bob = s(t * 2) * 0.003;
    },
  },

  sword: {
    group: 'combat',
    prop: 'sword',
    apply(t, p) {
      const u = frac(t * 1.4);
      const strike = u < 0.55 ? smooth(u / 0.55) : 1 - smooth((u - 0.55) / 0.45);
      const slash = u > 0.45 && u < 0.6 ? 1 : 0;
      p.wingRF = 1.8 - strike * 2.3;
      p.wingR = 0.5 + strike * 0.3;
      p.propSwing = -0.4 + strike * 0.9;
      p.pitch = slash * 0.25 + (1 - strike) * -0.1;
      p.yaw = (strike - 0.5) * 0.5;
      p.legL = slash * 0.5;
      p.legR = -slash * 0.3;
      p.headPitch = -0.1;
      p.wingL = 0.5;
    },
  },
  spell: {
    group: 'combat',
    prop: 'staff',
    apply(t, p) {
      const u = frac(t / 2.2);
      const charge = smooth(u / 0.75);
      const cast = u > 0.75 ? 1 - smooth((u - 0.75) / 0.25) : 0;
      p.wingRF = 0.6 + charge * 1.2 - cast * 0.6;
      p.wingR = 0.3 + charge * 0.3;
      p.wingL = 0.3 + charge * 0.9;
      p.wingLF = charge * 0.6;
      p.glow = u > 0.75 ? 1 : charge * 0.6 + s(t * 20) * 0.05;
      p.headPitch = -0.3 * charge;
      p.squash = 1 + charge * 0.05;
      p.bob = s(t * 3) * 0.01;
      p.pitch = u > 0.75 ? 0.25 * cast : 0;
    },
  },
  sling: {
    group: 'combat',
    prop: 'sling',
    apply(t, p) {
      const u = frac(t / 1.6);
      // Whirl over the head, then let go.
      const whirl = u < 0.7;
      p.wingR = whirl ? 1.4 + s(t * 16) * 0.25 : 0.9;
      p.wingRF = whirl ? 0.6 + Math.cos(t * 16) * 0.5 : 1.6 - (u - 0.7) * 2;
      p.propSwing = whirl ? t * 16 : 0;
      p.pitch = whirl ? -0.1 : 0.2;
      p.headPitch = -0.15;
      p.yaw = whirl ? -0.2 : 0.2;
    },
  },
  mace: {
    group: 'combat',
    prop: 'mace',
    apply(t, p) {
      // A heavy overhead slam: slow wind-up, hit, recoil.
      const u = frac(t / 1.4);
      const up = u < 0.6 ? smooth(u / 0.6) : 1 - smooth((u - 0.6) / 0.12);
      const hit = u > 0.68 && u < 0.85 ? 1 : 0;
      p.wingRF = -0.1 + up * 2.4;
      p.wingLF = -0.1 + up * 2.2;
      p.wingR = p.wingL = 0.35;
      p.propSwing = up * 0.5;
      p.pitch = -up * 0.25 + hit * 0.35;
      p.squash = hit ? 0.9 : 1 + up * 0.05;
      p.bob = up * 0.03;
    },
  },

  hurt: {
    group: 'state',
    apply(t, p) {
      p.sit = 0.7;
      p.headPitch = 0.55;
      p.roll = s(t * 0.9) * 0.12;
      p.wingL = p.wingR = 0.05;
      p.squash = 0.95 + s(t * 1.2) * 0.02;
    },
  },
  fall: {
    group: 'state',
    once: 0.7,
    apply(t, p) {
      const k = smooth(t / 0.45);
      // A little bounce at the end.
      const settle = t > 0.45 ? s(((t - 0.45) / 0.25) * Math.PI) * 0.05 * (t < 0.7 ? 1 : 0) : 0;
      p.roll = k * 1.45 - settle;
      p.sit = k * 0.8;
      p.headPitch = k * 0.3;
      p.wingL = k * 0.9;
      p.wingR = k * 0.2;
      p.legL = k * 0.6;
      p.legR = k * 0.3;
      p.bob = s(clamp01(t / 0.45) * Math.PI) * 0.06;
    },
  },
  getUp: {
    group: 'state',
    once: 1.2,
    apply(t, p) {
      const k = 1 - smooth(t / 0.6);
      p.roll = k * 1.45;
      p.sit = k * 0.8;
      p.wingL = k * 0.9;
      p.wingR = k * 0.2;
      // Then a shake of the feathers.
      if (t > 0.6) {
        const sh = 1 - clamp01((t - 0.6) / 0.6);
        p.yaw = s(t * 40) * 0.12 * sh;
        p.wingL = p.wingR = 0.3 * sh;
        p.squash = 1 + 0.05 * sh;
      }
    },
  },
};

/**
 * Plays clips for one kiwi with a short crossfade between them. `pose(dt)` advances the time
 * and returns the blended pose (the same object every call).
 */
export class ClipPlayer {
  clip: ClipId = 'idle';
  time = 0;
  private prev: ClipId | null = null;
  private prevTime = 0;
  private fade = 1;
  private readonly a = restPose();
  private readonly b = restPose();

  constructor(
    offset = 0,
    private readonly fadeS = 0.22,
  ) {
    this.time = offset;
  }

  /** Switches clip (a no-op if it already plays); one-shot clips restart. */
  play(clip: ClipId, at = 0): void {
    if (clip === this.clip) return;
    this.prev = this.clip;
    this.prevTime = this.time;
    this.clip = clip;
    this.time = CLIPS[clip].once ? 0 : at;
    this.fade = 0;
  }

  /** True once a one-shot clip has played to its end. */
  get done(): boolean {
    const once = CLIPS[this.clip].once;
    return once !== undefined && this.time >= once;
  }

  pose(dt: number, rate = 1): Pose {
    this.time += dt * rate;
    this.prevTime += dt;
    this.fade = Math.min(1, this.fade + dt / this.fadeS);
    sample(this.clip, this.time, this.b);
    if (this.prev && this.fade < 1) {
      sample(this.prev, this.prevTime, this.a);
      return blendPoses(this.a, this.a, this.b, smooth(this.fade));
    }
    this.prev = null;
    return this.b;
  }
}

/** Writes clip `id` at time `t` into `out` (from the rest pose). */
export function sample(id: ClipId, t: number, out: Pose): Pose {
  const clip = CLIPS[id];
  restPose(out);
  out.prop = clip.prop ?? null;
  clip.apply(clip.once ? Math.min(t, clip.once) : t, out);
  return out;
}
