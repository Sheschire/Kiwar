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

/**
 * Procedural low-poly building models. Each model is assembled from primitives with vertex
 * colours and merged into a single geometry (one draw call per building), cached per level.
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

type Part = [BufferGeometry, string, Matrix4];

/** Models are authored for a unit tile; this makes them read better from the default zoom. */
const MODEL_SCALE = 1.3;

function m(x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): Matrix4 {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(sx, sy, sz),
  );
}

function bake(parts: Part[]): BufferGeometry {
  const prepared = parts.map(([geo, color, matrix]) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
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

function flag(parts: Part[], level: number, x: number, y: number, z: number): void {
  if (level < 2) return;
  parts.push([cyl(5), C.woodDark, m(x, y + 0.3, z, 0.02, 0.6, 0.02)]);
  parts.push([
    box(),
    level >= 3 ? C.flagGold : C.flagBlue,
    m(x + 0.1, y + 0.52, z, 0.2, 0.12, 0.015),
  ]);
}

function nest(level: number): Part[] {
  const p: Part[] = [];
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
    p.push([
      sphere(),
      gold ? C.goldEgg : C.egg,
      m(Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2, 0.13, 0.17, 0.13),
    ]);
  }
  if (level >= 2) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.push([
        cone(4),
        C.twig,
        m(Math.cos(a) * 0.62 * s, 0.38, Math.sin(a) * 0.62 * s, 0.05, 0.35, 0.05, 0, 0, 0),
      ]);
    }
  }
  if (level >= 3) {
    p.push([new TorusGeometry(0.28, 0.1, 6, 12), C.straw, m(0, 0.5, 0, 1, 1, 1, Math.PI / 2)]);
  }
  flag(p, level, 0.6 * s, 0.25, -0.2);
  return p;
}

function pulpery(level: number): Part[] {
  const p: Part[] = [];
  const s = 0.85 + level * 0.1;
  p.push([cyl(10), C.cream, m(0, 0.2 * s, 0, 0.36 * s, 0.4 * s, 0.36 * s)]);
  p.push([cone(10), C.leaf, m(0, 0.6 * s, 0, 0.5 * s, 0.42 * s, 0.5 * s)]);
  p.push([sphere(6, 4), C.leafDark, m(0, 0.84 * s, 0, 0.07, 0.07, 0.07)]);
  p.push([box(), C.door, m(0, 0.13 * s, 0.35 * s, 0.14, 0.24 * s, 0.03)]);
  // Basket of pulp.
  p.push([cyl(8), C.wood, m(0.42, 0.07, 0.22, 0.14, 0.14, 0.14)]);
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

function fiberWorkshop(level: number): Part[] {
  const p: Part[] = [];
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
  if (level >= 2) spool(-0.45, 0.32);
  if (level >= 3) p.push([box(), C.stoneDark, m(0.2, 0.75 * s, -0.1, 0.1, 0.35, 0.1)]);
  flag(p, level, -0.4, 0.4, -0.25);
  return p;
}

function seedQuarry(level: number): Part[] {
  const p: Part[] = [];
  const s = 0.9 + level * 0.08;
  // Wooden A-frame with a pulley.
  p.push([box(), C.wood, m(-0.25, 0.4 * s, 0, 0.06, 0.85 * s, 0.06, 0, 0, 0.3)]);
  p.push([box(), C.wood, m(0.25, 0.4 * s, 0, 0.06, 0.85 * s, 0.06, 0, 0, -0.3)]);
  p.push([box(), C.woodDark, m(0, 0.78 * s, 0, 0.5, 0.06, 0.06)]);
  p.push([cyl(10), C.stoneDark, m(0, 0.62 * s, 0, 0.08, 0.06, 0.08, Math.PI / 2)]);
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

function juiceWell(level: number): Part[] {
  const p: Part[] = [];
  const s = 0.9 + level * 0.08;
  p.push([cyl(12), C.stone, m(0, 0.15, 0, 0.36 * s, 0.32, 0.36 * s)]);
  p.push([cyl(12), C.juice, m(0, 0.31, 0, 0.29 * s, 0.02, 0.29 * s)]);
  p.push([box(), C.wood, m(-0.3 * s, 0.5, 0, 0.05, 0.7, 0.05)]);
  p.push([box(), C.wood, m(0.3 * s, 0.5, 0, 0.05, 0.7, 0.05)]);
  p.push([cone(4), C.roof, m(0, 0.95, 0, 0.5 * s, 0.3, 0.42 * s, 0, Math.PI / 4)]);
  p.push([cyl(8), C.woodDark, m(0, 0.72, 0, 0.04, 0.6 * s, 0.04, 0, 0, Math.PI / 2)]);
  p.push([cyl(8), C.wood, m(0.05, 0.5, 0, 0.07, 0.1, 0.07)]);
  if (level >= 2) p.push([cyl(10), C.stoneDark, m(0, 0.32, 0, 0.38 * s, 0.04, 0.38 * s)]);
  if (level >= 3) p.push([sphere(8, 6), C.juice, m(0.45, 0.12, 0.2, 0.12, 0.12, 0.12)]);
  flag(p, level, 0.42, 0.3, -0.3);
  return p;
}

function hut(level: number): Part[] {
  const p: Part[] = [];
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
  if (level >= 3) dome(-0.42, -0.3, 0.6);
  p.push([sphere(6, 4), C.furDark, m(0, 0.45 * s, 0, 0.06, 0.06, 0.06)]);
  flag(p, level, 0.42, 0.05, 0.2);
  return p;
}

function warehouse(level: number): Part[] {
  const p: Part[] = [];
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
  if (level >= 3) {
    p.push([cyl(10), C.stone, m(-0.45, 0.35, -0.25, 0.16, 0.7, 0.16)]);
    p.push([cone(10), C.roofDark, m(-0.45, 0.8, -0.25, 0.2, 0.2, 0.2)]);
  }
  flag(p, level, -0.42, 0.1, 0.3);
  return p;
}

const BUILDERS: Record<BuildingType, (level: number) => Part[]> = {
  nest,
  pulpery,
  fiberWorkshop,
  seedQuarry,
  juiceWell,
  hut,
  warehouse,
};

const cache = new Map<string, BufferGeometry>();

export function buildingGeometry(type: BuildingType, level: number): BufferGeometry {
  const key = `${type}:${level}`;
  let g = cache.get(key);
  if (!g) {
    g = bake(BUILDERS[type](Math.max(1, Math.min(3, level))));
    cache.set(key, g);
  }
  return g;
}

/** Wooden scaffolding around a construction site. */
export function scaffoldGeometry(): BufferGeometry {
  let g = cache.get('scaffold');
  if (!g) {
    const p: Part[] = [];
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
