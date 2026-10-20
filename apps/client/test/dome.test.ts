import { describe, expect, it } from 'vitest';
import { generateFace, hexKey, newGame, pixelToHex } from '@kiwar/shared';
import { domeRadius } from '../src/render/terrain';

describe('domeRadius', () => {
  for (const seed of ['demo', 'perf', 'gec4fenp', 'lagoon-7']) {
    it(`keeps the skin under the tiles (${seed})`, () => {
      const state = newGame({ seed, face: 'kiwino', now: 0 });
      const map = generateFace(seed, 'kiwino', state.params);
      const r = domeRadius(map);
      for (let i = 0; i < 2880; i++) {
        const a = (i / 2880) * Math.PI * 2;
        const h = pixelToHex(
          Math.cos(a) * r * map.ellipse,
          (Math.sin(a) * r) / Math.sqrt(map.ellipse),
        );
        expect(map.index.has(hexKey(h))).toBe(true);
      }
      expect(r).toBeGreaterThan(0.85 * (map.params.radius * Math.sqrt(3) * 0.96));
    });
  }
});
