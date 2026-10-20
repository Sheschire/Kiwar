import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three';
import { getTile, type FaceMap, type GameState, type Meteor, type ResourceId } from '@kiwar/shared';
import { worldPosition } from './terrain';

const GLOW: Record<ResourceId, string> = {
  seeds: '#f2b84e',
  juice: '#d8f04a',
  fiber: '#f0d9a8',
  pulp: '#a8e05a',
};

/** Height of the shooting star when it is first seen, and of the fall animation. */
const STAR_HEIGHT = 9;
const FALL_S = 1.4;

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,240,200,0.8)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

interface Crater {
  group: Group;
  rock: Mesh;
  glow: Sprite;
  /** Seconds since the landing animation started (Infinity: landed long ago). */
  fall: number;
  y: number;
}

/**
 * Gifts from the sky (chantier 06): the shooting star that announces a meteorite (a bright
 * point slowly coming down over its landing tile, with a target ring), then the crater with
 * its glowing rock, which shrinks as it is picked.
 */
export class MeteorsView {
  readonly group = new Group();
  private readonly craters = new Map<string, Crater>();
  private readonly rockGeometry = new IcosahedronGeometry(0.3, 0);
  private readonly ringGeometry = new TorusGeometry(0.5, 0.09, 5, 12);
  private readonly ringMaterial = new MeshStandardMaterial({
    color: '#6b4a2e',
    roughness: 1,
    flatShading: true,
  });
  private readonly glowTexture = glowTexture();
  private readonly star: Sprite;
  private readonly target: Mesh;
  private incoming: { at: number; announceAt: number; x: number; y: number; z: number } | null =
    null;
  private signature = '';
  private time = 0;

  constructor(private readonly map: FaceMap) {
    this.star = new Sprite(
      new SpriteMaterial({
        map: this.glowTexture,
        color: '#fff2c8',
        blending: AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    this.star.scale.set(1.4, 1.4, 1);
    this.star.visible = false;
    this.target = new Mesh(
      new RingGeometry(0.5, 0.62, 24),
      new MeshBasicMaterial({
        color: '#fff2c8',
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.target.rotation.x = -Math.PI / 2;
    this.target.visible = false;
    this.group.add(this.star, this.target);
  }

  private heightAt(q: number, r: number): number {
    return getTile(this.map, { q, r })?.height ?? 0;
  }

  sync(state: GameState): void {
    const sky = state.sky;
    const next = sky.next?.announced ? sky.next : null;
    const sig = `${next ? `${next.id}@${next.q},${next.r}` : '-'}|${sky.meteors
      .map((m) => `${m.id}:${Math.round((m.stock / Math.max(1, m.max)) * 20)}`)
      .join(';')}`;
    if (sig === this.signature) return;
    this.signature = sig;
    if (next) {
      const p = worldPosition(next);
      this.incoming = {
        at: next.at,
        announceAt: next.announceAt,
        x: p.x,
        y: this.heightAt(next.q, next.r),
        z: p.z,
      };
    } else this.incoming = null;
    const alive = new Set(sky.meteors.map((m) => m.id));
    for (const [id, c] of this.craters) {
      if (alive.has(id)) continue;
      this.group.remove(c.group);
      (c.rock.material as MeshStandardMaterial).dispose();
      (c.glow.material as SpriteMaterial).dispose();
      this.craters.delete(id);
    }
    for (const m of sky.meteors) {
      const c = this.craters.get(m.id) ?? this.add(m, state.now - m.landedAt > FALL_S * 1000);
      const k = m.max > 0 ? m.stock / m.max : 0;
      const s = m.stock > 0 ? 0.45 + 0.55 * k : 0.3;
      c.rock.scale.setScalar(s);
      c.glow.visible = m.stock > 0;
      c.glow.scale.setScalar(1.1 + 1.2 * k);
    }
  }

  private add(m: Meteor, landed: boolean): Crater {
    const group = new Group();
    const p = worldPosition(m);
    const y = this.heightAt(m.q, m.r);
    group.position.set(p.x, y, p.z);
    const ring = new Mesh(this.ringGeometry, this.ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.02;
    ring.scale.set(1, 1, 0.5);
    const color = new Color(GLOW[m.resource]);
    const rock = new Mesh(
      this.rockGeometry,
      new MeshStandardMaterial({
        color: '#4a3a30',
        emissive: color,
        emissiveIntensity: 0.55,
        roughness: 0.8,
        flatShading: true,
      }),
    );
    rock.position.y = 0.12;
    const glow = new Sprite(
      new SpriteMaterial({
        map: this.glowTexture,
        color,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.7,
      }),
    );
    glow.position.y = 0.35;
    group.add(ring, rock, glow);
    this.group.add(group);
    const c: Crater = { group, rock, glow, fall: landed ? Infinity : 0, y };
    this.craters.set(m.id, c);
    return c;
  }

  update(dt: number, now: number): void {
    this.time += dt;
    const inc = this.incoming;
    if (inc && now < inc.at) {
      // The star comes down slowly over the hour before the impact.
      const k = Math.min(1, Math.max(0, (inc.at - now) / Math.max(1, inc.at - inc.announceAt)));
      this.star.visible = true;
      this.star.position.set(inc.x + k * 3, inc.y + 2.5 + k * STAR_HEIGHT, inc.z - k * 2);
      const twinkle = 1.2 + Math.sin(this.time * 7) * 0.2;
      this.star.scale.set(twinkle, twinkle, 1);
      this.target.visible = true;
      this.target.position.set(inc.x, inc.y + 0.04, inc.z);
      (this.target.material as MeshBasicMaterial).opacity = 0.35 + 0.3 * Math.sin(this.time * 3);
    } else {
      this.star.visible = false;
      this.target.visible = false;
    }
    for (const c of this.craters.values()) {
      if (c.fall < FALL_S) {
        c.fall += dt;
        const u = Math.min(1, c.fall / FALL_S);
        c.rock.position.y = 0.12 + (1 - u * u) * STAR_HEIGHT * 0.6;
      } else c.rock.position.y = 0.12;
      c.rock.rotation.y += dt * 0.4;
      (c.rock.material as MeshStandardMaterial).emissiveIntensity =
        0.45 + 0.2 * Math.sin(this.time * 2 + c.y);
    }
  }

  dispose(): void {
    for (const c of this.craters.values()) {
      (c.rock.material as MeshStandardMaterial).dispose();
      (c.glow.material as SpriteMaterial).dispose();
    }
    this.craters.clear();
    this.rockGeometry.dispose();
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    this.glowTexture.dispose();
    (this.star.material as SpriteMaterial).dispose();
    this.target.geometry.dispose();
    (this.target.material as MeshBasicMaterial).dispose();
  }
}
