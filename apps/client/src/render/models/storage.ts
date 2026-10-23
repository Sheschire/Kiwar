import { C, box, cyl, roofPrism, m, rig, flag, type Parts } from './kit';

/**
 * Warehouse: wide and low in dark wood under a slate roof, a big double door and stacks of
 * crates on both sides (chantier 17); a little crane swings crates around.
 */
export function warehouse(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  p.push([box(), C.stoneDark, m(0, 0.03, 0, 0.98 * s, 0.06, 0.62 * s)]);
  p.push([box(), C.storeWood, m(0, 0.2 * s, 0, 0.9 * s, 0.34 * s, 0.52 * s)]);
  // Low, wide slate roof with eaves.
  p.push([roofPrism(), C.slate, m(0, 0.45 * s, 0, 0.3 * s, 0.98 * s, 0.34 * s, 0, 0, Math.PI / 2)]);
  p.push([box(), C.slateDark, m(0, 0.6 * s, 0, 1.0 * s, 0.03, 0.05)]);
  // Double door: two light leaves with cross braces, open a crack.
  for (const side of [-1, 1]) {
    const x = side * 0.075 * s;
    p.push([box(), C.wood, m(x, 0.15 * s, 0.265 * s, 0.14 * s, 0.27 * s, 0.02, 0, side * 0.12, 0)]);
    p.push([
      box(),
      C.woodDark,
      m(x, 0.15 * s, 0.275 * s, 0.025, 0.3 * s, 0.015, 0, side * 0.12, side * 0.5),
    ]);
  }
  p.push([box(), C.woodDark, m(0, 0.3 * s, 0.27 * s, 0.34 * s, 0.03, 0.02)]);
  // Stacks of crates on both sides of the door.
  const crate = (x: number, y: number, z: number, turn: number) =>
    p.push([box(), C.wood, m(x, y, z, 0.13, 0.13, 0.13, 0, turn, 0)]);
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
  p.push([cyl(6), C.woodDark, m(cx, 0.4, cz, 0.03, 0.8, 0.03)]);
  rig(p, 'crane', [cx, 0.78, cz], { kind: 'swing', axis: 'y', amount: 0.9, speed: 0.9 });
  p.push([box(), C.wood, m(cx, 0.78, cz + 0.17, 0.035, 0.035, 0.42), 'crane']);
  p.push([cyl(4), C.straw, m(cx, 0.66, cz + 0.34, 0.008, 0.24, 0.008), 'crane']);
  p.push([box(), C.wood, m(cx, 0.51, cz + 0.34, 0.1, 0.1, 0.1, 0, 0.3, 0), 'crane']);
  if (level >= 2) {
    // Chantier 11: a lean-to shed on the side, with barrels.
    p.push([box(), C.storeWood, m(-0.6 * s, 0.13, -0.08, 0.2, 0.26, 0.34)]);
    p.push([box(), C.slateDark, m(-0.62 * s, 0.29, -0.08, 0.28, 0.03, 0.4, 0, 0, 0.35)]);
    for (const z of [-0.36, -0.22])
      p.push([cyl(8), C.wood, m(-0.4 * s, 0.08, z, 0.06, 0.16, 0.06)]);
  }
  if (level >= 3) {
    // A slate-capped loft over the middle.
    p.push([box(), C.storeWood, m(0, 0.62 * s, -0.04, 0.3, 0.2, 0.24)]);
    p.push([roofPrism(), C.slate, m(0, 0.77 * s, -0.04, 0.14, 0.36, 0.16, 0, 0, Math.PI / 2)]);
    p.push([box(), C.goldEgg, m(0, 0.62 * s, 0.085, 0.08, 0.08, 0.02)]);
  }
  flag(p, level, -0.48, 0.14, -0.3);
  return p;
}
