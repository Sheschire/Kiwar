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

/** Chantier 44: kiwi juice, green (the palette's `juice` is the yellow well). */
const JUICE = '#7fb236';
const JUICE_LIGHT = '#c6e86a';

/** Chantier 44: petals of the flower beds and arches (vertex colours, like the palette). */
const PETALS = ['#ff7fa8', '#ffd95a', '#b48cff', '#ff8a5c', '#fff4dc'] as const;

/** A flower on its stalk at (x, z), `h` high, in the rig `name` if any. */
function flower(p: Parts, x: number, z: number, h: number, i: number, name?: string): void {
  p.push([cyl(4), C.leafDark, m(x, h / 2, z, 0.008, h, 0.008), name]);
  p.push([sphere(5, 3), PETALS[i % PETALS.length]!, m(x, h, z, 0.042, 0.03, 0.042), name]);
}

/**
 * Chantier 44: lanterns. In the Eden and the Stone age two posts with a vine strung between
 * them and three leaf lanterns that sway; an iron street lamp in the Iron age, a brass lamp
 * post in the Industry (the look follows the colony's age, not a level).
 */
export function lanterns(look: Look): Parts {
  const p: Parts = [];
  const age = look.colonyAge;
  if (age >= 2) {
    const metal = age >= 3 ? A.brass : C.ironDark;
    p.push([cyl(8), age >= 3 ? A.steel : C.stoneDark, m(0, 0.03, 0, 0.09, 0.06, 0.09)]);
    p.push([cyl(6), metal, m(0, 0.32, 0, 0.022, 0.6, 0.022)]);
    // A crook carrying the lantern, and a second lower one in the Industry.
    p.push([box(), metal, m(0.07, 0.6, 0, 0.16, 0.018, 0.018)]);
    p.push([cone(4), metal, m(0.14, 0.6, 0, 0.06, 0.05, 0.06)]);
    rig(p, 'light', [0.14, 0.53, 0], { kind: 'flicker', amount: 0.08, speed: 3, ambient: true });
    p.push([box(), C.fire, m(0.14, 0.53, 0, 0.06, 0.08, 0.06), 'light']);
    p.push([box(), C.door, m(0.14, 0.53, 0, 0.012, 0.012, 0.012)]);
    if (age >= 3) {
      p.push([box(), metal, m(-0.07, 0.48, 0, 0.16, 0.018, 0.018)]);
      p.push([cone(4), metal, m(-0.14, 0.48, 0, 0.06, 0.05, 0.06)]);
      p.push([box(), C.fire, m(-0.14, 0.41, 0, 0.06, 0.08, 0.06), 'light']);
    }
    return p;
  }
  const post = age >= 1 ? C.stone : C.twig;
  for (const x of [-0.32, 0.32]) {
    p.push([cyl(5), post, m(x, 0.22, 0, 0.025, 0.44, 0.025)]);
    p.push([sphere(5, 3), C.leaf, m(x, 0.44, 0, 0.04, 0.03, 0.04)]);
  }
  // The vine: three short segments sagging in the middle.
  const ys = [0.42, 0.36, 0.36, 0.42];
  const xs = [-0.32, -0.11, 0.11, 0.32];
  for (let i = 0; i < 3; i++) {
    const dx = xs[i + 1]! - xs[i]!;
    const dy = ys[i + 1]! - ys[i]!;
    p.push([
      cyl(4),
      C.leafDark,
      m(
        (xs[i]! + xs[i + 1]!) / 2,
        (ys[i]! + ys[i + 1]!) / 2,
        0,
        0.008,
        Math.hypot(dx, dy),
        0.008,
        0,
        0,
        Math.atan2(dx, -dy),
      ),
    ]);
  }
  const colours = ['#ffb347', '#ff6f5e', '#ffd95a'];
  [-0.21, 0, 0.21].forEach((x, i) => {
    const name = `lantern${i}`;
    const top = i === 1 ? 0.355 : 0.38;
    rig(p, name, [x, top, 0], {
      kind: 'swing',
      axis: 'x',
      amount: 0.18,
      speed: 1.2 + i * 0.3,
      ambient: true,
    });
    p.push([cyl(6), colours[i]!, m(x, top - 0.06, 0, 0.04, 0.08, 0.04), name]);
    p.push([cone(6), C.leafDark, m(x, top - 0.01, 0, 0.045, 0.03, 0.045), name]);
    p.push([box(), C.door, m(x, top - 0.06, 0, 0.01, 0.01, 0.01), name]);
  });
  return p;
}

