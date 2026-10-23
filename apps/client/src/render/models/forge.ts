import { C, box, cone, cyl, emitter, ico, m, rig, sphere, type Parts } from './kit';
import { A, banner, byAge, chimney, gable, wall, type Look } from './ageKit';

/**
 * Chantier 38: the Forge (Stone age, its last level Iron). An open smithy under a lean roof: a
 * hearth of stones with glowing embers and its chimney, an anvil where a hammer falls and throws
 * sparks, a quench barrel and a rack of finished blades. Level 2 adds bellows and a grindstone,
 * level 3 (Iron) a brick hearth and iron hoops. The other two tiles hold the coal pile and the
 * meteoric iron heap (`forgeYard`). Defense family colours: stone, iron, the red of the fire.
 */
export function forge(look: Look): Parts {
  const { age, tier } = look;
  const p: Parts = [];
  const post = byAge(age, [C.wood, C.woodDark, A.beam, A.steel]);
  const stone = byAge(age, [C.stone, A.drystone, A.brick, A.brick]);
  const stoneDark = byAge(age, [C.stoneDark, A.drystoneDark, A.brickDark, A.brickDark]);
  // Floor of beaten earth and flagstones.
  p.push([cyl(10), C.strawDark, m(0, 0.015, 0, 0.5, 0.03, 0.5)]);
  p.push([box(), stoneDark, m(-0.12, 0.035, -0.05, 0.6, 0.02, 0.44)]);
  // Back wall and the lean roof on four posts.
  wall(p, age, -0.12, 0.16, -0.3, 0.62, 0.32, 0.06, C.stone);
  for (const [x, z] of [
    [-0.42, -0.3],
    [0.18, -0.3],
    [-0.42, 0.18],
    [0.18, 0.18],
  ] as const)
    p.push([cyl(6), post, m(x, 0.2, z, 0.025, 0.4, 0.025)]);
  gable(p, age, -0.12, 0.44, -0.06, 0.14, 0.7, 0.32, C.slate);
  // The hearth: a block of stones, embers that flicker, the chimney behind.
  p.push([box(), stone, m(-0.3, 0.1, -0.16, 0.22, 0.2, 0.2)]);
  p.push([box(), stoneDark, m(-0.3, 0.205, -0.16, 0.24, 0.03, 0.22)]);
  rig(p, 'embers', [-0.3, 0.23, -0.14], { kind: 'flicker', amount: 0.3, speed: 5, ambient: true });
  p.push([ico(), C.fire, m(-0.3, 0.23, -0.14, 0.07, 0.04, 0.06), 'embers']);
  p.push([cone(6), '#ffb347', m(-0.3, 0.27, -0.14, 0.035, 0.07, 0.035), 'embers']);
  emitter(p, { kind: 'ember', at: [-0.3, 0.26, -0.14], rate: 2, ambient: true });
  if (age > 0) chimney(p, age, -0.36, -0.28, 0.7);
  else {
    p.push([cyl(8), C.stoneDark, m(-0.36, 0.35, -0.28, 0.07, 0.7, 0.07)]);
    emitter(p, { kind: 'smoke', at: [-0.36, 0.74, -0.28], rate: 0.6, ambient: true });
  }
  // The anvil on its stump, the hammer falling on it (sparks at each blow).
  const ax = 0.02;
  const az = 0.0;
  p.push([cyl(8), C.woodDark, m(ax, 0.06, az, 0.07, 0.12, 0.07)]);
  p.push([box(), C.ironDark, m(ax, 0.14, az, 0.13, 0.05, 0.06)]);
  p.push([cone(4), C.ironDark, m(ax + 0.09, 0.15, az, 0.03, 0.06, 0.03, 0, 0, -Math.PI / 2)]);
  p.push([box(), C.iron, m(ax, 0.17, az, 0.14, 0.012, 0.065)]);
  rig(p, 'hammer', [ax - 0.02, 0.24, az + 0.05], { kind: 'pound', amount: 0.08, speed: 3.4 });
  p.push([cyl(5), C.wood, m(ax - 0.02, 0.27, az + 0.1, 0.01, 0.12, 0.01, 0.9), 'hammer']);
  p.push([box(), C.ironDark, m(ax - 0.02, 0.22, az + 0.04, 0.035, 0.035, 0.06), 'hammer']);
  emitter(p, { kind: 'spark', at: [ax, 0.19, az], rig: 'hammer', count: 4, phase: 0 });
  // The quench barrel.
  p.push([cyl(10), C.storeWood, m(0.3, 0.08, 0.08, 0.07, 0.16, 0.07)]);
  p.push([cyl(10), C.ironDark, m(0.3, 0.13, 0.08, 0.072, 0.012, 0.072)]);
  p.push([cyl(10), '#5d8fb0', m(0.3, 0.161, 0.08, 0.062, 0.004, 0.062)]);
  // A rack of finished pieces: a blade, a mace, a bow, a shield.
  const rx = 0.32;
  const rz = -0.24;
  p.push([box(), post, m(rx, 0.22, rz, 0.26, 0.02, 0.03)]);
  for (const dx of [-0.12, 0.12]) p.push([box(), post, m(rx + dx, 0.12, rz, 0.02, 0.24, 0.03)]);
  const metal = age >= 2 ? '#e8e8ee' : C.stone;
  p.push([box(), metal, m(rx - 0.07, 0.15, rz + 0.025, 0.018, 0.2, 0.006, 0.1)]);
  p.push([cyl(5), C.wood, m(rx, 0.15, rz + 0.025, 0.01, 0.2, 0.01, 0.1)]);
  p.push([ico(), C.ironDark, m(rx, 0.25, rz + 0.04, 0.03, 0.03, 0.03)]);
  p.push([cyl(10), C.roof, m(rx + 0.08, 0.13, rz + 0.04, 0.05, 0.012, 0.05, Math.PI / 2)]);
  if (tier >= 2) {
    // Bellows by the hearth and a grindstone.
    rig(p, 'bellows', [-0.12, 0.08, -0.12], { kind: 'breathe', amount: 0.25, speed: 2.2 });
    p.push([sphere(8, 5), C.fur, m(-0.12, 0.08, -0.12, 0.07, 0.04, 0.05), 'bellows']);
    p.push([cone(6), C.woodDark, m(-0.19, 0.09, -0.13, 0.015, 0.06, 0.015, 0, 0, Math.PI / 2)]);
    p.push([cyl(12), C.stone, m(0.1, 0.12, 0.3, 0.08, 0.025, 0.08, Math.PI / 2)]);
    p.push([box(), post, m(0.1, 0.06, 0.3, 0.02, 0.12, 0.06)]);
  }
  if (tier >= 3) {
    // Iron hoops round the hearth and a second anvil.
    for (const y of [0.06, 0.15]) p.push([box(), A.steel, m(-0.3, y, -0.16, 0.235, 0.015, 0.215)]);
    p.push([box(), C.ironDark, m(0.12, 0.1, -0.08, 0.09, 0.04, 0.05)]);
    p.push([cyl(8), A.steel, m(0.12, 0.04, -0.08, 0.035, 0.08, 0.035)]);
  }
  banner(p, look, -0.5, 0.06, 0.25);
  return p;
}

