import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType } from '@kiwar/shared';
import type { ParticleKind } from './particles';

/**
 * Procedural low-poly building models. Each model is assembled from primitives with vertex
 * colours. Static parts are merged into one geometry (one draw call per building); moving parts
 * ("rigs": a press, a wheel, windmill sails…) are merged per rig around their pivot so the view
 * can animate them. Everything is cached per type and level.
 */

const C = {
  straw: '#d9b36c',
  strawDark: '#b08a48',
  twig: '#8a5f38',
  egg: '#fff4dc',
  goldEgg: '#f2c14e',
  cream: '#f4e6c4',
  leaf: '#6fae2c',
  leafDark: '#4f7f1c',
  pulp: '#a8d65a',
  wood: '#a7774a',
  woodDark: '#7a5233',
  roof: '#b5523f',
  roofDark: '#8c3b2e',
  stone: '#c9c0ae',
  stoneDark: '#9c9382',
  seed: '#1f1612',
  juice: '#c9dc2e',
  fur: '#8a6440',
  furDark: '#6b4a2e',
  door: '#4a3324',
  flagBlue: '#5b8fd6',
  flagGold: '#f2c14e',
  white: '#fbf6ea',
} as const;

/** Geometry, colour, transform, and the rig it belongs to (none = static). */
type Part = [BufferGeometry, string, Matrix4, string?];

/**
 * How a rig moves; `phase` advances with the building's activity.
 * - spin: rotates around `axis` (`amount` = radians per phase unit).
 * - swing: oscillates around `axis` by ±`amount` radians.
 * - pump: moves up and down by `amount` (smooth).
 * - pound: lifted slowly by `amount`, then drops fast (hammers).
 * - bob: small vertical float of ±`amount`.
 * - breathe: slow squash and stretch of ±`amount` (the docked ship).
 * - flicker: irregular height changes of ±`amount` (flames).
 */
export interface RigMotion {
  kind: 'spin' | 'swing' | 'pump' | 'pound' | 'bob' | 'breathe' | 'flicker';
  axis?: 'x' | 'y' | 'z';
  amount: number;
  /** Phase units per second at full activity. */
  speed: number;
  /** Keeps moving when the building is idle (ambient life: flags, smoke, eggs). */
  ambient?: boolean;
}

interface RigDef {
  name: string;
  pivot: Vector3;
  motion: RigMotion;
}

/**
 * Particles of a building: either a steady `rate` (per second at full activity), or a burst of
 * `count` each time the rig `rig` passes `phase` (the press hits the pulp, the hammer falls…).
 */
interface EmitterDef {
  kind: ParticleKind;
  at: [number, number, number];
  rate?: number;
  rig?: string;
  count?: number;
  phase?: number;
  ambient?: boolean;
}

/** Parts plus the rigs and particle emitters they declare. */
type Parts = Part[] & { rigs?: RigDef[]; emitters?: EmitterDef[] };

function rig(p: Parts, name: string, pivot: [number, number, number], motion: RigMotion): void {
  (p.rigs ??= []).push({ name, pivot: new Vector3(...pivot), motion });
}

function emitter(p: Parts, def: EmitterDef): void {
  (p.emitters ??= []).push(def);
}

export interface BuildingEmitter {
  kind: ParticleKind;
  /** Position in the building's local space (scaled). */
  at: Vector3;
  rate: number;
  /** Index of the rig that triggers bursts, or -1. */
  rig: number;
  count: number;
  phase: number;
  ambient: boolean;
}

export interface BuildingRig {
  /** Rig geometry, centred on its pivot. */
  geometry: BufferGeometry;
  /** Pivot position in the building's local space (scaled). */
  pivot: Vector3;
  motion: RigMotion;
}

export interface BuildingModel {
  /** Static parts, merged. */
  geometry: BufferGeometry;
  rigs: BuildingRig[];
  emitters: BuildingEmitter[];
  /** Top of the model (for status icons). */
  height: number;
}

/** Models are authored for a unit tile; this makes them read better from the default zoom. */
const MODEL_SCALE = 1.3;

function m(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(sx, sy, sz),
  );
}

