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
import { shipIdForAge, type BuildingType, type ShipId } from '@kiwar/shared';
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
  iron: '#7d858c',
  ironDark: '#50575d',
  brick: '#a2533b',
  fire: '#ff9a3c',
} as const;

/** Geometry, colour, transform, and the rig it belongs to (none = static). */
type Part = [BufferGeometry, string, Matrix4, (string | undefined)?];

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
    // Chantier 11: a storehouse annex under a leaf roof.
    p.push([cyl(8), C.cream, m(-0.4, 0.18, -0.2, 0.24, 0.36, 0.24)]);
    p.push([cone(8), C.leaf, m(-0.4, 0.5, -0.2, 0.34, 0.32, 0.34)]);
    p.push([box(), C.door, m(-0.4, 0.1, 0.03, 0.1, 0.18, 0.02)]);
  }
  if (level >= 3) {
    // Big leaf sail on the roof and a tall drying tower.
    p.push([sphere(8, 5), C.leafDark, m(0, 0.95 * s, 0, 0.32, 0.04, 0.12, 0, 0.6, 0.3)]);
    p.push([cyl(8), C.wood, m(0.38, 0.4, -0.34, 0.11, 0.8, 0.11)]);
    p.push([cone(8), C.leafDark, m(0.38, 0.92, -0.34, 0.2, 0.26, 0.2)]);
    for (const y of [0.3, 0.55])
      p.push([sphere(6, 4), C.pulp, m(0.38, y, -0.22, 0.07, 0.06, 0.04)]);
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
  if (level >= 2) {
    // Chantier 11: a drying rack hung with skeins of fibre.
    for (const x of [0.12, 0.6]) p.push([box(), C.woodDark, m(x, 0.3, -0.42, 0.04, 0.6, 0.04)]);
    p.push([box(), C.woodDark, m(0.36, 0.6, -0.42, 0.56, 0.04, 0.04)]);
    for (const x of [0.22, 0.36, 0.5])
      p.push([box(), C.cream, m(x, 0.44, -0.42, 0.08, 0.28, 0.05)]);
  }
  if (level >= 3) {
    p.push([box(), C.stoneDark, m(0.2, 0.75 * s, -0.1, 0.1, 0.35, 0.1)]);
    // A loft above the workshop.
    p.push([box(), C.wood, m(-0.12, 0.7 * s, 0, 0.3 * s, 0.22 * s, 0.32 * s)]);
    p.push([
      roofPrism(),
      C.roofDark,
      m(-0.12, 0.88 * s, 0, 0.16 * s, 0.36 * s, 0.2 * s, 0, 0, Math.PI / 2),
    ]);
  }
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
  if (level >= 2) {
    // Chantier 11: a cart full of seeds.
    p.push([box(), C.wood, m(-0.36, 0.16, -0.3, 0.3, 0.12, 0.2)]);
    for (const x of [-0.46, -0.26])
      p.push([cyl(8), C.woodDark, m(x, 0.08, -0.19, 0.07, 0.03, 0.07, Math.PI / 2)]);
    for (let i = 0; i < 3; i++)
      p.push([sphere(6, 4), C.seed, m(-0.44 + i * 0.08, 0.24, -0.3, 0.05, 0.035, 0.06, 0, i, 0)]);
  }
  if (level >= 3) {
    p.push([box(), C.woodDark, m(0.3, 0.86 * s, 0, 0.7, 0.05, 0.05, 0, 0, -0.25)]);
    // A stone silo.
    p.push([cyl(10), C.stone, m(0.42, 0.32, -0.3, 0.15, 0.64, 0.15)]);
    p.push([cone(10), C.roofDark, m(0.42, 0.74, -0.3, 0.19, 0.2, 0.19)]);
  }
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
  // Chantier 11: juice pockets (big translucent-looking bags of juice) on wooden cradles.
  const pocket = (x: number, z: number) => {
    p.push([box(), C.woodDark, m(x, 0.06, z, 0.3, 0.06, 0.08)]);
    p.push([box(), C.woodDark, m(x, 0.06, z, 0.08, 0.06, 0.3)]);
    p.push([sphere(10, 7), C.juice, m(x, 0.24, z, 0.2, 0.18, 0.2)]);
    p.push([
      new TorusGeometry(1, 0.08, 4, 12),
      C.wood,
      m(x, 0.24, z, 0.16, 0.16, 0.16, Math.PI / 2),
    ]);
    p.push([cyl(6), C.wood, m(x, 0.44, z, 0.03, 0.06, 0.03)]);
  };
  if (level >= 2) pocket(0.46, 0.24);
  if (level >= 3) {
    pocket(-0.44, 0.26);
    p.push([cyl(6), C.woodDark, m(0, 0.36, 0.26, 0.025, 0.9, 0.025, 0, 0, Math.PI / 2)]);
  }
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
  // Chantier 11: each level adds a room you can see from afar.
  if (level >= 2) {
    dome(0.4, -0.26, 0.62);
    p.push([cyl(6), C.stoneDark, m(0.18, 0.42 * s, -0.1, 0.06, 0.25, 0.06)]);
  }
  emitter(p, {
    kind: 'smoke',
    at: level >= 2 ? [0.18, 0.42 * s + 0.14, -0.1] : [0, 0.5 * s, 0],
    rate: 0.8,
    ambient: true,
  });
  if (level >= 3) {
    dome(-0.42, -0.3, 0.6);
    // A thatched cap on the main room.
    p.push([cone(10), C.straw, m(0, 0.5 * s, 0, 0.26 * s, 0.24 * s, 0.26 * s)]);
    p.push([cyl(10), C.strawDark, m(0, 0.4 * s, 0, 0.27 * s, 0.03, 0.27 * s)]);
  }
  p.push([sphere(6, 4), C.furDark, m(0, (level >= 3 ? 0.64 : 0.45) * s, 0, 0.06, 0.06, 0.06)]);
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
  if (level >= 2) {
    // Chantier 11: a lean-to shed on the side.
    p.push([box(), C.wood, m(-0.46 * s, 0.14, 0.12, 0.2, 0.28, 0.36)]);
    p.push([box(), C.roofDark, m(-0.48 * s, 0.31, 0.12, 0.28, 0.03, 0.42, 0, 0, 0.35)]);
  }
  if (level >= 3) {
    p.push([cyl(10), C.stone, m(-0.45, 0.35, -0.25, 0.16, 0.7, 0.16)]);
    p.push([cone(10), C.roofDark, m(-0.45, 0.8, -0.25, 0.2, 0.2, 0.2)]);
  }
  flag(p, level, -0.42, 0.1, 0.3);
  return p;
}

