import { Matrix4 } from 'three';
import { footprintOf, type BuildingType } from '@kiwar/shared';
import { C, box, cone, cyl, emitter, m, MODEL_SCALE, rig, sphere, type Parts } from './kit';
import { A, banner, byAge, door, gable, lamp, pipe, under, wall, type Look } from './ageKit';
import { trainingGrounds } from './training';
import { forgeYard } from './forge';
import { cabaretTerrace, townHallGarden } from './village';

/**
 * Chantier 35: big buildings drawn at the scale of their footprint. The recipe of the building
 * (one tile) grows at the centre, then each type dresses the other tiles with kit pieces in the
 * materials of its age: wings, a runway, vats, sheds, the monument's plaza.
 *
 * Local frame (see `footprintFrame`): a triangle's centre is the origin and its anchor — the
 * door — lies towards +z; the two other tiles are behind, left and right. The monument's
 * anchor is the centre, its six tiles at every 60° (the frame keeps a multiple of 60°).
 */

/** Distance between two tile centres in model units (models are authored for a unit tile). */
const STEP = Math.sqrt(3) / MODEL_SCALE;
/** Tile centres of a triangle footprint: the anchor (front), then back left and back right. */
export const TRIANGLE: readonly (readonly [number, number])[] = [
  [0, STEP / Math.sqrt(3)],
  [-STEP / 2, -STEP / (2 * Math.sqrt(3))],
  [STEP / 2, -STEP / (2 * Math.sqrt(3))],
];
/** Tile centres of the monument's hexagon: the centre, then the ring. */
export const HEXAGON: readonly (readonly [number, number])[] = [
  [0, 0],
  ...Array.from(
    { length: 6 },
    (_, k) => [STEP * Math.cos((k * Math.PI) / 3), STEP * Math.sin((k * Math.PI) / 3)] as const,
  ),
];
/** How much the one-tile recipe grows at the centre. */
const GROWTH: Record<3 | 7, number> = { 3: 1.3, 7: 1.85 };
/** A tile-sized hexagonal slab (radius in model units, just inside the tile). */
const SLAB = 0.7;

/** Scales every part, rig pivot, emitter and the sign about the origin. */
function scaleAll(p: Parts, k: number): void {
  const scale = new Matrix4().makeScale(k, k, k);
  for (const part of p) part[2] = part[2].clone().premultiply(scale);
  for (const r of p.rigs ?? []) r.pivot.multiplyScalar(k);
  for (const e of p.emitters ?? []) e.at = [e.at[0] * k, e.at[1] * k, e.at[2] * k];
  p.sign?.multiplyScalar(k);
}

/** The ground of a footprint: a slab under each tile, beaten earth then paving by age. */
function slabs(p: Parts, tiles: readonly (readonly [number, number])[], color: string): void {
  for (const [x, z] of tiles) p.push([cyl(6), color, m(x, 0.014, z, SLAB, 0.028, SLAB)]);
}

const groundOf = (age: number) => byAge(age, ['#cdb98f', A.drystoneDark, C.stoneDark, '#8f918d']);

/** Turn (around y) that makes a piece at (x, z) face the centre with its +z side. */
const facing = (x: number, z: number) => Math.atan2(-x, -z);

/** A small hall at (x, z) facing the centre: walls, a gable roof of the family, a door. */
function hall(
  p: Parts,
  look: Look,
  x: number,
  z: number,
  walls: string,
  roof: string,
  size = 1,
): void {
  const { age } = look;
  under(p, m(x, 0, z, size, size, size, 0, facing(x, z), 0), () => {
    wall(p, age, 0, 0.17, 0, 0.46, 0.34, 0.32, walls);
    gable(p, age, 0, 0.44, 0, 0.2, 0.54, 0.22, roof);
    door(p, age, 0, 0.11, 0.165, 0.11, 0.2);
  });
}

/** A paved walk from the centre to the anchor's door. */
function walk(p: Parts, age: number): void {
  const [x, z] = TRIANGLE[0]!;
  p.push([
    box(),
    byAge(age, [C.strawDark, A.drystone, C.stone, A.mortar]),
    m(x, 0.03, z - 0.05, 0.2, 0.012, 0.5),
  ]);
}

