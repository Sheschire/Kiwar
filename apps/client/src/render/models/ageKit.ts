import { Color, Matrix4, Quaternion, Vector3 } from 'three';
import {
  box,
  C,
  cone,
  cyl,
  emitter,
  flag,
  ico,
  m,
  rig,
  roofPrism,
  sphere,
  type Parts,
} from './kit';

/**
 * Chantier 33: the kit of pieces by age. Every building is a recipe of (age, tier): the age
 * of its level gives the materials and the base silhouette, the tier within the age adds an
 * annex (2) and a crown (3). The pieces below draw a wall, a roof, a door… in the material of
 * the age; at the Eden age each one draws exactly the primitive the Eden models always used.
 *
 * | Age      | Walls                         | Roofs                     |
 * | -------- | ----------------------------- | ------------------------- |
 * | Eden     | bark, cream daub              | leaves, the family colour |
 * | Stone    | dry stones, a darker footing  | thatch, a family ridge    |
 * | Iron     | plaster, beams, iron bands    | tiles in rows             |
 * | Industry | brick, mortar, glass windows  | sheet metal, ribs, glass  |
 */

/** What a model is built for. */
export interface Look {
  /** Age of the building's level (0 Eden … 3 Industry): materials and silhouette. */
  age: number;
  /** Tier within the age, 1–3: 2 adds an annex, 3 a crown. */
  tier: number;
  /** Full level (1–12). */
  level: number;
  /** Age of the colony (the ship generation of the launch pad). */
  colonyAge: number;
  /** The ship stands on its pad. */
  docked: boolean;
}

export const EDEN = (tier: number): Look => ({
  age: 0,
  tier,
  level: tier,
  colonyAge: 0,
  docked: true,
});

/** Materials of the later ages (never recoloured by the age dressing). */
export const A = {
  thatch: '#d4ab60',
  thatchDark: '#a37b3b',
  drystone: '#b9b1a1',
  drystoneDark: '#8b8476',
  drystoneLight: '#d8d1c1',
  plaster: '#f2e6cb',
  beam: '#5a4030',
  brick: '#a8553c',
  brickDark: '#7c3d2b',
  mortar: '#dccbb0',
  brass: '#d6aa45',
  glass: '#a8dce9',
  steel: '#69747c',
} as const;

/** The colour of each age (level badges, banners). */
export const AGE_TINTS = ['#7a5233', '#c99a1e', '#6f8394', '#b8673a'] as const;

const mixes = new Map<string, string>();
/** `a` moved `t` of the way to `b` (cached hex). */
export function mix(a: string, b: string, t: number): string {
  const key = `${a}${b}${t}`;
  let out = mixes.get(key);
  if (!out) {
    out = '#' + new Color(a).lerp(new Color(b), t).getHexString();
    mixes.set(key, out);
  }
  return out;
}

/** A darker shade of a colour (tile rows, ribs). */
export const shade = (hex: string, k = 0.72) => mix(hex, '#1a1410', 1 - k);

