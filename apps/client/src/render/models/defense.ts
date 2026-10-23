import { TorusGeometry } from 'three';
import { C, box, cyl, cone, sphere, m, rig, type Parts } from './kit';
import { A, banner, beam, byAge, round, under, type Look } from './ageKit';

/** The weapons' rest heading: three-quarters, so their barrel or bow shows in profile. */
const AIM = 0.9;

/**
 * Chantier 33: the turrets, redrawn to read from afar — a tower, then a big weapon on top that
 * turns to watch its sector, its barrel or bow pointing out. Every age has its weapon; the tiers
 * add armour (2) and spikes or buttresses (3) in every age.
 */

/**
 * Seed turret (anti-ferret, chantier 06): a log palisade with a big crossbow (Eden), a
 * crenellated dry-stone tower with a ballista (Stone), a seed cannon on its carriage on an
 * iron-banded tower (Iron), a twin-barrelled gun with a drum on a brick tower (Industry).
 */
export function seedTurret(look: Look): Parts {
  const { age, tier } = look;
  const p: Parts = [];
  const s = 0.85 + tier * 0.08;
  const h = 0.36 + tier * 0.1;
  const stone = byAge(age, [C.wood, A.drystone, C.guardStone, A.brick]);
  const deck = byAge(age, [C.woodDark, A.drystoneDark, C.guardStoneDark, A.steel]);
  if (age === 0) {
    // A palisade of logs, sharpened at the top, bound by a straw rope.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const lh = h + (i % 2) * 0.05;
      const x = Math.cos(a) * 0.27 * s;
      const z = Math.sin(a) * 0.27 * s;
      p.push([cyl(6), i % 2 ? C.wood : C.twig, m(x, lh / 2, z, 0.06, lh, 0.06)]);
      p.push([cone(6), C.wood, m(x, lh + 0.04, z, 0.06, 0.08, 0.06)]);
    }
    p.push([cyl(10), C.straw, m(0, h * 0.45, 0, 0.31 * s, 0.04, 0.31 * s)]);
    p.push([cyl(10), deck, m(0, h - 0.02, 0, 0.27 * s, 0.05, 0.27 * s)]);
  } else {
    round(p, age, 0, h / 2, 0, 0.29 * s, h, stone, 10);
    p.push([cyl(10), deck, m(0, h + 0.03, 0, 0.36 * s, 0.06, 0.36 * s)]);
    if (age <= 2)
      // Crenels.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        p.push([
          box(),
          deck,
          m(Math.cos(a) * 0.31 * s, h + 0.1, Math.sin(a) * 0.31 * s, 0.1, 0.1, 0.09, 0, -a, 0),
        ]);
      }
    else
      p.push([
        new TorusGeometry(0.33 * s, 0.015, 4, 16),
        A.brass,
        m(0, h + 0.14, 0, 1, 1, 1, Math.PI / 2),
      ]);
  }
  // The weapon turns slowly, watching the land below.
  const y = h + (age === 0 ? 0.16 : 0.2);
  rig(p, 'bow', [0, y, 0], { kind: 'swing', axis: 'y', amount: 0.8, speed: 0.7, ambient: true });
  // Authored along +z, turned to show its profile to the default camera.
  under(
    p,
    m(0, 0, 0, 1.25, 1.25, 1.25, 0, AIM, 0).premultiply(m(0, -y * 0.25)),
    () => {
      if (age <= 1) {
        // A big crossbow (a ballista at the Stone age): stock, wide arms, string and a loaded seed.
        const span = age === 0 ? 0.34 : 0.4;
        const wood = age === 0 ? C.wood : C.woodDark;
        p.push([box(), wood, m(0, y, 0.06, 0.09, 0.08, 0.56), 'bow']);
        p.push([box(), C.woodDark, m(0, y - 0.07, -0.02, 0.06, 0.14, 0.06), 'bow']);
        for (const side of [-1, 1]) {
          beam(p, wood, [0, y + 0.02, 0.3], [side * span, y + 0.02, 0.16], 0.045, false, 'bow');
          beam(p, C.straw, [side * span, y + 0.02, 0.16], [0, y + 0.02, -0.08], 0.01, true, 'bow');
          if (age === 1)
            p.push([box(), C.ironDark, m(side * span, y + 0.02, 0.16, 0.05, 0.06, 0.05), 'bow']);
        }
        p.push([sphere(6, 5), C.seed, m(0, y + 0.07, 0.2, 0.06, 0.045, 0.09), 'bow']);
        if (age === 1) p.push([box(), A.drystoneDark, m(0, y - 0.02, -0.2, 0.14, 0.1, 0.1), 'bow']);
      } else if (age === 2) {
        // A seed cannon on a wooden carriage.
        p.push([box(), C.wood, m(0, y - 0.05, 0, 0.22, 0.08, 0.3), 'bow']);
        for (const side of [-1, 1])
          p.push([
            cyl(10),
            C.woodDark,
            m(side * 0.13, y - 0.05, 0.02, 0.08, 0.03, 0.08, 0, 0, Math.PI / 2),
            'bow',
          ]);
        p.push([
          cyl(10),
          C.ironDark,
          m(0, y + 0.04, 0.12, 0.075, 0.56, 0.075, Math.PI / 2 - 0.12),
          'bow',
        ]);
        p.push([
          cyl(10),
          C.iron,
          m(0, y + 0.075, 0.4, 0.09, 0.05, 0.09, Math.PI / 2 - 0.12),
          'bow',
        ]);
        p.push([sphere(8, 6), C.ironDark, m(0, y + 0.0, -0.16, 0.08, 0.08, 0.08), 'bow']);
      } else {
        // A twin-barrelled gun under a steel housing, fed by a brass drum.
        p.push([box(), A.steel, m(0, y, -0.02, 0.24, 0.14, 0.26), 'bow']);
        p.push([cyl(12), A.brass, m(0, y + 0.1, -0.08, 0.09, 0.2, 0.09, 0, 0, Math.PI / 2), 'bow']);
        for (const side of [-1, 1]) {
          p.push([
            cyl(8),
            C.ironDark,
            m(side * 0.06, y, 0.28, 0.04, 0.5, 0.04, Math.PI / 2),
            'bow',
          ]);
          p.push([cyl(8), A.brass, m(side * 0.06, y, 0.53, 0.05, 0.04, 0.05, Math.PI / 2), 'bow']);
        }
        p.push([box(), A.glass, m(0, y + 0.06, 0.1, 0.16, 0.05, 0.02), 'bow']);
      }
    },
    true,
  );
  if (tier >= 2) {
    // Chantier 11: big shield plates on the tower.
    const plate = byAge(age, [C.woodDark, C.ironDark, C.ironDark, A.steel]);
    for (const a of [0.7, -0.7, Math.PI])
      p.push([
        box(),
        plate,
        m(Math.sin(a) * 0.32 * s, h * 0.55, Math.cos(a) * 0.32 * s, 0.24, 0.28, 0.04, 0, a, 0),
      ]);
  }
  if (tier >= 3) {
    p.push([cyl(8), deck, m(0, 0.07, 0, 0.42 * s, 0.14, 0.42 * s)]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      p.push([
        cone(4),
        age >= 2 ? C.ironDark : C.woodDark,
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
  for (let i = 0; i < 2 + tier; i++)
    p.push([
      sphere(6, 5),
      C.seed,
      m(0.28 - i * 0.07, 0.04, 0.34 - (i % 2) * 0.06, 0.05, 0.035, 0.07, 0, i, 0),
    ]);
  banner(p, look, -0.34, h, -0.22);
  return p;
}

/**
 * Sky sling (anti-air): a tall tower firing seed bursts at the bats. A wooden trestle with a
 * big sling arm (Eden), a stone column with a counterweighted sling (Stone), an iron mortar
 * pointing at the sky (Iron), three steel barrels and a brass dish (Industry).
 */
export function skyTurret(look: Look): Parts {
  const { age, tier } = look;
  const p: Parts = [];
  const s = 0.85 + tier * 0.08;
  const h = 0.5 + tier * 0.12;
  const deck = byAge(age, [C.woodDark, A.drystoneDark, C.ironDark, A.steel]);
  if (age === 0) {
    // A trestle of three logs.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      beam(
        p,
        C.wood,
        [Math.cos(a) * 0.3 * s, 0, Math.sin(a) * 0.3 * s],
        [Math.cos(a) * 0.1, h, Math.sin(a) * 0.1],
        0.06,
        true,
      );
    }
    p.push([cyl(8), C.straw, m(0, h * 0.5, 0, 0.2 * s, 0.05, 0.2 * s)]);
  } else {
    round(p, age, 0, 0.07, 0, 0.32 * s, 0.14, C.guardStoneDark, 10);
    round(p, age, 0, h / 2, 0, 0.17 * s, h, C.guardStone, 10);
  }
  p.push([cyl(10), deck, m(0, h + 0.02, 0, 0.26 * s, 0.05, 0.26 * s)]);
  // The launcher turns round to follow the swarm.
  const y = h + 0.06;
  rig(p, 'sling', [0, y, 0], { kind: 'spin', axis: 'y', amount: 1, speed: 0.6, ambient: true });
  under(
    p,
    m(0, 0, 0, 1.3, 1.3, 1.3, 0, AIM, 0).premultiply(m(0, -y * 0.3)),
    () => {
      if (age <= 1) {
        // A long sling arm raised to the sky, a basket of seeds at its tip, a counterweight.
        const arm = age === 0 ? C.wood : C.woodDark;
        p.push([box(), C.woodDark, m(0, y + 0.03, 0, 0.16, 0.06, 0.1), 'sling']);
        beam(p, arm, [0, y + 0.04, -0.14], [0, y + 0.52, 0.16], 0.045, false, 'sling');
        p.push([cone(8), C.wood, m(0, y + 0.56, 0.19, 0.11, 0.12, 0.11, Math.PI), 'sling']);
        p.push([sphere(6, 5), C.seed, m(0, y + 0.6, 0.19, 0.07, 0.05, 0.07), 'sling']);
        p.push([
          age === 0 ? sphere(6, 5) : box(),
          age === 0 ? C.straw : A.drystone,
          m(0, y + 0.02, -0.17, 0.09, 0.09, 0.09),
          'sling',
        ]);
      } else if (age === 2) {
        // An iron mortar on a turntable, pointing at the sky.
        p.push([cyl(10), C.iron, m(0, y + 0.02, 0, 0.18, 0.04, 0.18), 'sling']);
        p.push([cyl(10), C.ironDark, m(0, y + 0.2, 0.05, 0.11, 0.36, 0.11, 0.35), 'sling']);
        p.push([cyl(10), C.iron, m(0, y + 0.37, 0.11, 0.13, 0.05, 0.13, 0.35), 'sling']);
        p.push([cyl(10), C.seed, m(0, y + 0.39, 0.12, 0.09, 0.02, 0.09, 0.35), 'sling']);
      } else {
        // Three steel barrels and a brass dish.
        p.push([cyl(10), A.steel, m(0, y + 0.04, 0, 0.15, 0.08, 0.15), 'sling']);
        for (const dx of [-0.07, 0, 0.07]) {
          p.push([cyl(8), C.ironDark, m(dx, y + 0.34, 0.07, 0.04, 0.6, 0.04, 0.25), 'sling']);
          p.push([cyl(8), A.brass, m(dx, y + 0.63, 0.14, 0.05, 0.05, 0.05, 0.25), 'sling']);
        }
        p.push([cone(12), A.brass, m(0, y + 0.22, -0.16, 0.15, 0.06, 0.15, -1.1), 'sling']);
        p.push([sphere(5, 4), A.glass, m(0, y + 0.25, -0.13, 0.03, 0.03, 0.03), 'sling']);
      }
    },
    true,
  );
  if (tier >= 2) {
    // Chantier 11: a lookout ring halfway up and a basket of seeds at the foot.
    p.push([cyl(10), age >= 2 ? C.ironDark : C.wood, m(0, h * 0.45, 0, 0.32 * s, 0.05, 0.32 * s)]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.push([
        box(),
        age >= 3 ? A.steel : C.woodDark,
        m(Math.cos(a) * 0.3 * s, h * 0.45 + 0.07, Math.sin(a) * 0.3 * s, 0.03, 0.12, 0.03),
      ]);
    }
    p.push([cyl(9), C.straw, m(0.3, 0.12, 0.16, 0.12, 0.2, 0.12)]);
    for (let i = 0; i < 3; i++)
      p.push([sphere(6, 4), C.seed, m(0.27 + i * 0.04, 0.24, 0.16, 0.04, 0.03, 0.05, 0, i, 0)]);
  }
  if (tier >= 3) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.8;
      p.push([
        box(),
        age === 0 ? C.woodDark : deck,
        m(Math.cos(a) * 0.2 * s, h * 0.3, Math.sin(a) * 0.2 * s, 0.07, h * 0.6, 0.14, 0, -a, 0),
      ]);
    }
  }
  banner(p, look, 0.3, 0.1, -0.24);
  return p;
}
