import { TorusGeometry, SphereGeometry } from 'three';
import { C, box, cyl, cone, sphere, m, rig, emitter, type Parts } from './kit';
import {
  A,
  banner,
  byAge,
  cap,
  chimney,
  door,
  gable,
  lamp,
  mix,
  round,
  wall,
  type Look,
} from './ageKit';

/**
 * The Nest. Chantier 33: from the Stone age it sits on a round plinth of the age (dry stones,
 * an iron-hooped tub, brick with a brass rim) and always holds the golden egg; tier 2 rings it
 * with posts of the age (twigs, standing stones, capped beams, brass lamps), tier 3 raises an
 * arch behind it (a trilithon, a timber gate under tiles, a brick gate with a clock).
 */
export function nest(look: Look): Parts {
  const { age } = look;
  // Later ages keep every Eden piece (the level-3 form) in their own materials.
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 1 + (level - 1) * 0.12;
  const y0 = age > 0 ? 0.12 : 0;
  if (age > 0) round(p, age, 0, y0 / 2, 0, 0.66 * s, y0, C.straw, 14);
  p.push([
    new TorusGeometry(0.5 * s, 0.17 * s, 6, 14),
    C.straw,
    m(0, 0.16 + y0, 0, 1, 1, 1, Math.PI / 2),
  ]);
  p.push([cyl(14), C.strawDark, m(0, 0.08 + y0, 0, 0.5 * s, 0.12, 0.5 * s)]);
  // Woven twigs around the rim.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.push([
      box(),
      C.twig,
      m(Math.cos(a) * 0.55 * s, 0.2 + y0, Math.sin(a) * 0.55 * s, 0.05, 0.05, 0.42, 0.3, -a, 0.4),
    ]);
  }
  const rich = level >= 3 || age > 0;
  const eggs = rich ? 4 : 3;
  for (let i = 0; i < eggs; i++) {
    const a = (i / eggs) * Math.PI * 2 + 0.4;
    const gold = rich && i === 0;
    const ex = Math.cos(a) * 0.2;
    const ez = Math.sin(a) * 0.2;
    // Eggs rock gently on their base; the golden one twinkles.
    rig(p, `egg${i}`, [ex, 0.09 + y0, ez], {
      kind: 'swing',
      axis: i % 2 ? 'x' : 'z',
      amount: 0.1,
      speed: 1.6 + i * 0.35,
      ambient: true,
    });
    p.push([sphere(), gold ? C.goldEgg : C.egg, m(ex, 0.25 + y0, ez, 0.13, 0.17, 0.13), `egg${i}`]);
    if (gold) emitter(p, { kind: 'gold', at: [ex, 0.36 + y0, ez], rate: 1.6, ambient: true });
  }
  if (level >= 2) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tx = Math.cos(a) * (age > 0 ? 0.74 : 0.62) * s;
      const tz = Math.sin(a) * (age > 0 ? 0.74 : 0.62) * s;
      if (age === 0) {
        // Twigs quivering in the breeze.
        rig(p, `twig${i}`, [tx, 0.22, tz], {
          kind: 'swing',
          axis: i % 2 ? 'x' : 'z',
          amount: 0.07,
          speed: 5 + i,
          ambient: true,
        });
        p.push([cone(4), C.twig, m(tx, 0.38, tz, 0.05, 0.35, 0.05), `twig${i}`]);
      } else if (age === 1) {
        const h = 0.3 + (i % 2) * 0.1;
        p.push([
          box(),
          i % 2 ? A.drystone : A.drystoneLight,
          m(tx, h / 2, tz, 0.09, h, 0.07, 0, -a, 0.06),
        ]);
      } else if (age === 2) {
        p.push([box(), A.beam, m(tx, 0.2, tz, 0.05, 0.4, 0.05, 0, -a)]);
        p.push([cone(4), C.ironDark, m(tx, 0.45, tz, 0.045, 0.1, 0.045, 0, Math.PI / 4 - a)]);
      } else {
        p.push([cyl(6), A.steel, m(tx, 0.22, tz, 0.02, 0.44, 0.02)]);
        p.push([sphere(6, 4), i % 2 ? C.goldEgg : A.glass, m(tx, 0.47, tz, 0.045, 0.05, 0.045)]);
      }
    }
  }
  if (level >= 3) {
    p.push([new TorusGeometry(0.28, 0.1, 6, 12), C.straw, m(0, 0.5 + y0, 0, 1, 1, 1, Math.PI / 2)]);
  }
  if (look.tier >= 3 && age > 0) {
    // The crown: an arch behind the nest (the Nest at the heart turns its -z to the camera).
    const z = 0.78 * s;
    const x = 0.46 * s;
    const h = 0.95;
    if (age === 1) {
      for (const side of [-1, 1])
        p.push([box(), A.drystone, m(side * x, h / 2, z, 0.16, h, 0.14, 0, 0, side * 0.04)]);
      p.push([box(), A.drystoneLight, m(0, h + 0.05, z, 2 * x + 0.3, 0.12, 0.16)]);
    } else if (age === 2) {
      for (const side of [-1, 1]) wall(p, age, side * x, h / 2, z, 0.12, h, 0.12, C.wood);
      p.push([box(), A.beam, m(0, h, z, 2 * x + 0.2, 0.06, 0.1)]);
      gable(p, age, 0, h + 0.06, z - 0.04, 0.14, 2 * x + 0.24, 0.12, C.roof);
      rig(p, 'bell', [0, h - 0.05, z], {
        kind: 'swing',
        axis: 'z',
        amount: 0.3,
        speed: 1.5,
        ambient: true,
      });
      p.push([cone(8), C.flagGold, m(0, h - 0.1, z, 0.05, 0.08, 0.05), 'bell']);
    } else {
      for (const side of [-1, 1]) wall(p, age, side * x, h / 2, z, 0.14, h, 0.14, C.brick);
      p.push([box(), A.brickDark, m(0, h + 0.04, z, 2 * x + 0.24, 0.09, 0.15)]);
      p.push([cyl(14), A.brass, m(0, h + 0.2, z, 0.16, 0.03, 0.16, Math.PI / 2)]);
      p.push([cyl(14), C.white, m(0, h + 0.2, z + 0.012, 0.13, 0.03, 0.13, Math.PI / 2)]);
      p.push([box(), C.seed, m(0.03, h + 0.22, z + 0.03, 0.06, 0.012, 0.01, 0, 0, 0.6)]);
      emitter(p, { kind: 'smoke', at: [x, h + 0.08, z], rate: 0.6, ambient: true });
    }
  }
  if (age >= 2) lamp(p, age, -0.72 * s, 0.4, 'nestLamp');
  banner(p, look, 0.6 * s, 0.25 + y0, -0.2);
  return p;
}