function bake(parts: Part[], offset?: Vector3): BufferGeometry {
  const prepared = parts.map(([geo, color, matrix]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    if (offset) g.translate(-offset.x, -offset.y, -offset.z);
    g.deleteAttribute('uv');
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const c = new Color(color);
    const count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error('Failed to merge building parts');
  merged.scale(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

const box = () => new BoxGeometry(1, 1, 1);
const cyl = (seg = 8) => new CylinderGeometry(1, 1, 1, seg);
const cone = (seg = 8) => new ConeGeometry(1, 1, seg);
const sphere = (w = 10, h = 7) => new SphereGeometry(1, w, h);
const ico = () => new IcosahedronGeometry(1, 0);
const roofPrism = () => new CylinderGeometry(1, 1, 1, 3); // triangular prism lying down

function flag(parts: Parts, level: number, x: number, y: number, z: number): void {
  if (level < 2) return;
  parts.push([cyl(5), C.woodDark, m(x, y + 0.3, z, 0.02, 0.6, 0.02)]);
  rig(parts, 'flag', [x, y + 0.52, z], {
    kind: 'swing',
    axis: 'y',
    amount: 0.35,
    speed: 3,
    ambient: true,
  });
  parts.push([
    box(),
    level >= 3 ? C.flagGold : C.flagBlue,
    m(x + 0.1, y + 0.52, z, 0.2, 0.12, 0.015),
    'flag',
  ]);
}

function nest(level: number): Parts {
  const p: Parts = [];
  const s = 1 + (level - 1) * 0.12;
  p.push([
    new TorusGeometry(0.5 * s, 0.17 * s, 6, 14),
    C.straw,
    m(0, 0.16, 0, 1, 1, 1, Math.PI / 2),
  ]);
  p.push([cyl(14), C.strawDark, m(0, 0.08, 0, 0.5 * s, 0.12, 0.5 * s)]);
  // Woven twigs around the rim.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.push([
      box(),
      C.twig,
      m(Math.cos(a) * 0.55 * s, 0.2, Math.sin(a) * 0.55 * s, 0.05, 0.05, 0.42, 0.3, -a, 0.4),
    ]);
  }
  const eggs = level >= 3 ? 4 : 3;
  for (let i = 0; i < eggs; i++) {
    const a = (i / eggs) * Math.PI * 2 + 0.4;
    const gold = level >= 3 && i === 0;
    const ex = Math.cos(a) * 0.2;
    const ez = Math.sin(a) * 0.2;
    // Eggs rock gently on their base; the golden one twinkles.
    rig(p, `egg${i}`, [ex, 0.09, ez], {
      kind: 'swing',
      axis: i % 2 ? 'x' : 'z',
      amount: 0.1,
      speed: 1.6 + i * 0.35,
      ambient: true,
    });
    p.push([sphere(), gold ? C.goldEgg : C.egg, m(ex, 0.25, ez, 0.13, 0.17, 0.13), `egg${i}`]);
    if (gold) emitter(p, { kind: 'gold', at: [ex, 0.36, ez], rate: 1.6, ambient: true });
  }
  if (level >= 2) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tx = Math.cos(a) * 0.62 * s;
      const tz = Math.sin(a) * 0.62 * s;
      // Twigs quivering in the breeze.
      rig(p, `twig${i}`, [tx, 0.22, tz], {
        kind: 'swing',
        axis: i % 2 ? 'x' : 'z',
        amount: 0.07,
        speed: 5 + i,
        ambient: true,
      });
      p.push([cone(4), C.twig, m(tx, 0.38, tz, 0.05, 0.35, 0.05), `twig${i}`]);
    }
  }
  if (level >= 3) {
    p.push([new TorusGeometry(0.28, 0.1, 6, 12), C.straw, m(0, 0.5, 0, 1, 1, 1, Math.PI / 2)]);
  }
  flag(p, level, 0.6 * s, 0.25, -0.2);
  return p;
}

