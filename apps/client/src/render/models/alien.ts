import type { BufferGeometry } from 'three';
import type { AlienBuildingKind } from '@kiwar/shared';
import { bake, box, C, cone, cyl, ico, m, sphere, type Parts } from './kit';
import { A, beam, byAge, cap, chimney, door, jit, round, wall } from './ageKit';

/**
 * Chantier 41: the buildings of the alien civilisation, drawn on the twin where our kiwis have
 * eyes (beacons, glimpses). Earth, bark and bone with violet cloth — never our families'
 * colours — over the materials of their age from the kit of chantier 33: a burrow of the Eden
 * age is a mound with a hole, the same burrow at the Industry age has a brick mouth and a
 * smoking pipe. One recipe per kind; `alienGeometry(kind, age)` is cached.
 */

const X = {
  earth: '#6b4a2e',
  earthDark: '#4f3521',
  bark: '#5b4636',
  bone: '#eadfc6',
  moss: '#5f7a3a',
  violet: '#6a4384',
  violetDark: '#45295a',
  hole: '#24160e',
  eye: '#f2d14e',
  gold: '#d6aa45',
} as const;

/** The wall colour of an age (earth, dry stone, plaster, brick). */
const wallOf = (age: number) => byAge(age, [X.earth, A.drystone, A.plaster, A.brick]);
/** Spikes and trims: bone, bone, iron, steel. */
const trimOf = (age: number) => byAge(age, [X.bone, X.bone, C.iron, A.steel]);

/** A pennant on a pole (violet, the civilisation's colour). */
function pennant(p: Parts, x: number, z: number, h: number, age: number): void {
  p.push([
    cyl(5),
    byAge(age, [X.bark, X.bark, C.ironDark, A.steel]),
    m(x, h / 2, z, 0.025, h, 0.025),
  ]);
  p.push([box(), X.violet, m(x + 0.11, h - 0.09, z, 0.2, 0.14, 0.012)]);
  p.push([box(), X.violetDark, m(x + 0.11, h - 0.15, z, 0.2, 0.025, 0.014)]);
}

/** A ring of bone spikes (or iron stakes) around (x, z). */
function spikes(
  p: Parts,
  x: number,
  z: number,
  r: number,
  n: number,
  h: number,
  age: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + jit(i, r) * 0.4;
    const sx = x + Math.sin(a) * r;
    const sz = z + Math.cos(a) * r;
    p.push([
      cone(5),
      trimOf(age),
      m(sx, h / 2, sz, 0.035, h, 0.035, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25),
    ]);
  }
}

/** Earth mound with a dark mouth facing +z: the ferrets' home. */
function burrow(p: Parts, age: number, scale = 1): void {
  const r = 0.42 * scale;
  p.push([
    sphere(10, 6),
    byAge(age, [X.earth, X.earth, X.earthDark, X.earthDark]),
    m(0, 0, 0, r, r * 0.75, r),
  ]);
  p.push([sphere(8, 5), X.moss, m(-0.12 * scale, r * 0.55, -0.08, r * 0.45, r * 0.22, r * 0.45)]);
  // The mouth: a hole, framed by the age.
  p.push([sphere(8, 5), X.hole, m(0, 0.08 * scale, r * 0.86, 0.15 * scale, 0.13 * scale, 0.07)]);
  if (age >= 1)
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + (i / 4) * 1.8;
      p.push([
        ico(),
        age === 1 ? A.drystone : wallOf(age),
        m(Math.sin(a) * 0.2 * scale, 0.05 + Math.cos(a) * 0.14 * scale, r * 0.88, 0.06, 0.05, 0.05),
      ]);
    }
  if (age >= 2)
    beam(
      p,
      A.beam,
      [-0.18 * scale, 0.26 * scale, r * 0.8],
      [0.18 * scale, 0.26 * scale, r * 0.8],
      0.04,
    );
  if (age >= 3) {
    p.push([cyl(6), A.steel, m(0.2 * scale, r * 0.75, -0.1, 0.035, 0.3, 0.035)]);
    p.push([cyl(6), A.brass, m(0.2 * scale, r * 0.75 + 0.15, -0.1, 0.05, 0.03, 0.05)]);
  }
}

