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
 * Pulpery: a cream hut under a big leaf roof, and its signature press shaped like a kiwi bird
 * whose head and long beak peck the pulp in a basket (chantier 17).
 */
export function pulpery(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  p.push([cyl(10), C.cream, m(-0.1, 0.2 * s, -0.05, 0.34 * s, 0.4 * s, 0.34 * s)]);
  p.push([cone(10), C.leaf, m(-0.1, 0.6 * s, -0.05, 0.5 * s, 0.42 * s, 0.5 * s)]);
  p.push([sphere(6, 4), C.leafDark, m(-0.1, 0.84 * s, -0.05, 0.07, 0.07, 0.07)]);
  p.push([box(), C.door, m(-0.1, 0.13 * s, 0.28 * s - 0.05, 0.14, 0.24 * s, 0.03)]);
  // The kiwi press: a round furry body on two legs, facing the basket.
  const kx = 0.36;
  const kz = 0.18;
  p.push([sphere(10, 7), C.fur, m(kx, 0.27, kz - 0.08, 0.17, 0.15, 0.2)]);
  p.push([sphere(8, 5), C.furDark, m(kx, 0.33, kz - 0.25, 0.06, 0.05, 0.05)]);
  for (const dx of [-0.06, 0.06])
    p.push([cyl(5), C.goldEgg, m(kx + dx, 0.08, kz - 0.06, 0.018, 0.16, 0.018)]);
  // Basket of pulp under the beak.
  p.push([cyl(8), C.wood, m(kx, 0.06, kz + 0.24, 0.13, 0.12, 0.13)]);
  for (let i = 0; i < 4; i++)
    p.push([
      sphere(6, 4),
      C.pulp,
      m(kx - 0.04 + (i % 2) * 0.08, 0.13, kz + 0.2 + Math.floor(i / 2) * 0.08, 0.05, 0.04, 0.05),
    ]);
  // Head and beak peck down into the basket.
  rig(p, 'press', [kx, 0.36, kz + 0.08], { kind: 'pound', amount: 0.07, speed: 4 });
  p.push([sphere(8, 6), C.fur, m(kx, 0.4, kz + 0.1, 0.09, 0.09, 0.09), 'press']);
  for (const dx of [-0.05, 0.05])
    p.push([sphere(4, 3), C.seed, m(kx + dx, 0.43, kz + 0.16, 0.018, 0.018, 0.018), 'press']);
  p.push([cone(6), C.straw, m(kx, 0.3, kz + 0.22, 0.025, 0.24, 0.025, 2.3), 'press']);
  emitter(p, { kind: 'pulp', at: [kx, 0.16, kz + 0.24], rig: 'press', count: 3, phase: 0 });
  if (level >= 2) {
    // Chantier 11: a storehouse annex under a leaf roof.
    p.push([cyl(8), C.cream, m(-0.46, 0.18, 0.28, 0.2, 0.36, 0.2)]);
    p.push([cone(8), C.leaf, m(-0.46, 0.48, 0.28, 0.29, 0.3, 0.29)]);
    p.push([box(), C.door, m(-0.46, 0.1, 0.47, 0.09, 0.18, 0.02)]);
  }
  if (level >= 3) {
    // Big leaf sail on the roof and a tall drying tower.
    p.push([sphere(8, 5), C.leafDark, m(-0.1, 0.95 * s, -0.05, 0.32, 0.04, 0.12, 0, 0.6, 0.3)]);
    p.push([cyl(8), C.wood, m(0.4, 0.4, -0.36, 0.11, 0.8, 0.11)]);
    p.push([cone(8), C.leafDark, m(0.4, 0.92, -0.36, 0.2, 0.26, 0.2)]);
    for (const y of [0.3, 0.55]) p.push([sphere(6, 4), C.pulp, m(0.4, y, -0.24, 0.07, 0.06, 0.04)]);
  }
  flag(p, level, -0.5, 0.1, -0.35);
  return p;
}

/**
 * Fibre workshop: a wooden workshop under a sage-green roof, its signature a big spool of
 * fibre turning on the ridge (chantier 17); a spinning wheel by the door, skeins drying.
 */