function pulpery(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  p.push([cyl(10), C.cream, m(0, 0.2 * s, 0, 0.36 * s, 0.4 * s, 0.36 * s)]);
  p.push([cone(10), C.leaf, m(0, 0.6 * s, 0, 0.5 * s, 0.42 * s, 0.5 * s)]);
  p.push([sphere(6, 4), C.leafDark, m(0, 0.84 * s, 0, 0.07, 0.07, 0.07)]);
  p.push([box(), C.door, m(0, 0.13 * s, 0.35 * s, 0.14, 0.24 * s, 0.03)]);
  // Basket of pulp under a little press whose plate pumps on the fruit.
  p.push([cyl(8), C.wood, m(0.42, 0.07, 0.22, 0.14, 0.14, 0.14)]);
  for (const x of [0.25, 0.59]) p.push([box(), C.woodDark, m(x, 0.24, 0.22, 0.035, 0.48, 0.035)]);
  p.push([box(), C.woodDark, m(0.42, 0.47, 0.22, 0.38, 0.04, 0.05)]);
  rig(p, 'press', [0.42, 0.3, 0.22], { kind: 'pump', amount: 0.08, speed: 5 });
  p.push([cyl(6), C.stoneDark, m(0.42, 0.38, 0.22, 0.02, 0.18, 0.02), 'press']);
  p.push([cyl(10), C.wood, m(0.42, 0.29, 0.22, 0.12, 0.03, 0.12), 'press']);
  emitter(p, { kind: 'pulp', at: [0.42, 0.2, 0.22], rig: 'press', count: 3, phase: Math.PI });
  for (let i = 0; i < 4; i++)
    p.push([
      sphere(6, 4),
      C.pulp,
      m(0.38 + (i % 2) * 0.08, 0.16, 0.18 + Math.floor(i / 2) * 0.08, 0.06, 0.05, 0.06),
    ]);
  if (level >= 2) {
    p.push([cyl(8), C.cream, m(-0.4, 0.14, -0.2, 0.2, 0.28, 0.2)]);
    p.push([cone(8), C.leaf, m(-0.4, 0.42, -0.2, 0.3, 0.3, 0.3)]);
  }
  if (level >= 3) {
    // Big leaf sail on the roof.
    p.push([sphere(8, 5), C.leafDark, m(0, 0.95 * s, 0, 0.32, 0.04, 0.12, 0, 0.6, 0.3)]);
  }
  flag(p, level, -0.45, 0.1, 0.35);
  return p;
}

function fiberWorkshop(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  p.push([box(), C.wood, m(0, 0.2 * s, 0, 0.62 * s, 0.4 * s, 0.46 * s)]);
  p.push([roofPrism(), C.roof, m(0, 0.52 * s, 0, 0.28 * s, 0.7 * s, 0.32 * s, 0, 0, Math.PI / 2)]);
  p.push([box(), C.door, m(0, 0.13 * s, 0.24 * s, 0.14, 0.24 * s, 0.02)]);
  const spool = (x: number, z: number) => {
    p.push([cyl(10), C.cream, m(x, 0.18, z, 0.13, 0.26, 0.13)]);
    p.push([cyl(10), C.woodDark, m(x, 0.04, z, 0.17, 0.04, 0.17)]);
    p.push([cyl(10), C.woodDark, m(x, 0.32, z, 0.17, 0.04, 0.17)]);
  };
  spool(0.45, 0.3);
  if (level >= 2) spool(-0.2, 0.44);
  // Spinning wheel on its stand, facing the street.
  const wx = -0.46;
  const wz = 0.1;
  const wy = 0.3;
  for (const dx of [-0.05, 0.05]) {
    p.push([box(), C.woodDark, m(wx + dx, wy / 2, wz - 0.03, 0.03, wy, 0.03)]);
  }
  rig(p, 'wheel', [wx, wy, wz], { kind: 'spin', axis: 'z', amount: 1, speed: 4 });
  p.push([new TorusGeometry(0.17, 0.022, 4, 14), C.wood, m(wx, wy, wz), 'wheel']);
  for (let i = 0; i < 3; i++) {
    p.push([
      box(),
      C.woodDark,
      m(wx, wy, wz, 0.015, 0.34, 0.015, 0, 0, (i * Math.PI) / 3),
      'wheel',
    ]);
  }
  p.push([cyl(6), C.cream, m(wx, wy, wz, 0.04, 0.1, 0.04, Math.PI / 2), 'wheel']);
  if (level >= 3) p.push([box(), C.stoneDark, m(0.2, 0.75 * s, -0.1, 0.1, 0.35, 0.1)]);
  flag(p, level, -0.4, 0.4, -0.25);
  return p;
}

