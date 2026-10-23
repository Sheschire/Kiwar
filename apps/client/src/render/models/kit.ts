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
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ParticleKind } from '../particles';

/**
 * Procedural low-poly building models. Each model is assembled from primitives with vertex
 * colours. Static parts are merged into one geometry (one draw call per building); moving parts
 * ("rigs": a press, a wheel, windmill sails…) are merged per rig around their pivot so the view
 * can animate them. Everything is cached per type and level.
 */

export const C = {
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
  // Chantier 17: one signature colour per family, the same as its interface icon.
  /** Production: the colour of the resource. */
  fiberRoof: '#8fb07a',
  fiberRoofDark: '#6c8d5a',
  seedRoof: '#b8862f',
  seedRoofDark: '#8a6222',
  juiceRoof: '#a9cc2c',
  juiceRoofDark: '#7f9c1d',
  /** Storage: dark wood under slate. */
  storeWood: '#6e4a2f',
  slate: '#5f6e7c',
  slateDark: '#46525d',
  /** Knowledge: stone and blue. */
  blueRoof: '#4f80c6',
  blueRoofDark: '#3a619b',
  /** Defense: grey stone and iron. */
  guardStone: '#aeaba3',
  guardStoneDark: '#85827b',
  /** Ship: light wood and copper. */
  lightWood: '#d2ab78',
  copper: '#c47a43',
} as const;

/** Geometry, colour, transform, and the rig it belongs to (none = static). */
export type Part = [BufferGeometry, string, Matrix4, (string | undefined)?];

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

export interface RigDef {
  name: string;
  pivot: Vector3;
  motion: RigMotion;
}

/**
 * Particles of a building: either a steady `rate` (per second at full activity), or a burst of
 * `count` each time the rig `rig` passes `phase` (the press hits the pulp, the hammer falls…).
 */
export interface EmitterDef {
  kind: ParticleKind;
  at: [number, number, number];
  rate?: number;
  rig?: string;
  count?: number;
  phase?: number;
  ambient?: boolean;
}

/** Parts plus the rigs, particle emitters and sign (chantier 17) they declare. */
export type Parts = Part[] & {
  rigs?: RigDef[];
  emitters?: EmitterDef[];
  sign?: Vector3;
  /** The door parts, marked before the age recolours them (chantier 23: night lights). */
  doors?: Part[];
};

export function rig(
  p: Parts,
  name: string,
  pivot: [number, number, number],
  motion: RigMotion,
): void {
  (p.rigs ??= []).push({ name, pivot: new Vector3(...pivot), motion });
}

export function emitter(p: Parts, def: EmitterDef): void {
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
  /** Where the sign with the building's icon hangs (local space, scaled), if it has one. */
  sign: Vector3 | null;
  /**
   * Chantier 23: night lights, in local space (scaled), as matrices of a unit plane facing +z:
   * a warm pane over each door, and small windows on the wall beside it.
   */
  lights: { doors: Matrix4[]; windows: Matrix4[] };
}

/** Models are authored for a unit tile; this makes them read better from the default zoom. */
export const MODEL_SCALE = 1.3;

export function m(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(sx, sy, sz),
  );
}

export function bake(parts: Part[], offset?: Vector3): BufferGeometry {
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

export const box = () => new BoxGeometry(1, 1, 1);
export const cyl = (seg = 8) => new CylinderGeometry(1, 1, 1, seg);
export const cone = (seg = 8) => new ConeGeometry(1, 1, seg);
export const sphere = (w = 10, h = 7) => new SphereGeometry(1, w, h);
export const ico = () => new IcosahedronGeometry(1, 0);
export const roofPrism = () => new CylinderGeometry(1, 1, 1, 3); // triangular prism lying down

export function flag(parts: Parts, level: number, x: number, y: number, z: number): void {
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