/**
 * Hut: furry domes (Eden). Chantier 33: dry-stone beehive huts under thatch (Stone),
 * half-timbered houses under tiles (Iron), brick houses with metal roofs and chimneys
 * (Industry). Each tier adds a room; tier 3 of the later ages an upper floor.
 */
export function hut(look: Look): Parts {
  const { age } = look;
  // Later ages keep every Eden piece (the level-3 form) in their own materials.
  const level = age > 0 ? 3 : look.tier;
  const p: Parts = [];
  const s = 0.85 + level * 0.1;
  const roofColor = byAge(age, [C.straw, C.straw, C.roof, mix(C.roof, A.steel, 0.35)]);
  const dome = (x: number, z: number, k: number) => {
    if (age === 0) {
      p.push([
        new SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        C.fur,
        m(x, 0, z, 0.42 * k, 0.45 * k, 0.42 * k),
      ]);
      p.push([box(), C.door, m(x, 0.11 * k, z + 0.38 * k, 0.14 * k, 0.22 * k, 0.05)]);
      // A tiny beak-shaped awning above the door.
      p.push([
        cone(5),
        C.straw,
        m(x, 0.3 * k, z + 0.42 * k, 0.05, 0.22, 0.05, Math.PI / 2.4, 0, 0),
      ]);
    } else if (age === 1) {
      round(p, age, x, 0.15 * k, z, 0.38 * k, 0.3 * k, C.fur);
      cap(p, age, x, 0.48 * k, z, 0.44 * k, 0.38 * k, roofColor);
      door(p, age, x, 0.11 * k, z + 0.4 * k, 0.13 * k, 0.2 * k, 0.03);
    } else {
      wall(p, age, x, 0.18 * k, z, 0.66 * k, 0.36 * k, 0.5 * k, C.fur);
      gable(p, age, x, 0.36 * k, z, 0.24 * k, 0.72 * k, 0.3 * k, roofColor);
      door(p, age, x, 0.11 * k, z + 0.26 * k, 0.13 * k, 0.21 * k);
    }
  };
  dome(0, 0, s);
  // Chantier 11: each level adds a room you can see from afar.
  if (level >= 2) {
    dome(0.4, -0.26, 0.62);
    if (age === 0) p.push([cyl(6), C.stoneDark, m(0.18, 0.42 * s, -0.1, 0.06, 0.25, 0.06)]);
  }
  if (age === 0)
    emitter(p, {
      kind: 'smoke',
      at: level >= 2 ? [0.18, 0.42 * s + 0.14, -0.1] : [0, 0.5 * s, 0],
      rate: 0.8,
      ambient: true,
    });
  else chimney(p, age, 0.3 * s, -0.2 * s, 0.55 * s + age * 0.06);
  if (level >= 3) {
    dome(-0.42, -0.3, 0.6);
    if (age === 0) {
      // A thatched cap on the main room.
      p.push([cone(10), C.straw, m(0, 0.5 * s, 0, 0.26 * s, 0.24 * s, 0.26 * s)]);
      p.push([cyl(10), C.strawDark, m(0, 0.4 * s, 0, 0.27 * s, 0.03, 0.27 * s)]);
    } else if (look.tier < 3) {
      // Tier 3 of the later ages: the crown below.
    } else if (age === 1) {
      // A taller thatch with a smoke hole.
      cap(p, age, 0, 0.78 * s, 0, 0.24 * s, 0.26 * s, roofColor);
    } else {
      // An upper floor on the main house.
      wall(p, age, -0.06, 0.5 * s, -0.08 * s, 0.36 * s, 0.22 * s, 0.26 * s, C.fur);
      gable(p, age, -0.06, 0.62 * s, -0.08 * s, 0.14 * s, 0.42 * s, 0.17 * s, roofColor);
      p.push([box(), C.goldEgg, m(-0.06, 0.5 * s, 0.055 * s, 0.07, 0.08, 0.015)]);
    }
  }
  if (age === 0)
    p.push([sphere(6, 4), C.furDark, m(0, (level >= 3 ? 0.64 : 0.45) * s, 0, 0.06, 0.06, 0.06)]);
  banner(p, look, 0.42, 0.05, 0.2);
  return p;
}