function seedQuarry(level: number): Parts {
  const p: Parts = [];
  const s = 0.9 + level * 0.08;
  // Wooden A-frame with a pulley.
  p.push([box(), C.wood, m(-0.25, 0.4 * s, 0, 0.06, 0.85 * s, 0.06, 0, 0, 0.3)]);
  p.push([box(), C.wood, m(0.25, 0.4 * s, 0, 0.06, 0.85 * s, 0.06, 0, 0, -0.3)]);
  p.push([box(), C.woodDark, m(0, 0.78 * s, 0, 0.5, 0.06, 0.06)]);
  p.push([cyl(10), C.stoneDark, m(0, 0.62 * s, 0, 0.08, 0.06, 0.08, Math.PI / 2)]);
  // Drop hammer: hauled up to the pulley, then it falls on the seeds.
  rig(p, 'hammer', [0, 0.14, 0], { kind: 'pound', amount: 0.24 * s, speed: 3.2 });
  p.push([cyl(6), C.woodDark, m(0, 0.3, 0, 0.018, 0.34, 0.018), 'hammer']);
  p.push([cyl(10), C.stone, m(0, 0.14, 0, 0.12, 0.12, 0.12), 'hammer']);
  p.push([cyl(10), C.stoneDark, m(0, 0.2, 0, 0.13, 0.025, 0.13), 'hammer']);
  emitter(p, { kind: 'chip', at: [0, 0.08, 0], rig: 'hammer', count: 5, phase: 0 });
  // Pit and a pile of seeds.
  p.push([cyl(10), C.stoneDark, m(0, 0.03, 0, 0.32, 0.06, 0.32)]);
  const seeds = 3 + level * 2;
  for (let i = 0; i < seeds; i++) {
    const a = i * 2.4;
    const r = 0.12 + (i % 3) * 0.06;
    p.push([
      sphere(7, 5),
      C.seed,
      m(
        0.4 + Math.cos(a) * r * 0.6,
        0.06 + (i % 2) * 0.05,
        0.25 + Math.sin(a) * r * 0.6,
        0.1,
        0.05,
        0.06,
        0,
        a,
        0,
      ),
    ]);
  }
  p.push([cyl(8), C.wood, m(-0.4, 0.08, 0.3, 0.1, 0.16, 0.1)]);
  if (level >= 3) p.push([box(), C.woodDark, m(0.3, 0.86 * s, 0, 0.7, 0.05, 0.05, 0, 0, -0.25)]);
  flag(p, level, -0.45, 0.1, -0.3);
  return p;
}

function juiceWell(level: number): Parts {
  const p: Parts = [];
  const s = 0.9 + level * 0.08;
  p.push([cyl(12), C.stone, m(0, 0.15, 0, 0.36 * s, 0.32, 0.36 * s)]);
  p.push([cyl(12), C.juice, m(0, 0.31, 0, 0.29 * s, 0.02, 0.29 * s)]);
  p.push([box(), C.wood, m(-0.3 * s, 0.5, 0, 0.05, 0.7, 0.05)]);
  p.push([box(), C.wood, m(0.3 * s, 0.5, 0, 0.05, 0.7, 0.05)]);
  p.push([cone(4), C.roof, m(0, 0.95, 0, 0.5 * s, 0.3, 0.42 * s, 0, Math.PI / 4)]);
  p.push([cyl(8), C.woodDark, m(0, 0.72, 0, 0.04, 0.6 * s, 0.04, 0, 0, Math.PI / 2)]);
  // Bucket going up and down on its rope.
  rig(p, 'bucket', [0.05, 0.5, 0], { kind: 'pump', amount: 0.14, speed: 2.2 });
  p.push([cyl(8), C.wood, m(0.05, 0.5, 0, 0.07, 0.1, 0.07), 'bucket']);
  p.push([cyl(4), C.straw, m(0.05, 0.62, 0, 0.008, 0.16, 0.008), 'bucket']);
  emitter(p, { kind: 'juice', at: [0.05, 0.44, 0], rig: 'bucket', count: 2, phase: 0 });
  // Little windmill on the roof that drives the winch.
  const hub: [number, number, number] = [0, 1.16, 0.16];
  p.push([cyl(6), C.woodDark, m(0, 1.08, 0.05, 0.025, 0.24, 0.025)]);
  p.push([cyl(6), C.woodDark, m(0, 1.16, 0.08, 0.02, 0.16, 0.02, Math.PI / 2)]);
  rig(p, 'sails', hub, { kind: 'spin', axis: 'z', amount: 1, speed: 2.4 });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const r = 0.17;
    p.push([
      box(),
      C.woodDark,
      m(hub[0] + Math.sin(a) * r, hub[1] + Math.cos(a) * r, hub[2], 0.02, 0.34, 0.015, 0, 0, -a),
      'sails',
    ]);
    p.push([
      box(),
      C.cream,
      m(
        hub[0] + Math.sin(a) * r + Math.cos(a) * 0.045,
        hub[1] + Math.cos(a) * r - Math.sin(a) * 0.045,
        hub[2] + 0.01,
        0.08,
        0.26,
        0.01,
        0,
        0,
        -a,
      ),
      'sails',
    ]);
  }
  p.push([sphere(6, 4), C.roof, m(...hub, 0.04, 0.04, 0.04), 'sails']);
  if (level >= 2) p.push([cyl(10), C.stoneDark, m(0, 0.32, 0, 0.38 * s, 0.04, 0.38 * s)]);
  if (level >= 3) p.push([sphere(8, 6), C.juice, m(0.45, 0.12, 0.2, 0.12, 0.12, 0.12)]);
  flag(p, level, 0.42, 0.3, -0.3);
  return p;
}