export function fiberWorkshop(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  p.push([box(), C.wood, m(0, 0.2 * s, 0, 0.62 * s, 0.4 * s, 0.46 * s)]);
  p.push([
    roofPrism(),
    C.fiberRoof,
    m(0, 0.52 * s, 0, 0.28 * s, 0.7 * s, 0.32 * s, 0, 0, Math.PI / 2),
  ]);
  p.push([box(), C.door, m(0, 0.13 * s, 0.24 * s, 0.14, 0.24 * s, 0.02)]);
  // The big spool on its two forks along the ridge, winding the fibre.
  const sy = 0.82 * s;
  for (const x of [-0.2, 0.2])
    p.push([box(), C.woodDark, m(x * s, 0.7 * s, 0, 0.035, 0.26 * s, 0.035)]);
  rig(p, 'spool', [0, sy, 0], { kind: 'spin', axis: 'x', amount: 1, speed: 2.2 });
  p.push([cyl(12), C.cream, m(0, sy, 0, 0.12 * s, 0.34 * s, 0.12 * s, 0, 0, Math.PI / 2), 'spool']);
  for (const x of [-0.17, 0.17])
    p.push([
      cyl(12),
      C.fiberRoofDark,
      m(x * s, sy, 0, 0.18 * s, 0.035, 0.18 * s, 0, 0, Math.PI / 2),
      'spool',
    ]);
  p.push([box(), C.woodDark, m(0, sy, 0.13 * s, 0.3 * s, 0.03, 0.02), 'spool']);
  // Thread running down from the spool to the door.
  p.push([cyl(4), C.cream, m(0.05, 0.56 * s, 0.2 * s, 0.006, 0.42 * s, 0.006, 0.5)]);
  // Spinning wheel on its stand, facing the street.
  const wx = -0.46;
  const wz = 0.1;
  const wy = 0.3;
  for (const dx of [-0.05, 0.05])
    p.push([box(), C.woodDark, m(wx + dx, wy / 2, wz - 0.03, 0.03, wy, 0.03)]);
  p.push([new TorusGeometry(0.17, 0.022, 4, 14), C.wood, m(wx, wy, wz)]);
  for (let i = 0; i < 3; i++)
    p.push([box(), C.woodDark, m(wx, wy, wz, 0.015, 0.34, 0.015, 0, 0, (i * Math.PI) / 3)]);
  // Bales of fibre.
  const bale = (x: number, z: number) => {
    p.push([cyl(10), C.fiberRoof, m(x, 0.12, z, 0.12, 0.24, 0.12)]);
    p.push([cyl(10), C.woodDark, m(x, 0.12, z, 0.125, 0.03, 0.125)]);
  };
  bale(0.44, 0.3);
  if (level >= 2) {
    bale(0.2, 0.42);
    // Chantier 11: a drying rack hung with skeins of fibre.
    for (const x of [0.12, 0.6]) p.push([box(), C.woodDark, m(x, 0.3, -0.42, 0.04, 0.6, 0.04)]);
    p.push([box(), C.woodDark, m(0.36, 0.6, -0.42, 0.56, 0.04, 0.04)]);
    for (const x of [0.22, 0.36, 0.5])
      p.push([box(), C.cream, m(x, 0.44, -0.42, 0.08, 0.28, 0.05)]);
  }
  if (level >= 3) {
    // A loft on the side, with its own sage roof.
    p.push([box(), C.wood, m(-0.44, 0.34, -0.28, 0.28, 0.68, 0.28)]);
    p.push([
      roofPrism(),
      C.fiberRoofDark,
      m(-0.44, 0.78, -0.28, 0.16, 0.34, 0.18, 0, 0, Math.PI / 2),
    ]);
    p.push([box(), C.goldEgg, m(-0.44, 0.48, -0.135, 0.08, 0.1, 0.02)]);
  }
  flag(p, level, 0.42, 0.4, -0.2);
  return p;
}

export function seedQuarry(level: number): Parts {
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
  p.push([cyl(10), C.seedRoofDark, m(0, 0.03, 0, 0.34, 0.06, 0.34)]);
  p.push([cyl(10), C.stoneDark, m(0, 0.035, 0, 0.27, 0.06, 0.27)]);
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
  // Chantier 17: the sorting shed under a golden-brown roof, the colour of the seeds.
  p.push([box(), C.wood, m(0.42, 0.14, -0.3, 0.3, 0.28, 0.26)]);
  p.push([cone(4), C.seedRoof, m(0.42, 0.38, -0.3, 0.3, 0.22, 0.26, 0, Math.PI / 4, 0)]);
  p.push([box(), C.door, m(0.42, 0.1, -0.165, 0.09, 0.16, 0.02)]);
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
    p.push([cyl(10), C.stone, m(0.06, 0.34, -0.46, 0.14, 0.68, 0.14)]);
    p.push([cone(10), C.seedRoof, m(0.06, 0.78, -0.46, 0.18, 0.2, 0.18)]);
  }
  flag(p, level, -0.45, 0.1, -0.3);
  return p;
}

export function juiceWell(level: number): Parts {
  const p: Parts = [];
  const s = 0.9 + level * 0.08;
  p.push([cyl(12), C.stone, m(0, 0.15, 0, 0.36 * s, 0.32, 0.36 * s)]);
  p.push([cyl(12), C.juice, m(0, 0.31, 0, 0.29 * s, 0.02, 0.29 * s)]);
  p.push([box(), C.wood, m(-0.3 * s, 0.5, 0, 0.05, 0.7, 0.05)]);
  p.push([box(), C.wood, m(0.3 * s, 0.5, 0, 0.05, 0.7, 0.05)]);
  p.push([cone(4), C.juiceRoof, m(0, 0.95, 0, 0.5 * s, 0.3, 0.42 * s, 0, Math.PI / 4)]);
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
  p.push([sphere(6, 4), C.juiceRoofDark, m(...hub, 0.04, 0.04, 0.04), 'sails']);
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

/** Gathering camp: a leaf lean-to, a woven basket and a little stone ring. No foundations. */
export function camp(): Parts {
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
