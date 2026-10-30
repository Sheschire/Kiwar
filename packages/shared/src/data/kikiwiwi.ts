import { ms } from './curves';
import type { Resources } from './resources';

/**
 * Chantier 08 (second half): the laboratory against nature turns a kiwi into a Kikiwiwi with
 * juice from the planet. Long and costly; it can fail (the kiwi survives, hurt and weakened).
 * At most one per age reached from the Iron age (Iron 1, Industry 2).
 */
export const KIKIWIWI = {
  /** Kiwi level needed (an invested kiwi). */
  minLevel: 5,
  /** Paid when the infusion starts (lost on a failure). */
  cost: { pulp: 1000, seeds: 400, juice: 2500 } as Partial<Resources>,
  /** Chantier 13: stardust paid on top of the cost. */
  stardust: 10,
  /** Infusion time by laboratory level. */
  durationMs: [ms.h(16), ms.h(12), ms.h(8)] as readonly number[],
  risk: {
    base: 0.4,
    /**
     * Less risk per point of Endurance and of Strength above average (chantier 37), per kiwi
     * level above the first.
     */
    endurance: 0.02,
    strength: 0.02,
    level: 0.01,
    /** Less risk by laboratory level (index = level − 1). */
    lab: [0, 0.08, 0.16] as readonly number[],
    min: 0.05,
    max: 0.6,
  },
  failure: {
    /** The kiwi rests this long, and loses a point of these stats. */
    injuredMs: ms.h(24),
    stats: ['strength', 'endurance'] as const,
  },
  /** Kikiwiwis allowed by age (index = age): from the Iron age, one per age reached. */
  capByAge: [0, 0, 1, 2, 3] as readonly number[],
  /**
   * What the juice does to a kiwi (multiplied onto its trait and class): four times as strong,
   * hard to hurt, but heavy in the ship's hold and a big eater on expeditions.
   */
  modifiers: { fight: 4, exposure: 0.3, weight: 5, rations: 3 },
  /** On the rampart: reaches ferrets and bats alike, whatever its class. */
  affinity: { ground: 1, air: 1 },
  /** Juice drunk per hour at home (on top of the usual meals). */
  upkeep: 40,
  /** Power while the colony has no juice left. */
  weakPower: 0.5,
  /** Kikiwiwis on one ship. */
  perShip: 1,
  /** Chantier 37: a Kikiwiwi loses its class and its class skills (no trade any more). */
  losesClass: true,
} as const;
