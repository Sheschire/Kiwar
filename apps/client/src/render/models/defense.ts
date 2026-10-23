import { C, box, cyl, cone, sphere, m, rig, flag, type Parts } from './kit';

/** Chantier 06: crossbow tower on the skin rampart, loaded with seeds (anti-ferret). */
export function seedTurret(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const h = 0.34 + level * 0.1;
  p.push([cyl(8), C.guardStone, m(0, h / 2, 0, 0.3 * s, h, 0.3 * s)]);
  p.push([cyl(8), C.iron, m(0, h * 0.35, 0, 0.31 * s, 0.04, 0.31 * s)]);
  p.push([cyl(8), C.guardStoneDark, m(0, h + 0.03, 0, 0.36 * s, 0.06, 0.36 * s)]);
  // Crenels.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push([
      box(),
      C.guardStoneDark,
      m(Math.cos(a) * 0.3 * s, h + 0.1, Math.sin(a) * 0.3 * s, 0.09, 0.09, 0.09, 0, -a, 0),
    ]);
  }
  // The crossbow turns slowly, watching the land below.
  const y = h + 0.16;
  rig(p, 'bow', [0, y, 0], { kind: 'swing', axis: 'y', amount: 0.8, speed: 0.7, ambient: true });
  p.push([box(), C.wood, m(0, y, 0.04, 0.08, 0.08, 0.46), 'bow']);
  p.push([box(), C.woodDark, m(0, y + 0.02, 0.2, 0.5 * s, 0.04, 0.05, 0, 0, 0), 'bow']);
  p.push([cyl(4), C.straw, m(0, y + 0.02, 0.12, 0.006, 0.006, 0.18, Math.PI / 2, 0, 0), 'bow']);
  p.push([sphere(6, 5), C.seed, m(0, y + 0.06, 0.02, 0.05, 0.035, 0.07), 'bow']);
  if (level >= 2) {
    // Chantier 11: big iron shield plates bolted on the tower.
    for (const a of [0.7, -0.7, Math.PI])
      p.push([
        box(),
        C.ironDark,
        m(Math.sin(a) * 0.32 * s, h * 0.55, Math.cos(a) * 0.32 * s, 0.24, 0.28, 0.04, 0, a, 0),
      ]);
  }
  if (level >= 3) {
    p.push([cyl(8), C.guardStoneDark, m(0, 0.07, 0, 0.42 * s, 0.14, 0.42 * s)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      p.push([
        cone(4),
        C.woodDark,
        m(
          Math.cos(a) * 0.45 * s,
          0.18,
          Math.sin(a) * 0.45 * s,
          0.03,
          0.18,
          0.03,
          0.5 * Math.sin(a),
          0,
          -0.5 * Math.cos(a),
        ),
      ]);
    }
  }
  // Seed pile at the foot.
  for (let i = 0; i < 2 + level; i++)
    p.push([
      sphere(6, 5),
      C.seed,
      m(0.28 - i * 0.07, 0.04, 0.3 - (i % 2) * 0.06, 0.05, 0.035, 0.07, 0, i, 0),
    ]);
  flag(p, level, -0.32, h, -0.2);
  return p;
}

/** Sky sling: a slender tower firing seed bursts at the bats (anti-air). */
export function skyTurret(level: number): Parts {
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const h = 0.5 + level * 0.12;
  p.push([cyl(8), C.guardStoneDark, m(0, 0.06, 0, 0.32 * s, 0.12, 0.32 * s)]);
  p.push([cyl(8), C.guardStone, m(0, h / 2, 0, 0.18 * s, h, 0.18 * s)]);
  p.push([cyl(8), C.iron, m(0, h * 0.7, 0, 0.2 * s, 0.05, 0.2 * s)]);
  p.push([cyl(8), C.ironDark, m(0, h + 0.02, 0, 0.26 * s, 0.05, 0.26 * s)]);
  // A sling basket pointed at the sky, turning round to follow the swarm.
  const y = h + 0.08;
  rig(p, 'sling', [0, y, 0], { kind: 'spin', axis: 'y', amount: 1, speed: 0.6, ambient: true });
  p.push([box(), C.woodDark, m(0, y + 0.12, 0, 0.05, 0.3, 0.05, 0.5, 0, 0), 'sling']);
  p.push([cone(6), C.wood, m(0, y + 0.3, 0.08, 0.09, 0.1, 0.09, Math.PI + 0.5, 0, 0), 'sling']);
  p.push([sphere(6, 5), C.seed, m(0, y + 0.3, 0.09, 0.05, 0.04, 0.05), 'sling']);
  if (level >= 2) {
    // Chantier 11: a wooden lookout ring halfway up and a basket of seeds at the foot.
    p.push([cyl(10), C.wood, m(0, h * 0.45, 0, 0.32 * s, 0.05, 0.32 * s)]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.push([
        box(),
        C.woodDark,
        m(Math.cos(a) * 0.3 * s, h * 0.45 + 0.07, Math.sin(a) * 0.3 * s, 0.03, 0.12, 0.03),
      ]);
    }
    p.push([cyl(9), C.straw, m(0.26, 0.12, 0.12, 0.12, 0.2, 0.12)]);
    for (let i = 0; i < 3; i++)
      p.push([sphere(6, 4), C.seed, m(0.23 + i * 0.04, 0.24, 0.12, 0.04, 0.03, 0.05, 0, i, 0)]);
  }
  if (level >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.8;
      p.push([
        box(),
        C.guardStoneDark,
        m(Math.cos(a) * 0.2 * s, h * 0.3, Math.sin(a) * 0.2 * s, 0.07, h * 0.6, 0.14, 0, -a, 0),
      ]);
    }
  }
  flag(p, level, 0.28, 0.1, -0.22);
  return p;
}
