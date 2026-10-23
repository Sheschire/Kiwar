import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import { colored, mat, merged } from './geometry';
import { Part } from './part';

/**
 * Chantier 34: the predators of the waves — ferrets on the ground, bats in the air — as
 * instanced parts posed by procedural clips, like the kiwis (`kiwiRig.ts`). Their look follows
 * the age (`age` 0–3: a scarf, then a helmet, then goggles and a shoulder plate; weapons and
 * armour come with chantier 38). Purely cosmetic.
 */

export type CreatureKind = 'ferret' | 'bat';

export const CREATURE_CLIPS = {
  ferret: ['run', 'bite', 'hit', 'hurt', 'fall'],
  bat: ['flap', 'dive', 'spit', 'hurt', 'fall'],
} as const;
export type FerretClip = (typeof CREATURE_CLIPS.ferret)[number];
export type BatClip = (typeof CREATURE_CLIPS.bat)[number];
export type CreatureClip = FerretClip | BatClip;

/** One-shot clips hold their last pose after this long. */
const ONCE: Partial<Record<CreatureClip, number>> = { fall: 0.8, hurt: 0.45 };

export interface CreaturePose {
  bob: number;
  pitch: number;
  roll: number;
  yaw: number;
  squash: number;
  headPitch: number;
  headYaw: number;
  /** Mouth open (0–1). */
  jaw: number;
  /** Tail swing (ferret), left-right. */
  tail: number;
  /** Ferret legs: front pair and back pair swings; `reach` lifts the front paws (a swipe). */
  legFront: number;
  legBack: number;
  reach: number;
  /** Bat wings: raise angle (+ up), and sweep back (folded for a dive). */
  wing: number;
  sweep: number;
  /** A gob of juice at the mouth (bats spitting), 0–1. */
  spit: number;
  /** White flash of a hit (0–1). */
  flash: number;
}

export function restCreaturePose(p: CreaturePose = {} as CreaturePose): CreaturePose {
  p.bob = 0;
  p.pitch = 0;
  p.roll = 0;
  p.yaw = 0;
  p.squash = 1;
  p.headPitch = 0;
  p.headYaw = 0;
  p.jaw = 0;
  p.tail = 0;
  p.legFront = 0;
  p.legBack = 0;
  p.reach = 0;
  p.wing = 0;
  p.sweep = 0;
  p.spit = 0;
  p.flash = 0;
  return p;
}

const s = Math.sin;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * (3 - 2 * u);
};
const frac = (x: number) => x - Math.floor(x);

/** Writes a clip at time `t` into `p` (from the rest pose). */
export function sampleCreature(
  kind: CreatureKind,
  clip: CreatureClip,
  t: number,
  p: CreaturePose,
): CreaturePose {
  restCreaturePose(p);
  const once = ONCE[clip];
  const u = once ? Math.min(t, once) : t;
  if (kind === 'ferret') ferretClip(clip as FerretClip, u, p);
  else batClip(clip as BatClip, u, p);
  return p;
}