function library(p: Parts, look: Look): void {
  const { age } = look;
  // Two reading wings and a garden of clipped bushes by the door.
  for (const i of [1, 2]) {
    const [x, z] = TRIANGLE[i]!;
    hall(p, look, x, z, C.cream, C.blueRoof);
    // A row of book-blue windows.
    under(p, m(x, 0, z, 1, 1, 1, 0, facing(x, z), 0), () => {
      for (const dx of [-0.15, 0.15])
        p.push([box(), C.flagBlue, m(dx, 0.22, 0.165, 0.07, 0.09, 0.012)]);
    });
  }
  walk(p, age);
  const [fx, fz] = TRIANGLE[0]!;
  for (const side of [-1, 1]) {
    p.push([sphere(7, 5), C.leafDark, m(fx + side * 0.24, 0.1, fz, 0.1, 0.1, 0.1)]);
    p.push([cyl(6), C.woodDark, m(fx + side * 0.24, 0.02, fz, 0.06, 0.04, 0.06)]);
  }
  if (age >= 1) banner(p, look, fx + 0.34, 0.45, fz - 0.15);
}

function school(p: Parts, look: Look): void {
  const { age } = look;
  // A second classroom, and a training field with dummies behind a fence.
  const [lx, lz] = TRIANGLE[1]!;
  hall(p, look, lx, lz, C.cream, C.blueRoof);
  const [rx, rz] = TRIANGLE[2]!;
  p.push([cyl(10), C.strawDark, m(rx, 0.03, rz, 0.42, 0.02, 0.42)]);
  const fence = byAge(age, [C.wood, C.wood, A.beam, A.steel]);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.push([
      box(),
      fence,
      m(rx + Math.cos(a) * 0.45, 0.07, rz + Math.sin(a) * 0.45, 0.025, 0.14, 0.025),
    ]);
  }
  for (const [dx, dz] of [
    [-0.15, 0.08],
    [0.16, -0.1],
  ] as const) {
    p.push([cyl(5), C.woodDark, m(rx + dx, 0.17, rz + dz, 0.02, 0.34, 0.02)]);
    p.push([cyl(8), C.straw, m(rx + dx, 0.25, rz + dz, 0.065, 0.15, 0.065)]);
    p.push([sphere(6, 4), C.strawDark, m(rx + dx, 0.37, rz + dz, 0.055, 0.055, 0.055)]);
  }
  walk(p, age);
}

function warehouse(p: Parts, look: Look): void {
  const { age } = look;
  // A long shed behind, a stack of crates and sacks on the other side, a cart at the door.
  const [lx, lz] = TRIANGLE[1]!;
  hall(p, look, lx, lz, C.storeWood, C.slate, 1.1);
  const [rx, rz] = TRIANGLE[2]!;
  for (const [dx, dz, y, r] of [
    [-0.12, 0, 0.08, 0.2],
    [0.12, 0.05, 0.08, -0.1],
    [0, 0.02, 0.24, 0.4],
    [0.05, -0.22, 0.08, 0.7],
  ] as const)
    p.push([box(), C.storeWood, m(rx + dx, y, rz + dz, 0.16, 0.16, 0.16, 0, r)]);
  for (const [dx, dz] of [
    [-0.25, 0.2],
    [0.25, 0.22],
    [-0.28, -0.12],
  ] as const)
    p.push([sphere(7, 5), C.cream, m(rx + dx, 0.07, rz + dz, 0.1, 0.08, 0.09)]);
  const [fx, fz] = TRIANGLE[0]!;
  p.push([box(), C.wood, m(fx + 0.28, 0.12, fz - 0.05, 0.2, 0.08, 0.3)]);
  for (const side of [-1, 1])
    p.push([
      cyl(10),
      C.woodDark,
      m(fx + 0.28 + side * 0.11, 0.08, fz - 0.05, 0.08, 0.025, 0.08, 0, 0, Math.PI / 2),
    ]);
  walk(p, age);
}

