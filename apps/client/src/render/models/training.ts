import { TorusGeometry } from 'three';
import { C, box, cone, cyl, emitter, ico, m, rig, sphere, type Parts } from './kit';
import { A, banner, byAge, type Look } from './ageKit';

/**
 * Chantier 37: the training camp (Stone age, its last level Iron). A sparring ring of beaten
 * earth inside a palisade, a striped tent, a rack of weapons and a straw dummy that spins
 * under the blows; level 2 adds a second dummy and a lookout, level 3 (Iron) iron posts and a
 * brazier. The other two tiles of its footprint hold the archery range and the circle of spells
 * (`spread.ts`). Defense family colours: grey stone and iron, red canvas.
 */
export function trainingCamp(look: Look): Parts {
  const { age, tier } = look;
  const p: Parts = [];
  const post = byAge(age, [C.wood, C.woodDark, A.steel, A.steel]);
  // The ring.
  p.push([cyl(12), C.strawDark, m(0, 0.02, 0.05, 0.36, 0.03, 0.36)]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.4) continue; // the gate, towards the door side
    p.push([
      cyl(5),
      post,
      m(Math.cos(a) * 0.38, 0.09, 0.05 + Math.sin(a) * 0.38, 0.022, 0.18, 0.022),
    ]);
  }
  // The spinning dummy in the middle, arms out.
  p.push([cyl(5), C.woodDark, m(0, 0.12, 0.05, 0.025, 0.24, 0.025)]);
  rig(p, 'dummy', [0, 0.3, 0.05], { kind: 'spin', axis: 'y', amount: 1, speed: 1.6 });
  p.push([cyl(8), C.straw, m(0, 0.3, 0.05, 0.08, 0.18, 0.08), 'dummy']);
  p.push([sphere(6, 4), C.strawDark, m(0, 0.44, 0.05, 0.065, 0.065, 0.065), 'dummy']);
  p.push([cyl(5), C.woodDark, m(0, 0.33, 0.05, 0.018, 0.34, 0.018, 0, 0, Math.PI / 2), 'dummy']);
  p.push([box(), C.roof, m(0, 0.3, 0.13, 0.1, 0.06, 0.02), 'dummy']);
  emitter(p, { kind: 'dust', at: [0, 0.08, 0.05], rate: 1.5 });
  // The tent: red and cream canvas on a pole, a pennant on top.
  const tx = -0.44;
  const tz = 0.3;
  p.push([cone(8), C.roof, m(tx, 0.22, tz, 0.24, 0.44, 0.24)]);
  p.push([cone(8), C.white, m(tx, 0.24, tz, 0.245, 0.2, 0.245)]);
  p.push([box(), C.door, m(tx + 0.1, 0.09, tz + 0.15, 0.1, 0.16, 0.02, 0, 0.6, 0)]);
  p.push([cyl(5), C.woodDark, m(tx, 0.5, tz, 0.012, 0.16, 0.012)]);
  rig(p, 'pennant', [tx, 0.56, tz], {
    kind: 'swing',
    axis: 'y',
    amount: 0.4,
    speed: 2,
    ambient: true,
  });
  p.push([box(), C.flagGold, m(tx + 0.06, 0.56, tz, 0.1, 0.05, 0.008), 'pennant']);
  // The weapons rack: a mace, a sword, a staff, a sling.
  const rx = 0.34;
  const rz = 0.48;
  p.push([box(), post, m(rx, 0.2, rz, 0.3, 0.025, 0.04)]);
  for (const dx of [-0.14, 0.14]) p.push([box(), post, m(rx + dx, 0.12, rz, 0.025, 0.24, 0.04)]);
  p.push([cyl(5), C.wood, m(rx - 0.08, 0.16, rz + 0.03, 0.012, 0.3, 0.012, 0.15)]);
  p.push([ico(), C.ironDark, m(rx - 0.08, 0.3, rz + 0.05, 0.035, 0.035, 0.035)]);
  p.push([box(), '#e8e8ee', m(rx, 0.17, rz + 0.03, 0.02, 0.3, 0.008, 0.15)]);
  p.push([cyl(5), C.woodDark, m(rx + 0.08, 0.17, rz + 0.03, 0.012, 0.34, 0.012, 0.15)]);
  p.push([ico(), '#9b7cf2', m(rx + 0.08, 0.34, rz + 0.05, 0.025, 0.025, 0.025)]);
  if (tier >= 2) {
    // A second dummy and a lookout on stilts.
    p.push([cyl(5), C.woodDark, m(0.17, 0.12, -0.12, 0.02, 0.24, 0.02)]);
    p.push([cyl(8), C.straw, m(0.17, 0.27, -0.12, 0.065, 0.15, 0.065)]);
    p.push([sphere(6, 4), C.strawDark, m(0.17, 0.39, -0.12, 0.055, 0.055, 0.055)]);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      p.push([cyl(5), post, m(dx * 0.06, 0.3, -0.5 + dz * 0.06, 0.016, 0.6, 0.016)]);
    p.push([box(), C.wood, m(0, 0.6, -0.5, 0.18, 0.03, 0.18)]);
    p.push([cone(4), C.roofDark, m(0, 0.72, -0.5, 0.15, 0.16, 0.15, 0, Math.PI / 4, 0)]);
  }
  if (tier >= 3) {
    // An iron brazier by the gate.
    p.push([cyl(8), A.steel, m(0.14, 0.1, 0.56, 0.03, 0.2, 0.03)]);
    p.push([cyl(8), C.ironDark, m(0.14, 0.21, 0.56, 0.07, 0.04, 0.07)]);
    rig(p, 'brazier', [0.14, 0.26, 0.56], {
      kind: 'flicker',
      amount: 0.25,
      speed: 4,
      ambient: true,
    });
    p.push([cone(6), C.fire, m(0.14, 0.27, 0.56, 0.05, 0.1, 0.05), 'brazier']);
  }
  banner(p, look, -0.55, 0.06, 0.05);
  return p;
}