/** Chantier 44: a flower bed in a ring of pebbles, the flowers sway in the breeze. */
export function flowerBed(): Parts {
  const p: Parts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.push([
      ico(),
      i % 3 ? C.stone : C.stoneDark,
      m(Math.cos(a) * 0.33, 0.025, Math.sin(a) * 0.33, 0.05, 0.035, 0.05),
    ]);
  }
  p.push([cyl(12), C.woodDark, m(0, 0.025, 0, 0.3, 0.05, 0.3)]);
  rig(p, 'flowers', [0, 0.05, 0], {
    kind: 'swing',
    axis: 'z',
    amount: 0.05,
    speed: 0.8,
    ambient: true,
  });
  let i = 0;
  for (const [r, n] of [
    [0.08, 4],
    [0.2, 8],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 7;
      flower(p, Math.cos(a) * r, Math.sin(a) * r, 0.1 + ((k * 7 + i) % 3) * 0.03, i++, 'flowers');
    }
  }
  for (const a of [0.6, 2.7, 4.6])
    p.push([ico(), C.leaf, m(Math.cos(a) * 0.14, 0.07, Math.sin(a) * 0.14, 0.06, 0.05, 0.06)]);
  return p;
}

/**
 * Chantier 44: an arch of woven vines in bloom. No floor of its own: it stands over the ground
 * or over a path, which goes on under it.
 */
export function vineArch(): Parts {
  const p: Parts = [];
  const R = 0.28;
  // Two vines twisted together along the half circle.
  for (const [dz, col] of [
    [-0.02, C.leafDark],
    [0.02, C.twig],
  ] as const) {
    p.push([new TorusGeometry(R, 0.022, 5, 14, Math.PI), col, m(0, 0.12, dz, 1, 1, 1)]);
    for (const x of [-R, R]) p.push([cyl(5), col, m(x, 0.06, dz, 0.022, 0.12, 0.022)]);
  }
  rig(p, 'bloom', [0, 0.4, 0], {
    kind: 'swing',
    axis: 'z',
    amount: 0.03,
    speed: 0.6,
    ambient: true,
  });
  for (let i = 0; i < 9; i++) {
    const a = (i / 8) * Math.PI;
    const x = Math.cos(a) * R;
    const y = 0.12 + Math.sin(a) * R;
    p.push([ico(), C.leaf, m(x, y, 0.03 * (i % 2 ? 1 : -1), 0.045, 0.035, 0.04), 'bloom']);
    if (i % 2 === 0)
      p.push([
        sphere(5, 3),
        PETALS[i % PETALS.length]!,
        m(x, y + 0.03, 0.04, 0.028, 0.022, 0.028),
        'bloom',
      ]);
  }
  return p;
}

/**
 * Chantier 44: the juice fountain — a stone basin full of kiwi juice, a pillar with a small bowl
 * and a jet that springs and falls in drops (it glows softly at night).
 */
