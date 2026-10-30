import { TorusGeometry } from 'three';
import { shipIdForAge, type ShipId } from '@kiwar/shared';
import { C, box, cyl, cone, sphere, m, rig, emitter, type Parts } from './kit';
import { A, banner, beam, byAge, pipe, round, type Look } from './ageKit';

/** Colours of each ship generation (chantier 07): hull, trim, wings. */
export const SHIP_LOOKS: Record<ShipId, { hull: string; trim: string; wing: string }> = {
  wood: { hull: C.wood, trim: C.woodDark, wing: C.cream },
  logs: { hull: C.twig, trim: C.straw, wing: '#e8d7b0' },
  iron: { hull: '#8f969c', trim: '#5d646b', wing: '#b7bdc2' },
  jet: { hull: '#eef2f0', trim: '#3aa6a0', wing: '#d5e4e2' },
  // Chantier 51: celestial brass and crystal sails.
  sail: { hull: '#f3ead8', trim: '#c9a227', wing: '#cfe8f2' },
};

/**
 * The mechanical kiwi bird (chantier 07): round body, small head, long beak, folded legs and
 * two wings on rigs (`wingL`, `wingR`, pivots at the shoulders). The body is the `ship` rig, so
 * it breathes on the pad. Front is +z. Each generation has its own materials and gear: pedal
 * crank (wood), rope bands (logs), rivets and a steam stack (iron), thrusters (jet).
 */
export function bird(p: Parts, gen: ShipId, docked: boolean): void {
  const look = SHIP_LOOKS[gen];
  const y = 0.46;
  if (docked)
    rig(p, 'ship', [0, 0.16, 0], { kind: 'breathe', amount: 0.03, speed: 1.4, ambient: true });
  const body = docked ? 'ship' : undefined;
  p.push([sphere(12, 8), look.hull, m(0, y, 0, 0.29, 0.26, 0.38), body]);
  // Head, beak and eyes.
  p.push([sphere(10, 7), look.hull, m(0, y + 0.13, 0.3, 0.14, 0.13, 0.14), body]);
  p.push([cone(8), '#e2c992', m(0, y + 0.07, 0.6, 0.035, 0.36, 0.035, Math.PI / 2 + 0.35), body]);
  for (const side of [-1, 1])
    p.push([sphere(6, 4), C.seed, m(side * 0.09, y + 0.17, 0.39, 0.025, 0.025, 0.025), body]);
  // Folded legs.
  for (const side of [-1, 1])
    p.push([cyl(5), '#c9a36a', m(side * 0.1, y - 0.24, 0.02, 0.025, 0.16, 0.025, 1.1), body]);
  // Tail tuft.
  p.push([cone(6), look.trim, m(0, y + 0.02, -0.4, 0.08, 0.14, 0.06, -Math.PI / 2 - 0.3), body]);
  if (gen === 'wood') {
    // Pedal crank on the flank.
    for (const side of [-1, 1])
      p.push([
        new TorusGeometry(0.07, 0.015, 4, 10),
        look.trim,
        m(side * 0.29, y - 0.05, 0, 1, 1, 1, 0, Math.PI / 2),
        body,
      ]);
  } else if (gen === 'logs') {
    for (const z of [-0.16, 0.12])
      p.push([new TorusGeometry(0.27, 0.018, 4, 16), look.trim, m(0, y, z, 1, 0.95, 1), body]);
  } else if (gen === 'iron') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      p.push([
        sphere(4, 3),
        look.trim,
        m(Math.cos(a) * 0.29, y + Math.sin(a) * 0.25, 0.02, 0.02, 0.02, 0.02),
        body,
      ]);
    }
    p.push([cyl(8), look.trim, m(0, y + 0.3, -0.1, 0.045, 0.16, 0.045), body]);
    emitter(p, { kind: 'smoke', at: [0, y + 0.4, -0.1], rate: 0.6, ambient: true });
  } else {
    for (const side of [-1, 1])
      p.push([
        cone(8),
        C.flagGold,
        m(side * 0.12, y - 0.04, -0.44, 0.07, 0.14, 0.07, -Math.PI / 2),
        body,
      ]);
  }
  // Wings: canvas (or plates) on a frame, hinged at the shoulders.
  for (const side of [-1, 1]) {
    const name = side < 0 ? 'wingL' : 'wingR';
    const sx = side * 0.26;
    rig(p, name, [sx, y + 0.08, 0], {
      kind: 'swing',
      axis: 'z',
      amount: side * 0.22,
      speed: 0.9,
      ambient: true,
    });
    p.push([
      box(),
      look.wing,
      m(sx + side * 0.22, y + 0.08, -0.02, 0.44, 0.025, 0.26, 0, side * 0.12),
      name,
    ]);
    p.push([
      box(),
      look.trim,
      m(sx + side * 0.22, y + 0.095, 0.1, 0.46, 0.03, 0.03, 0, side * 0.12),
      name,
    ]);
    if (gen === 'wood' || gen === 'logs')
      for (const k of [0.12, 0.3])
        p.push([box(), look.trim, m(sx + side * k, y + 0.095, -0.02, 0.02, 0.03, 0.24), name]);
  }
}

