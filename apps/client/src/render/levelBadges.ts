import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';
import { ageOfLevel, maxLevelOf, upgradeLock, type GameState } from '@kiwar/shared';

/**
 * Chantier 11: a small level badge above every building, with a green arrow when it can be
 * upgraded right now. Shown at medium zoom, or always with the "show levels" setting.
 */

const TAU = Math.PI * 2;
/** Ring colour of a level badge, by the age of the level. */
const AGE_RINGS = ['#7a5233', '#c99a1e', '#6f8394', '#b8673a', '#5b6fc4'];

/** Share of the screen height. */
const BADGE_SIZE = 0.03;

function badgeTexture(level: number, upgradable: boolean): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.beginPath();
  g.arc(28, 36, 22, 0, TAU);
  g.fillStyle = '#fbf3df';
  g.fill();
  g.lineWidth = 4;
  // Chantier 30: one ring colour per age (Eden wood, Stone gold, Iron steel, Industry copper).
  g.strokeStyle = AGE_RINGS[ageOfLevel(level)] ?? '#7a5233';
  g.stroke();
  g.fillStyle = '#4a3324';
  g.font = level >= 10 ? 'bold 23px Georgia, serif' : 'bold 28px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(level), 28, 38);
  if (upgradable) {
    g.beginPath();
    g.arc(48, 16, 14, 0, TAU);
    g.fillStyle = '#5fae2a';
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = '#fbf3df';
    g.stroke();
    g.beginPath();
    g.moveTo(48, 7);
    g.lineTo(56, 19);
    g.lineTo(40, 19);
    g.closePath();
    g.fillStyle = '#fbf3df';
    g.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export interface BadgeAnchor {
  x: number;
  y: number;
  z: number;
}

export class LevelBadges {
  readonly group = new Group();
  private readonly sprites = new Map<string, Sprite>();
  private readonly materials = new Map<string, SpriteMaterial>();
  private signature = '';

  constructor() {
    this.group.visible = false;
  }

  private material(level: number, upgradable: boolean): SpriteMaterial {
    const key = `${level}:${upgradable ? 1 : 0}`;
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new SpriteMaterial({
        map: badgeTexture(level, upgradable),
        depthTest: false,
        transparent: true,
        // Same size on screen at every zoom (readable on a phone's overview too).
        sizeAttenuation: false,
      });
      this.materials.set(key, mat);
    }
    return mat;
  }

  /** Cheap when nothing changed: levels, upgradability and positions make the signature. */
  sync(state: GameState, anchorOf: (id: string) => BadgeAnchor | null): void {
    const rows = state.buildings
      .filter((b) => b.type !== 'camp' && maxLevelOf(b.type) > 1)
      .map((b) => ({ b, a: anchorOf(b.id), up: upgradeLock(state, b) === null }));
    const sig = rows
      .map(({ b, a, up }) => `${b.id}:${b.level}:${up ? 1 : 0}:${a ? a.y.toFixed(2) : '-'}`)
      .join(',');
    if (sig === this.signature) return;
    this.signature = sig;
    const seen = new Set<string>();
    for (const { b, a, up } of rows) {
      if (!a) continue;
      seen.add(b.id);
      let s = this.sprites.get(b.id);
      if (!s) {
        s = new Sprite();
        s.scale.set(BADGE_SIZE, BADGE_SIZE, 1);
        s.renderOrder = 11;
        this.sprites.set(b.id, s);
        this.group.add(s);
      }
      s.material = this.material(b.level, up);
      s.position.set(a.x, a.y, a.z);
      // Tapping a badge selects its building.
      s.userData = { q: b.q, r: b.r };
    }
    for (const [id, s] of this.sprites) {
      if (seen.has(id)) continue;
      this.group.remove(s);
      this.sprites.delete(id);
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    for (const m of this.materials.values()) {
      m.map?.dispose();
      m.dispose();
    }
  }
}