export function fountain(look: Look): Parts {
  const p: Parts = [];
  const stone = look.colonyAge >= 2 ? A.drystoneLight : C.stone;
  p.push([cyl(14), stone, m(0, 0.06, 0, 0.36, 0.12, 0.36)]);
  p.push([cyl(14), JUICE, m(0, 0.11, 0, 0.31, 0.03, 0.31)]);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    p.push([
      box(),
      C.stoneDark,
      m(Math.cos(a) * 0.35, 0.125, Math.sin(a) * 0.35, 0.07, 0.02, 0.05, 0, -a, 0),
    ]);
  }
  p.push([cyl(8), stone, m(0, 0.2, 0, 0.05, 0.2, 0.05)]);
  p.push([cyl(10), stone, m(0, 0.3, 0, 0.13, 0.04, 0.13)]);
  p.push([cyl(10), JUICE, m(0, 0.322, 0, 0.11, 0.008, 0.11)]);
  // The light under the jet (night lights) and the jet itself.
  p.push([box(), C.door, m(0, 0.33, 0, 0.012, 0.012, 0.012)]);
  rig(p, 'jet', [0, 0.32, 0], { kind: 'pump', amount: 0.025, speed: 1.6, ambient: true });
  p.push([cyl(6), JUICE_LIGHT, m(0, 0.42, 0, 0.022, 0.2, 0.022), 'jet']);
  p.push([sphere(7, 5), JUICE_LIGHT, m(0, 0.53, 0, 0.06, 0.04, 0.06), 'jet']);
  // Drops falling back into the bowl.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const y = 0.38 + (i % 2) * 0.06;
    p.push([
      sphere(4, 3),
      JUICE,
      m(Math.cos(a) * 0.08, y, Math.sin(a) * 0.08, 0.016, 0.022, 0.016),
      'jet',
    ]);
  }
  emitter(p, { kind: 'juice', at: [0, 0.47, 0], rate: 4, ambient: true });
  return p;
}

/**
 * Chantier 44: the mayor's statue — a kiwi in stone on a plinth, its beak raised towards the
 * horizon and its sash of office, a gold chain, flowers at its feet.
 */
export function mayorStatue(look: Look): Parts {
  const p: Parts = [];
  const plinth = look.colonyAge >= 2 ? A.drystone : C.guardStone;
  const stone = '#cfc8b8';
  p.push([box(), C.guardStoneDark, m(0, 0.025, 0, 0.42, 0.05, 0.42)]);
  p.push([box(), plinth, m(0, 0.13, 0, 0.28, 0.16, 0.28)]);
  p.push([box(), C.flagGold, m(0, 0.14, 0.141, 0.16, 0.04, 0.004)]);
  // The kiwi: body, legs, head, long beak.
  p.push([cyl(4), stone, m(-0.04, 0.24, 0, 0.018, 0.06, 0.018)]);
  p.push([cyl(4), stone, m(0.04, 0.24, 0, 0.018, 0.06, 0.018)]);
  p.push([sphere(10, 7), stone, m(0, 0.36, 0, 0.13, 0.13, 0.15)]);
  p.push([sphere(8, 6), stone, m(0, 0.5, 0.1, 0.07, 0.07, 0.07)]);
  p.push([cone(6), stone, m(0, 0.5, 0.24, 0.02, 0.2, 0.02, Math.PI / 2 + 0.25, 0, 0)]);
  // The sash across the chest and the chain of office.
  p.push([
    new TorusGeometry(0.135, 0.018, 4, 16),
    C.flagBlue,
    m(0, 0.36, 0.005, 1, 1, 1.1, 0, Math.PI / 2, 0.7),
  ]);
  p.push([
    new TorusGeometry(0.07, 0.012, 4, 12),
    C.flagGold,
    m(0, 0.43, 0.075, 1, 1, 1, 1.1, 0, 0),
  ]);
  for (const [x, z, i] of [
    [-0.17, 0.17, 0],
    [0.17, 0.17, 1],
    [-0.17, -0.17, 2],
    [0.17, -0.17, 3],
  ] as const)
    flower(p, x, z, 0.08, i);
  return p;
}

/** Chantier 44: water of the skipping pond. */
const POND = '#6fb4d8';

/**
 * Chantier 44: the vine swing — an A-frame of branches, a crossbar, two vines and a bark seat
 * that keeps swinging.
 */