/** Deterministic jitter in [0, 1). */
export function jit(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Runs `draw` and moves every part it added by `base`. Rig pivots are not moved: a base that
 * moves rig parts (`rigs`) must keep their pivots in place (a turn around the pivot's axis).
 */
export function under(p: Parts, base: Matrix4, draw: () => void, rigs = false): void {
  const n = p.length;
  draw();
  for (let i = n; i < p.length; i++)
    if (rigs || !p[i]![3]) p[i]![2] = p[i]![2].clone().premultiply(base);
}

const UP = new Vector3(0, 1, 0);
/** A straight bar (box, or a cylinder with `round`) from `a` to `b`. */
export function beam(
  p: Parts,
  color: string,
  a: [number, number, number],
  b: [number, number, number],
  thick: number,
  round = false,
  rigName?: string,
): void {
  const from = new Vector3(...a);
  const dir = new Vector3(...b).sub(from);
  const length = dir.length();
  const mid = from.addScaledVector(dir, 0.5);
  const q = new Quaternion().setFromUnitVectors(UP, dir.normalize());
  p.push([
    round ? cyl(5) : box(),
    color,
    new Matrix4().compose(mid, q, new Vector3(thick, length, thick)),
    rigName,
  ]);
}

/** A box wall centred at (x, y, z), `w` wide (x), `h` high, `d` deep (z), turned by `ry`. */
export function wall(
  p: Parts,
  age: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  eden: string,
  ry = 0,
): void {
  if (age <= 0) {
    p.push([box(), eden, m(x, y, z, w, h, d, 0, ry, 0)]);
    return;
  }
  under(p, m(x, y, z, 1, 1, 1, 0, ry, 0), () => {
    if (age === 1) {
      p.push([box(), A.drystone, m(0, 0, 0, w, h, d)]);
      p.push([box(), A.drystoneDark, m(0, -h * 0.4, 0, w + 0.03, h * 0.2, d + 0.03)]);
      // Loose stones standing out of the faces, and corner stones.
      for (let i = 0; i < 5; i++) {
        const sx = (jit(i, w) - 0.5) * (w - 0.12);
        const sy = -h * 0.2 + jit(i, h) * h * 0.6;
        const tone = i % 2 ? A.drystoneLight : A.drystoneDark;
        p.push([box(), tone, m(sx, sy, d / 2 + 0.006, 0.07 + 0.04 * jit(i, 3), 0.045, 0.014)]);
      }
      for (const side of [-1, 1])
        for (let i = 0; i < 2; i++) {
          const sz = (jit(i + side, d) - 0.5) * (d - 0.12);
          const sy = -h * 0.15 + jit(i, side + h) * h * 0.5;
          p.push([box(), A.drystoneLight, m(side * (w / 2 + 0.006), sy, sz, 0.014, 0.045, 0.08)]);
        }
      for (const cx of [-1, 1])
        for (const k of [0.35, 0.75])
          p.push([
            box(),
            A.drystoneLight,
            m(cx * (w / 2 - 0.03), -h / 2 + h * k, d / 2 - 0.03, 0.07, 0.06, 0.07),
          ]);
    } else if (age === 2) {
      p.push([box(), A.plaster, m(0, 0, 0, w, h, d)]);
      // Half-timbering: corner posts, rails, studs on the front, braces on the sides.
      for (const cx of [-1, 1])
        for (const cz of [-1, 1])
          p.push([box(), A.beam, m((cx * w) / 2, 0, (cz * d) / 2, 0.035, h + 0.01, 0.035)]);
      for (const cy of [-1, 1]) {
        const y = cy * (h / 2 - 0.015);
        p.push([box(), A.beam, m(0, y, d / 2 + 0.005, w + 0.02, 0.03, 0.02)]);
        p.push([box(), A.beam, m(0, y, -d / 2 - 0.005, w + 0.02, 0.03, 0.02)]);
      }
      for (const k of [-0.3, 0.3])
        p.push([box(), A.beam, m(w * k, 0, d / 2 + 0.006, 0.025, h, 0.015)]);
      const brace = Math.atan2(d, h);
      for (const side of [-1, 1])
        p.push([
          box(),
          A.beam,
          m((side * w) / 2 + side * 0.006, 0, 0, 0.015, Math.hypot(h, d) * 0.9, 0.025, brace),
        ]);
      for (const cx of [-1, 1])
        p.push([box(), C.ironDark, m((cx * w) / 2, h / 2 - 0.04, d / 2 + 0.02, 0.05, 0.05, 0.01)]);
    } else {
      p.push([box(), A.brick, m(0, 0, 0, w, h, d)]);
      for (const k of [0.3, 0.55, 0.8])
        p.push([box(), A.mortar, m(0, -h / 2 + h * k, 0, w + 0.008, 0.012, d + 0.008)]);
      p.push([box(), A.brickDark, m(0, h / 2 - 0.015, 0, w + 0.03, 0.04, d + 0.03)]);
      p.push([box(), A.steel, m(0, -h / 2 + 0.02, 0, w + 0.025, 0.04, d + 0.025)]);
      if (w > 0.3)
        for (const k of [-0.32, 0.32]) {
          p.push([box(), A.steel, m(w * k, h * 0.1, d / 2 + 0.004, 0.1, 0.12, 0.008)]);
          p.push([box(), A.glass, m(w * k, h * 0.1, d / 2 + 0.008, 0.08, 0.1, 0.008)]);
        }
    }
  });
}

/** A round wall (cylinder) centred at (x, y, z). */
export function round(
  p: Parts,
  age: number,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  eden: string,
  seg = 10,
): void {
  if (age <= 0) {
    p.push([cyl(seg), eden, m(x, y, z, r, h, r)]);
    return;
  }
  const at = (k: number) => y - h / 2 + h * k;
  if (age === 1) {
    p.push([cyl(seg), A.drystone, m(x, y, z, r, h, r)]);
    p.push([cyl(seg), A.drystoneDark, m(x, at(0.1), z, r + 0.02, h * 0.2, r + 0.02)]);
    p.push([cyl(seg), A.drystoneLight, m(x, at(0.55), z, r + 0.008, 0.025, r + 0.008)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + jit(i, r) * 0.6;
      const sy = at(0.3 + jit(i, h) * 0.55);
      p.push([
        box(),
        i % 2 ? A.drystoneLight : A.drystoneDark,
        m(x + Math.sin(a) * r, sy, z + Math.cos(a) * r, 0.07, 0.045, 0.03, 0, a, 0),
      ]);
    }
  } else if (age === 2) {
    p.push([cyl(seg), A.plaster, m(x, y, z, r, h, r)]);
    for (const k of [0.12, 0.88])
      p.push([cyl(seg), C.ironDark, m(x, at(k), z, r + 0.012, 0.03, r + 0.012)]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      p.push([box(), A.beam, m(x + Math.sin(a) * r, y, z + Math.cos(a) * r, 0.03, h, 0.03, 0, a)]);
    }
  } else {
    p.push([cyl(seg), A.brick, m(x, y, z, r, h, r)]);
    for (const k of [0.3, 0.55, 0.8])
      p.push([cyl(seg), A.mortar, m(x, at(k), z, r + 0.006, 0.012, r + 0.006)]);
    p.push([cyl(seg), A.brass, m(x, at(0.97), z, r + 0.015, 0.035, r + 0.015)]);
    p.push([cyl(seg), A.steel, m(x, at(0.03), z, r + 0.015, 0.05, r + 0.015)]);
  }
}

/**
 * A lean-to roof: the prism `m(x, y, z, a, len, d, 0, 0, π/2)` every model uses (ridge along x
 * at the back, at y + 0.87a; the front slope comes down to z + d at y).
 */
export function gable(
  p: Parts,
  age: number,
  x: number,
  y: number,
  z: number,
  a: number,
  len: number,
  d: number,
  family: string,
): void {
  if (age <= 0) {
    p.push([roofPrism(), family, m(x, y, z, a, len, d, 0, 0, Math.PI / 2)]);
    return;
  }
  // The front slope, from the eave up to the ridge, in the (y, z) plane.
  const k = age === 1 ? 1.12 : 1.04;
  const A0 = a * k;
  const D0 = d * k;
  const eave: [number, number] = [y, z + D0];
  const ridge: [number, number] = [y + 0.866 * A0, z - 0.5 * D0];
  const dy = ridge[0] - eave[0];
  const dz = ridge[1] - eave[1];
  const slope = Math.hypot(dy, dz);
  const phi = Math.atan2(-dy, dz);
  // Outward normal of the slope.
  const ny = -Math.cos(phi);
  const nz = -Math.sin(phi);
  const along = (t: number, out: number): [number, number] => [
    eave[0] + dy * t + ny * out,
    eave[1] + dz * t + nz * out,
  ];
  if (age === 1) {
    p.push([
      roofPrism(),
      mix(A.thatch, family, 0.55),
      m(x, y, z, A0, len * 1.06, D0, 0, 0, Math.PI / 2),
    ]);
    p.push([box(), family, m(x, ridge[0], ridge[1], len * 1.1, 0.06, 0.09)]);
    const [fy, fz] = along(0.02, 0.01);
    p.push([box(), A.thatchDark, m(x, fy, fz, len * 1.07, 0.035, 0.06, phi)]);
    const [by, bz] = along(0.55, 0.008);
    p.push([box(), A.thatchDark, m(x, by, bz, len * 1.06, 0.012, 0.03, phi)]);
  } else if (age === 2) {
    p.push([roofPrism(), family, m(x, y, z, A0, len * 1.04, D0, 0, 0, Math.PI / 2)]);
    for (const t of [0.3, 0.6]) {
      const [ty, tz] = along(t, 0.008);
      p.push([box(), shade(family), m(x, ty, tz, len * 1.05, 0.016, 0.035, phi)]);
    }
    p.push([box(), shade(family, 0.6), m(x, ridge[0] + 0.01, ridge[1], len * 1.08, 0.04, 0.05)]);
    for (const side of [-1, 1])
      p.push([
        cone(4),
        C.ironDark,
        m(x + side * len * 0.54, ridge[0] + 0.07, ridge[1], 0.02, 0.12, 0.02),
      ]);
  } else {
    p.push([roofPrism(), family, m(x, y, z, A0, len * 1.04, D0, 0, 0, Math.PI / 2)]);
    for (let i = 0; i < 5; i++) {
      const rx = x + (i / 4 - 0.5) * len * 0.95;
      const [ry, rz] = along(0.5, 0.008);
      p.push([box(), A.steel, m(rx, ry, rz, 0.018, 0.014, slope * 0.98, phi)]);
    }
    const [gy, gz] = along(0.55, 0.012);
    p.push([box(), A.glass, m(x + len * 0.18, gy, gz, len * 0.2, 0.012, slope * 0.35, phi)]);
    p.push([box(), A.steel, m(x, ridge[0] + 0.01, ridge[1], len * 1.06, 0.035, 0.045)]);
  }
}

/** A cone roof centred at (x, y, z) (radius `r`, height `h`). */
export function cap(
  p: Parts,
  age: number,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  family: string,
  seg = 10,
  ry = 0,
  rz = r,
): void {
  if (age <= 0) {
    p.push([cone(seg), family, m(x, y, z, r, h, rz, 0, ry, 0)]);
    return;
  }
  const base = y - h / 2;
  const top = y + h / 2;
  if (age === 1) {
    p.push([
      cone(seg),
      mix(A.thatch, family, 0.55),
      m(x, y, z, r * 1.12, h * 1.05, rz * 1.12, 0, ry),
    ]);
    p.push([
      cone(seg),
      A.thatch,
      m(x, y + h * 0.3, z, r * 0.62, h * 0.55, rz * 0.62, 0, seg > 4 ? ry + 0.3 : ry),
    ]);
    p.push([cyl(seg), A.thatchDark, m(x, base + 0.015, z, r * 1.1, 0.035, r * 1.1)]);
    p.push([sphere(6, 4), family, m(x, top + 0.02, z, 0.05, 0.05, 0.05)]);
  } else if (age === 2) {
    p.push([cone(seg), family, m(x, y, z, r * 1.04, h, rz * 1.04, 0, ry)]);
    for (const f of [0.3, 0.62])
      p.push([
        cyl(seg),
        shade(family),
        m(x, base + h * f, z, r * (1 - f) + 0.012, 0.022, r * (1 - f) + 0.012),
      ]);
    p.push([cone(5), C.ironDark, m(x, top + 0.07, z, 0.022, 0.16, 0.022)]);
  } else {
    p.push([cone(seg), family, m(x, y, z, r * 1.04, h, rz * 1.04, 0, ry)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      beam(
        p,
        A.steel,
        [x + Math.sin(a) * r * 1.05, base, z + Math.cos(a) * r * 1.05],
        [x, top, z],
        0.016,
      );
    }
    p.push([cyl(seg), A.brass, m(x, base + 0.015, z, r * 1.06, 0.03, r * 1.06)]);
    p.push([sphere(6, 4), A.brass, m(x, top + 0.03, z, 0.04, 0.04, 0.04)]);
  }
}

/**
 * A door facing +z (centre x, y, z; turned by `ry`). Its leaf is always `C.door` (the night
 * lights find the doors by that colour); later ages frame it.
 */
export function door(
  p: Parts,
  age: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  t = 0.02,
  ry = 0,
): void {
  p.push([box(), C.door, m(x, y, z, w, h, t, 0, ry, 0)]);
  if (age <= 0) return;
  under(p, m(x, y, z, 1, 1, 1, 0, ry, 0), () => {
    if (age === 1) {
      p.push([box(), A.drystoneDark, m(0, h / 2 + 0.025, 0.004, w + 0.07, 0.05, t + 0.01)]);
      p.push([box(), A.drystoneLight, m(0, -h / 2 + 0.01, 0.01, w + 0.05, 0.02, t + 0.03)]);
    } else if (age === 2) {
      for (const side of [-1, 1])
        p.push([box(), A.beam, m((side * (w + 0.03)) / 2, 0.01, 0.004, 0.03, h + 0.02, t + 0.01)]);
      p.push([box(), A.beam, m(0, h / 2 + 0.015, 0.004, w + 0.06, 0.03, t + 0.01)]);
      for (const k of [-0.25, 0.25])
        p.push([box(), C.ironDark, m(-w * 0.2, h * k, t / 2 + 0.003, w * 0.5, 0.015, 0.006)]);
    } else {
      p.push([box(), A.steel, m(0, h / 2 + 0.02, 0.004, w + 0.06, 0.035, t + 0.012)]);
      p.push([sphere(5, 4), A.brass, m(w * 0.3, 0, t / 2 + 0.008, 0.015, 0.015, 0.015)]);
      p.push([box(), A.glass, m(0, h / 2 + 0.065, 0.006, w * 0.8, 0.05, t)]);
    }
  });
}

/** A chimney standing on the ground at (x, z), `h` high, with smoke from the later ages. */
export function chimney(p: Parts, age: number, x: number, z: number, h: number): void {
  if (age <= 0) return;
  if (age === 1) {
    p.push([box(), A.drystone, m(x, h / 2, z, 0.12, h, 0.12)]);
    p.push([box(), A.drystoneDark, m(x, h * 0.2, z, 0.14, h * 0.4, 0.14)]);
    p.push([ico(), A.drystoneDark, m(x, h + 0.02, z, 0.07, 0.04, 0.07)]);
  } else if (age === 2) {
    p.push([box(), A.brick, m(x, h / 2, z, 0.12, h, 0.12)]);
    p.push([box(), C.ironDark, m(x, h + 0.015, z, 0.15, 0.03, 0.15)]);
  } else {
    p.push([cyl(8), A.brick, m(x, h / 2, z, 0.07, h, 0.07)]);
    for (const k of [0.35, 0.75]) p.push([cyl(8), A.brass, m(x, h * k, z, 0.078, 0.025, 0.078)]);
    p.push([cyl(8), A.steel, m(x, h + 0.02, z, 0.09, 0.04, 0.09)]);
  }
  emitter(p, { kind: 'smoke', at: [x, h + 0.06, z], rate: 0.5 + age * 0.2, ambient: true });
}

/** A copper (or brass) pipe between two points. */
export function pipe(
  p: Parts,
  a: [number, number, number],
  b: [number, number, number],
  color: string = C.copper,
  thick = 0.025,
): void {
  beam(p, color, a, b, thick, true);
}

/** A small glass lamp on a post (Iron and Industry). */
export function lamp(p: Parts, age: number, x: number, z: number, name: string): void {
  p.push([cyl(5), age >= 3 ? A.steel : C.ironDark, m(x, 0.2, z, 0.018, 0.4, 0.018)]);
  p.push([box(), age >= 3 ? A.brass : C.iron, m(x, 0.42, z, 0.07, 0.07, 0.07)]);
  rig(p, name, [x, 0.42, z], { kind: 'flicker', amount: 0.15, speed: 3, ambient: true });
  p.push([sphere(5, 4), C.fire, m(x, 0.42, z, 0.035, 0.035, 0.035), name]);
}

/** One value per age (Eden, Stone, Iron, Industry). */
export function byAge<T>(age: number, values: readonly [T, T, T, T]): T {
  return values[Math.max(0, Math.min(3, age))]!;
}

/** Posts, frames and handles: wood, wood, dark beams, steel. */
export const frameColor = (age: number) => byAge(age, [C.woodDark, C.woodDark, A.beam, A.steel]);

/**
 * The flag of a building (tier 2 blue, tier 3 gold); from the Stone age a bigger banner with a
 * stripe in the age's colour, on a pole of the age (wood on a stone, iron, brass).
 */
export function banner(p: Parts, look: Look, x: number, y: number, z: number): void {
  const { age, tier } = look;
  if (age <= 0) {
    flag(p, tier, x, y, z);
    return;
  }
  if (tier < 2) return;
  const pole = byAge(age, [C.woodDark, C.woodDark, C.ironDark, A.brass]);
  p.push([cyl(5), pole, m(x, y + 0.36, z, 0.022, 0.72, 0.022)]);
  if (age === 1) p.push([ico(), A.drystoneDark, m(x, y + 0.02, z, 0.06, 0.04, 0.06)]);
  else p.push([sphere(5, 4), pole, m(x, y + 0.74, z, 0.03, 0.03, 0.03)]);
  rig(p, 'flag', [x, y + 0.62, z], {
    kind: 'swing',
    axis: 'y',
    amount: 0.3,
    speed: 3,
    ambient: true,
  });
  const cloth = tier >= 3 ? C.flagGold : C.flagBlue;
  p.push([box(), cloth, m(x + 0.13, y + 0.62, z, 0.26, 0.15, 0.015), 'flag']);
  p.push([box(), AGE_TINTS[age]!, m(x + 0.13, y + 0.55, z, 0.26, 0.035, 0.018), 'flag']);
}

/**
 * The annex of tier 2 in the later ages, standing on the ground at (x, z): a dry-stone store
 * with a woodpile (Stone), a covered cart and a hooped barrel (Iron), a steam tank on legs
 * (Industry).
 */
export function annex(p: Parts, age: number, x: number, z: number, ry = 0): void {
  under(p, m(x, 0, z, 1, 1, 1, 0, ry, 0), () => {
    if (age === 1) {
      wall(p, 1, 0, 0.11, 0, 0.26, 0.22, 0.18, C.stone);
      gable(p, 1, 0, 0.22, 0, 0.1, 0.28, 0.1, A.thatchDark);
      for (let i = 0; i < 3; i++)
        p.push([
          cyl(6),
          C.woodDark,
          m(-0.04 + i * 0.05, 0.04 + (i % 2) * 0.05, 0.16, 0.025, 0.2, 0.025, 0, 0, Math.PI / 2),
        ]);
    } else if (age === 2) {
      p.push([box(), C.wood, m(0, 0.13, 0, 0.3, 0.1, 0.18)]);
      gable(p, 2, 0, 0.2, -0.02, 0.08, 0.32, 0.1, C.roof);
      for (const side of [-1, 1])
        p.push([cyl(10), C.ironDark, m(side * 0.1, 0.07, 0.1, 0.07, 0.025, 0.07, Math.PI / 2)]);
      p.push([cyl(8), C.wood, m(0.22, 0.09, 0.02, 0.07, 0.18, 0.07)]);
      for (const y of [0.04, 0.14])
        p.push([cyl(8), C.ironDark, m(0.22, y, 0.02, 0.074, 0.018, 0.074)]);
    } else {
      p.push([cyl(10), C.copper, m(0, 0.3, 0, 0.11, 0.24, 0.11)]);
      p.push([sphere(8, 5), C.copper, m(0, 0.42, 0, 0.11, 0.05, 0.11)]);
      for (const k of [0.22, 0.38]) p.push([cyl(10), A.brass, m(0, k, 0, 0.115, 0.02, 0.115)]);
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const)
        p.push([box(), A.steel, m(dx * 0.07, 0.09, dz * 0.07, 0.025, 0.18, 0.025)]);
      pipe(p, [0.09, 0.32, 0], [0.2, 0.05, 0.05], A.steel, 0.02);
    }
  });
}

/**
 * The crown of tier 3 in the later ages, standing on the ground at (x, z), seen from afar: a
 * carved totem (Stone), a weathervane with a kiwi (Iron), a lightning mast with a glowing globe
 * and spinning cups (Industry).
 */
export function crown(p: Parts, age: number, x: number, z: number): void {
  if (age === 1) {
    p.push([ico(), A.drystoneDark, m(x, 0.04, z, 0.09, 0.06, 0.09)]);
    p.push([cyl(7), C.wood, m(x, 0.5, z, 0.06, 1.0, 0.06)]);
    for (const [y, c] of [
      [0.35, C.roof],
      [0.62, C.leaf],
      [0.86, C.flagGold],
    ] as const)
      p.push([cyl(7), c, m(x, y, z, 0.075, 0.08, 0.075)]);
    p.push([sphere(8, 6), C.fur, m(x, 1.06, z, 0.09, 0.08, 0.1)]);
    p.push([cone(6), C.straw, m(x, 1.04, z + 0.13, 0.02, 0.14, 0.02, Math.PI / 2 + 0.3)]);
  } else if (age === 2) {
    p.push([cyl(6), C.ironDark, m(x, 0.6, z, 0.022, 1.2, 0.022)]);
    p.push([sphere(6, 4), C.flagGold, m(x, 1.2, z, 0.035, 0.035, 0.035)]);
    rig(p, 'vane', [x, 1.12, z], {
      kind: 'swing',
      axis: 'y',
      amount: 0.6,
      speed: 0.5,
      ambient: true,
    });
    p.push([box(), C.ironDark, m(x, 1.12, z, 0.02, 0.02, 0.36), 'vane']);
    p.push([cone(4), C.ironDark, m(x, 1.12, z + 0.2, 0.04, 0.08, 0.02, Math.PI / 2), 'vane']);
    p.push([sphere(6, 5), C.ironDark, m(x, 1.16, z - 0.12, 0.05, 0.05, 0.06), 'vane']);
    for (const r of [0, Math.PI / 2])
      p.push([box(), C.iron, m(x, 1.0, z, 0.24, 0.012, 0.012, 0, r)]);
  } else {
    p.push([cyl(6), A.steel, m(x, 0.65, z, 0.025, 1.3, 0.025)]);
    for (const k of [0.3, 0.7]) p.push([cyl(6), A.brass, m(x, k, z, 0.04, 0.03, 0.04)]);
    p.push([sphere(8, 6), C.goldEgg, m(x, 1.34, z, 0.06, 0.06, 0.06)]);
    emitter(p, { kind: 'gold', at: [x, 1.38, z], rate: 1, ambient: true });
    rig(p, 'cups', [x, 1.16, z], { kind: 'spin', axis: 'y', amount: 1, speed: 2.5, ambient: true });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      p.push([
        box(),
        A.brass,
        m(x + Math.sin(a) * 0.07, 1.16, z + Math.cos(a) * 0.07, 0.012, 0.012, 0.14, 0, a),
        'cups',
      ]);
      p.push([
        sphere(5, 4),
        A.brass,
        m(x + Math.sin(a) * 0.14, 1.16, z + Math.cos(a) * 0.14, 0.035, 0.03, 0.035),
        'cups',
      ]);
    }
  }
}
