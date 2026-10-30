import { C, box, cyl, emitter, m, sphere, type Parts } from './kit';
import { A, byAge, frameColor, lamp, mix, type Look } from './ageKit';

/**
 * Chantier 48: the tunnel entrance (Iron age). A mound of green flesh with a dark arched mouth
 * propped by a timber frame, rails coming out with a small cart of sap, a lantern; level 2 adds
 * a winch on a headframe, level 3 an iron grille over the mouth. Earthy colours with the kiwi's
 * green flesh around the hole.
 */
export function tunnel(look: Look): Parts {
  const { age, tier } = look;
  const p: Parts = [];
  const frame = frameColor(age);
  const flesh = '#7fae3e';
  // The mound and the dark mouth facing the door side (+z).
  p.push([sphere(10, 6), flesh, m(0, 0.02, -0.04, 0.42, 0.26, 0.4)]);
  p.push([sphere(10, 6), mix(flesh, '#c9d97a', 0.4), m(0, 0.05, -0.06, 0.3, 0.2, 0.28)]);
  p.push([cyl(12), '#1d1a14', m(0, 0.13, 0.33, 0.14, 0.03, 0.14, Math.PI / 2)]);
  p.push([box(), '#1d1a14', m(0, 0.065, 0.34, 0.28, 0.13, 0.03)]);
  // The timber (or iron) frame around the mouth.
  for (const dx of [-0.17, 0.17]) p.push([box(), frame, m(dx, 0.13, 0.36, 0.04, 0.26, 0.04)]);
  p.push([box(), frame, m(0, 0.27, 0.36, 0.42, 0.045, 0.05)]);
  // Rails out of the mouth, and the cart.
  for (const dx of [-0.06, 0.06])
    p.push([box(), C.ironDark, m(dx, 0.012, 0.47, 0.012, 0.012, 0.36)]);
  for (let i = 0; i < 4; i++)
    p.push([box(), C.woodDark, m(0, 0.006, 0.33 + i * 0.09, 0.18, 0.01, 0.025)]);
  p.push([
    box(),
    byAge(age, [C.wood, C.wood, C.woodDark, A.steel]),
    m(0, 0.07, 0.52, 0.14, 0.08, 0.12),
  ]);
  p.push([box(), C.juice, m(0, 0.11, 0.52, 0.11, 0.02, 0.09)]);
  for (const dx of [-0.075, 0.075])
    for (const dz of [-0.04, 0.04])
      p.push([cyl(6), C.ironDark, m(dx, 0.03, 0.52 + dz, 0.025, 0.012, 0.025, 0, 0, Math.PI / 2)]);
  lamp(p, age, 0.3, 0.32, 'tunnelLamp');
  emitter(p, { kind: 'dust', at: [0, 0.08, 0.3], rate: 0.8 });
  if (tier >= 2) {
    // A headframe with its winch above the mouth.
    for (const dx of [-0.22, 0.22]) p.push([box(), frame, m(dx, 0.36, 0.05, 0.035, 0.6, 0.035)]);
    p.push([box(), frame, m(0, 0.66, 0.05, 0.5, 0.04, 0.04)]);
    p.push([cyl(10), C.woodDark, m(0, 0.58, 0.05, 0.07, 0.12, 0.07, 0, 0, Math.PI / 2)]);
    p.push([cyl(4), C.straw, m(0, 0.42, 0.12, 0.008, 0.3, 0.008)]);
  }
  if (tier >= 3) {
    // An iron grille that can close the mouth.
    for (let i = -2; i <= 2; i++)
      p.push([cyl(4), A.steel, m(i * 0.06, 0.13, 0.37, 0.01, 0.24, 0.01)]);
    p.push([box(), A.steel, m(0, 0.2, 0.37, 0.3, 0.015, 0.015)]);
  }
  return p;
}