function ferretClip(clip: FerretClip, t: number, p: CreaturePose): void {
  switch (clip) {
    case 'run': {
      // A bounding gallop: the back arches, front and back legs in turn.
      const ph = t * 14;
      p.bob = Math.abs(s(ph)) * 0.05;
      p.pitch = s(ph) * 0.12;
      p.legFront = s(ph) * 0.9;
      p.legBack = -s(ph) * 0.9;
      p.tail = s(ph * 0.5) * 0.3;
      p.headPitch = -s(ph) * 0.1;
      p.squash = 1 + s(ph) * 0.06;
      break;
    }
    case 'bite': {
      const u = frac(t * 1.5);
      const lunge = u < 0.35 ? smooth(u / 0.35) : 1 - smooth((u - 0.35) / 0.65);
      p.pitch = lunge * 0.25;
      p.bob = lunge * 0.02;
      p.headPitch = lunge * 0.35;
      p.jaw = u < 0.3 ? smooth(u / 0.3) : u < 0.4 ? 0 : 0.2;
      p.legFront = -lunge * 0.5;
      p.legBack = lunge * 0.4;
      p.tail = s(t * 9) * 0.25;
      break;
    }
    case 'hit': {
      // Rears up and swipes with the front paws.
      const u = frac(t * 1.2);
      const up = u < 0.4 ? smooth(u / 0.4) : 1 - smooth((u - 0.4) / 0.6);
      p.pitch = -up * 0.7;
      p.bob = up * 0.08;
      p.reach = up;
      p.legFront = s(t * 18) * up * 0.8;
      p.headPitch = up * 0.3;
      p.jaw = up * 0.5;
      p.tail = up * 0.4;
      break;
    }
    case 'hurt': {
      const k = 1 - smooth(t / 0.45);
      p.flash = k;
      p.squash = 1 - k * 0.15;
      p.pitch = -k * 0.3;
      p.headYaw = s(t * 40) * k * 0.4;
      p.jaw = k * 0.7;
      p.tail = k * 0.6;
      break;
    }
    case 'fall': {
      const k = smooth(t / 0.5);
      p.roll = k * 1.6;
      p.bob = s(clamp01(t / 0.5) * Math.PI) * 0.06;
      p.legFront = k * 0.6;
      p.legBack = -k * 0.4;
      p.headPitch = k * 0.4;
      p.jaw = k * 0.3;
      p.tail = k * 0.5;
      break;
    }
  }
}

