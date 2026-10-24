import { TorusGeometry } from 'three';
import { C, cyl, cone, sphere, ico, m, rig, emitter, type Parts } from './kit';

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
  p.push([cone(6), C.roof, m(0, 0.15, 0, 0.1, 0.24, 0.1), 'fire']);
  p.push([cone(5), C.flagGold, m(0, 0.12, 0, 0.065, 0.17, 0.065), 'fire']);
  emitter(p, { kind: 'spark', at: [0, 0.22, 0], rate: 3, ambient: true });
  emitter(p, { kind: 'smoke', at: [0, 0.32, 0], rate: 0.6, ambient: true });
  // Three log benches around it.
  for (const a of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3]) {
    const x = Math.cos(a) * 0.4;
    const z = Math.sin(a) * 0.4;
    p.push([cyl(6), C.wood, m(x, 0.05, z, 0.05, 0.3, 0.05, Math.PI / 2, -a + Math.PI / 2, 0)]);
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
