import { TorusGeometry } from 'three';
import {
  C,
  box,
  cyl,
  cone,
  sphere,
  ico,
  roofPrism,
  m,
  rig,
  emitter,
  flag,
  type Parts,
} from './kit';

/**
 * School: a cream schoolhouse under a blue roof with a tall blue bell tower whose bell swings,
 * and its yard with a straw dummy (chantier 17). Level 2 adds an archery target, level 3 a
 * mage's tower with a twinkling crystal.
 */
export function school(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.08;
  p.push([box(), C.stone, m(-0.08, 0.03, 0, 0.66 * s, 0.06, 0.52 * s)]);
  p.push([box(), C.cream, m(-0.08, 0.22 * s, 0, 0.56 * s, 0.36 * s, 0.4 * s)]);
  p.push([
    roofPrism(),
    C.blueRoof,
    m(-0.08, 0.5 * s, 0, 0.26 * s, 0.64 * s, 0.28 * s, 0, 0, Math.PI / 2),
  ]);
  p.push([box(), C.door, m(-0.08, 0.13 * s, 0.205 * s, 0.13, 0.22 * s, 0.02)]);
  for (const x of [-0.26, 0.1]) {
    p.push([box(), C.flagBlue, m(x * s, 0.25 * s, 0.205 * s, 0.1, 0.1, 0.015)]);
    p.push([box(), C.white, m(x * s, 0.25 * s, 0.21 * s, 0.11, 0.015, 0.015)]);
  }
  // The bell tower: a tall cream tower with an open belfry and a blue spire.
  const tx = 0.2 * s;
  p.push([box(), C.cream, m(tx, 0.4 * s, -0.04, 0.17, 0.8 * s, 0.17)]);
  p.push([box(), C.blueRoofDark, m(tx, 0.81 * s, -0.04, 0.2, 0.03, 0.2)]);
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const)
    p.push([box(), C.wood, m(tx + dx * 0.07, 0.9 * s, -0.04 + dz * 0.07, 0.025, 0.16, 0.025)]);
  p.push([cone(4), C.blueRoof, m(tx, 1.12 * s, -0.04, 0.15, 0.3, 0.15, 0, Math.PI / 4, 0)]);
  p.push([sphere(5, 4), C.flagGold, m(tx, 1.28 * s, -0.04, 0.025, 0.025, 0.025)]);
  rig(p, 'bell', [tx, 0.97 * s, -0.04], { kind: 'swing', axis: 'z', amount: 0.45, speed: 2.4 });
  p.push([cone(8), C.flagGold, m(tx, 0.91 * s, -0.04, 0.055, 0.09, 0.055), 'bell']);
  // The yard: a beaten-earth patch, a fence and the straw training dummy.
  const yx = 0.5 * s;
  const yz = 0.24;
  p.push([cyl(10), C.strawDark, m(yx, 0.015, yz, 0.2, 0.03, 0.2)]);
  p.push([cyl(5), C.woodDark, m(yx, 0.18, yz, 0.02, 0.36, 0.02)]);
  p.push([cyl(8), C.straw, m(yx, 0.26, yz, 0.07, 0.16, 0.07)]);
  p.push([sphere(6, 4), C.strawDark, m(yx, 0.39, yz, 0.06, 0.06, 0.06)]);
  p.push([cyl(5), C.woodDark, m(yx, 0.28, yz, 0.015, 0.22, 0.015, 0, 0, Math.PI / 2)]);
  for (let i = 0; i < 4; i++)
    p.push([box(), C.wood, m(yx - 0.21 + i * 0.14, 0.07, yz + 0.24, 0.02, 0.14, 0.02)]);
  p.push([box(), C.wood, m(yx, 0.11, yz + 0.24, 0.44, 0.02, 0.015)]);
  // Chalkboard by the door.
  p.push([box(), C.leafDark, m(-0.5 * s, 0.2, 0.22, 0.2, 0.16, 0.02, 0, 0.5, 0)]);
  p.push([box(), C.woodDark, m(-0.5 * s, 0.08, 0.22, 0.02, 0.16, 0.02, 0, 0.5, 0)]);
  if (level >= 2) {
    // Chantier 11: a big archery target, readable from afar.
    p.push([box(), C.woodDark, m(0.52 * s, 0.22, -0.3, 0.03, 0.44, 0.03, 0.2, 0, 0)]);
    p.push([cyl(12), C.white, m(0.52 * s, 0.38, -0.27, 0.16, 0.03, 0.16, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.roof, m(0.52 * s, 0.38, -0.25, 0.1, 0.03, 0.1, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.flagGold, m(0.52 * s, 0.38, -0.24, 0.04, 0.03, 0.04, Math.PI / 2 + 0.2)]);
  }
  if (level >= 3) {
    // Mage's tower with a floating crystal.
    p.push([cyl(8), C.stoneDark, m(-0.46 * s, 0.4, -0.24, 0.11, 0.8, 0.11)]);
    p.push([cone(8), C.blueRoof, m(-0.46 * s, 0.9, -0.24, 0.15, 0.24, 0.15)]);
    rig(p, 'crystal', [-0.46 * s, 1.1, -0.24], {
      kind: 'bob',
      amount: 0.03,
      speed: 2,
      ambient: true,
    });
    p.push([ico(), C.juice, m(-0.46 * s, 1.1, -0.24, 0.05, 0.08, 0.05), 'crystal']);
    emitter(p, { kind: 'gold', at: [-0.46 * s, 1.12, -0.24], rate: 1.2, ambient: true });
  }
  flag(p, level, -0.42, 0.06, 0.3);
  return p;
}

/**
 * Library (chantier 08): a round stone tower full of books. A star globe turns on its lectern
 * while the researchers work; level 2 adds a floor, level 3 an observatory dome and a telescope.
 */
export function library(fullLevel: number): Parts {
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