/** A dead tree (later: a tower) with hanging cocoons: the bats' perch. */
function roost(p: Parts, age: number): void {
  const h = byAge(age, [1.1, 1.2, 1.35, 1.5]);
  if (age <= 1) {
    if (age === 1) round(p, 1, 0, 0.08, 0, 0.2, 0.16, A.drystone, 8);
    p.push([cyl(6), X.bark, m(0, h / 2, 0, 0.06, h, 0.06, 0, 0, 0.06)]);
    beam(p, X.bark, [0, h * 0.62, 0], [0.32, h * 0.86, 0.06], 0.04);
    beam(p, X.bark, [0, h * 0.48, 0], [-0.28, h * 0.7, -0.08], 0.035);
    beam(p, X.bark, [0, h * 0.8, 0], [-0.1, h + 0.12, 0.2], 0.03);
  } else {
    // A lattice tower of beams (Iron) or steel (Industry) under a violet hood.
    const post = age === 2 ? A.beam : A.steel;
    for (const [x, z] of [
      [-0.16, -0.16],
      [0.16, -0.16],
      [-0.16, 0.16],
      [0.16, 0.16],
    ] as const)
      beam(p, post, [x * 1.3, 0, z * 1.3], [x * 0.6, h, z * 0.6], 0.035);
    for (const k of [0.35, 0.7])
      p.push([box(), post, m(0, h * k, 0, 0.36 - k * 0.15, 0.03, 0.36 - k * 0.15)]);
    p.push([cone(6), X.violetDark, m(0, h + 0.12, 0, 0.2, 0.26, 0.2)]);
    beam(p, post, [0, h * 0.85, 0], [0.34, h * 0.85, 0.05], 0.03);
  }
  // Cocoons (sleeping bats) hanging from the branches.
  for (const [x, y, z] of [
    [0.3, h * 0.78, 0.06],
    [-0.26, h * 0.62, -0.08],
    [0.1, h * 0.5, 0.18],
  ] as const) {
    p.push([cyl(4), X.bark, m(x, y + 0.06, z, 0.006, 0.1, 0.006)]);
    p.push([sphere(6, 4), X.violetDark, m(x, y - 0.04, z, 0.06, 0.1, 0.06)]);
  }
}

/** A round hut with a fur roof, a work bench and tools: crafts of the age. */
function workshop(p: Parts, age: number): void {
  round(p, age, 0, 0.2, 0, 0.32, 0.4, X.earth, 10);
  cap(p, age, 0, 0.55, 0, 0.42, 0.34, X.earthDark, 10);
  door(p, age, 0, 0.14, 0.32, 0.14, 0.24);
  p.push([box(), X.bark, m(0.36, 0.12, 0.2, 0.2, 0.05, 0.14)]);
  p.push([box(), trimOf(age), m(0.36, 0.17, 0.2, 0.12, 0.04, 0.04, 0, 0.6, 0)]);
  if (age >= 1) chimney(p, age, -0.22, -0.18, 0.75);
  else p.push([sphere(6, 4), X.bone, m(-0.3, 0.06, 0.24, 0.07, 0.06, 0.07)]);
}

/** A carved pole of stacked heads (ferret faces), feathers on top. */
function totem(p: Parts, age: number): void {
  const blocks = byAge(age, [3, 3, 4, 4]);
  const wood = byAge(age, [X.bark, X.bark, A.beam, A.beam]);
  for (let i = 0; i < blocks; i++) {
    const y = 0.14 + i * 0.22;
    p.push([
      cyl(6),
      i % 2 ? wood : X.earthDark,
      m(0, y, 0, 0.13 - i * 0.008, 0.2, 0.13 - i * 0.008),
    ]);
    for (const side of [-1, 1])
      p.push([box(), X.eye, m(side * 0.05, y + 0.03, 0.12, 0.035, 0.03, 0.02)]);
    p.push([cone(4), X.bone, m(0, y - 0.04, 0.14, 0.03, 0.06, 0.03, Math.PI / 2, 0, 0)]);
  }
  const top = 0.14 + blocks * 0.22;
  for (let k = -1; k <= 1; k++)
    p.push([
      box(),
      k === 0 ? X.violet : X.violetDark,
      m(k * 0.07, top + 0.06, 0, 0.04, 0.22, 0.012, 0, 0, k * 0.4),
    ]);
  if (age >= 2)
    p.push([cyl(8), age === 2 ? C.iron : X.gold, m(0, top - 0.06, 0, 0.15, 0.03, 0.15)]);
  if (age >= 1) round(p, age, 0, 0.03, 0, 0.2, 0.06, X.earth, 8);
}