/** The coal pile and the meteoric iron heap on the Forge's two other tiles (`spread.ts`). */
export function forgeYard(
  p: Parts,
  look: Look,
  coal: readonly [number, number],
  ore: readonly [number, number],
): void {
  const post = byAge(look.age, [C.wood, C.woodDark, A.beam, A.steel]);
  const [cx, cz] = coal;
  p.push([cone(8), '#2f2a27', m(cx, 0.08, cz, 0.22, 0.16, 0.2)]);
  for (const [dx, dz] of [
    [0.15, 0.1],
    [-0.14, 0.12],
    [0.05, -0.15],
  ] as const)
    p.push([ico(), '#3b3532', m(cx + dx, 0.03, cz + dz, 0.05, 0.04, 0.05)]);
  p.push([box(), post, m(cx + 0.24, 0.1, cz - 0.06, 0.02, 0.2, 0.02)]);
  p.push([box(), C.storeWood, m(cx + 0.24, 0.05, cz + 0.02, 0.08, 0.06, 0.12)]);
  // Meteoric iron: dark rocks with a blue-grey metal sheen and a little glow.
  const [ox, oz] = ore;
  for (const [dx, dz, s] of [
    [0, 0, 0.11],
    [0.12, 0.07, 0.07],
    [-0.1, 0.09, 0.08],
    [0.04, -0.12, 0.06],
  ] as const) {
    p.push([ico(), '#4c5560', m(ox + dx, s * 0.6, oz + dz, s, s * 0.8, s)]);
    p.push([
      ico(),
      '#9fb4c8',
      m(ox + dx + s * 0.3, s * 0.95, oz + dz, s * 0.35, s * 0.25, s * 0.35),
    ]);
  }
  p.push([cyl(8), post, m(ox - 0.22, 0.04, oz - 0.04, 0.07, 0.08, 0.05)]);
  p.push([box(), '#9fb4c8', m(ox - 0.22, 0.09, oz - 0.04, 0.05, 0.02, 0.03)]);
}
