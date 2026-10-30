/**
 * Chantier 34: the pose of a kiwi for one frame, relative to its rest pose. Every number is
 * an angle in radians or a length in kiwi units (a kiwi is about 0.45 tall). Poses are plain
 * objects, filled in place by the clips (`clips.ts`) and blended between two clips, so the
 * rig never allocates per frame.
 */

/** Accessories a kiwi can hold (`props.ts`). */
export const PROP_IDS = [
  'book',
  'quill',
  'ledger',
  'hammer',
  'sword',
  'staff',
  'sling',
  'mace',
  'basket',
  'dagger',
  'lute',
  // Chantier 49: the miners' pick.
  'pick',
] as const;
export type PropId = (typeof PROP_IDS)[number];

export interface Pose {
  /** Body lift above the legs (hops). */
  bob: number;
  /** Body squash along its height (1 = none; < 1 squashed, > 1 stretched). */
  squash: number;
  /** Body bend forward (+) or back (−). */
  pitch: number;
  /** Body roll to its left (+) or right (−). */
  roll: number;
  /** Body turn added to the heading. */
  yaw: number;
  /** Sitting: 0 standing, 1 legs folded under the body. */
  sit: number;
  headPitch: number;
  headYaw: number;
  headRoll: number;
  /** Wings raised away from the body (0 folded). */
  wingL: number;
  wingR: number;
  /** Wings swung forward and up (+) or back (−). */
  wingLF: number;
  wingRF: number;
  /** Leg swings (walk). */
  legL: number;
  legR: number;
  /** Held accessory, or none. */
  prop: PropId | null;
  /** Extra turn of the accessory in the wing (a wrist). */
  propSwing: number;
  /** Magic glow at the accessory's tip (0–1). */
  glow: number;
}

export function restPose(out: Pose = {} as Pose): Pose {
  out.bob = 0;
  out.squash = 1;
  out.pitch = 0;
  out.roll = 0;
  out.yaw = 0;
  out.sit = 0;
  out.headPitch = 0;
  out.headYaw = 0;
  out.headRoll = 0;
  out.wingL = 0;
  out.wingR = 0;
  out.wingLF = 0;
  out.wingRF = 0;
  out.legL = 0;
  out.legR = 0;
  out.prop = null;
  out.propSwing = 0;
  out.glow = 0;
  return out;
}

const NUMBERS = [
  'bob',
  'squash',
  'pitch',
  'roll',
  'yaw',
  'sit',
  'headPitch',
  'headYaw',
  'headRoll',
  'wingL',
  'wingR',
  'wingLF',
  'wingRF',
  'legL',
  'legR',
  'propSwing',
  'glow',
] as const satisfies readonly (keyof Pose)[];

/** out = a × (1 − w) + b × w; the accessory switches half way. `out` may be `a` or `b`. */
export function blendPoses(out: Pose, a: Pose, b: Pose, w: number): Pose {
  const prop = w < 0.5 ? a.prop : b.prop;
  for (const k of NUMBERS) out[k] = a[k] + (b[k] - a[k]) * w;
  out.prop = prop;
  return out;
}