/** Colours of each ship generation (chantier 07): hull, trim, wings. */
const SHIP_LOOKS: Record<ShipId, { hull: string; trim: string; wing: string }> = {
  wood: { hull: C.wood, trim: C.woodDark, wing: C.cream },
  logs: { hull: C.twig, trim: C.straw, wing: '#e8d7b0' },
  iron: { hull: '#8f969c', trim: '#5d646b', wing: '#b7bdc2' },
  jet: { hull: '#eef2f0', trim: '#3aa6a0', wing: '#d5e4e2' },
};

/**
 * The mechanical kiwi bird (chantier 07): round body, small head, long beak, folded legs and
 * two wings on rigs (`wingL`, `wingR`, pivots at the shoulders). The body is the `ship` rig, so
 * it breathes on the pad. Front is +z. Each generation has its own materials and gear: pedal
 * crank (wood), rope bands (logs), rivets and a steam stack (iron), thrusters (jet).
 */
export function bird(p: Parts, gen: ShipId, docked: boolean): void {
  const look = SHIP_LOOKS[gen];
  const y = 0.46;
  if (docked)
    rig(p, 'ship', [0, 0.16, 0], { kind: 'breathe', amount: 0.03, speed: 1.4, ambient: true });
  const body = docked ? 'ship' : undefined;
  p.push([sphere(12, 8), look.hull, m(0, y, 0, 0.29, 0.26, 0.38), body]);
  // Head, beak and eyes.
  p.push([sphere(10, 7), look.hull, m(0, y + 0.13, 0.3, 0.14, 0.13, 0.14), body]);
  p.push([cone(8), '#e2c992', m(0, y + 0.07, 0.6, 0.035, 0.36, 0.035, Math.PI / 2 + 0.35), body]);
  for (const side of [-1, 1])
    p.push([sphere(6, 4), C.seed, m(side * 0.09, y + 0.17, 0.39, 0.025, 0.025, 0.025), body]);
  // Folded legs.
  for (const side of [-1, 1])
    p.push([cyl(5), '#c9a36a', m(side * 0.1, y - 0.24, 0.02, 0.025, 0.16, 0.025, 1.1), body]);
  // Tail tuft.
  p.push([cone(6), look.trim, m(0, y + 0.02, -0.4, 0.08, 0.14, 0.06, -Math.PI / 2 - 0.3), body]);
  if (gen === 'wood') {
    // Pedal crank on the flank.
    for (const side of [-1, 1])
      p.push([
        new TorusGeometry(0.07, 0.015, 4, 10),
        look.trim,
        m(side * 0.29, y - 0.05, 0, 1, 1, 1, 0, Math.PI / 2),
        body,
      ]);
  } else if (gen === 'logs') {
    for (const z of [-0.16, 0.12])
      p.push([new TorusGeometry(0.27, 0.018, 4, 16), look.trim, m(0, y, z, 1, 0.95, 1), body]);
  } else if (gen === 'iron') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.push([
        sphere(4, 3),
        look.trim,
        m(Math.cos(a) * 0.29, y + Math.sin(a) * 0.25, 0.02, 0.02, 0.02, 0.02),
        body,
      ]);
    }
    p.push([cyl(8), look.trim, m(0, y + 0.3, -0.1, 0.045, 0.16, 0.045), body]);
    emitter(p, { kind: 'smoke', at: [0, y + 0.4, -0.1], rate: 0.6, ambient: true });
  } else {
    for (const side of [-1, 1])
      p.push([
        cone(8),
        C.flagGold,
        m(side * 0.12, y - 0.04, -0.44, 0.07, 0.14, 0.07, -Math.PI / 2),
        body,
      ]);
  }
  // Wings: canvas (or plates) on a frame, hinged at the shoulders.
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'wingL' : 'wingR';
    const sx = side * 0.26;
    rig(p, name, [sx, y + 0.08, 0], {
      kind: 'swing',
      axis: 'z',
      amount: side * 0.22,
      speed: 0.9,
      ambient: true,
    });
    p.push([
      box(),
      look.wing,
      m(sx + side * 0.22, y + 0.08, -0.02, 0.44, 0.025, 0.26, 0, side * 0.12),
      name,
    ]);
    p.push([
      box(),
      look.trim,
      m(sx + side * 0.22, y + 0.095, 0.1, 0.46, 0.03, 0.03, 0, side * 0.12),
      name,
    ]);
    if (gen === 'wood' || gen === 'logs')
      for (const k of [0.12, 0.3])
        p.push([box(), look.trim, m(sx + side * k, y + 0.095, -0.02, 0.02, 0.03, 0.24), name]);
  }
}