function hut(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const dome = (x: number, z: number, k: number) => {
    p.push([
      new SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      C.fur,
      m(x, 0, z, 0.42 * k, 0.45 * k, 0.42 * k),
    ]);
    p.push([box(), C.door, m(x, 0.11 * k, z + 0.38 * k, 0.14 * k, 0.22 * k, 0.05)]);
    // A tiny beak-shaped awning above the door.
    p.push([cone(5), C.straw, m(x, 0.3 * k, z + 0.42 * k, 0.05, 0.22, 0.05, Math.PI / 2.4, 0, 0)]);
  };
  dome(0, 0, s);
  if (level >= 2) p.push([cyl(6), C.stoneDark, m(0.18, 0.42 * s, -0.1, 0.06, 0.25, 0.06)]);
  emitter(p, {
    kind: 'smoke',
    at: level >= 2 ? [0.18, 0.42 * s + 0.14, -0.1] : [0, 0.5 * s, 0],
    rate: 0.8,
    ambient: true,
  });
  if (level >= 3) dome(-0.42, -0.3, 0.6);
  p.push([sphere(6, 4), C.furDark, m(0, 0.45 * s, 0, 0.06, 0.06, 0.06)]);
  flag(p, level, 0.42, 0.05, 0.2);
  return p;
}

function warehouse(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  p.push([box(), C.roof, m(0, 0.22 * s, 0, 0.66 * s, 0.44 * s, 0.5 * s)]);
  p.push([
    roofPrism(),
    C.roofDark,
    m(0, 0.56 * s, 0, 0.3 * s, 0.72 * s, 0.36 * s, 0, 0, Math.PI / 2),
  ]);
  p.push([box(), C.white, m(0, 0.17 * s, 0.26 * s, 0.26, 0.3 * s, 0.02)]);
  p.push([box(), C.woodDark, m(0, 0.17 * s, 0.27 * s, 0.26, 0.03, 0.02, 0, 0, 0.75)]);
  const crates = level + 1;
  for (let i = 0; i < crates; i++) {
    p.push([
      box(),
      C.wood,
      m(
        0.48 - (i % 2) * 0.16,
        0.07 + Math.floor(i / 2) * 0.14,
        0.32 - (i % 2) * 0.06,
        0.13,
        0.13,
        0.13,
        0,
        i * 0.4,
        0,
      ),
    ]);
  }
  // Little crane swinging crates around.
  const cx = 0.5;
  const cz = -0.22;
  p.push([cyl(6), C.woodDark, m(cx, 0.36, cz, 0.03, 0.72, 0.03)]);
  rig(p, 'crane', [cx, 0.72, cz], { kind: 'swing', axis: 'y', amount: 0.9, speed: 0.9 });
  p.push([box(), C.wood, m(cx, 0.72, cz + 0.17, 0.035, 0.035, 0.42), 'crane']);
  p.push([cyl(4), C.straw, m(cx, 0.6, cz + 0.34, 0.008, 0.24, 0.008), 'crane']);
  p.push([box(), C.wood, m(cx, 0.45, cz + 0.34, 0.1, 0.1, 0.1, 0, 0.3, 0), 'crane']);
  if (level >= 3) {
    p.push([cyl(10), C.stone, m(-0.45, 0.35, -0.25, 0.16, 0.7, 0.16)]);
    p.push([cone(10), C.roofDark, m(-0.45, 0.8, -0.25, 0.2, 0.2, 0.2)]);
  }
  flag(p, level, -0.42, 0.1, 0.3);
  return p;
}