export function swing(): Parts {
  const p: Parts = [];
  const top = 0.5;
  for (const x of [-0.28, 0.28])
    for (const dz of [-0.12, 0.12])
      p.push([cyl(5), C.twig, m(x, top / 2, dz / 2, 0.022, top + 0.04, 0.022, dz, 0, 0)]);
  p.push([cyl(6), C.woodDark, m(0, top, 0, 0.025, 0.64, 0.025, 0, 0, Math.PI / 2)]);
  for (const x of [-0.28, 0.28])
    p.push([sphere(5, 3), C.leaf, m(x, top + 0.02, 0, 0.05, 0.035, 0.05)]);
  rig(p, 'seat', [0, top, 0], {
    kind: 'swing',
    axis: 'x',
    amount: 0.45,
    speed: 1.1,
    ambient: true,
  });
  for (const x of [-0.1, 0.1])
    p.push([cyl(4), C.leafDark, m(x, top - 0.17, 0, 0.008, 0.34, 0.008), 'seat']);
  p.push([box(), C.wood, m(0, top - 0.34, 0, 0.26, 0.025, 0.1), 'seat']);
  // Worn grass under the seat.
  p.push([cyl(10), C.straw, m(0, 0.006, 0, 0.14, 0.01, 0.2)]);
  return p;
}

/** Chantier 44: seed skittles — a lane of light wood, six seed pins at its end, a pulp ball. */
export function skittles(): Parts {
  const p: Parts = [];
  p.push([box(), C.lightWood, m(0, 0.02, 0, 0.22, 0.04, 0.78)]);
  for (const x of [-0.12, 0.12]) p.push([box(), C.woodDark, m(x, 0.035, 0, 0.025, 0.05, 0.78)]);
  rig(p, 'pins', [0, 0.04, -0.28], { kind: 'pound', amount: 0.03, speed: 0.5, ambient: true });
  const rows = [[0], [-0.045, 0.045], [-0.09, 0, 0.09]];
  rows.forEach((row, i) =>
    row.forEach((x) => {
      const z = -0.22 - i * 0.06;
      p.push([sphere(6, 5), C.cream, m(x, 0.08, z, 0.022, 0.05, 0.022), 'pins']);
      p.push([cyl(6), C.roof, m(x, 0.095, z, 0.02, 0.01, 0.02), 'pins']);
    }),
  );
  rig(p, 'ball', [0, 0.07, 0.24], { kind: 'spin', axis: 'x', amount: 1, speed: 2, ambient: true });
  p.push([sphere(7, 5), C.pulp, m(0, 0.07, 0.24, 0.04, 0.04, 0.04), 'ball']);
  // The rack of spare balls and the score board on its post.
  p.push([box(), C.woodDark, m(0.2, 0.05, 0.3, 0.1, 0.06, 0.08)]);
  p.push([cyl(4), C.twig, m(0.2, 0.14, -0.3, 0.012, 0.28, 0.012)]);
  p.push([box(), C.lightWood, m(0.2, 0.26, -0.3, 0.02, 0.08, 0.12)]);
  for (const z of [-0.33, -0.3, -0.27])
    p.push([box(), C.woodDark, m(0.211, 0.26, z, 0.004, 0.05, 0.008)]);
  return p;
}

