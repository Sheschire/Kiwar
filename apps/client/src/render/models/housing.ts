import { TorusGeometry, SphereGeometry } from 'three';
import { C, box, cyl, cone, sphere, m, rig, emitter, flag, type Parts } from './kit';

export function nest(level: number): Parts {
  const p: Parts = [];
  const s = 1 + (level - 1) * 0.12;
  p.push([
    new TorusGeometry(0.5 * s, 0.17 * s, 6, 14),
    C.straw,
    m(0, 0.16, 0, 1, 1, 1, Math.PI / 2),
  ]);
  p.push([cyl(14), C.strawDark, m(0, 0.08, 0, 0.5 * s, 0.12, 0.5 * s)]);
  // Woven twigs around the rim.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.push([
      box(),
      C.twig,
      m(Math.cos(a) * 0.55 * s, 0.2, Math.sin(a) * 0.55 * s, 0.05, 0.05, 0.42, 0.3, -a, 0.4),
    ]);
  }
  const eggs = level >= 3 ? 4 : 3;
  for (let i = 0; i < eggs; i++) {
    const a = (i / eggs) * Math.PI * 2 + 0.4;
    const gold = level >= 3 && i === 0;
    const ex = Math.cos(a) * 0.2;
    const ez = Math.sin(a) * 0.2;
    // Eggs rock gently on their base; the golden one twinkles.
    rig(p, `egg${i}`, [ex, 0.09, ez], {
      kind: 'swing',
      axis: i % 2 ? 'x' : 'z',
      amount: 0.1,
      speed: 1.6 + i * 0.35,
      ambient: true,
    });
    p.push([sphere(), gold ? C.goldEgg : C.egg, m(ex, 0.25, ez, 0.13, 0.17, 0.13), `egg${i}`]);
    if (gold) emitter(p, { kind: 'gold', at: [ex, 0.36, ez], rate: 1.6, ambient: true });
  }
  if (level >= 2) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tx = Math.cos(a) * 0.62 * s;
      const tz = Math.sin(a) * 0.62 * s;
      // Twigs quivering in the breeze.
      rig(p, `twig${i}`, [tx, 0.22, tz], {
        kind: 'swing',
        axis: i % 2 ? 'x' : 'z',
        amount: 0.07,
        speed: 5 + i,
        ambient: true,
      });
      p.push([cone(4), C.twig, m(tx, 0.38, tz, 0.05, 0.35, 0.05), `twig${i}`]);
    }
  }
  if (level >= 3) {
    p.push([new TorusGeometry(0.28, 0.1, 6, 12), C.straw, m(0, 0.5, 0, 1, 1, 1, Math.PI / 2)]);
  }
  flag(p, level, 0.6 * s, 0.25, -0.2);
  return p;
}

export function hut(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const dome = (x: number, z: number, k: number) => {
    p.push([
      new SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      C.fur,
      m(x, 0, z, 0.42 * k, 0.45 * k, 0.42 * k),
    ]);
    p.push([box(), C.door, m(x, 0.11 * k, z + 0.38 * k, 0.14 * k, 0.22 * k, 0.05)]);
    // A tiny beak-shaped awning above the door.
    p.push([cone(5), C.straw, m(x, 0.3 * k, z + 0.42 * k, 0.05, 0.22, 0.05, Math.PI / 2.4, 0, 0)]);
  };
  dome(0, 0, s);
  // Chantier 11: each level adds a room you can see from afar.
  if (level >= 2) {
    dome(0.4, -0.26, 0.62);
    p.push([cyl(6), C.stoneDark, m(0.18, 0.42 * s, -0.1, 0.06, 0.25, 0.06)]);
  }
  emitter(p, {
    kind: 'smoke',
    at: level >= 2 ? [0.18, 0.42 * s + 0.14, -0.1] : [0, 0.5 * s, 0],
    rate: 0.8,
    ambient: true,
  });
  if (level >= 3) {
    dome(-0.42, -0.3, 0.6);
    // A thatched cap on the main room.
    p.push([cone(10), C.straw, m(0, 0.5 * s, 0, 0.26 * s, 0.24 * s, 0.26 * s)]);
    p.push([cyl(10), C.strawDark, m(0, 0.4 * s, 0, 0.27 * s, 0.03, 0.27 * s)]);
  }
  p.push([sphere(6, 4), C.furDark, m(0, (level >= 3 ? 0.64 : 0.45) * s, 0, 0.06, 0.06, 0.06)]);
  flag(p, level, 0.42, 0.05, 0.2);
  return p;
}