/** Launch platform; the kiwi-shaped ship is drawn only while it is docked. */
function launchpad(level: number, docked = true): Parts {
  const p: Parts = [];
  const s = 0.9 + level * 0.08;
  p.push([cyl(14), C.wood, m(0, 0.06, 0, 0.62 * s, 0.12, 0.62 * s)]);
  p.push([cyl(14), C.straw, m(0, 0.13, 0, 0.5 * s, 0.02, 0.5 * s)]);
  // Launch tower.
  p.push([box(), C.woodDark, m(-0.5 * s, 0.55, -0.1, 0.06, 1.0, 0.06)]);
  p.push([box(), C.woodDark, m(-0.5 * s, 0.55, 0.12, 0.06, 1.0, 0.06)]);
  for (const y of [0.35, 0.7]) p.push([box(), C.wood, m(-0.42 * s, y, 0.01, 0.2, 0.04, 0.26)]);
  if (docked) {
    // Hull: half a kiwi (furry skin below, green slice deck on top), fins and a leaf sail.
    // The docked ship slowly "breathes".
    rig(p, 'ship', [0, 0.16, 0], { kind: 'breathe', amount: 0.035, speed: 1.4, ambient: true });
    p.push([
      new SphereGeometry(1, 12, 7, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      C.fur,
      m(0, 0.42, 0, 0.32, 0.26, 0.42),
      'ship',
    ]);
    p.push([cyl(14), C.leaf, m(0, 0.42, 0, 0.31, 0.02, 0.41), 'ship']);
    p.push([cyl(10), C.cream, m(0, 0.43, 0, 0.1, 0.02, 0.14), 'ship']);
    for (const side of [-1, 1]) {
      p.push([
        box(),
        C.roof,
        m(side * 0.3, 0.3, -0.25, 0.04, 0.16, 0.18, 0, 0, side * 0.5),
        'ship',
      ]);
    }
    p.push([cyl(6), C.woodDark, m(0, 0.75, 0.05, 0.025, 0.65, 0.025), 'ship']);
    p.push([sphere(8, 5), C.leafDark, m(0, 0.8, 0.12, 0.03, 0.26, 0.16), 'ship']);
    if (level >= 2)
      p.push([cone(8), C.flagGold, m(0, 0.33, -0.45, 0.08, 0.12, 0.08, -Math.PI / 2), 'ship']);
  }
  flag(p, level, 0.5, 0.12, 0.35);
  return p;
}

/**
 * School: a cream schoolhouse with a red roof and a bell tower whose bell swings. Level 2 adds
 * a training yard (a straw dummy), level 3 a mage's tower with a twinkling crystal.
 */
function school(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.08;
  p.push([box(), C.stone, m(0, 0.03, 0, 0.78 * s, 0.06, 0.56 * s)]);
  p.push([box(), C.cream, m(0, 0.24 * s, 0, 0.64 * s, 0.4 * s, 0.44 * s)]);
  p.push([roofPrism(), C.roof, m(0, 0.54 * s, 0, 0.28 * s, 0.72 * s, 0.3 * s, 0, 0, Math.PI / 2)]);
  p.push([box(), C.door, m(0, 0.14 * s, 0.225 * s, 0.13, 0.22 * s, 0.02)]);
  for (const x of [-0.2, 0.2]) {
    p.push([box(), C.flagBlue, m(x * s, 0.27 * s, 0.225 * s, 0.1, 0.1, 0.015)]);
    p.push([box(), C.white, m(x * s, 0.27 * s, 0.23 * s, 0.11, 0.015, 0.015)]);
  }
  // Bell tower on the ridge; the bell rings when the classes are in session.
  const tx = 0.18 * s;
  const ty = 0.72 * s;
  p.push([box(), C.wood, m(tx, ty, 0, 0.16, 0.2, 0.16)]);
  p.push([cone(4), C.roofDark, m(tx, ty + 0.18, 0, 0.15, 0.16, 0.15, 0, Math.PI / 4, 0)]);
  rig(p, 'bell', [tx, ty + 0.07, 0], { kind: 'swing', axis: 'z', amount: 0.45, speed: 2.4 });
  p.push([cone(8), C.flagGold, m(tx, ty + 0.01, 0, 0.055, 0.09, 0.055), 'bell']);
  // Chalkboard by the door.
  p.push([box(), C.leafDark, m(-0.42 * s, 0.2, 0.2, 0.2, 0.16, 0.02, 0, 0.5, 0)]);
  p.push([box(), C.woodDark, m(-0.42 * s, 0.08, 0.2, 0.02, 0.16, 0.02, 0, 0.5, 0)]);
  if (level >= 2) {
    // Training dummy for the warriors.
    p.push([cyl(5), C.woodDark, m(0.48 * s, 0.18, 0.28, 0.02, 0.36, 0.02)]);
    p.push([cyl(8), C.straw, m(0.48 * s, 0.26, 0.28, 0.07, 0.16, 0.07)]);
    p.push([sphere(6, 4), C.strawDark, m(0.48 * s, 0.39, 0.28, 0.06, 0.06, 0.06)]);
    p.push([cyl(5), C.woodDark, m(0.48 * s, 0.28, 0.28, 0.015, 0.22, 0.015, 0, 0, Math.PI / 2)]);
  }
  if (level >= 3) {
    // Mage's tower with a floating crystal.
    p.push([cyl(8), C.stoneDark, m(-0.38 * s, 0.4, -0.22, 0.11, 0.8, 0.11)]);
    p.push([cone(8), C.flagBlue, m(-0.38 * s, 0.9, -0.22, 0.15, 0.24, 0.15)]);
    rig(p, 'crystal', [-0.38 * s, 1.1, -0.22], {
      kind: 'bob',
      amount: 0.03,
      speed: 2,
      ambient: true,
    });
    p.push([ico(), C.juice, m(-0.38 * s, 1.1, -0.22, 0.05, 0.08, 0.05), 'crystal']);
    emitter(p, { kind: 'gold', at: [-0.38 * s, 1.12, -0.22], rate: 1.2, ambient: true });
  }
  flag(p, level, 0.42, 0.06, -0.3);
  return p;
}

/** Gathering camp: a leaf lean-to, a woven basket and a little stone ring. No foundations. */
function camp(): Parts {
  const p: Parts = [];
  // Lean-to: two forked poles, a ridge and a leaf roof.
  for (const x of [-0.28, 0.28]) {
    p.push([cyl(5), C.woodDark, m(x, 0.24, -0.12, 0.025, 0.5, 0.025, -0.35, 0, 0)]);
  }
  p.push([cyl(5), C.wood, m(0, 0.46, -0.04, 0.025, 0.64, 0.025, 0, 0, Math.PI / 2)]);
  p.push([box(), C.leaf, m(0, 0.27, -0.2, 0.7, 0.03, 0.46, -0.85, 0, 0)]);
  p.push([box(), C.leafDark, m(0, 0.29, -0.19, 0.6, 0.02, 0.36, -0.85, 0, 0)]);
  // Woven basket with a few pickings.
  p.push([cyl(9), C.straw, m(0.3, 0.09, 0.26, 0.13, 0.18, 0.13)]);
  p.push([
    new TorusGeometry(0.13, 0.025, 4, 10),
    C.strawDark,
    m(0.3, 0.18, 0.26, 1, 1, 1, Math.PI / 2),
  ]);
  // The pickings shuffle in the basket while the kiwis work.
  rig(p, 'pick', [0.3, 0.2, 0.26], { kind: 'bob', amount: 0.015, speed: 4 });
  p.push([sphere(6, 4), C.pulp, m(0.27, 0.2, 0.25, 0.06, 0.05, 0.06), 'pick']);
  p.push([sphere(6, 4), C.pulp, m(0.34, 0.21, 0.28, 0.05, 0.05, 0.05), 'pick']);
  // Stone ring.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push([
      ico(),
      C.stoneDark,
      m(-0.25 + Math.cos(a) * 0.12, 0.03, 0.28 + Math.sin(a) * 0.12, 0.05, 0.04, 0.05),
    ]);
  }
  // Crackling campfire.
  rig(p, 'fire', [-0.25, 0.02, 0.28], { kind: 'flicker', amount: 0.25, speed: 9, ambient: true });
  p.push([cone(5), C.roof, m(-0.25, 0.1, 0.28, 0.07, 0.17, 0.07), 'fire']);
  p.push([cone(5), C.flagGold, m(-0.25, 0.08, 0.28, 0.045, 0.12, 0.045), 'fire']);
  emitter(p, { kind: 'spark', at: [-0.25, 0.14, 0.28], rate: 2.5, ambient: true });
  emitter(p, { kind: 'smoke', at: [-0.25, 0.2, 0.28], rate: 0.5, ambient: true });
  return p;
}