/** Chantier 44: the skipping pond — a round pond in a ring of pebbles, reeds and a heap of seeds. */
export function skipPond(): Parts {
  const p: Parts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    p.push([
      ico(),
      i % 2 ? C.stone : C.stoneDark,
      m(Math.cos(a) * 0.36, 0.025, Math.sin(a) * 0.36, 0.055, 0.035, 0.05),
    ]);
  }
  p.push([cyl(16), POND, m(0, 0.02, 0, 0.33, 0.02, 0.33)]);
  rig(p, 'ripple', [0.06, 0.035, -0.05], {
    kind: 'breathe',
    amount: 0.35,
    speed: 1.4,
    ambient: true,
  });
  p.push([
    new TorusGeometry(0.08, 0.006, 3, 16),
    C.white,
    m(0.06, 0.035, -0.05, 1, 1, 1, Math.PI / 2),
    'ripple',
  ]);
  p.push([
    new TorusGeometry(0.14, 0.005, 3, 18),
    C.white,
    m(0.06, 0.035, -0.05, 1, 1, 1, Math.PI / 2),
    'ripple',
  ]);
  for (const [x, z] of [
    [-0.3, -0.2],
    [-0.26, -0.27],
    [-0.33, -0.12],
  ] as const)
    p.push([cyl(4), C.leafDark, m(x, 0.1, z, 0.01, 0.2, 0.01)]);
  p.push([cone(5), C.twig, m(-0.3, 0.2, -0.2, 0.02, 0.05, 0.02)]);
  for (const [x, z] of [
    [0.3, 0.26],
    [0.34, 0.2],
    [0.27, 0.31],
    [0.31, 0.29],
  ] as const)
    p.push([sphere(5, 3), C.seed, m(x, 0.04, z, 0.03, 0.02, 0.03)]);
  return p;
}

/** Chantier 44: the bark slide — a grassy mound, a ladder behind, a bark chute down the front. */
export function slide(): Parts {
  const p: Parts = [];
  p.push([sphere(10, 6), C.leaf, m(0, 0, -0.12, 0.3, 0.32, 0.26)]);
  p.push([cyl(8), C.wood, m(0, 0.33, -0.12, 0.1, 0.03, 0.1)]);
  // The ladder at the back.
  for (const x of [-0.06, 0.06])
    p.push([cyl(4), C.twig, m(x, 0.18, -0.36, 0.012, 0.38, 0.012, -0.35, 0, 0)]);
  for (let i = 0; i < 4; i++)
    p.push([
      cyl(4),
      C.twig,
      m(0, 0.07 + i * 0.08, -0.4 + i * 0.03, 0.01, 0.12, 0.01, 0, 0, Math.PI / 2),
    ]);
  // The chute: three pieces of bark from the top down to the front, steep then flat, with low
  // sides (each piece joins the next).
  const points: [number, number][] = [
    [0.35, -0.06],
    [0.2, 0.13],
    [0.08, 0.3],
    [0.035, 0.42],
  ];
  for (let i = 0; i < 3; i++) {
    const [y1, z1] = points[i]!;
    const [y2, z2] = points[i + 1]!;
    const len = Math.hypot(y2 - y1, z2 - z1) + 0.02;
    const tilt = Math.atan2(y1 - y2, z2 - z1);
    const y = (y1 + y2) / 2;
    const z = (z1 + z2) / 2;
    p.push([box(), C.woodDark, m(0, y, z, 0.14, 0.02, len, tilt, 0, 0)]);
    for (const x of [-0.07, 0.07])
      p.push([box(), C.twig, m(x, y + 0.02, z, 0.015, 0.04, len, tilt, 0, 0)]);
  }
  // Soft sand where they land.
  p.push([cyl(10), C.straw, m(0, 0.008, 0.42, 0.14, 0.015, 0.1)]);
  return p;
}

/** Chantier 44: the cabaret's reds, and the robins' feathers. */
const CABARET_RED = '#b3262f';
const CABARET_DARK = '#6e1820';
const ROBIN_BROWN = '#8a5a3a';
const ROBIN_BREAST = '#e2552d';

