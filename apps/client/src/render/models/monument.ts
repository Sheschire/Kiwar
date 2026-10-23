import { TorusGeometry } from 'three';
import { C, box, cyl, cone, sphere, m, rig, emitter, type Parts } from './kit';

/**
 * Monument (chantier 08), one level per age: a ring of standing stones (Stone age), a forge
 * and iron bands (Iron age), then a clock tower with turning gears and steam (Industry).
 */
export function monument(level: number): Parts {
  const p: Parts = [];
  p.push([cyl(14), C.stoneDark, m(0, 0.03, 0, 0.62, 0.06, 0.62)]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const h = 0.32 + (i % 2) * 0.08;
    p.push([
      box(),
      C.stone,
      m(Math.cos(a) * 0.5, h / 2 + 0.05, Math.sin(a) * 0.5, 0.1, h, 0.08, 0, -a, 0.05),
    ]);
  }
  // The great menhir with a carved kiwi and a juice-green glow.
  p.push([box(), C.stone, m(0, 0.45, 0, 0.2, 0.8, 0.16, 0, 0.2, 0)]);
  p.push([cone(4), C.stone, m(0, 0.92, 0, 0.13, 0.16, 0.1, 0, Math.PI / 4 + 0.2, 0)]);
  p.push([sphere(8, 6), C.juice, m(0.03, 0.55, 0.08, 0.05, 0.05, 0.02)]);
  emitter(p, { kind: 'gold', at: [0, 0.7, 0.1], rate: 0.6, ambient: true });
  if (level >= 2) {
    for (const y of [0.25, 0.65])
      p.push([cyl(10), C.ironDark, m(0, y, 0, 0.16, 0.04, 0.13, 0, 0.2, 0)]);
    // Forge with a living fire and an anvil.
    p.push([box(), C.brick, m(-0.32, 0.14, 0.28, 0.24, 0.2, 0.2)]);
    rig(p, 'fire', [-0.32, 0.26, 0.28], { kind: 'flicker', amount: 0.25, speed: 4, ambient: true });
    p.push([cone(6), C.fire, m(-0.32, 0.3, 0.28, 0.08, 0.12, 0.08), 'fire']);
    emitter(p, { kind: 'spark', at: [-0.32, 0.36, 0.28], rate: 1.5, ambient: true });
    p.push([box(), C.iron, m(0.3, 0.12, 0.3, 0.16, 0.06, 0.08)]);
    p.push([box(), C.ironDark, m(0.3, 0.06, 0.3, 0.06, 0.08, 0.06)]);
  }
  if (level >= 3) {
    // Clock tower with a turning gear and a smoking chimney.
    const tx = 0.32;
    const tz = -0.3;
    p.push([box(), C.brick, m(tx, 0.45, tz, 0.2, 0.8, 0.2)]);
    p.push([cone(4), C.ironDark, m(tx, 0.98, tz, 0.18, 0.26, 0.18, 0, Math.PI / 4, 0)]);
    p.push([cyl(12), C.white, m(tx, 0.68, tz + 0.105, 0.07, 0.01, 0.07, Math.PI / 2)]);
    rig(p, 'gear', [tx - 0.105, 0.45, tz], {
      kind: 'spin',
      axis: 'x',
      amount: 1,
      speed: 0.8,
      ambient: true,
    });
    p.push([
      new TorusGeometry(1, 0.35, 4, 8),
      C.iron,
      m(tx - 0.105, 0.45, tz, 0.07, 0.07, 0.07, 0, Math.PI / 2, 0),
      'gear',
    ]);
    p.push([cyl(8), C.ironDark, m(-0.3, 0.5, -0.32, 0.05, 0.9, 0.05)]);
    emitter(p, { kind: 'smoke', at: [-0.3, 0.98, -0.32], rate: 1.2, ambient: true });
  }
  return p;
}
