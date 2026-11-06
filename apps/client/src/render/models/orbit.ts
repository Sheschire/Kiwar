import { Vector3 } from 'three';
import { C, box, cyl, emitter, m, rig, sphere, type Parts } from './kit';
import { A, lamp, mix, under, type Look } from './ageKit';

/** Chantier 53: the smooth green-bronze skin of a kiwai (the yard's model and the orbit view). */
export const KIWAI_SKIN = '#8a9a4a';
export const KIWAI_SHINE = '#c8c27a';

/**
 * Chantier 53: the orbital yard (Age of the stars). A round pad of star stone with a crystal
 * rim, a gantry of celestial brass holding a small kiwai ready to go (smooth, green-bronze), a
 * slanted launch rail and a beacon that turns; level 2 adds a second arm and a fuel tank,
 * level 3 a ring of night glass around the kiwai and a taller mast.
 */
export function orbitalYard(look: Look): Parts {
  const p: Parts = [];
  // Drawn at a unit tile, then grown: the rig pivots and emitters grow with the parts.
  const [sx, sy, sz] = [1.35, 1.45, 1.35];
  under(p, m(0, 0, 0, sx, sy, sz), () => yardParts(p, look), true);
  for (const r of p.rigs ?? []) r.pivot.multiply(new Vector3(sx, sy, sz));
  for (const e of p.emitters ?? []) e.at = [e.at[0] * sx, e.at[1] * sy, e.at[2] * sz];
  return p;
}

function yardParts(p: Parts, look: Look): void {
  const { age, tier } = look;
  // The pad.
  p.push([cyl(18), A.starstoneDark, m(0, 0.02, 0, 0.46, 0.04, 0.46)]);
  p.push([cyl(18), A.starstone, m(0, 0.05, 0, 0.4, 0.03, 0.4)]);
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    p.push([box(), A.crystal, m(Math.cos(a) * 0.43, 0.06, Math.sin(a) * 0.43, 0.06, 0.02, 0.06)]);
  }
  // The gantry: two posts and a top beam, celestial brass.
  for (const dx of [-0.24, 0.24]) {
    p.push([box(), A.celestial, m(dx, 0.36, -0.12, 0.05, 0.62, 0.05)]);
    p.push([box(), mix(A.celestial, '#1a1410', 0.3), m(dx, 0.36, -0.12, 0.02, 0.6, 0.07)]);
  }
  p.push([box(), A.celestial, m(0, 0.68, -0.12, 0.54, 0.05, 0.06)]);
  // The kiwai in its cradle, ready to go.
  p.push([sphere(14, 10), KIWAI_SKIN, m(0, 0.38, -0.06, 0.18, 0.17, 0.18)]);
  p.push([sphere(10, 7), KIWAI_SHINE, m(-0.06, 0.45, 0.03, 0.06, 0.05, 0.05)]);
  p.push([cyl(12), A.night, m(0, 0.22, -0.06, 0.12, 0.03, 0.12)]);
  // The launch rail, slanted towards the sky.
  p.push([box(), C.ironDark, m(0.22, 0.2, 0.2, 0.04, 0.03, 0.42, -0.6, 0, 0)]);
  p.push([box(), A.steel, m(0.22, 0.24, 0.2, 0.025, 0.02, 0.42, -0.6, 0, 0)]);
  // The beacon on the beam, turning.
  p.push([cyl(8), A.celestial, m(0, 0.72, -0.12, 0.03, 0.04, 0.03)]);
  p.push([box(), A.starlight, m(0, 0.77, -0.12, 0.16, 0.025, 0.025), 'beacon']);
  rig(p, 'beacon', [0, 0.77, -0.12], {
    kind: 'spin',
    axis: 'y',
    amount: 1,
    speed: 1.2,
    ambient: true,
  });
  // The control booth with its door (it glows at night).
  p.push([box(), A.starstone, m(-0.3, 0.12, 0.12, 0.16, 0.24, 0.16)]);
  p.push([box(), A.night, m(-0.3, 0.25, 0.12, 0.19, 0.03, 0.19)]);
  p.push([box(), C.door, m(-0.3, 0.09, 0.205, 0.07, 0.15, 0.01)]);
  lamp(p, age, -0.32, 0.36, 'yardLamp');
  emitter(p, { kind: 'glint', at: [0, 0.4, -0.06], rate: 0.5 });
  if (tier >= 2) {
    // A second arm reaching the kiwai, and a fuel tank of stardust.
    p.push([box(), A.celestial, m(-0.12, 0.52, -0.09, 0.2, 0.03, 0.03, 0, 0, -0.5)]);
    p.push([cyl(10), A.starstone, m(0.32, 0.16, -0.26, 0.07, 0.24, 0.07)]);
    p.push([sphere(8, 6), A.celestial, m(0.32, 0.29, -0.26, 0.07, 0.04, 0.07)]);
  }
  if (tier >= 3) {
    // A ring of night glass round the kiwai, a taller mast.
    p.push([cyl(20), A.night, m(0, 0.36, -0.06, 0.22, 0.012, 0.22, 0.3, 0, 0)]);
    p.push([box(), A.celestial, m(-0.24, 0.84, -0.12, 0.03, 0.32, 0.03)]);
    p.push([sphere(6, 5), A.starlight, m(-0.24, 1.01, -0.12, 0.03, 0.03, 0.03)]);
  }
}