/** A robin dancing the cancan at (x, z), facing +z: it sways and kicks (two rigs). */
function robin(p: Parts, x: number, y: number, z: number, i: number): void {
  const body = `robin${i}`;
  const leg = `kick${i}`;
  rig(p, body, [x, y, z], {
    kind: 'swing',
    axis: 'z',
    amount: 0.22,
    speed: 3.2 + i * 0.4,
    ambient: true,
  });
  p.push([sphere(7, 5), ROBIN_BROWN, m(x, y + 0.09, z, 0.045, 0.05, 0.04), body]);
  p.push([sphere(6, 4), ROBIN_BREAST, m(x, y + 0.085, z + 0.022, 0.034, 0.036, 0.022), body]);
  p.push([sphere(6, 4), ROBIN_BROWN, m(x, y + 0.15, z + 0.005, 0.028, 0.028, 0.028), body]);
  p.push([
    cone(4),
    C.flagGold,
    m(x, y + 0.15, z + 0.035, 0.008, 0.025, 0.008, Math.PI / 2, 0, 0),
    body,
  ]);
  // The frilly skirt, white and red.
  p.push([cone(8), C.white, m(x, y + 0.045, z, 0.06, 0.05, 0.06), body]);
  p.push([cone(8), CABARET_RED, m(x, y + 0.055, z, 0.05, 0.035, 0.05), body]);
  // One leg stands, the other kicks high.
  p.push([cyl(4), C.flagGold, m(x - 0.012, y + 0.02, z, 0.006, 0.04, 0.006)]);
  rig(p, leg, [x + 0.012, y + 0.04, z], {
    kind: 'swing',
    axis: 'x',
    amount: 0.9,
    speed: 4.4 + i * 0.3,
    ambient: true,
  });
  p.push([cyl(4), C.flagGold, m(x + 0.012, y + 0.02, z + 0.004, 0.006, 0.045, 0.006), leg]);
}

/**
 * Chantier 44: the Robin's Cabaret, after the Moulin-Rouge — a red hall under a dark red roof,
 * the windmill tower at its corner with sails that keep turning, a sign with gold bulbs over
 * the door, and the stage in front where three robins dance the cancan. Its lights glow red at
 * night (`weather.ts`). The two other tiles hold the terrace and the poster column
 * (`cabaretTerrace` in `spread.ts`).
 */
export function cabaret(look: Look): Parts {
  const { age } = look;
  const p: Parts = [];
  const trim = byAge(age, [C.cream, C.cream, A.plaster, A.brass]);
  p.push([box(), C.stoneDark, m(0, 0.03, 0, 0.82, 0.06, 0.58)]);
  // The hall.
  p.push([box(), CABARET_RED, m(-0.05, 0.24, -0.06, 0.62, 0.36, 0.38)]);
  for (const y of [0.075, 0.415]) p.push([box(), trim, m(-0.05, y, -0.06, 0.64, 0.025, 0.4)]);
  gable(p, age, -0.05, 0.43, -0.06, 0.16, 0.66, 0.21, CABARET_DARK);
  door(p, age, -0.05, 0.14, 0.135, 0.13, 0.2);
  // Arched windows each side of the door.
  for (const x of [-0.28, 0.18]) {
    p.push([box(), C.flagGold, m(x, 0.25, 0.135, 0.07, 0.12, 0.012)]);
    p.push([cyl(8), C.flagGold, m(x, 0.31, 0.135, 0.035, 0.012, 0.035, Math.PI / 2, 0, 0)]);
  }
  // The sign and its bulbs.
  p.push([box(), '#2a0f12', m(-0.05, 0.36, 0.14, 0.34, 0.07, 0.015)]);
  for (let i = 0; i < 7; i++)
    p.push([sphere(4, 3), C.flagGold, m(-0.2 + i * 0.05, 0.36, 0.152, 0.012, 0.012, 0.012)]);
  // The windmill tower and its sails.
  const tx = 0.34;
  const tz = 0.06;
  p.push([cyl(10), CABARET_RED, m(tx, 0.38, tz, 0.1, 0.7, 0.1)]);
  p.push([cyl(10), trim, m(tx, 0.72, tz, 0.105, 0.02, 0.105)]);
  p.push([cone(10), CABARET_DARK, m(tx, 0.8, tz, 0.12, 0.16, 0.12)]);
  p.push([box(), C.flagGold, m(tx, 0.42, tz + 0.1, 0.05, 0.07, 0.01)]);
  const hub: [number, number, number] = [tx, 0.64, tz + 0.12];
  rig(p, 'sails', hub, { kind: 'spin', axis: 'z', amount: 1, speed: 0.7, ambient: true });
  p.push([
    cyl(6),
    C.woodDark,
    m(hub[0], hub[1], hub[2], 0.025, 0.04, 0.025, Math.PI / 2, 0, 0),
    'sails',
  ]);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const cx = hub[0] + Math.sin(a) * 0.15;
    const cy = hub[1] + Math.cos(a) * 0.15;
    p.push([box(), C.woodDark, m(cx, cy, hub[2] + 0.01, 0.014, 0.3, 0.01, 0, 0, -a), 'sails']);
    p.push([
      box(),
      C.cream,
      m(
        cx + Math.cos(a) * 0.025,
        cy - Math.sin(a) * 0.025,
        hub[2] + 0.012,
        0.045,
        0.24,
        0.006,
        0,
        0,
        -a,
      ),
      'sails',
    ]);
  }
  // The stage in front, its footlights and the three dancers.
  p.push([box(), C.woodDark, m(-0.06, 0.07, 0.25, 0.44, 0.04, 0.16)]);
  p.push([box(), CABARET_DARK, m(-0.06, 0.05, 0.33, 0.44, 0.04, 0.005)]);
  for (let i = 0; i < 6; i++)
    p.push([sphere(4, 3), C.fire, m(-0.25 + i * 0.076, 0.095, 0.325, 0.01, 0.01, 0.01)]);
  for (let i = 0; i < 3; i++) robin(p, -0.19 + i * 0.13, 0.09, 0.25, i);
  return p;
}

