import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
} from 'three';
import { colored, mat, merged } from './geometry';
import type { PropId } from './pose';

/**
 * Chantier 34: the accessories of the kiwis. Held ones (`wing`) are authored in the grip frame
 * at the tip of the right wing, pointing forward along +Z; a forward swing of the wing raises
 * them. `front` ones sit in the body frame (a book held under the eyes), `ground` ones in
 * the kiwi's frame on the ground (a basket). `tip` is where a spell glows.
 */
export interface PropDef {
  anchor: 'wing' | 'front' | 'ground';
  geometry: () => BufferGeometry;
  tip: Vector3;
  /** Drawn along with this one (the quill's book). */
  companion?: PropId;
}

const WOOD = '#8a5a35';
const DARK_WOOD = '#5e3d24';
const IRON = '#b9b9c2';
const DARK_IRON = '#6d6c74';
const along = Math.PI / 2; // a cylinder's axis (Y) turned to +Z

export const PROPS: Record<PropId, PropDef> = {
  book: {
    anchor: 'front',
    tip: new Vector3(0, 0.14, 0.44),
    geometry: () => {
      // Two open covers in a V, tilted towards the eyes, pages on top, held under the beak.
      const parts: BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        parts.push(
          colored(
            new BoxGeometry(1, 1, 1),
            '#b0453a',
            mat(side * 0.07, 0.1, 0.42, 0.14, 0.014, 0.18, -1.0, 0, -side * 0.22),
          ),
          colored(
            new BoxGeometry(1, 1, 1),
            '#f6efdc',
            mat(side * 0.067, 0.11, 0.418, 0.125, 0.012, 0.165, -1.0, 0, -side * 0.22),
          ),
        );
      }
      return merged(parts);
    },
  },
  quill: {
    anchor: 'wing',
    tip: new Vector3(0, 0.02, 0.14),
    geometry: () =>
      merged([
        colored(
          new ConeGeometry(1, 1, 4),
          '#f4f1e8',
          mat(0, 0.03, 0.08, 0.025, 0.16, 0.008, along + 0.4),
        ),
        colored(
          new CylinderGeometry(1, 1, 1, 4),
          '#3a2a20',
          mat(0, -0.005, -0.01, 0.004, 0.05, 0.004, along + 0.4),
        ),
      ]),
    companion: 'ledger',
  },
  ledger: {
    anchor: 'ground',
    tip: new Vector3(0, 0.03, 0.3),
    geometry: () =>
      merged([
        // A book open on the ground, a little ink pot beside it.
        colored(new BoxGeometry(1, 1, 1), '#3f6aa6', mat(0, 0.01, 0.29, 0.2, 0.02, 0.14, 0, 0.15)),
        colored(
          new BoxGeometry(1, 1, 1),
          '#f6efdc',
          mat(0, 0.024, 0.29, 0.185, 0.01, 0.125, 0, 0.15),
        ),
        colored(
          new CylinderGeometry(1, 1.2, 1, 8),
          '#2a2633',
          mat(0.15, 0.025, 0.2, 0.025, 0.05, 0.025),
        ),
      ]),
  },
  hammer: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.22),
    geometry: () =>
      merged([
        colored(new CylinderGeometry(1, 1, 1, 6), WOOD, mat(0, 0, 0.1, 0.012, 0.24, 0.012, along)),
        colored(new BoxGeometry(1, 1, 1), DARK_IRON, mat(0, 0, 0.22, 0.12, 0.05, 0.05)),
      ]),
  },
  sword: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.4),
    geometry: () =>
      merged([
        colored(
          new CylinderGeometry(1, 1, 1, 6),
          DARK_WOOD,
          mat(0, 0, -0.01, 0.012, 0.06, 0.012, along),
        ),
        colored(new BoxGeometry(1, 1, 1), '#d4a640', mat(0, 0, 0.025, 0.09, 0.016, 0.016)),
        colored(new BoxGeometry(1, 1, 1), '#e8e8ee', mat(0, 0, 0.2, 0.05, 0.012, 0.32)),
        colored(
          new ConeGeometry(1, 1, 4),
          '#e8e8ee',
          mat(0, 0, 0.38, 0.035, 0.07, 0.008, along, Math.PI / 4),
        ),
      ]),
  },
  staff: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.36),
    geometry: () =>
      merged([
        colored(
          new CylinderGeometry(1, 0.8, 1, 6),
          DARK_WOOD,
          mat(0, 0, 0.12, 0.014, 0.44, 0.014, along),
        ),
        colored(new TorusGeometry(1, 0.25, 4, 8), DARK_WOOD, mat(0, 0, 0.34, 0.035, 0.035, 0.035)),
        colored(new IcosahedronGeometry(1, 0), '#9b7cf2', mat(0, 0, 0.36, 0.03, 0.03, 0.03)),
      ]),
  },
  sling: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.2),
    geometry: () =>
      merged([
        colored(
          new CylinderGeometry(1, 1, 1, 4),
          '#a07a4c',
          mat(0, 0, 0.09, 0.006, 0.18, 0.006, along),
        ),
        colored(new SphereGeometry(1, 6, 4), '#6e4a2c', mat(0, 0, 0.19, 0.03, 0.022, 0.035)),
        colored(new IcosahedronGeometry(1, 0), '#3a2e26', mat(0, 0.012, 0.19, 0.016, 0.016, 0.016)),
      ]),
  },
  mace: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.24),
    geometry: () => {
      const parts = [
        colored(new CylinderGeometry(1, 1, 1, 6), WOOD, mat(0, 0, 0.09, 0.014, 0.22, 0.014, along)),
        colored(new IcosahedronGeometry(1, 0), DARK_IRON, mat(0, 0, 0.22, 0.055, 0.055, 0.055)),
      ];
      for (const [x, y, z] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
      ] as const) {
        parts.push(
          colored(
            new ConeGeometry(1, 1, 4),
            IRON,
            mat(
              x * 0.06,
              y * 0.06,
              0.22 + z * 0.06,
              0.016,
              0.04,
              0.016,
              z ? along : y < 0 ? Math.PI : 0,
              0,
              x ? -x * along : 0,
            ),
          ),
        );
      }
      return merged(parts);
    },
  },
  // Chantier 49: the miner's pick, a curved iron head across the handle.
  pick: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.24),
    geometry: () =>
      merged([
        colored(new CylinderGeometry(1, 1, 1, 6), WOOD, mat(0, 0, 0.1, 0.012, 0.26, 0.012, along)),
        colored(new ConeGeometry(1, 1, 4), DARK_IRON, mat(0, 0.07, 0.235, 0.02, 0.15, 0.02, 0.25)),
        colored(
          new ConeGeometry(1, 1, 4),
          DARK_IRON,
          mat(0, -0.07, 0.235, 0.02, 0.15, 0.02, Math.PI - 0.25),
        ),
      ]),
  },
  // Chantier 37: the scout's dagger and the bard's lute.
  dagger: {
    anchor: 'wing',
    tip: new Vector3(0, 0, 0.2),
    geometry: () =>
      merged([
        colored(
          new CylinderGeometry(1, 1, 1, 6),
          DARK_WOOD,
          mat(0, 0, 0, 0.011, 0.05, 0.011, along),
        ),
        colored(new BoxGeometry(1, 1, 1), '#d4a640', mat(0, 0, 0.03, 0.06, 0.012, 0.012)),
        colored(
          new ConeGeometry(1, 1, 4),
          '#e8e8ee',
          mat(0, 0, 0.11, 0.028, 0.15, 0.007, along, Math.PI / 4),
        ),
      ]),
  },
  lute: {
    anchor: 'front',
    tip: new Vector3(0, 0.2, 0.4),
    geometry: () =>
      merged([
        // A round body held across the chest, its neck up to the right.
        colored(
          new SphereGeometry(1, 10, 6),
          '#b9773f',
          mat(-0.04, 0.12, 0.3, 0.1, 0.1, 0.045, 0, 0, 0.5),
        ),
        colored(
          new CylinderGeometry(1, 1, 1, 8),
          '#3a2a20',
          mat(-0.035, 0.125, 0.345, 0.025, 0.004, 0.025, along),
        ),
        colored(
          new BoxGeometry(1, 1, 1),
          DARK_WOOD,
          mat(0.08, 0.22, 0.31, 0.03, 0.2, 0.016, 0, 0, -0.9),
        ),
      ]),
  },
  basket: {
    anchor: 'ground',
    tip: new Vector3(0, 0.1, 0.3),
    geometry: () =>
      merged([
        colored(
          new CylinderGeometry(1, 0.75, 1, 10, 1, true),
          '#c79a5a',
          mat(0, 0.035, 0.3, 0.09, 0.07, 0.09),
        ),
        colored(
          new CylinderGeometry(1, 1, 1, 10),
          '#a9d35c',
          mat(0, 0.06, 0.3, 0.075, 0.02, 0.075),
        ),
        colored(new SphereGeometry(1, 6, 4), '#a9d35c', mat(0.02, 0.075, 0.29, 0.035, 0.03, 0.035)),
      ]),
  },
};
