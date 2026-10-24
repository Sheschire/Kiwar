import { TorusGeometry } from 'three';
import { C, box, cyl, cone, sphere, ico, m, rig, emitter, type Parts } from './kit';
import { A, banner, byAge, cap, door, gable, wall, type Look } from './ageKit';

/**
 * Chantier 43: the village's own buildings. The campfire: a ring of stones around crossed logs
 * and a crackling fire, three log benches for the supper at nightfall, and the shared food
 * basket.
 */
export function campfire(): Parts {
  const p: Parts = [];
  // Ring of stones.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    p.push([
      ico(),
      i % 2 ? C.stone : C.stoneDark,
      m(Math.cos(a) * 0.17, 0.035, Math.sin(a) * 0.17, 0.065, 0.05, 0.065),
    ]);
  }
  // Crossed logs.
  for (const a of [0.3, -0.5, 1.4]) {
    p.push([cyl(5), C.woodDark, m(0, 0.05, 0, 0.03, 0.26, 0.03, Math.PI / 2 - 0.25, a, 0)]);
  }
  // The fire.
  rig(p, 'fire', [0, 0.04, 0], { kind: 'flicker', amount: 0.28, speed: 9, ambient: true });
  p.push([cone(6), C.roof, m(0, 0.17, 0, 0.13, 0.3, 0.13), 'fire']);
  p.push([cone(5), C.fire, m(0, 0.14, 0, 0.085, 0.22, 0.085), 'fire']);
  emitter(p, { kind: 'spark', at: [0, 0.22, 0], rate: 3, ambient: true });
  emitter(p, { kind: 'smoke', at: [0, 0.32, 0], rate: 0.6, ambient: true });
  // Three log benches around it (along the circle).
  for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3]) {
    const x = Math.cos(a) * 0.4;
    const z = Math.sin(a) * 0.4;
    p.push([box(), C.wood, m(x, 0.05, z, 0.3, 0.07, 0.09, 0, -a - Math.PI / 2, 0)]);
    p.push([box(), C.woodDark, m(x, 0.088, z, 0.28, 0.01, 0.07, 0, -a - Math.PI / 2, 0)]);
  }
  // The shared basket, full of pulp and seeds.
  p.push([cyl(9), C.straw, m(0.36, 0.07, -0.28, 0.1, 0.14, 0.1)]);
  p.push([
    new TorusGeometry(0.1, 0.02, 4, 10),
    C.strawDark,
    m(0.36, 0.14, -0.28, 1, 1, 1, Math.PI / 2),
  ]);
  p.push([sphere(6, 4), C.pulp, m(0.33, 0.15, -0.27, 0.05, 0.045, 0.05)]);
  p.push([sphere(6, 4), C.pulp, m(0.39, 0.16, -0.3, 0.045, 0.04, 0.045)]);
  p.push([sphere(5, 3), C.seed, m(0.37, 0.16, -0.24, 0.03, 0.025, 0.03)]);
  return p;
}

/**
 * Chantier 43: the Town Hall, where the mayor gives the Speech. A cream hall under a red roof
 * with a clock gable, wide steps and the speaker's balcony over the door (its lectern faces the
 * square in front), the flag of the colony on a tall pole. Level 2 adds the side porch and
 * flower boxes, level 3 the belfry. The two other tiles hold the notice board and the garden
 * (`townHallGarden` in `spread.ts`).
 */