const BUILDERS: Record<BuildingType, (level: number) => Parts> = {
  camp,
  launchpad,
  nest,
  pulpery,
  fiberWorkshop,
  seedQuarry,
  juiceWell,
  hut,
  warehouse,
  school,
};

const cache = new Map<string, BufferGeometry>();
const models = new Map<string, BuildingModel>();

function partsOf(type: BuildingType, level: number, shipAway: boolean): Parts {
  const lvl = Math.max(1, Math.min(3, level));
  return type === 'launchpad' && shipAway ? launchpad(lvl, false) : BUILDERS[type](lvl);
}

/** The whole model merged in its rest pose (construction ghosts). */
export function buildingGeometry(
  type: BuildingType,
  level: number,
  shipAway = false,
): BufferGeometry {
  const key = `${type}:${level}${shipAway ? ':away' : ''}`;
  let g = cache.get(key);
  if (!g) {
    g = bake(partsOf(type, level, shipAway));
    cache.set(key, g);
  }
  return g;
}

/** Static geometry plus the animated rigs of a building. */
export function buildingModel(type: BuildingType, level: number, shipAway = false): BuildingModel {
  const key = `${type}:${level}${shipAway ? ':away' : ''}`;
  let model = models.get(key);
  if (!model) {
    const parts = partsOf(type, level, shipAway);
    const geometry = bake(parts.filter((part) => !part[3]));
    const rigs = (parts.rigs ?? [])
      .filter((r) => parts.some((part) => part[3] === r.name))
      .map((r) => ({
        geometry: bake(
          parts.filter((part) => part[3] === r.name),
          r.pivot,
        ),
        pivot: r.pivot.clone().multiplyScalar(MODEL_SCALE),
        motion: r.motion,
      }));
    const height = buildingGeometry(type, level, shipAway).boundingBox!.max.y;
    const rigNames = (parts.rigs ?? [])
      .filter((r) => parts.some((part) => part[3] === r.name))
      .map((r) => r.name);
    const emitters = (parts.emitters ?? []).map((e) => ({
      kind: e.kind,
      at: new Vector3(...e.at).multiplyScalar(MODEL_SCALE),
      rate: e.rate ?? 0,
      rig: e.rig ? rigNames.indexOf(e.rig) : -1,
      count: e.count ?? 1,
      phase: e.phase ?? 0,
      ambient: e.ambient ?? false,
    }));
    model = { geometry, rigs, emitters, height };
    models.set(key, model);
  }
  return model;
}