/** The archery range and the circle of spells on the camp's two other tiles (`spread.ts`). */
export function trainingGrounds(
  p: Parts,
  look: Look,
  range: readonly [number, number],
  circle: readonly [number, number],
): void {
  const { age } = look;
  const post = byAge(age, [C.wood, C.woodDark, A.steel, A.steel]);
  // Archery range: three targets on stands.
  const [ax, az] = range;
  for (const dx of [-0.25, 0, 0.25]) {
    p.push([box(), post, m(ax + dx, 0.18, az - 0.12, 0.025, 0.36, 0.025, 0.2)]);
    p.push([cyl(12), C.white, m(ax + dx, 0.32, az - 0.09, 0.1, 0.02, 0.1, Math.PI / 2 + 0.2)]);
    p.push([cyl(12), C.roof, m(ax + dx, 0.32, az - 0.078, 0.065, 0.02, 0.065, Math.PI / 2 + 0.2)]);
    p.push([
      cyl(12),
      C.flagGold,
      m(ax + dx, 0.32, az - 0.07, 0.025, 0.02, 0.025, Math.PI / 2 + 0.2),
    ]);
  }
  p.push([box(), C.strawDark, m(ax, 0.04, az + 0.2, 0.18, 0.08, 0.1)]);
  // Circle of spells: a glowing ring of stones around a floating crystal.
  const [cx, cz] = circle;
  p.push([
    cyl(14),
    byAge(age, [C.stoneDark, A.drystoneDark, C.stoneDark, '#8f918d']),
    m(cx, 0.02, cz, 0.36, 0.02, 0.36),
  ]);
  p.push([
    new TorusGeometry(1, 0.06, 4, 20),
    '#9b7cf2',
    m(cx, 0.04, cz, 0.3, 0.3, 0.3, Math.PI / 2),
  ]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push([
      ico(),
      C.stone,
      m(cx + Math.cos(a) * 0.34, 0.06, cz + Math.sin(a) * 0.34, 0.05, 0.07, 0.05),
    ]);
  }
  rig(p, 'orb', [cx, 0.32, cz], { kind: 'bob', amount: 0.03, speed: 2, ambient: true });
  p.push([ico(), C.juice, m(cx, 0.32, cz, 0.06, 0.09, 0.06), 'orb']);
  emitter(p, { kind: 'gold', at: [cx, 0.3, cz], rate: 1.5, ambient: true });
}
