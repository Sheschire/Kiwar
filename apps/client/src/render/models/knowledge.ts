import { TorusGeometry } from 'three';
import { C, box, cyl, cone, sphere, ico, m, rig, emitter, type Parts } from './kit';
import {
  A,
  banner,
  byAge,
  cap,
  chimney,
  door,
  frameColor,
  gable,
  round,
  wall,
  type Look,
} from './ageKit';

/**
 * School: a cream schoolhouse under a blue roof with a tall blue bell tower whose bell swings,
 * and its yard with a straw dummy (chantier 17). Level 2 adds an archery target, level 3 a
 * mage's tower with a twinkling crystal. Chantier 33: a stone training block (Stone), a rack
 * of practice spears (Iron), a clock on the tower (Industry).
 */
export function school(look: Look): Parts {
  const { age } = look;
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 0.85 + level * 0.08;
  const lift = age > 0 ? 0.012 : 0;
  p.push([
    box(),
    age === 1 ? A.drystoneDark : C.stone,
    m(-0.08, 0.03, 0, 0.66 * s, 0.06, 0.52 * s),
  ]);
  wall(p, age, -0.08, 0.22 * s, 0, 0.56 * s, 0.36 * s, 0.4 * s, C.cream);
  gable(p, age, -0.08, 0.5 * s, 0, 0.26 * s, 0.64 * s, 0.28 * s, C.blueRoof);
  door(p, age, -0.08, 0.13 * s, 0.205 * s + lift, 0.13, 0.22 * s);
  if (age !== 3)
    for (const x of [-0.26, 0.1]) {
      p.push([box(), C.flagBlue, m(x * s, 0.25 * s, 0.205 * s + lift, 0.1, 0.1, 0.015)]);
      p.push([box(), C.white, m(x * s, 0.25 * s, 0.21 * s + lift, 0.11, 0.015, 0.015)]);
    }
  // The bell tower: a tall cream tower with an open belfry and a blue spire.
  const tx = 0.2 * s;
  wall(p, age, tx, 0.4 * s, -0.04, 0.17, 0.8 * s, 0.17, C.cream);
  p.push([box(), C.blueRoofDark, m(tx, 0.81 * s, -0.04, 0.2, 0.03, 0.2)]);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    p.push([
      box(),
      byAge(age, [C.wood, C.wood, A.beam, A.steel]),
      m(tx + dx * 0.07, 0.9 * s, -0.04 + dz * 0.07, 0.025, 0.16, 0.025),
    ]);
  cap(p, age, tx, 1.12 * s, -0.04, 0.15, 0.3, C.blueRoof, 4, Math.PI / 4);
  if (age === 0) p.push([sphere(5, 4), C.flagGold, m(tx, 1.28 * s, -0.04, 0.025, 0.025, 0.025)]);
  rig(p, 'bell', [tx, 0.97 * s, -0.04], { kind: 'swing', axis: 'z', amount: 0.45, speed: 2.4 });
  p.push([cone(8), C.flagGold, m(tx, 0.91 * s, -0.04, 0.055, 0.09, 0.055), 'bell']);
  if (age >= 3) {
    // A clock on the tower.
    p.push([cyl(14), A.brass, m(tx, 0.62 * s, 0.05, 0.075, 0.02, 0.075, Math.PI / 2)]);
    p.push([cyl(14), C.white, m(tx, 0.62 * s, 0.058, 0.06, 0.02, 0.06, Math.PI / 2)]);
    p.push([box(), C.seed, m(tx + 0.015, 0.63 * s, 0.07, 0.04, 0.008, 0.006, 0, 0, 0.7)]);
  }
  // The yard: a beaten-earth patch, a fence and the straw training dummy.
  const yx = 0.5 * s;
  const yz = 0.24;
  p.push([cyl(10), C.strawDark, m(yx, 0.015, yz, 0.2, 0.03, 0.2)]);
  p.push([cyl(5), C.woodDark, m(yx, 0.18, yz, 0.02, 0.36, 0.02)]);
  p.push([cyl(8), C.straw, m(yx, 0.26, yz, 0.07, 0.16, 0.07)]);
  p.push([sphere(6, 4), C.strawDark, m(yx, 0.39, yz, 0.06, 0.06, 0.06)]);
  p.push([cyl(5), C.woodDark, m(yx, 0.28, yz, 0.015, 0.22, 0.015, 0, 0, Math.PI / 2)]);
  const fence = byAge(age, [C.wood, C.wood, A.beam, A.steel]);
  for (let i = 0; i < 4; i++)
    p.push([box(), fence, m(yx - 0.21 + i * 0.14, 0.07, yz + 0.24, 0.02, 0.14, 0.02)]);
  p.push([box(), fence, m(yx, 0.11, yz + 0.24, 0.44, 0.02, 0.015)]);
  if (age === 1) {
    // A stone block to lift.
    p.push([ico(), A.drystone, m(yx - 0.16, 0.06, yz - 0.04, 0.07, 0.06, 0.07)]);
  } else if (age === 2) {
    // A rack of practice spears.
    p.push([box(), A.beam, m(yx + 0.2, 0.2, yz - 0.1, 0.03, 0.03, 0.2)]);
    for (const dz of [-0.07, 0, 0.07])
      p.push([cyl(5), C.wood, m(yx + 0.2, 0.2, yz - 0.1 + dz, 0.012, 0.4, 0.012, 0, 0, 0.15)]);
  }
  // Chalkboard by the door.
  p.push([box(), C.leafDark, m(-0.5 * s, 0.2, 0.22, 0.2, 0.16, 0.02, 0, 0.5, 0)]);
  p.push([box(), frameColor(age), m(-0.5 * s, 0.08, 0.22, 0.02, 0.16, 0.02, 0, 0.5, 0)]);
  if (level >= 2) {
    // Chantier 11: a big archery target, readable from afar.
    p.push([box(), C.woodDark, m(0.52 * s, 0.22, -0.3, 0.03, 0.44, 0.03, 0.2, 0, 0)]);
    p.push([cyl(12), C.white, m(0.52 * s, 0.38, -0.27, 0.16, 0.03, 0.16, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.roof, m(0.52 * s, 0.38, -0.25, 0.1, 0.03, 0.1, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.flagGold, m(0.52 * s, 0.38, -0.24, 0.04, 0.03, 0.04, Math.PI / 2 + 0.2)]);
  }
  if (level >= 3) {
    // Mage's tower with a floating crystal.
    round(p, age, -0.46 * s, 0.4, -0.24, 0.11, 0.8, C.stoneDark, 8);
    cap(p, age, -0.46 * s, 0.9, -0.24, 0.15, 0.24, C.blueRoof, 8);
    const cy = age > 0 ? 1.18 : 1.1;
    rig(p, 'crystal', [-0.46 * s, cy, -0.24], {
      kind: 'bob',
      amount: 0.03,
      speed: 2,
      ambient: true,
    });
    p.push([ico(), C.juice, m(-0.46 * s, cy, -0.24, 0.05, 0.08, 0.05), 'crystal']);
    emitter(p, { kind: 'gold', at: [-0.46 * s, cy + 0.02, -0.24], rate: 1.2, ambient: true });
  }
  if (age >= 3) chimney(p, age, -0.1, -0.34, 0.85);
  banner(p, look, -0.42, 0.06, 0.3);
  return p;
}

/**
 * Library (chantier 08): a round stone tower full of books. A star globe turns on its lectern
 * while the researchers work; level 2 adds a floor, level 3 an observatory dome and a telescope.
 * Chantier 33: carved stone tablets (Stone), the vat of glowing juice of the laboratory and its
 * flasks (Iron), a lightning rod and a glass dome (Industry).
 */
export function library(look: Look): Parts {
  const { age } = look;
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 0.85 + level * 0.08;
  const h = level >= 2 ? 0.62 : 0.42;
  p.push([
    cyl(12),
    age === 1 ? A.drystoneDark : C.stoneDark,
    m(0, 0.03, 0, 0.42 * s, 0.06, 0.42 * s),
  ]);
  round(p, age, 0, h / 2 + 0.05, 0, 0.32 * s, h, C.stone, 12);
  if (level >= 2 && age === 0)
    p.push([cyl(12), C.stoneDark, m(0, 0.34, 0, 0.335 * s, 0.035, 0.335 * s)]);
  door(p, age, 0, 0.13, 0.3 * s + (age > 0 ? 0.02 : 0), 0.12, 0.2, 0.03);
  // Arched windows with warm lamplight.
  const pane = age >= 3 ? A.glass : C.goldEgg;
  for (const a of [0.9, -0.9, Math.PI]) {
    const wx = Math.sin(a) * (0.31 * s + (age > 0 ? 0.02 : 0));
    const wz = Math.cos(a) * (0.31 * s + (age > 0 ? 0.02 : 0));
    p.push([box(), pane, m(wx, h * 0.62 + 0.05, wz, 0.07, 0.11, 0.02, 0, a, 0)]);
  }
  const top = h + 0.05;
  if (level >= 3) {
    const dome = byAge(age, [C.flagBlue, C.flagBlue, C.blueRoof, A.glass]);
    p.push([sphere(12, 6), dome, m(0, top, 0, 0.3 * s, 0.22 * s, 0.3 * s)]);
    if (age >= 2)
      for (const r of [0, Math.PI / 2])
        p.push([
          new TorusGeometry(1, 0.03, 4, 16, Math.PI),
          age >= 3 ? A.brass : C.ironDark,
          m(0, top, 0, 0.305 * s, 0.225 * s, 0.305 * s, 0, r),
        ]);
    // Telescope sweeping the sky.
    rig(p, 'scope', [0, top + 0.12, 0], { kind: 'swing', axis: 'y', amount: 0.8, speed: 0.6 });
    const tube = age >= 3 ? A.brass : C.woodDark;
    p.push([cyl(8), tube, m(0.1, top + 0.2, 0, 0.035, 0.32, 0.035, 0, 0, -0.9), 'scope']);
    p.push([cyl(8), C.flagGold, m(0.22, top + 0.29, 0, 0.045, 0.05, 0.045, 0, 0, -0.9), 'scope']);
  } else {
    p.push([cone(12), C.blueRoof, m(0, top + 0.16, 0, 0.38 * s, 0.32, 0.38 * s)]);
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
  p.push([cyl(6), frameColor(age), m(gx, 0.12, gz, 0.025, 0.24, 0.025)]);
  rig(p, 'globe', [gx, 0.3, gz], { kind: 'spin', axis: 'y', amount: 1, speed: 1.2 });
  p.push([sphere(8, 6), C.flagBlue, m(gx, 0.3, gz, 0.08, 0.08, 0.08), 'globe']);
  p.push([
    new TorusGeometry(1, 0.08, 4, 14),
    C.flagGold,
    m(gx, 0.3, gz, 0.095, 0.095, 0.095, 1.1),
    'globe',
  ]);
  emitter(p, { kind: 'gold', at: [gx, 0.4, gz], rate: 0.8 });
  banner(p, look, 0.3, top - 0.05, -0.25);
  if (age === 1) {
    // Carved tablets leaning on the tower.
    for (const [x, ry] of [
      [-0.2, 0.3],
      [0.18, -0.4],
    ] as const) {
      p.push([box(), A.drystoneLight, m(x, 0.16, -0.38, 0.14, 0.3, 0.04, -0.15, ry, 0)]);
      p.push([box(), A.drystoneDark, m(x, 0.18, -0.36, 0.08, 0.015, 0.045, -0.15, ry, 0)]);
    }
  }
  if (age >= 2) {
    // The laboratory: a vat of glowing juice bubbling away, fed by copper pipes.
    const vx = 0.05;
    const vz = -0.42;
    p.push([cyl(10), C.ironDark, m(vx, 0.12, vz, 0.17, 0.24, 0.17)]);
    p.push([cyl(10), C.juice, m(vx, 0.25, vz, 0.15, 0.03, 0.15)]);
    p.push([cyl(6), C.copper, m(vx + 0.18, 0.35, vz + 0.1, 0.02, 0.5, 0.02, 0, 0, 0.5)]);
    rig(p, 'brew', [vx, 0.3, vz], { kind: 'bob', amount: 0.02, speed: 3 });
    p.push([sphere(6, 4), C.juice, m(vx + 0.04, 0.3, vz, 0.04, 0.04, 0.04), 'brew']);
    emitter(p, { kind: 'juice', at: [vx, 0.32, vz], rate: 2 });
    // Glass flasks on a shelf.
    for (let i = 0; i < 3; i++)
      p.push([sphere(6, 5), C.juice, m(-0.2 + i * 0.09, 0.08, -0.4, 0.04, 0.05, 0.04)]);
  }
  if (age >= 3) {
    // A lightning rod: the juice crackles.
    p.push([cyl(6), A.steel, m(0, top + 0.35, 0, 0.015, 0.5, 0.015)]);
    emitter(p, { kind: 'spark', at: [0, top + 0.6, 0], rate: 1.5, ambient: true });
  }
  return p;
}

/**
 * Laboratory against nature (chantier 08): glass vats of glowing juice on an iron platform,
 * copper pipes, a crackling lightning rod; a dark shape floats in the main vat. More vats and a
 * taller coil with each level. Chantier 33: an Iron-age building (its last level Industry).
 */
export function lab(level: number): Parts {
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