/** Wooden scaffolding around a construction site. */
export function scaffoldGeometry(): BufferGeometry {
  let g = cache.get('scaffold');
  if (!g) {
    const p: Parts = [];
    const r = 0.5;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      p.push([box(), C.wood, m(Math.cos(a) * r, 0.45, Math.sin(a) * r, 0.05, 0.9, 0.05)]);
    }
    for (const y of [0.3, 0.75]) {
      p.push([box(), C.woodDark, m(0, y, r * 0.71, r * 1.42, 0.04, 0.04)]);
      p.push([box(), C.woodDark, m(0, y, -r * 0.71, r * 1.42, 0.04, 0.04)]);
      p.push([box(), C.woodDark, m(r * 0.71, y, 0, 0.04, 0.04, r * 1.42)]);
      p.push([box(), C.woodDark, m(-r * 0.71, y, 0, 0.04, 0.04, r * 1.42)]);
    }
    p.push([box(), C.straw, m(0.35, 0.05, 0.45, 0.3, 0.06, 0.12, 0, 0.3, 0)]);
    p.push([box(), C.straw, m(0.33, 0.11, 0.45, 0.28, 0.06, 0.12, 0, 0.1, 0)]);
    g = bake(p);
    cache.set('scaffold', g);
  }
  return g;
}

/** A small wooden stake with a ribbon marking a planned (queued) construction. */
export function stakeGeometry(): BufferGeometry {
  let g = cache.get('stake');
  if (!g) {
    g = bake([
      [box(), C.wood, m(0, 0.25, 0, 0.05, 0.5, 0.05)],
      [box(), C.flagGold, m(0.08, 0.42, 0, 0.16, 0.08, 0.015)],
      [ico(), C.stoneDark, m(0, 0.03, 0, 0.08, 0.05, 0.08)],
    ]);
    cache.set('stake', g);
  }
  return g;
}