/** A long house behind a palisade, pennants on the roof: soldiers sleep here. */
function barracks(p: Parts, age: number): void {
  wall(p, age, 0, 0.2, 0, 0.7, 0.4, 0.42, X.earth);
  // A ridge roof of fur (two slabs).
  for (const side of [-1, 1])
    p.push([
      box(),
      byAge(age, [X.earthDark, X.earthDark, A.beam, A.steel]),
      m(0, 0.5, side * 0.12, 0.78, 0.04, 0.3, side * 0.62, 0, 0),
    ]);
  door(p, age, 0, 0.14, 0.215, 0.16, 0.24);
  pennant(p, -0.3, -0.1, 0.95, age);
  pennant(p, 0.3, -0.1, 0.95, age);
  for (let i = 0; i < 7; i++) {
    const x = -0.42 + i * 0.14;
    p.push([cone(4), trimOf(age), m(x, 0.12, 0.38, 0.03, 0.24, 0.03)]);
  }
  if (age >= 3) chimney(p, age, 0.32, -0.25, 0.8);
}

/** Heaps of sacks and barrels under a lean-to: their stores. */
function store(p: Parts, age: number): void {
  for (const [x, z, k] of [
    [-0.18, 0.08, 1],
    [0.12, 0.14, 0.9],
    [-0.02, -0.12, 1.1],
  ] as const)
    p.push([sphere(7, 5), X.bone, m(x, 0.1 * k, z, 0.15 * k, 0.12 * k, 0.15 * k)]);
  for (const [x, z] of [
    [0.28, -0.1],
    [0.3, 0.16],
  ] as const) {
    p.push([cyl(8), byAge(age, [X.bark, X.bark, A.beam, C.iron]), m(x, 0.13, z, 0.09, 0.26, 0.09)]);
    p.push([cyl(8), trimOf(age), m(x, 0.18, z, 0.095, 0.02, 0.095)]);
  }
  // A lean-to over the back of the heap, on two tall and two short posts.
  for (const [x, z, h] of [
    [-0.36, -0.34, 0.62],
    [0.4, -0.34, 0.62],
    [-0.36, 0.02, 0.46],
    [0.4, 0.02, 0.46],
  ] as const)
    p.push([
      cyl(5),
      byAge(age, [X.bark, X.bark, A.beam, A.steel]),
      m(x, h / 2, z, 0.025, h, 0.025),
    ]);
  p.push([
    box(),
    byAge(age, [X.earthDark, A.thatch, A.beam, A.steel]),
    m(0.02, 0.56, -0.16, 0.9, 0.04, 0.44, 0.4, 0, 0),
  ]);
  if (age >= 1) round(p, age, -0.1, 0.03, 0.02, 0.4, 0.06, X.earth, 10);
}

/** The queen's burrow: a great mound, bone crown, gold and violet banners. */
function royal(p: Parts, age: number): void {
  burrow(p, age, 1.55);
  spikes(p, 0, 0, 0.6, 9, 0.3, age);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + (i / 4) * 1.8;
    p.push([
      cone(5),
      X.gold,
      m(Math.sin(a) * 0.16, 0.5 + Math.cos(a) * 0.04, Math.cos(a) * 0.1 - 0.02, 0.04, 0.16, 0.04),
    ]);
  }
  pennant(p, -0.45, -0.2, 1.1, age);
  pennant(p, 0.45, -0.2, 1.1, age);
  if (age >= 2) round(p, age, 0, 0.05, 0, 0.66, 0.1, X.earth, 12);
}

const RECIPES: Record<AlienBuildingKind, (p: Parts, age: number) => void> = {
  burrow,
  roost,
  workshop,
  totem,
  barracks,
  store,
  royal,
};

const cache = new Map<string, BufferGeometry>();

/** The model of an alien building at an age (0 Eden … 3 Industry), baked with vertex colours. */
export function alienGeometry(kind: AlienBuildingKind, age: number): BufferGeometry {
  const a = Math.max(0, Math.min(3, Math.round(age)));
  const key = `${kind}/${a}`;
  let g = cache.get(key);
  if (!g) {
    const p: Parts = [];
    RECIPES[kind](p, a);
    g = bake(p);
    cache.set(key, g);
  }
  return g;
}