function launchpad(p: Parts, look: Look): void {
  const { age } = look;
  // The runway: from the anchor across the pad to the back edge, lit on both sides.
  const [fx, fz] = TRIANGLE[0]!;
  const back = TRIANGLE[1]![1];
  const len = fz - back + 0.5;
  const mid = (fz + back) / 2;
  p.push([
    box(),
    byAge(age, [C.lightWood, A.drystone, C.stoneDark, '#8f918d']),
    m(fx, 0.03, mid, 0.42, 0.02, len),
  ]);
  for (let i = 0; i < 5; i++)
    p.push([box(), C.white, m(fx, 0.042, back - 0.15 + (i * len) / 5, 0.04, 0.006, 0.12)]);
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const z = back - 0.1 + (i * len) / 4;
      p.push([sphere(5, 4), C.flagGold, m(fx + side * 0.25, 0.06, z, 0.025, 0.025, 0.025)]);
    }
  emitter(p, { kind: 'gold', at: [fx, 0.12, fz], rate: 0.3, ambient: true });
  // A hangar for the bird and a windsock.
  const [lx, lz] = TRIANGLE[1]!;
  hall(p, look, lx - 0.08, lz, C.lightWood, C.copper, 1.15);
  const [rx, rz] = TRIANGLE[2]!;
  p.push([cyl(5), C.woodDark, m(rx + 0.1, 0.35, rz, 0.02, 0.7, 0.02)]);
  rig(p, 'sock', [rx + 0.1, 0.66, rz], {
    kind: 'swing',
    axis: 'y',
    amount: 0.6,
    speed: 0.8,
    ambient: true,
  });
  p.push([cone(8), C.fire, m(rx + 0.1, 0.62, rz + 0.12, 0.05, 0.22, 0.05, Math.PI / 2), 'sock']);
  p.push([
    cyl(8),
    byAge(age, [C.wood, C.wood, A.steel, A.steel]),
    m(rx - 0.15, 0.14, rz + 0.08, 0.1, 0.28, 0.1),
  ]);
}

function lab(p: Parts, look: Look): void {
  const { age } = look;
  // Two great vats of green juice piped to the main hall, and warning posts.
  for (const i of [1, 2]) {
    const [x, z] = TRIANGLE[i]!;
    p.push([cyl(12), A.steel, m(x, 0.04, z, 0.3, 0.08, 0.3)]);
    p.push([cyl(12), A.glass, m(x, 0.3, z, 0.24, 0.48, 0.24)]);
    p.push([cyl(12), C.juice, m(x, 0.24, z, 0.22, 0.34, 0.22)]);
    p.push([cyl(12), A.steel, m(x, 0.56, z, 0.26, 0.04, 0.26)]);
    rig(p, `vat${i}`, [x, 0.42, z], { kind: 'breathe', amount: 0.06, speed: 1.6, ambient: true });
    p.push([sphere(8, 6), C.juice, m(x, 0.42, z, 0.08, 0.08, 0.08), `vat${i}`]);
    pipe(p, [x * 0.5, 0.5, z * 0.5], [x, 0.56, z], A.steel, 0.03);
    emitter(p, { kind: 'smoke', at: [x, 0.62, z], rate: 0.3, ambient: true });
  }
  const [fx, fz] = TRIANGLE[0]!;
  for (const side of [-1, 1]) {
    p.push([box(), C.flagGold, m(fx + side * 0.3, 0.15, fz, 0.04, 0.3, 0.04)]);
    p.push([box(), C.seed, m(fx + side * 0.3, 0.22, fz, 0.045, 0.04, 0.045)]);
  }
  walk(p, age);
}