export function townHall(look: Look): Parts {
  const { age } = look;
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 0.88 + level * 0.06;
  const lift = age > 0 ? 0.012 : 0;
  const trim = byAge(age, [C.wood, C.woodDark, A.beam, A.steel]);
  // Plinth and three steps in front of the door.
  p.push([box(), age === 1 ? A.drystoneDark : C.stone, m(0, 0.03, -0.02, 0.72 * s, 0.06, 0.5 * s)]);
  for (let i = 0; i < 3; i++)
    p.push([box(), C.stone, m(0, 0.02 + i * 0.025, 0.26 * s - i * 0.03, 0.3, 0.025, 0.06)]);
  // The hall and its roof.
  wall(p, age, 0, 0.24 * s, -0.04, 0.62 * s, 0.4 * s, 0.38 * s, C.cream);
  gable(p, age, 0, 0.44 * s, -0.04, 0.24 * s, 0.7 * s, 0.24 * s, C.roof);
  door(p, age, 0, 0.13 * s, 0.15 * s + lift, 0.13, 0.22 * s);
  // Two tall windows each side of the door.
  for (const x of [-0.2, 0.2])
    p.push([box(), C.flagBlue, m(x * s, 0.27 * s, 0.15 * s + lift, 0.08, 0.14, 0.015)]);
  // The speaker's balcony over the door: a ledge, a rail, the lectern.
  const by = 0.33 * s;
  const bz = 0.2 * s;
  p.push([box(), trim, m(0, by, bz, 0.26, 0.025, 0.1)]);
  p.push([box(), trim, m(0, by + 0.06, bz + 0.045, 0.26, 0.015, 0.012)]);
  for (const x of [-0.12, -0.04, 0.04, 0.12])
    p.push([box(), trim, m(x, by + 0.03, bz + 0.045, 0.012, 0.06, 0.012)]);
  p.push([box(), C.woodDark, m(0, by + 0.05, bz, 0.06, 0.08, 0.04)]);
  p.push([box(), C.flagGold, m(0, by + 0.095, bz, 0.08, 0.012, 0.05, 0.3)]);
  // A clock in the gable.
  p.push([
    cyl(14),
    age >= 2 ? A.brass : C.flagGold,
    m(0, 0.6 * s, 0.03, 0.06, 0.02, 0.06, Math.PI / 2),
  ]);
  p.push([cyl(14), C.white, m(0, 0.6 * s, 0.038, 0.048, 0.02, 0.048, Math.PI / 2)]);
  p.push([box(), C.seed, m(0.01, 0.61 * s, 0.05, 0.03, 0.006, 0.005, 0, 0, 0.8)]);
  // The colony's flag on a tall pole beside the hall.
  const fx = -0.42 * s;
  p.push([cyl(5), trim, m(fx, 0.45 * s, 0.12, 0.015, 0.9 * s, 0.015)]);
  rig(p, 'flag', [fx, 0.82 * s, 0.12], {
    kind: 'swing',
    axis: 'y',
    amount: 0.25,
    speed: 1.6,
    ambient: true,
  });
  p.push([box(), C.leaf, m(fx + 0.09, 0.82 * s, 0.12, 0.17, 0.1, 0.006), 'flag']);
  p.push([sphere(6, 4), C.pulp, m(fx + 0.09, 0.82 * s, 0.125, 0.03, 0.03, 0.006), 'flag']);
  if (level >= 2) {
    // A porch on the right and flower boxes under the windows.
    p.push([box(), trim, m(0.38 * s, 0.14 * s, 0.1, 0.02, 0.28 * s, 0.02)]);
    p.push([box(), C.roof, m(0.34 * s, 0.29 * s, 0.04, 0.16, 0.02, 0.2, 0.25)]);
    for (const x of [-0.2, 0.2]) {
      p.push([box(), C.woodDark, m(x * s, 0.18 * s, 0.17 * s + lift, 0.1, 0.03, 0.03)]);
      p.push([sphere(6, 4), C.flagGold, m(x * s, 0.2 * s, 0.17 * s + lift, 0.05, 0.025, 0.02)]);
    }
  }
  if (level >= 3) {
    // The belfry on the ridge.
    const ty = 0.66 * s;
    wall(p, age, 0, ty, -0.12, 0.13, 0.16, 0.13, C.cream);
    cap(p, age, 0, ty + 0.17, -0.12, 0.12, 0.2, C.roof, 4, Math.PI / 4);
    rig(p, 'bell', [0, ty + 0.03, -0.12], { kind: 'swing', axis: 'z', amount: 0.4, speed: 2.2 });
    p.push([cone(8), C.flagGold, m(0, ty - 0.01, -0.12, 0.04, 0.06, 0.04), 'bell']);
  }
  banner(p, look, 0.42 * s, 0.06, 0.18);
  return p;
}

/** The Town Hall's two back tiles: the notice board and benches, the garden and its fountain. */
export function townHallGarden(
  p: Parts,
  look: Look,
  left: readonly [number, number],
  right: readonly [number, number],
): void {
  const { age } = look;
  const post = byAge(age, [C.wood, C.woodDark, A.beam, A.steel]);
  // Notice board with pinned leaves, and a bench.
  const [lx, lz] = left;
  for (const dx of [-0.16, 0.16]) p.push([cyl(5), post, m(lx + dx, 0.18, lz, 0.02, 0.36, 0.02)]);
  p.push([box(), C.woodDark, m(lx, 0.27, lz, 0.38, 0.18, 0.025)]);
  p.push([box(), C.roof, m(lx, 0.38, lz, 0.42, 0.03, 0.08)]);
  for (const [dx, dy, c] of [
    [-0.1, 0.3, C.white],
    [0.04, 0.25, C.straw],
    [0.12, 0.31, C.white],
  ] as const)
    p.push([box(), c, m(lx + dx, dy, lz + 0.016, 0.07, 0.08, 0.004)]);
  p.push([box(), C.wood, m(lx, 0.07, lz + 0.22, 0.34, 0.025, 0.08)]);
  for (const dx of [-0.14, 0.14])
    p.push([box(), C.woodDark, m(lx + dx, 0.035, lz + 0.22, 0.03, 0.07, 0.07)]);
  // Garden: flower beds round a small fountain of juice.
  const [rx, rz] = right;
  p.push([cyl(12), C.stone, m(rx, 0.05, rz, 0.2, 0.1, 0.2)]);
  p.push([cyl(12), C.juice, m(rx, 0.095, rz, 0.17, 0.01, 0.17)]);
  p.push([cyl(6), C.stone, m(rx, 0.17, rz, 0.03, 0.16, 0.03)]);
  rig(p, 'spout', [rx, 0.25, rz], { kind: 'bob', amount: 0.02, speed: 3, ambient: true });
  p.push([sphere(6, 4), C.juice, m(rx, 0.26, rz, 0.04, 0.05, 0.04), 'spout']);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.push([
      sphere(5, 3),
      i % 2 ? C.flagGold : C.roof,
      m(rx + Math.cos(a) * 0.3, 0.05, rz + Math.sin(a) * 0.3, 0.06, 0.04, 0.06),
    ]);
    p.push([
      ico(),
      C.leaf,
      m(rx + Math.cos(a) * 0.3, 0.025, rz + Math.sin(a) * 0.3, 0.07, 0.03, 0.07),
    ]);
  }
}