/**
 * Launch platform; the mechanical kiwi bird is drawn only while it is docked (its generation
 * follows the colony's age). Chantier 33: a dry-stone ring (Stone), iron deck plates and a
 * riveted tower (Iron), a steel deck, brass rails and a fuel tank (Industry).
 */
export function launchpad(look: Look): Parts {
  const { age } = look;
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 0.9 + level * 0.08;
  if (age === 1) round(p, age, 0, 0.05, 0, 0.66 * s, 0.1, C.stone, 14);
  p.push([
    cyl(14),
    byAge(age, [C.lightWood, C.lightWood, C.ironDark, A.steel]),
    m(0, 0.06, 0, 0.62 * s, 0.12, 0.62 * s),
  ]);
  p.push([cyl(14), age >= 3 ? A.brass : C.copper, m(0, 0.115, 0, 0.6 * s, 0.03, 0.6 * s)]);
  p.push([
    cyl(14),
    byAge(age, [C.straw, C.straw, C.iron, '#8d969c']),
    m(0, 0.13, 0, 0.5 * s, 0.02, 0.5 * s),
  ]);
  if (age >= 2)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.push([
        sphere(4, 3),
        age >= 3 ? A.brass : C.ironDark,
        m(Math.cos(a) * 0.42 * s, 0.14, Math.sin(a) * 0.42 * s, 0.025, 0.02, 0.025),
      ]);
    }
  // Launch tower.
  const post = byAge(age, [C.woodDark, C.woodDark, C.ironDark, A.steel]);
  p.push([box(), post, m(-0.5 * s, 0.55, -0.1, 0.06, 1.0, 0.06)]);
  p.push([box(), post, m(-0.5 * s, 0.55, 0.12, 0.06, 1.0, 0.06)]);
  for (const y of [0.35, 0.7]) p.push([box(), C.copper, m(-0.42 * s, y, 0.01, 0.2, 0.04, 0.26)]);
  if (age >= 2)
    for (const [a, b] of [
      [0.15, 0.5],
      [0.5, 0.95],
    ] as const) {
      beam(p, post, [-0.5 * s, a, -0.1], [-0.5 * s, b, 0.12], 0.025);
      beam(p, post, [-0.5 * s, a, 0.12], [-0.5 * s, b, -0.1], 0.025);
    }
  p.push([cone(6), C.copper, m(-0.5 * s, 1.1, 0.01, 0.07, 0.12, 0.17)]);
  if (look.docked) bird(p, shipIdForAge(look.colonyAge), true);
  if (level >= 2) {
    // Chantier 11: a striped windsock for the pilots.
    p.push([cyl(5), post, m(0.52, 0.45, -0.38, 0.02, 0.9, 0.02)]);
    rig(p, 'sock', [0.52, 0.86, -0.38], {
      kind: 'swing',
      axis: 'y',
      amount: 0.5,
      speed: 1.4,
      ambient: true,
    });
    p.push([cone(8), C.copper, m(0.62, 0.86, -0.38, 0.06, 0.2, 0.06, 0, 0, Math.PI / 2), 'sock']);
    p.push([cone(8), C.white, m(0.68, 0.86, -0.38, 0.045, 0.08, 0.045, 0, 0, Math.PI / 2), 'sock']);
  }
  if (level >= 3) {
    p.push([box(), C.copper, m(-0.5 * s, 1.24, 0.01, 0.06, 0.3, 0.28)]);
    p.push([sphere(8, 6), C.flagGold, m(-0.5 * s, 1.44, 0.01, 0.08, 0.08, 0.08)]);
    emitter(p, { kind: 'gold', at: [-0.5 * s, 1.49, 0.01], rate: 0.8, ambient: true });
    for (let i = 0; i < 3; i++)
      p.push([
        cyl(8),
        i === 1 ? C.copper : C.lightWood,
        m(0.3 + i * 0.13, 0.2, 0.5, 0.06, 0.16, 0.06),
      ]);
  }
  if (age >= 3) {
    // The fuel tank, piped to the deck.
    p.push([cyl(12), C.copper, m(-0.15, 0.3, -0.62, 0.1, 0.3, 0.1)]);
    p.push([sphere(8, 5), C.copper, m(-0.15, 0.45, -0.62, 0.1, 0.05, 0.1)]);
    for (const y of [0.2, 0.4]) p.push([cyl(12), A.brass, m(-0.15, y, -0.62, 0.105, 0.02, 0.105)]);
    pipe(p, [-0.12, 0.18, -0.53], [-0.08, 0.13, -0.4], A.steel, 0.02);
  }
  banner(p, look, 0.5, 0.12, 0.35);
  return p;
}