function monument(p: Parts, look: Look): void {
  const { age } = look;
  // The plaza: an obelisk on each tile of the ring, braziers by age, banners at the Iron age.
  for (let k = 1; k < HEXAGON.length; k++) {
    const [x, z] = HEXAGON[k]!;
    const tall = k % 2 === 0;
    const h = tall ? 0.7 : 0.5;
    p.push([box(), C.stone, m(x * 0.92, 0.06, z * 0.92, 0.22, 0.12, 0.22)]);
    p.push([box(), C.stone, m(x * 0.92, h / 2 + 0.1, z * 0.92, 0.12, h, 0.12, 0, k * 0.5, 0)]);
    p.push([
      cone(4),
      C.stone,
      m(x * 0.92, h + 0.16, z * 0.92, 0.09, 0.14, 0.09, 0, Math.PI / 4 + k * 0.5, 0),
    ]);
    if (!tall) {
      p.push([
        cyl(8),
        age >= 2 ? A.steel : C.woodDark,
        m(x * 0.6, 0.18, z * 0.6, 0.04, 0.36, 0.04),
      ]);
      p.push([cyl(8), C.ironDark, m(x * 0.6, 0.38, z * 0.6, 0.08, 0.05, 0.08)]);
      rig(p, `brazier${k}`, [x * 0.6, 0.45, z * 0.6], {
        kind: 'flicker',
        amount: 0.25,
        speed: 4,
        ambient: true,
      });
      p.push([cone(6), C.fire, m(x * 0.6, 0.46, z * 0.6, 0.06, 0.12, 0.06), `brazier${k}`]);
    } else if (age >= 2) banner(p, look, x * 0.75, 0.55, z * 0.75);
  }
  if (age >= 2)
    for (const k of [1, 4]) lamp(p, age, HEXAGON[k]![0] * 0.4, HEXAGON[k]![1] * 0.4, `plaza${k}`);
}

/** Chantier 37: the archery range behind on the left, the circle of spells on the right. */
function trainingCamp(p: Parts, look: Look): void {
  const out = (i: number) => [TRIANGLE[i]![0] * 1.12, TRIANGLE[i]![1] * 1.12] as const;
  trainingGrounds(p, look, out(1), out(2));
  walk(p, look.age);
}

/** Chantier 38: the coal pile behind on the left, the meteoric iron heap on the right. */
function forge(p: Parts, look: Look): void {
  const out = (i: number) => [TRIANGLE[i]![0] * 1.05, TRIANGLE[i]![1] * 1.05] as const;
  forgeYard(p, look, out(1), out(2));
  walk(p, look.age);
}

/** Chantier 43: the notice board behind on the left, the garden and its fountain on the right. */
function townHall(p: Parts, look: Look): void {
  const out = (i: number) => [TRIANGLE[i]![0] * 1.05, TRIANGLE[i]![1] * 1.05] as const;
  townHallGarden(p, look, out(1), out(2));
  walk(p, look.age);
}

/** Chantier 44: the terrace behind on the left, the poster column on the right. */
function cabaret(p: Parts, look: Look): void {
  const out = (i: number) => [TRIANGLE[i]![0] * 1.05, TRIANGLE[i]![1] * 1.05] as const;
  cabaretTerrace(p, look, out(1), out(2));
  walk(p, look.age);
}

const DRESS: Partial<Record<BuildingType, (p: Parts, look: Look) => void>> = {
  townHall,
  cabaret,
  trainingCamp,
  forge,
  library,
  school,
  warehouse,
  launchpad,
  lab,
  monument,
};

/**
 * Spreads a big building's recipe over its footprint: the recipe grows at the centre, slabs
 * cover every tile and its type dresses the others. One-tile types are left as they are.
 */
export function spread(p: Parts, type: BuildingType, look: Look): void {
  const size = footprintOf(type);
  if (size === 1) return;
  scaleAll(p, GROWTH[size]);
  const tiles = size === 7 ? HEXAGON : TRIANGLE;
  slabs(
    p,
    tiles,
    size === 7
      ? byAge(look.age, [C.stoneDark, A.drystoneDark, C.stoneDark, '#8f918d'])
      : groundOf(look.age),
  );
  DRESS[type]?.(p, look);
}

/** Where the sign of a big building stands (beside the anchor's door, or on the plaza). */
export function bigSignSpot(type: BuildingType): [number, number] | null {
  const size = footprintOf(type);
  if (size === 1) return null;
  if (size === 7) return [HEXAGON[2]![0] * 0.55, HEXAGON[2]![1] * 0.55 + 0.25];
  const [x, z] = TRIANGLE[0]!;
  return [x - 0.38, z + 0.05];
}