/** Launch platform; the mechanical kiwi bird is drawn only while it is docked. */
function launchpad(level: number, age = 0, docked = true): Parts {
  const p: Parts = [];
  const s = 0.9 + level * 0.08;
  p.push([cyl(14), C.wood, m(0, 0.06, 0, 0.62 * s, 0.12, 0.62 * s)]);
  p.push([cyl(14), C.straw, m(0, 0.13, 0, 0.5 * s, 0.02, 0.5 * s)]);
  // Launch tower.
  p.push([box(), C.woodDark, m(-0.5 * s, 0.55, -0.1, 0.06, 1.0, 0.06)]);
  p.push([box(), C.woodDark, m(-0.5 * s, 0.55, 0.12, 0.06, 1.0, 0.06)]);
  for (const y of [0.35, 0.7]) p.push([box(), C.wood, m(-0.42 * s, y, 0.01, 0.2, 0.04, 0.26)]);
  if (docked) bird(p, shipIdForAge(age), true);
  if (level >= 2) {
    // Chantier 11: a striped windsock for the pilots.
    p.push([cyl(5), C.woodDark, m(0.52, 0.45, -0.38, 0.02, 0.9, 0.02)]);
    rig(p, 'sock', [0.52, 0.86, -0.38], {
      kind: 'swing',
      axis: 'y',
      amount: 0.5,
      speed: 1.4,
      ambient: true,
    });
    p.push([cone(8), C.roof, m(0.62, 0.86, -0.38, 0.06, 0.2, 0.06, 0, 0, Math.PI / 2), 'sock']);
    p.push([cone(8), C.white, m(0.68, 0.86, -0.38, 0.045, 0.08, 0.045, 0, 0, Math.PI / 2), 'sock']);
  }
  if (level >= 3) {
    p.push([box(), C.woodDark, m(-0.5 * s, 1.2, 0.01, 0.06, 0.3, 0.28)]);
    p.push([sphere(8, 6), C.flagGold, m(-0.5 * s, 1.4, 0.01, 0.08, 0.08, 0.08)]);
    emitter(p, { kind: 'gold', at: [-0.5 * s, 1.45, 0.01], rate: 0.8, ambient: true });
    for (let i = 0; i < 3; i++)
      p.push([cyl(8), i === 1 ? C.roof : C.wood, m(0.3 + i * 0.13, 0.2, 0.5, 0.06, 0.16, 0.06)]);
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
    // Chantier 11: a big archery target, readable from afar.
    p.push([box(), C.woodDark, m(0.5 * s, 0.22, -0.3, 0.03, 0.44, 0.03, 0.2, 0, 0)]);
    p.push([cyl(12), C.white, m(0.5 * s, 0.38, -0.27, 0.16, 0.03, 0.16, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.roof, m(0.5 * s, 0.38, -0.25, 0.1, 0.03, 0.1, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.flagGold, m(0.5 * s, 0.38, -0.24, 0.04, 0.03, 0.04, Math.PI / 2 + 0.2)]);
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

/** Chantier 06: crossbow tower on the skin rampart, loaded with seeds (anti-ferret). */
function seedTurret(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const h = 0.34 + level * 0.1;
  p.push([cyl(8), C.wood, m(0, h / 2, 0, 0.3 * s, h, 0.3 * s)]);
  p.push([cyl(8), C.woodDark, m(0, h + 0.03, 0, 0.36 * s, 0.06, 0.36 * s)]);
  // Crenels.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push([
      box(),
      C.woodDark,
      m(Math.cos(a) * 0.3 * s, h + 0.1, Math.sin(a) * 0.3 * s, 0.09, 0.09, 0.09, 0, -a, 0),
    ]);
  }
  // The crossbow turns slowly, watching the land below.
  const y = h + 0.16;
  rig(p, 'bow', [0, y, 0], { kind: 'swing', axis: 'y', amount: 0.8, speed: 0.7, ambient: true });
  p.push([box(), C.wood, m(0, y, 0.04, 0.08, 0.08, 0.46), 'bow']);
  p.push([box(), C.woodDark, m(0, y + 0.02, 0.2, 0.5 * s, 0.04, 0.05, 0, 0, 0), 'bow']);
  p.push([cyl(4), C.straw, m(0, y + 0.02, 0.12, 0.006, 0.006, 0.18, Math.PI / 2, 0, 0), 'bow']);
  p.push([sphere(6, 5), C.seed, m(0, y + 0.06, 0.02, 0.05, 0.035, 0.07), 'bow']);
  if (level >= 2) {
    // Chantier 11: big red shield plates bolted on the tower.
    for (const a of [0.7, -0.7, Math.PI])
      p.push([
        box(),
        C.roof,
        m(Math.sin(a) * 0.32 * s, h * 0.55, Math.cos(a) * 0.32 * s, 0.24, 0.28, 0.04, 0, a, 0),
      ]);
  }
  if (level >= 3) {
    p.push([cyl(8), C.stone, m(0, 0.07, 0, 0.42 * s, 0.14, 0.42 * s)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      p.push([
        cone(4),
        C.woodDark,
        m(
          Math.cos(a) * 0.45 * s,
          0.18,
          Math.sin(a) * 0.45 * s,
          0.03,
          0.18,
          0.03,
          0.5 * Math.sin(a),
          0,
          -0.5 * Math.cos(a),
        ),
      ]);
    }
  }
  // Seed pile at the foot.
  for (let i = 0; i < 2 + level; i++)
    p.push([
      sphere(6, 5),
      C.seed,
      m(0.28 - i * 0.07, 0.04, 0.3 - (i % 2) * 0.06, 0.05, 0.035, 0.07, 0, i, 0),
    ]);
  flag(p, level, -0.32, h, -0.2);
  return p;
}

/** Sky sling: a slender tower firing seed bursts at the bats (anti-air). */
function skyTurret(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const h = 0.5 + level * 0.12;
  p.push([cyl(8), C.stoneDark, m(0, 0.06, 0, 0.32 * s, 0.12, 0.32 * s)]);
  p.push([cyl(8), C.stone, m(0, h / 2, 0, 0.18 * s, h, 0.18 * s)]);
  p.push([cyl(8), C.juice, m(0, h * 0.7, 0, 0.2 * s, 0.05, 0.2 * s)]);
  p.push([cyl(8), C.stoneDark, m(0, h + 0.02, 0, 0.26 * s, 0.05, 0.26 * s)]);
  // A sling basket pointed at the sky, turning round to follow the swarm.
  const y = h + 0.08;
  rig(p, 'sling', [0, y, 0], { kind: 'spin', axis: 'y', amount: 1, speed: 0.6, ambient: true });
  p.push([box(), C.woodDark, m(0, y + 0.12, 0, 0.05, 0.3, 0.05, 0.5, 0, 0), 'sling']);
  p.push([cone(6), C.wood, m(0, y + 0.3, 0.08, 0.09, 0.1, 0.09, Math.PI + 0.5, 0, 0), 'sling']);
  p.push([sphere(6, 5), C.seed, m(0, y + 0.3, 0.09, 0.05, 0.04, 0.05), 'sling']);
  if (level >= 2) {
    // Chantier 11: a wooden lookout ring halfway up and a basket of seeds at the foot.
    p.push([cyl(10), C.wood, m(0, h * 0.45, 0, 0.32 * s, 0.05, 0.32 * s)]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.push([
        box(),
        C.woodDark,
        m(Math.cos(a) * 0.3 * s, h * 0.45 + 0.07, Math.sin(a) * 0.3 * s, 0.03, 0.12, 0.03),
      ]);
    }
    p.push([cyl(9), C.straw, m(0.26, 0.12, 0.12, 0.12, 0.2, 0.12)]);
    for (let i = 0; i < 3; i++)
      p.push([sphere(6, 4), C.seed, m(0.23 + i * 0.04, 0.24, 0.12, 0.04, 0.03, 0.05, 0, i, 0)]);
  }
  if (level >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.8;
      p.push([
        box(),
        C.stoneDark,
        m(Math.cos(a) * 0.2 * s, h * 0.3, Math.sin(a) * 0.2 * s, 0.07, h * 0.6, 0.14, 0, -a, 0),
      ]);
    }
  }
  flag(p, level, 0.28, 0.1, -0.22);
  return p;
}

/**
 * Library (chantier 08): a round stone tower full of books. A star globe turns on its lectern
 * while the researchers work; level 2 adds a floor, level 3 an observatory dome and a telescope.
 */
function library(fullLevel: number): Parts {
  const p: Parts = [];
  const level = Math.min(3, fullLevel);
  const s = 0.85 + level * 0.08;
  const h = level >= 2 ? 0.62 : 0.42;
  p.push([cyl(12), C.stoneDark, m(0, 0.03, 0, 0.42 * s, 0.06, 0.42 * s)]);
  p.push([cyl(12), C.stone, m(0, h / 2 + 0.05, 0, 0.32 * s, h, 0.32 * s)]);
  if (level >= 2) p.push([cyl(12), C.stoneDark, m(0, 0.34, 0, 0.335 * s, 0.035, 0.335 * s)]);
  p.push([box(), C.door, m(0, 0.13, 0.3 * s, 0.12, 0.2, 0.03)]);
  // Arched windows with warm lamplight.
  for (const a of [0.9, -0.9, Math.PI]) {
    const wx = Math.sin(a) * 0.31 * s;
    const wz = Math.cos(a) * 0.31 * s;
    p.push([box(), C.goldEgg, m(wx, h * 0.62 + 0.05, wz, 0.07, 0.11, 0.02, 0, a, 0)]);
  }
  const top = h + 0.05;
  if (level >= 3) {
    p.push([sphere(12, 6), C.flagBlue, m(0, top, 0, 0.3 * s, 0.22 * s, 0.3 * s)]);
    // Telescope sweeping the sky.
    rig(p, 'scope', [0, top + 0.12, 0], { kind: 'swing', axis: 'y', amount: 0.8, speed: 0.6 });
    p.push([cyl(8), C.woodDark, m(0.1, top + 0.2, 0, 0.035, 0.32, 0.035, 0, 0, -0.9), 'scope']);
    p.push([cyl(8), C.flagGold, m(0.22, top + 0.29, 0, 0.045, 0.05, 0.045, 0, 0, -0.9), 'scope']);
  } else {
    p.push([cone(12), C.roof, m(0, top + 0.16, 0, 0.38 * s, 0.32, 0.38 * s)]);
  }
  // Book stacks by the door.
  const books = [C.roof, C.flagBlue, C.leafDark, C.flagGold];
  for (let i = 0; i < level + 1; i++) {
    p.push([
      box(),
      books[i % books.length]!,
      m(0.36 * s, 0.03 + i * 0.05, 0.22, 0.14, 0.045, 0.1, 0, i * 0.35, 0),
    ]);
  }
  // Star globe on a lectern: turns while the kiwis study.
  const gx = -0.4 * s;
  const gz = 0.2;
  p.push([cyl(6), C.woodDark, m(gx, 0.12, gz, 0.025, 0.24, 0.025)]);
  rig(p, 'globe', [gx, 0.3, gz], { kind: 'spin', axis: 'y', amount: 1, speed: 1.2 });
  p.push([sphere(8, 6), C.flagBlue, m(gx, 0.3, gz, 0.08, 0.08, 0.08), 'globe']);
  p.push([
    new TorusGeometry(1, 0.08, 4, 14),
    C.flagGold,
    m(gx, 0.3, gz, 0.095, 0.095, 0.095, 1.1),
    'globe',
  ]);
  emitter(p, { kind: 'gold', at: [gx, 0.4, gz], rate: 0.8 });
  flag(p, level, 0.3, top - 0.05, -0.25);
  if (fullLevel >= 4) {
    // The laboratory: a vat of glowing juice bubbling away, fed by copper pipes.
    const vx = 0.05;
    const vz = -0.42;
    p.push([cyl(10), C.ironDark, m(vx, 0.12, vz, 0.17, 0.24, 0.17)]);
    p.push([cyl(10), C.juice, m(vx, 0.25, vz, 0.15, 0.03, 0.15)]);
    p.push([cyl(6), C.fire, m(vx + 0.18, 0.35, vz + 0.1, 0.02, 0.5, 0.02, 0, 0, 0.5)]);
    rig(p, 'brew', [vx, 0.3, vz], { kind: 'bob', amount: 0.02, speed: 3 });
    p.push([sphere(6, 4), C.juice, m(vx + 0.04, 0.3, vz, 0.04, 0.04, 0.04), 'brew']);
    emitter(p, { kind: 'juice', at: [vx, 0.32, vz], rate: 2 });
    if (fullLevel >= 5) {
      // Glass flasks on a shelf.
      for (let i = 0; i < 3; i++)
        p.push([sphere(6, 5), C.juice, m(-0.2 + i * 0.09, 0.08, -0.4, 0.04, 0.05, 0.04)]);
    }
    if (fullLevel >= 6) {
      // A lightning rod: the juice crackles.
      p.push([cyl(6), C.iron, m(0, top + 0.35, 0, 0.015, 0.5, 0.015)]);
      emitter(p, { kind: 'spark', at: [0, top + 0.6, 0], rate: 1.5, ambient: true });
    }
  }
  return p;
}

/**
 * Laboratory against nature (chantier 08): glass vats of glowing juice on an iron platform,
 * copper pipes, a crackling lightning rod; a dark shape floats in the main vat. More vats and a
 * taller coil with each level.
 */
function lab(level: number): Parts {
  const p: Parts = [];
  p.push([cyl(8), C.ironDark, m(0, 0.04, 0, 0.6, 0.08, 0.6)]);
  p.push([box(), C.brick, m(-0.18, 0.28, -0.22, 0.42, 0.42, 0.3)]);
  p.push([cone(4), C.ironDark, m(-0.18, 0.58, -0.22, 0.36, 0.2, 0.28, 0, Math.PI / 4, 0)]);
  p.push([box(), C.door, m(-0.18, 0.16, -0.06, 0.12, 0.2, 0.03)]);
  // The main vat: a glass column of juice with iron hoops and a floating silhouette.
  const vx = 0.22;
  const vz = 0.12;
  p.push([cyl(10), C.ironDark, m(vx, 0.12, vz, 0.2, 0.08, 0.2)]);
  p.push([cyl(10), C.juice, m(vx, 0.4, vz, 0.16, 0.5, 0.16)]);
  for (const y of [0.2, 0.62])
    p.push([
      new TorusGeometry(1, 0.12, 4, 12),
      C.iron,
      m(vx, y, vz, 0.165, 0.165, 0.165, Math.PI / 2),
    ]);
  p.push([cyl(10), C.ironDark, m(vx, 0.68, vz, 0.18, 0.05, 0.18)]);
  rig(p, 'floater', [vx, 0.42, vz], { kind: 'bob', amount: 0.03, speed: 1.4, ambient: true });
  p.push([sphere(8, 6), C.leafDark, m(vx, 0.42, vz, 0.07, 0.09, 0.07), 'floater']);
  emitter(p, { kind: 'juice', at: [vx, 0.68, vz], rate: 1.6, ambient: true });
  // Smaller vats around it.
  const extra = Math.min(3, level) - 1;
  for (let i = 0; i < extra; i++) {
    const a = -0.4 + i * 1.1;
    const x = vx + Math.cos(a) * 0.32;
    const z = vz + Math.sin(a) * 0.32 + 0.05;
    p.push([cyl(8), C.ironDark, m(x, 0.1, z, 0.1, 0.06, 0.1)]);
    p.push([cyl(8), C.juice, m(x, 0.26, z, 0.08, 0.28, 0.08)]);
  }
  // Copper pipes from the house to the vat.
  p.push([cyl(6), C.fire, m(0.02, 0.5, -0.04, 0.025, 0.36, 0.025, 0, 0, 1.2)]);
  p.push([cyl(6), C.fire, m(0.05, 0.3, -0.02, 0.025, 0.3, 0.025, 0, 0, 1.4)]);
  // The lightning rod and its coil.
  const rodH = 0.55 + level * 0.12;
  p.push([cyl(6), C.iron, m(-0.38, 0.1 + rodH / 2, 0.22, 0.02, rodH, 0.02)]);
  rig(p, 'coil', [-0.38, 0.2 + rodH * 0.6, 0.22], {
    kind: 'spin',
    axis: 'y',
    amount: 1,
    speed: 2,
    ambient: true,
  });
  p.push([
    new TorusGeometry(1, 0.2, 4, 10),
    C.flagGold,
    m(-0.38, 0.2 + rodH * 0.6, 0.22, 0.08, 0.08, 0.08, Math.PI / 2),
    'coil',
  ]);
  emitter(p, {
    kind: 'spark',
    at: [-0.38, 0.12 + rodH, 0.22],
    rate: 1 + level * 0.5,
    ambient: true,
  });
  return p;
}

/**
 * Monument (chantier 08), one level per age: a ring of standing stones (Stone age), a forge
 * and iron bands (Iron age), then a clock tower with turning gears and steam (Industry).
 */
function monument(level: number): Parts {
  const p: Parts = [];
  p.push([cyl(14), C.stoneDark, m(0, 0.03, 0, 0.62, 0.06, 0.62)]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const h = 0.32 + (i % 2) * 0.08;
    p.push([
      box(),
      C.stone,
      m(Math.cos(a) * 0.5, h / 2 + 0.05, Math.sin(a) * 0.5, 0.1, h, 0.08, 0, -a, 0.05),
    ]);
  }
  // The great menhir with a carved kiwi and a juice-green glow.
  p.push([box(), C.stone, m(0, 0.45, 0, 0.2, 0.8, 0.16, 0, 0.2, 0)]);
  p.push([cone(4), C.stone, m(0, 0.92, 0, 0.13, 0.16, 0.1, 0, Math.PI / 4 + 0.2, 0)]);
  p.push([sphere(8, 6), C.juice, m(0.03, 0.55, 0.08, 0.05, 0.05, 0.02)]);
  emitter(p, { kind: 'gold', at: [0, 0.7, 0.1], rate: 0.6, ambient: true });
  if (level >= 2) {
    for (const y of [0.25, 0.65])
      p.push([cyl(10), C.ironDark, m(0, y, 0, 0.16, 0.04, 0.13, 0, 0.2, 0)]);
    // Forge with a living fire and an anvil.
    p.push([box(), C.brick, m(-0.32, 0.14, 0.28, 0.24, 0.2, 0.2)]);
    rig(p, 'fire', [-0.32, 0.26, 0.28], { kind: 'flicker', amount: 0.25, speed: 4, ambient: true });
    p.push([cone(6), C.fire, m(-0.32, 0.3, 0.28, 0.08, 0.12, 0.08), 'fire']);
    emitter(p, { kind: 'spark', at: [-0.32, 0.36, 0.28], rate: 1.5, ambient: true });
    p.push([box(), C.iron, m(0.3, 0.12, 0.3, 0.16, 0.06, 0.08)]);
    p.push([box(), C.ironDark, m(0.3, 0.06, 0.3, 0.06, 0.08, 0.06)]);
  }
  if (level >= 3) {
    // Clock tower with a turning gear and a smoking chimney.
    const tx = 0.32;
    const tz = -0.3;
    p.push([box(), C.brick, m(tx, 0.45, tz, 0.2, 0.8, 0.2)]);
    p.push([cone(4), C.ironDark, m(tx, 0.98, tz, 0.18, 0.26, 0.18, 0, Math.PI / 4, 0)]);
    p.push([cyl(12), C.white, m(tx, 0.68, tz + 0.105, 0.07, 0.01, 0.07, Math.PI / 2)]);
    rig(p, 'gear', [tx - 0.105, 0.45, tz], {
      kind: 'spin',
      axis: 'x',
      amount: 1,
      speed: 0.8,
      ambient: true,
    });
    p.push([
      new TorusGeometry(1, 0.35, 4, 8),
      C.iron,
      m(tx - 0.105, 0.45, tz, 0.07, 0.07, 0.07, 0, Math.PI / 2, 0),
      'gear',
    ]);
    p.push([cyl(8), C.ironDark, m(-0.3, 0.5, -0.32, 0.05, 0.9, 0.05)]);
    emitter(p, { kind: 'smoke', at: [-0.3, 0.98, -0.32], rate: 1.2, ambient: true });
  }
  return p;
}

const BUILDERS: Record<BuildingType, (level: number, age: number) => Parts> = {
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
  library,
  monument,
  lab,
  seedTurret,
  skyTurret,
};

const cache = new Map<string, BufferGeometry>();
const models = new Map<string, BuildingModel>();

function partsOf(type: BuildingType, level: number, shipAway: boolean, age: number): Parts {
  const lvl = Math.max(1, Math.min(3, level));
  const p =
    type === 'launchpad' && shipAway
      ? launchpad(lvl, age, false)
      : BUILDERS[type](type === 'library' ? level : lvl, age);
  if (level > 3) grow(p, level);
  if (type !== 'camp' && type !== 'monument') dress(p, type, age);
  return p;
}

/** Levels 4–6 (chantier 08): the level-3 model, a little bigger, with gold studs. */
function grow(p: Parts, level: number): void {
  const k = 1 + 0.08 * (level - 3);
  const scale = new Matrix4().makeScale(k, k, k);
  for (const part of p) part[2] = part[2].clone().premultiply(scale);
  for (const r of p.rigs ?? []) r.pivot.multiplyScalar(k);
  for (const e of p.emitters ?? []) e.at = [e.at[0] * k, e.at[1] * k, e.at[2] * k];
  for (let i = 0; i < level - 3; i++) {
    const a = Math.PI * 0.75 + i * 0.35;
    p.push([
      sphere(6, 4),
      C.flagGold,
      m(Math.sin(a) * 0.52, 0.06, Math.cos(a) * 0.52, 0.04, 0.04, 0.04),
    ]);
  }
  // Chantier 11: a banner pole with one golden pennant per level above 3, seen from afar.
  const x = 0.5;
  const z = -0.45;
  p.push([cyl(5), C.woodDark, m(x, 0.55, z, 0.02, 1.1, 0.02)]);
  p.push([sphere(6, 4), C.flagGold, m(x, 1.12, z, 0.035, 0.035, 0.035)]);
  for (let i = 0; i < level - 3; i++)
    p.push([
      cone(4),
      C.flagGold,
      m(x + 0.09, 1.0 - i * 0.16, z, 0.05, 0.16, 0.02, 0, 0, -Math.PI / 2),
    ]);
}

/** Colours that change with the age: red tiles turn to slate (Iron), then to sheet metal. */
const AGE_COLORS: readonly Partial<Record<string, string>>[] = [
  {},
  {},
  { [C.roof]: '#6f7c86', [C.roofDark]: '#55616a', [C.wood]: '#93704f' },
  { [C.roof]: '#8a949b', [C.roofDark]: '#6a747b', [C.wood]: '#8a6a50', [C.cream]: '#e6d6bf' },
];

/**
 * The village changes with the age (chantier 08): a stone plinth (Stone age), an iron lantern
 * and slate roofs (Iron age), a smoking brick chimney and metal roofs (Industrial age).
 */
function dress(p: Parts, type: BuildingType, age: number): void {
  if (age <= 0) return;
  const colors = AGE_COLORS[Math.min(age, AGE_COLORS.length - 1)]!;
  for (const part of p) part[1] = colors[part[1]] ?? part[1];
  const turret = type === 'seedTurret' || type === 'skyTurret';
  p.push([cyl(6), C.stoneDark, m(0, 0.012, 0, 0.6, 0.024, 0.6)]);
  if (age >= 2 && !turret) {
    const x = -0.5;
    const z = 0.38;
    p.push([cyl(5), C.ironDark, m(x, 0.2, z, 0.018, 0.4, 0.018)]);
    p.push([box(), C.iron, m(x, 0.42, z, 0.07, 0.07, 0.07)]);
    rig(p, `lamp${age}`, [x, 0.42, z], { kind: 'flicker', amount: 0.15, speed: 3, ambient: true });
    p.push([sphere(5, 4), C.fire, m(x, 0.42, z, 0.035, 0.035, 0.035), `lamp${age}`]);
  }
  if (age >= 3 && !turret && type !== 'nest') {
    const x = -0.38;
    const z = -0.42;
    p.push([box(), C.brick, m(x, 0.3, z, 0.1, 0.6, 0.1)]);
    p.push([box(), C.ironDark, m(x, 0.61, z, 0.12, 0.03, 0.12)]);
    emitter(p, { kind: 'smoke', at: [x, 0.66, z], rate: 0.7, ambient: true });
  }
}

/** The whole model merged in its rest pose (construction ghosts). */
export function buildingGeometry(
  type: BuildingType,
  level: number,
  shipAway = false,
  age = 0,
): BufferGeometry {
  const key = `${type}:${level}:${age}${shipAway ? ':away' : ''}`;
  let g = cache.get(key);
  if (!g) {
    g = bake(partsOf(type, level, shipAway, age));
    cache.set(key, g);
  }
  return g;
}

/** Static geometry plus the animated rigs of a building. */
export function buildingModel(
  type: BuildingType,
  level: number,
  shipAway = false,
  age = 0,
): BuildingModel {
  const key = `${type}:${level}:${age}${shipAway ? ':away' : ''}`;
  let model = models.get(key);
  if (!model) {
    model = modelOf(partsOf(type, level, shipAway, age));
    models.set(key, model);
  }
  return model;
}

/** The flying mechanical bird of a ship generation (wings as rigs, centred on its body). */
export function shipModel(gen: ShipId): BuildingModel {
  const key = `ship:${gen}`;
  let model = models.get(key);
  if (!model) {
    const p: Parts = [];
    bird(p, gen, false);
    model = modelOf(p);
    models.set(key, model);
  }
  return model;
}

function modelOf(parts: Parts): BuildingModel {
  const geometry = bake(parts.filter((part) => !part[3]));
  const used = (parts.rigs ?? []).filter((r) => parts.some((part) => part[3] === r.name));
  const rigs = used.map((r) => ({
    geometry: bake(
      parts.filter((part) => part[3] === r.name),
      r.pivot,
    ),
    pivot: r.pivot.clone().multiplyScalar(MODEL_SCALE),
    motion: r.motion,
  }));
  const whole = bake(parts);
  const height = whole.boundingBox!.max.y;
  whole.dispose();
  const rigNames = used.map((r) => r.name);
  const emitters = (parts.emitters ?? []).map((e) => ({
    kind: e.kind,
    at: new Vector3(...e.at).multiplyScalar(MODEL_SCALE),
    rate: e.rate ?? 0,
    rig: e.rig ? rigNames.indexOf(e.rig) : -1,
    count: e.count ?? 1,
    phase: e.phase ?? 0,
    ambient: e.ambient ?? false,
  }));
  return { geometry, rigs, emitters, height };
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