/**
 * Chantier 44: the cabaret's other tiles — the terrace with round tables and a red parasol on
 * the left, the poster column under red lanterns on the right.
 */
export function cabaretTerrace(
  p: Parts,
  look: Look,
  left: readonly [number, number],
  right: readonly [number, number],
): void {
  const metal = byAge(look.age, [C.woodDark, C.woodDark, C.ironDark, A.steel]);
  const [lx, lz] = left;
  for (const [dx, dz] of [
    [-0.18, 0.1],
    [0.16, 0.14],
    [0, -0.18],
  ] as const) {
    const x = lx + dx;
    const z = lz + dz;
    p.push([cyl(4), metal, m(x, 0.07, z, 0.012, 0.14, 0.012)]);
    p.push([cyl(10), C.cream, m(x, 0.145, z, 0.08, 0.012, 0.08)]);
    for (const a of [0.4, 2.5])
      p.push([
        cyl(6),
        CABARET_RED,
        m(x + Math.cos(a) * 0.12, 0.05, z + Math.sin(a) * 0.12, 0.03, 0.1, 0.03),
      ]);
  }
  p.push([cyl(4), metal, m(lx, 0.2, lz, 0.012, 0.4, 0.012)]);
  p.push([cone(8), CABARET_RED, m(lx, 0.42, lz, 0.24, 0.09, 0.24)]);
  p.push([cone(8), C.cream, m(lx, 0.405, lz, 0.25, 0.05, 0.25)]);
  const [rx, rz] = right;
  p.push([cyl(10), C.cream, m(rx, 0.22, rz, 0.08, 0.44, 0.08)]);
  p.push([cyl(10), CABARET_RED, m(rx, 0.26, rz, 0.083, 0.14, 0.083)]);
  p.push([cone(10), CABARET_DARK, m(rx, 0.48, rz, 0.1, 0.08, 0.1)]);
  for (const dx of [-0.3, 0.3])
    p.push([cyl(4), metal, m(rx + dx, 0.18, rz + 0.2, 0.012, 0.36, 0.012)]);
  for (let i = 0; i < 5; i++)
    p.push([
      sphere(5, 4),
      CABARET_RED,
      m(
        rx - 0.24 + i * 0.12,
        0.33 - Math.sin((i / 4) * Math.PI) * 0.05,
        rz + 0.2,
        0.025,
        0.03,
        0.025,
      ),
    ]);
}

