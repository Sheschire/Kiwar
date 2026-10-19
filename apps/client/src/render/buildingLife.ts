import type { Group } from 'three';
import {
  CanvasTexture,
  Mesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import {
  buildingHarvest,
  isProducer,
  storageFullCheck,
  workersOf,
  workerSlots,
  type Building,
  type GameState,
} from '@kiwar/shared';
import type { BuildingEmitter, BuildingModel, RigMotion } from './buildingModels';
import { Particles } from './particles';

/** What a building shows: how fast it works and why it stopped. */
export interface Activity {
  /** 0 (stopped) … 1 (fully staffed). */
  speed: number;
  icon: StatusIcon | null;
}

export type StatusIcon = 'depleted' | 'storageFull';

/** Pace of the animations, read from the very same harvest rules as the simulation. */
export function activityOf(
  state: GameState,
  b: Building,
  full = storageFullCheck(state),
): Activity {
  if (b.type === 'school') {
    // The bell rings while a class is in session.
    const busy = state.villagers.some((v) => v.job.kind === 'train' && v.job.schoolId === b.id);
    return { speed: busy ? 1 : 0, icon: null };
  }
  if (!isProducer(b.type)) return { speed: 1, icon: null };
  const h = buildingHarvest(state, b, full);
  if (!h) return { speed: 0, icon: null };
  switch (h.status) {
    case 'ok': {
      const slots = Math.max(1, workerSlots(b));
      return { speed: 0.45 + (0.55 * workersOf(state, b.id).length) / slots, icon: null };
    }
    case 'depleted':
      return { speed: 0.15, icon: 'depleted' };
    case 'storageFull':
      return { speed: 0, icon: 'storageFull' };
    default:
      return { speed: 0, icon: null };
  }
}

interface RigState {
  object: Object3D;
  motion: RigMotion;
  baseY: number;
  phase: number;
}

interface EmitterState {
  def: BuildingEmitter;
  /** Fractional particles waiting (steady emitters) or last burst cycle (rig emitters). */
  acc: number;
}

interface Living {
  rigs: RigState[];
  emitters: EmitterState[];
  /** Smoothed speed (animations ease in and out). */
  speed: number;
  target: number;
  icon: Sprite | null;
  iconKind: StatusIcon | null;
  height: number;
  group: Group;
}

const TAU = Math.PI * 2;

/** Number of times a phase has passed `offset` (mod 2π). */
function cycle(phase: number, offset: number): number {
  return Math.floor((phase - offset) / TAU);
}

function applyMotion(r: RigState): void {
  const { motion: m, object: o } = r;
  const axis = m.axis ?? 'y';
  switch (m.kind) {
    case 'spin':
      o.rotation[axis] = r.phase * m.amount;
      break;
    case 'swing':
      o.rotation[axis] = Math.sin(r.phase) * m.amount;
      break;
    case 'pump':
      o.position.y = r.baseY - m.amount * (0.5 - 0.5 * Math.cos(r.phase));
      break;
    case 'pound': {
      const u = (r.phase / TAU) % 1;
      const lift = u < 0.8 ? u / 0.8 : 1 - ((u - 0.8) / 0.2) ** 2;
      o.position.y = r.baseY + m.amount * lift;
      break;
    }
    case 'bob':
      o.position.y = r.baseY + Math.sin(r.phase) * m.amount;
      break;
    case 'breathe': {
      const k = Math.sin(r.phase) * m.amount;
      o.scale.set(1 - k * 0.5, 1 + k, 1 - k * 0.5);
      break;
    }
    case 'flicker': {
      const k = (Math.sin(r.phase) + Math.sin(r.phase * 2.7 + 1) * 0.6) * 0.6 * m.amount;
      o.scale.set(1 - k * 0.3, 1 + k, 1 - k * 0.3);
      break;
    }
  }
}

/** Small round badges drawn once on a canvas (no font or emoji dependency). */
function iconTexture(kind: StatusIcon): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.beginPath();
  g.arc(32, 32, 28, 0, TAU);
  g.fillStyle = '#fbf3df';
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = kind === 'depleted' ? '#d9822b' : '#7a5233';
  g.stroke();
  g.fillStyle = g.strokeStyle;
  if (kind === 'storageFull') {
    // Pause bars: storage is full, the harvest waits.
    g.fillRect(21, 18, 8, 28);
    g.fillRect(35, 18, 8, 28);
  } else {
    // Exclamation mark: the deposit is exhausted.
    g.fillRect(28, 14, 8, 24);
    g.beginPath();
    g.arc(32, 47, 5, 0, TAU);
    g.fill();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Brings buildings to life: animates their rigs at the pace of their activity and shows a
 * status badge when a producer is stopped (deposit exhausted, storage full).
 */
export class BuildingLife {
  readonly particles = new Particles();
  private readonly living = new Map<string, Living>();
  private readonly at = new Vector3();
  private readonly iconMaterials = new Map<StatusIcon, SpriteMaterial>();
  private animated = true;
  private time = 0;

  /** Low quality: rigs stay in their rest pose. */
  setAnimated(on: boolean): void {
    this.animated = on;
  }

  setParticles(on: boolean): void {
    this.particles.setEnabled(on);
  }

  /** Creates the rig meshes of a building inside its group. */
  attach(id: string, group: Group, model: BuildingModel, material: Material): void {
    const rigs = model.rigs.map((r, i) => {
      const mesh = new Mesh(r.geometry, material);
      mesh.position.copy(r.pivot);
      mesh.receiveShadow = true;
      group.add(mesh);
      // Desynchronise identical buildings a little.
      const phase = (id.length * 1.7 + i * 2.3) % TAU;
      return { object: mesh, motion: r.motion, baseY: r.pivot.y, phase };
    });
    const emitters = model.emitters.map((def) => ({
      def,
      acc: def.rig >= 0 ? cycle(rigs[def.rig]!.phase, def.phase) : 0,
    }));
    this.living.set(id, {
      rigs,
      emitters,
      speed: 0,
      target: 0,
      icon: null,
      iconKind: null,
      height: model.height,
      group,
    });
    for (const r of rigs) applyMotion(r);
  }

  detach(id: string): void {
    const l = this.living.get(id);
    if (l?.icon) l.group.remove(l.icon);
    this.living.delete(id);
  }

  setActivity(id: string, activity: Activity): void {
    const l = this.living.get(id);
    if (!l) return;
    l.target = activity.speed;
    if (l.iconKind === activity.icon) return;
    if (l.icon) l.group.remove(l.icon);
    l.icon = null;
    l.iconKind = activity.icon;
    if (activity.icon) {
      l.icon = new Sprite(this.iconMaterial(activity.icon));
      l.icon.scale.set(0.34, 0.34, 1);
      l.icon.position.set(0, l.height + 0.28, 0);
      l.icon.renderOrder = 10;
      l.group.add(l.icon);
    }
  }

  private iconMaterial(kind: StatusIcon): SpriteMaterial {
    let mat = this.iconMaterials.get(kind);
    if (!mat) {
      mat = new SpriteMaterial({ map: iconTexture(kind), depthWrite: false });
      this.iconMaterials.set(kind, mat);
    }
    return mat;
  }

  update(dt: number): void {
    this.time += dt;
    for (const l of this.living.values()) {
      if (l.icon) l.icon.position.y = l.height + 0.28 + Math.sin(this.time * 2.4) * 0.03;
      if (!this.animated) continue;
      // Ease towards the target pace (about half a second).
      l.speed += (l.target - l.speed) * Math.min(1, dt * 3);
      for (const r of l.rigs) {
        const pace = r.motion.ambient ? Math.max(l.speed, 0.6) : l.speed;
        if (pace < 1e-3) continue;
        r.phase += dt * r.motion.speed * pace;
        if (r.phase > 1e4) r.phase %= TAU * 1000;
        applyMotion(r);
      }
      for (const e of l.emitters) this.emit(l, e, dt);
    }
    this.particles.update(dt);
  }

  private emit(l: Living, e: EmitterState, dt: number): void {
    const d = e.def;
    let n = 0;
    if (d.rig >= 0) {
      // A burst each time the rig passes its trigger phase.
      const c = cycle(l.rigs[d.rig]!.phase, d.phase);
      if (c !== e.acc) n = d.count;
      e.acc = c;
    } else {
      const pace = d.ambient ? Math.max(l.speed, 0.6) : l.speed;
      e.acc += dt * d.rate * pace;
      n = Math.floor(e.acc);
      e.acc -= n;
    }
    if (n > 0) this.particles.emit(d.kind, l.group.localToWorld(this.at.copy(d.at)), n);
  }

  dispose(): void {
    this.particles.dispose();
    for (const m of this.iconMaterials.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.living.clear();
  }
}
