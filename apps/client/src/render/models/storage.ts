import { C, box, cyl, ico, m, rig, type Parts } from './kit';
import { A, banner, byAge, door, gable, wall, type Look } from './ageKit';

/**
 * Warehouse: wide and low in dark wood under a slate roof, a big double door and stacks of
 * crates on both sides (chantier 17); a little crane swings crates around. Chantier 33: a
 * stone counterweight on the crane (Stone), iron-strapped doors and an iron crane (Iron), a
 * steel rolling door, steel crates and a gantry (Industry).
 */
export function warehouse(look: Look): Parts {
  const { age } = look;
  // Later ages keep every Eden piece (the level-3 form) in their own materials.
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const lift = age > 0 ? 0.015 : 0;
  p.push([
    box(),
    age === 1 ? A.drystoneDark : C.stoneDark,
    m(0, 0.03, 0, 0.98 * s, 0.06, 0.62 * s),
  ]);
  wall(p, age, 0, 0.2 * s, 0, 0.9 * s, 0.34 * s, 0.52 * s, C.storeWood);
  // Low, wide slate roof with eaves.
  gable(p, age, 0, 0.45 * s, 0, 0.3 * s, 0.98 * s, 0.34 * s, C.slate);
  if (age === 0) p.push([box(), C.slateDark, m(0, 0.6 * s, 0, 1.0 * s, 0.03, 0.05)]);
  // Double door: two light leaves with cross braces, open a crack.
  const leaf = byAge(age, [C.wood, C.wood, A.beam, A.steel]);
  const brace = byAge(age, [C.woodDark, C.woodDark, C.ironDark, A.brass]);
  for (const side of [-1, 1]) {
    const x = side * 0.075 * s;
    p.push([
      box(),
      leaf,
      m(x, 0.15 * s, 0.265 * s + lift, 0.14 * s, 0.27 * s, 0.02, 0, side * 0.12, 0),
    ]);
    p.push([
      box(),
      brace,
      m(x, 0.15 * s, 0.275 * s + lift, 0.025, 0.3 * s, 0.015, 0, side * 0.12, side * 0.5),
    ]);
  }
  p.push([box(), brace, m(0, 0.3 * s, 0.27 * s + lift, 0.34 * s, 0.03, 0.02)]);
  if (age > 0) door(p, age, 0, 0.12 * s, 0.26 * s, 0.1 * s, 0.2 * s, 0.01);
  // Stacks of crates on both sides of the door.
  const crateColor = byAge(age, [C.wood, C.wood, C.wood, A.steel]);
  const crate = (x: number, y: number, z: number, turn: number) =>
    p.push([box(), crateColor, m(x, y, z, 0.13, 0.13, 0.13, 0, turn, 0)]);
  const stack = (x: number, z: number, high: boolean) => {
    crate(x - 0.07, 0.065, z, 0.1);
    crate(x + 0.07, 0.065, z, -0.15);
    crate(x, 0.195, z, 0.4);
    if (high) crate(x + 0.02, 0.325, z, -0.2);
  };
  stack(0.5 * s, 0.38 * s, level >= 2);
  stack(-0.5 * s, 0.38 * s, level >= 3);
  // Little crane swinging crates around.
  const cx = 0.52 * s;
  const cz = -0.3;
  const mast = byAge(age, [C.woodDark, C.woodDark, C.ironDark, A.steel]);
  const boom = byAge(age, [C.wood, C.wood, C.iron, A.steel]);
  p.push([cyl(6), mast, m(cx, 0.4, cz, 0.03, 0.8, 0.03)]);
  if (age >= 3) {
    // A gantry: a second leg and a cross beam.
    p.push([box(), A.steel, m(cx - 0.2, 0.4, cz, 0.04, 0.8, 0.04)]);
    p.push([box(), A.brass, m(cx - 0.1, 0.72, cz, 0.24, 0.04, 0.05)]);
  }
  rig(p, 'crane', [cx, 0.78, cz], { kind: 'swing', axis: 'y', amount: 0.9, speed: 0.9 });
  p.push([box(), boom, m(cx, 0.78, cz + 0.17, 0.035, 0.035, 0.42), 'crane']);
  p.push([cyl(4), C.straw, m(cx, 0.66, cz + 0.34, 0.008, 0.24, 0.008), 'crane']);
  p.push([box(), crateColor, m(cx, 0.51, cz + 0.34, 0.1, 0.1, 0.1, 0, 0.3, 0), 'crane']);
  if (age >= 1) {
    p.push([box(), boom, m(cx, 0.78, cz - 0.08, 0.035, 0.035, 0.14), 'crane']);
    p.push([
      age === 1 ? ico() : box(),
      age === 1 ? A.drystone : C.ironDark,
      m(cx, 0.75, cz - 0.15, 0.07, 0.07, 0.07),
      'crane',
    ]);
  }
  if (level >= 2) {
    // Chantier 11: a lean-to shed on the side, with barrels.
    wall(p, age, -0.6 * s, 0.13, -0.08, 0.2, 0.26, 0.34, C.storeWood);
    p.push([
      box(),
      byAge(age, [C.slateDark, A.thatchDark, C.slateDark, A.steel]),
      m(-0.62 * s, 0.29, -0.08, 0.28, 0.03, 0.4, 0, 0, 0.35),
    ]);
    for (const z of [-0.36, -0.22])
      p.push([cyl(8), age >= 3 ? C.copper : C.wood, m(-0.4 * s, 0.08, z, 0.06, 0.16, 0.06)]);
  }
  if (level >= 3) {
    // A slate-capped loft over the middle.
    wall(p, age, 0, 0.62 * s, -0.04, 0.3, 0.2, 0.24, C.storeWood);
    gable(p, age, 0, 0.77 * s, -0.04, 0.14, 0.36, 0.16, C.slate);
    p.push([box(), C.goldEgg, m(0, 0.62 * s, 0.085 + lift, 0.08, 0.08, 0.02)]);
  }
  banner(p, look, -0.48, 0.14, -0.3);
  return p;
}