/**
 * Chantier 44: the fireworks cannon — a short iron barrel raised to the sky on a wooden cart,
 * crates of rockets in the colours of the shows and a coiled fuse; a thin smoke wisps out.
 */
export function fireworks(look: Look): Parts {
  const p: Parts = [];
  const metal = look.colonyAge >= 3 ? A.brass : C.ironDark;
  // The cart and its wheels.
  p.push([box(), C.woodDark, m(0, 0.09, 0, 0.3, 0.05, 0.2)]);
  for (const x of [-0.16, 0.16])
    p.push([cyl(10), C.wood, m(x, 0.09, 0.02, 0.085, 0.03, 0.085, 0, 0, Math.PI / 2)]);
  // The barrel, raised towards the sky, its muzzle ring and a fuse.
  p.push([cyl(10), metal, m(0, 0.24, -0.02, 0.065, 0.3, 0.065, -0.45, 0, 0)]);
  p.push([cyl(10), C.iron, m(0, 0.37, -0.085, 0.075, 0.03, 0.075, -0.45, 0, 0)]);
  p.push([cyl(4), C.straw, m(0.04, 0.15, 0.09, 0.008, 0.08, 0.008, 0.6, 0, 0.3)]);
  emitter(p, { kind: 'smoke', at: [0, 0.4, -0.1], rate: 0.25, ambient: true });
  // Crates of rockets.
  const colours = ['#ff5a5a', '#ffd95a', '#6bc8ff', '#7cff6b'];
  for (const [x, z, k] of [
    [-0.28, -0.22, 0],
    [0.28, -0.2, 1],
  ] as const) {
    p.push([box(), C.wood, m(x, 0.06, z, 0.16, 0.12, 0.12)]);
    for (let i = 0; i < 3; i++) {
      const rx = x - 0.05 + i * 0.05;
      p.push([cyl(5), colours[(k + i) % 4]!, m(rx, 0.17, z, 0.014, 0.12, 0.014)]);
      p.push([cone(5), C.white, m(rx, 0.24, z, 0.016, 0.03, 0.016)]);
    }
  }
  return p;
}

/**
 * Chantier 50: a locule tree — a giant seed planted at the surface. A fuzzy trunk and a round
 * crown cut like a kiwi slice: green flesh, the pale ring of the locules and its black seeds
 * around a cream heart, facing the sky.
 */
export function loculeTree(): Parts {
  const p: Parts = [];
  p.push([cyl(6), C.woodDark, m(0, 0.16, 0, 0.045, 0.32, 0.045)]);
  p.push([cyl(5), C.wood, m(0.06, 0.28, 0, 0.018, 0.14, 0.018, 0, 0, -0.7)]);
  p.push([sphere(10, 7), C.leafDark, m(0, 0.44, 0, 0.27, 0.16, 0.27)]);
  rig(p, 'crown', [0, 0.44, 0], { kind: 'breathe', amount: 0.03, speed: 1.1, ambient: true });
  p.push([cyl(18), '#8fbf4a', m(0, 0.56, 0, 0.25, 0.035, 0.25), 'crown']);
  p.push([cyl(16), '#e8efc0', m(0, 0.58, 0, 0.13, 0.01, 0.13), 'crown']);
  p.push([cyl(12), '#f6f1d6', m(0, 0.59, 0, 0.06, 0.01, 0.06), 'crown']);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.push([
      sphere(4, 3),
      C.seed,
      m(Math.cos(a) * 0.1, 0.595, Math.sin(a) * 0.1, 0.014, 0.008, 0.026, 0, -a, 0),
      'crown',
    ]);
  }
  return p;
}