function batClip(clip: BatClip, t: number, p: CreaturePose): void {
  switch (clip) {
    case 'flap': {
      const ph = t * 16;
      p.wing = s(ph) * 0.9;
      p.bob = -s(ph) * 0.03;
      p.pitch = 0.1;
      p.headPitch = s(t * 2) * 0.1;
      break;
    }
    case 'dive': {
      // Wings swept back, nose down, a twitch now and then.
      p.wing = 0.25 + s(t * 30) * 0.06;
      p.sweep = 0.9;
      p.pitch = 0.75;
      p.headPitch = -0.3;
      p.jaw = 0.4;
      p.roll = s(t * 3) * 0.15;
      break;
    }
    case 'spit': {
      const u = frac(t / 1.3);
      const charge = smooth(u / 0.6);
      const shot = u > 0.6 && u < 0.75;
      p.wing = s(t * 18) * 0.7;
      p.pitch = shot ? 0.35 : -charge * 0.2;
      p.headPitch = shot ? 0.5 : -charge * 0.4;
      p.jaw = shot ? 1 : charge * 0.3;
      p.spit = u < 0.6 ? charge : shot ? 1 - (u - 0.6) / 0.15 : 0;
      break;
    }
    case 'hurt': {
      const k = 1 - smooth(t / 0.45);
      p.flash = k;
      p.wing = -0.4 * k + s(t * 30) * 0.3;
      p.roll = s(t * 25) * k * 0.5;
      p.squash = 1 - k * 0.12;
      p.jaw = k * 0.6;
      break;
    }
    case 'fall': {
      const k = smooth(t / 0.6);
      p.wing = 0.8 - k * 1.3;
      p.sweep = k * 0.3;
      p.roll = t * 6;
      p.pitch = k * 1.1;
      p.jaw = k * 0.5;
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Geometry (facing +Z, feet on y = 0 for the ferret, centred for the bat).

const FUR = '#8a6444';
const FUR_DARK = '#4a3423';
const CREAM = '#e6d2ac';
const BAT = '#43354a';
const BAT_SKIN = '#6b5172';

const F_NECK = new Vector3(0, 0.21, 0.24);
const F_TAIL = new Vector3(0, 0.2, -0.27);
const F_JAW = new Vector3(0, 0.0, 0.1);
const F_HIP = { x: 0.075, y: 0.13, front: 0.15, back: -0.16 };
const B_NECK = new Vector3(0, 0.03, 0.1);
const B_SHOULDER = 0.06;

function ferretBody(): BufferGeometry {
  return merged([
    colored(new SphereGeometry(1, 12, 8), FUR, mat(0, 0.18, 0, 0.11, 0.1, 0.3)),
    colored(new SphereGeometry(1, 10, 6), CREAM, mat(0, 0.15, 0.04, 0.085, 0.07, 0.24)),
    // A darker saddle on the back.
    colored(new SphereGeometry(1, 10, 6), FUR_DARK, mat(0, 0.235, -0.06, 0.08, 0.045, 0.17)),
  ]);
}

/** Head, mask, ears, eyes and nose, around the neck. */
function ferretHead(): BufferGeometry {
  const parts = [
    colored(new SphereGeometry(1, 10, 8), FUR, mat(0, 0.03, 0.06, 0.09, 0.08, 0.11)),
    colored(new SphereGeometry(1, 10, 8), CREAM, mat(0, 0.0, 0.13, 0.06, 0.045, 0.07)),
    // The bandit mask.
    colored(new SphereGeometry(1, 10, 6), FUR_DARK, mat(0, 0.045, 0.1, 0.085, 0.03, 0.07)),
    colored(new SphereGeometry(1, 6, 5), '#1a1210', mat(0, 0.01, 0.2, 0.022, 0.018, 0.018)),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      colored(
        new SphereGeometry(1, 6, 5),
        '#ffcf5a',
        mat(side * 0.04, 0.05, 0.155, 0.017, 0.017, 0.012),
      ),
      colored(
        new SphereGeometry(1, 5, 4),
        '#120c0a',
        mat(side * 0.041, 0.05, 0.166, 0.009, 0.011, 0.006),
      ),
      colored(
        new ConeGeometry(1, 1, 5),
        FUR_DARK,
        mat(side * 0.06, 0.1, 0.02, 0.03, 0.05, 0.02, -0.2, 0, -side * 0.4),
      ),
      colored(
        new ConeGeometry(1, 1, 5),
        '#e9a3a0',
        mat(side * 0.059, 0.098, 0.027, 0.017, 0.035, 0.008, -0.2, 0, -side * 0.4),
      ),
    );
  }
  return merged(parts);
}

/** Lower jaw with two little fangs, hinged under the head. */
function ferretJaw(): BufferGeometry {
  return merged([
    colored(new SphereGeometry(1, 8, 5), CREAM, mat(0, -0.025, 0.06, 0.045, 0.018, 0.07)),
    colored(new ConeGeometry(1, 1, 4), '#fbf6ea', mat(0.02, -0.005, 0.11, 0.008, 0.025, 0.008)),
    colored(new ConeGeometry(1, 1, 4), '#fbf6ea', mat(-0.02, -0.005, 0.11, 0.008, 0.025, 0.008)),
  ]);
}

function ferretTail(): BufferGeometry {
  return merged([
    colored(
      new CylinderGeometry(0.035, 0.05, 0.22, 7),
      FUR,
      mat(0, 0, -0.11, 1, 1, 1, -Math.PI / 2 - 0.3),
    ),
    colored(
      new ConeGeometry(0.035, 0.12, 7),
      FUR_DARK,
      mat(0, -0.035, -0.26, 1, 1, 1, -Math.PI / 2 - 0.3),
    ),
  ]);
}

function ferretLeg(): BufferGeometry {
  return merged([
    colored(new CylinderGeometry(0.022, 0.018, 0.13, 6), FUR_DARK, mat(0, -0.065, 0)),
    colored(new SphereGeometry(1, 6, 4), FUR_DARK, mat(0, -0.13, 0.015, 0.025, 0.014, 0.035)),
  ]);
}

function batBody(): BufferGeometry {
  return merged([
    colored(new SphereGeometry(1, 10, 8), BAT, mat(0, 0, 0, 0.08, 0.09, 0.11)),
    colored(new SphereGeometry(1, 8, 6), BAT_SKIN, mat(0, -0.03, 0.03, 0.06, 0.06, 0.08)),
    // Little clawed feet tucked under.
    colored(
      new ConeGeometry(1, 1, 4),
      '#2a2030',
      mat(0.03, -0.09, -0.04, 0.015, 0.04, 0.015, Math.PI),
    ),
    colored(
      new ConeGeometry(1, 1, 4),
      '#2a2030',
      mat(-0.03, -0.09, -0.04, 0.015, 0.04, 0.015, Math.PI),
    ),
  ]);
}

function batHead(): BufferGeometry {
  const parts = [
    colored(new SphereGeometry(1, 10, 8), BAT, mat(0, 0.02, 0.04, 0.065, 0.06, 0.06)),
    colored(new SphereGeometry(1, 6, 5), BAT_SKIN, mat(0, 0.0, 0.09, 0.03, 0.025, 0.025)),
  ];
  for (const side of [-1, 1]) {
    parts.push(
      colored(
        new ConeGeometry(1, 1, 4),
        BAT,
        mat(side * 0.04, 0.09, 0.02, 0.028, 0.09, 0.016, 0, 0, -side * 0.35),
      ),
      colored(
        new ConeGeometry(1, 1, 4),
        '#c77fa4',
        mat(side * 0.04, 0.085, 0.027, 0.016, 0.065, 0.006, 0, 0, -side * 0.35),
      ),
      colored(
        new SphereGeometry(1, 6, 5),
        '#ffd84a',
        mat(side * 0.028, 0.035, 0.088, 0.016, 0.016, 0.01),
      ),
      colored(
        new SphereGeometry(1, 5, 4),
        '#120c0a',
        mat(side * 0.028, 0.035, 0.097, 0.007, 0.01, 0.004),
      ),
      colored(
        new ConeGeometry(1, 1, 4),
        '#fbf6ea',
        mat(side * 0.014, -0.018, 0.095, 0.006, 0.02, 0.006, Math.PI),
      ),
    );
  }
  return merged(parts);
}

/** A membrane wing spreading along +X from the shoulder: a fan with three fingers. */
function batWing(): BufferGeometry {
  // Outline points (x, z) of the membrane, from the shoulder round to the body.
  const outline: [number, number][] = [
    [0, 0.05],
    [0.14, 0.09],
    [0.3, 0.07],
    [0.36, 0.02],
    [0.3, -0.03],
    [0.27, -0.1],
    [0.18, -0.07],
    [0.14, -0.14],
    [0.06, -0.1],
    [0, -0.06],
  ];
  const pos: number[] = [];
  const centre: [number, number] = [0.04, 0];
  for (let i = 0; i < outline.length - 1; i++) {
    const a = outline[i]!;
    const b = outline[i + 1]!;
    // Both faces.
    pos.push(centre[0], 0, centre[1], a[0], 0, a[1], b[0], 0, b[1]);
    pos.push(centre[0], 0, centre[1], b[0], 0, b[1], a[0], 0, a[1]);
  }
  const membrane = new BufferGeometry();
  membrane.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const n = pos.length / 3;
  const c = new Color(BAT_SKIN);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  membrane.setAttribute('color', new Float32BufferAttribute(col, 3));
  membrane.computeVertexNormals();
  const bones = [
    colored(
      new CylinderGeometry(0.008, 0.006, 0.36, 4),
      BAT,
      mat(0.18, 0.004, 0.06, 1, 1, 1, 0, 0, Math.PI / 2 + 0.05),
    ),
    colored(
      new CylinderGeometry(0.006, 0.004, 0.14, 4),
      BAT,
      mat(0.3, 0.004, 0.0, 1, 1, 1, Math.PI / 2, 0, 0.6),
    ),
    colored(
      new CylinderGeometry(0.006, 0.004, 0.16, 4),
      BAT,
      mat(0.22, 0.004, -0.05, 1, 1, 1, Math.PI / 2, 0, 0.9),
    ),
    colored(new ConeGeometry(1, 1, 4), '#2a2030', mat(0.14, 0.01, 0.1, 0.008, 0.03, 0.008)),
  ];
  return merged([membrane, ...bones]);
}

/** Gear by age: [neck/body piece, head piece], authored in the body / head frames. */
function gear(kind: CreatureKind, age: number): [BufferGeometry | null, BufferGeometry | null] {
  const ferret = kind === 'ferret';
  const neck = ferret ? F_NECK : B_NECK;
  const scarf = colored(
    new TorusGeometry(1, 0.35, 5, 12),
    '#c0473c',
    ferret
      ? mat(neck.x, neck.y - 0.03, neck.z - 0.02, 0.075, 0.075, 0.06, 0.3)
      : mat(0, 0.05, 0.07, 0.06, 0.06, 0.05, 0.4),
  );
  const helmet = colored(
    new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    '#8d8f99',
    ferret ? mat(0, 0.06, 0.05, 0.095, 0.06, 0.1) : mat(0, 0.05, 0.04, 0.07, 0.05, 0.065),
  );
  const spike = colored(
    new ConeGeometry(1, 1, 4),
    '#5d5f69',
    ferret ? mat(0, 0.13, 0.05, 0.015, 0.04, 0.015) : mat(0, 0.11, 0.04, 0.012, 0.035, 0.012),
  );
  const goggles = [-1, 1].map((side) =>
    colored(
      new TorusGeometry(1, 0.3, 5, 10),
      '#b07a3a',
      ferret
        ? mat(side * 0.04, 0.05, 0.16, 0.022, 0.022, 0.022)
        : mat(side * 0.028, 0.035, 0.092, 0.02, 0.02, 0.02),
    ),
  );
  const plate = colored(
    new SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    '#6d6f79',
    ferret ? mat(0, 0.22, 0.12, 0.1, 0.06, 0.12) : mat(0, 0.06, 0, 0.07, 0.04, 0.08),
  );
  if (age <= 0) return [null, null];
  if (age === 1) return [merged([scarf]), null];
  if (age === 2) return [merged([scarf]), merged([helmet, spike])];
  return [merged([scarf, plate]), merged([helmet, spike, ...goggles])];
}

export interface CreatureDraw {
  kind: CreatureKind;
  x: number;
  y: number;
  z: number;
  heading: number;
  scale: number;
  pose: CreaturePose;
  /** 0–3: the look of the age. */
  age: number;
  /** Fading out (0–1, 1 = solid): shrinks a little. */
  fade?: number;
}

const AGES = 4;

export class CreatureRig {
  readonly group = new Group();
  private readonly parts: Part[] = [];
  private readonly materials: Material[] = [];
  private readonly f: Record<'body' | 'head' | 'jaw' | 'tail' | 'leg', Part>;
  private readonly b: Record<'body' | 'head' | 'wing', Part>;
  private readonly gearBody = new Map<string, Part>();
  private readonly gearHead = new Map<string, Part>();
  private readonly gobs: Part;
  private readonly shadows: Part;
  private readonly root = new Matrix4();
  private readonly bodyM = new Matrix4();
  private readonly headM = new Matrix4();
  private readonly local = new Matrix4();
  private readonly out = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly v = new Vector3();
  private readonly sc = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly white = new Color(1, 1, 1);
  private readonly flash = new Color();

  constructor(max: number) {
    const skin = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      flatShading: true,
    });
    const membrane = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      flatShading: true,
      side: 2,
    });
    const gob = new MeshBasicMaterial({
      color: '#c9ff5a',
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const shadow = new MeshBasicMaterial({
      color: '#2b1a24',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    this.materials.push(skin, membrane, gob, shadow);
    const add = (geometry: BufferGeometry, material: Material, n = max, colors = true) => {
      const p = new Part(geometry, material, n, colors);
      this.parts.push(p);
      this.group.add(p.mesh);
      return p;
    };
    this.f = {
      body: add(ferretBody(), skin),
      head: add(ferretHead(), skin),
      jaw: add(ferretJaw(), skin),
      tail: add(ferretTail(), skin),
      leg: add(ferretLeg(), skin, max * 4),
    };
    this.b = {
      body: add(batBody(), skin),
      head: add(batHead(), skin),
      wing: add(batWing(), membrane, max * 2),
    };
    for (const kind of ['ferret', 'bat'] as const)
      for (let age = 1; age < AGES; age++) {
        const [body, head] = gear(kind, age);
        if (body) this.gearBody.set(`${kind}${age}`, add(body, skin, max, false));
        if (head) this.gearHead.set(`${kind}${age}`, add(head, skin, max, false));
      }
    this.gobs = add(new IcosahedronGeometry(1, 1), gob, max, false);
    this.shadows = add(new CircleGeometry(1, 14).rotateX(-Math.PI / 2), shadow, max, false);
    this.shadows.mesh.renderOrder = 1;
  }

  draw(c: CreatureDraw): void {
    const p = c.pose;
    const size = c.scale * (0.85 + 0.15 * (c.fade ?? 1));
    // A hit flashes white (instance colour pushed past 1 by the flash).
    const tint = this.flash.copy(this.white).multiplyScalar(1 + p.flash * 2.5);
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), c.heading);
    this.root.compose(this.v.set(c.x, c.y, c.z), this.q, this.sc.set(size, size, size));
    this.e.set(p.pitch, p.yaw, p.roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(this.v.set(0, p.bob, 0), this.q, this.sc.set(1, p.squash, 1));
    this.bodyM.multiplyMatrices(this.root, this.local);
    const key = `${c.kind}${Math.max(0, Math.min(AGES - 1, c.age))}`;
    if (c.kind === 'ferret') this.drawFerret(p, tint);
    else this.drawBat(p, tint);
    this.gearBody.get(key)?.push(this.bodyM);
    this.gearHead.get(key)?.push(this.headM);
    // Shadow on the ground (ferrets; bats fly too high for one).
    if (c.kind === 'ferret') {
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), c.heading);
      this.out.compose(
        this.v.set(c.x, c.y + 0.01, c.z),
        this.q,
        this.sc.set(size * 0.14, 1, size * 0.34),
      );
      this.shadows.push(this.out);
    }
  }

  private drawFerret(p: CreaturePose, tint: Color): void {
    // Head and jaw.
    this.e.set(p.headPitch, p.headYaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(F_NECK, this.q, this.one);
    this.headM.multiplyMatrices(this.bodyM, this.local);
    this.f.head.push(this.headM, tint);
    this.local.compose(F_JAW, this.q.setFromAxisAngle(this.v.set(1, 0, 0), p.jaw * 0.6), this.one);
    this.out.multiplyMatrices(this.headM, this.local);
    this.f.jaw.push(this.out, tint);
    // Body, tail.
    this.f.body.push(this.bodyM, tint);
    this.e.set(0.1, p.tail, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(F_TAIL, this.q, this.one);
    this.out.multiplyMatrices(this.bodyM, this.local);
    this.f.tail.push(this.out, tint);
    // Legs: front pair reach forward on a swipe.
    for (const front of [true, false])
      for (const side of [-1, 1]) {
        const swing = (front ? p.legFront : p.legBack) * (side === 1 ? 1 : 0.8);
        const reach = front ? p.reach * 1.2 : 0;
        this.q.setFromAxisAngle(this.v.set(1, 0, 0), -swing - reach);
        this.local.compose(
          this.v.set(side * F_HIP.x, F_HIP.y, front ? F_HIP.front : F_HIP.back),
          this.q,
          this.one,
        );
        this.out.multiplyMatrices(this.bodyM, this.local);
        this.f.leg.push(this.out, tint);
      }
  }

  private drawBat(p: CreaturePose, tint: Color): void {
    this.b.body.push(this.bodyM, tint);
    this.e.set(p.headPitch, p.headYaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.local.compose(B_NECK, this.q, this.one);
    this.headM.multiplyMatrices(this.bodyM, this.local);
    this.b.head.push(this.headM, tint);
    for (const side of [1, -1]) {
      // Raise about the body's length, sweep back about the vertical; the left wing mirrored.
      this.e.set(0, side * p.sweep, side * p.wing, 'YXZ');
      this.q.setFromEuler(this.e);
      this.local.compose(this.v.set(side * B_SHOULDER, 0.03, 0), this.q, this.sc.set(side, 1, 1));
      this.out.multiplyMatrices(this.bodyM, this.local);
      this.b.wing.push(this.out, tint);
    }
    if (p.spit > 0.02) {
      const r = 0.02 + p.spit * 0.035;
      this.local.compose(this.v.set(0, -0.01, 0.13), this.q.identity(), this.sc.set(r, r, r));
      this.out.multiplyMatrices(this.headM, this.local);
      this.gobs.push(this.out);
    }
  }

  end(): void {
    for (const p of this.parts) p.end();
  }

  dispose(): void {
    for (const p of this.parts) p.mesh.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}
