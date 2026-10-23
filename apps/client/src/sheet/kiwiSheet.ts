import {
  Color,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { ClassId } from '@kiwar/shared';
import { CLIP_IDS, CLIPS, ClipPlayer, type ClipId } from '../render/anim/clips';
import { KiwiRig } from '../render/anim/kiwiRig';
import {
  CREATURE_CLIPS,
  CreatureRig,
  restCreaturePose,
  sampleCreature,
  type CreatureClip,
  type CreatureKind,
} from '../render/anim/creatures';
import { Lighting } from '../render/lighting';
import { EFFECTS, Particles, type EffectId } from '../render/particles';

/**
 * Chantier 34: the review sheet of the living kiwis (`?kiwis`): every clip of the animation
 * library, played in a loop, with its label and group. `&t=1.5` freezes the time (headless
 * screenshots), `&clips=a,b` shows only those, bigger, `&zoom=` moves the camera closer.
 * It never touches a game.
 */

/** A cell of the sheet: something animated around (x, z). */
export interface SheetCell {
  label: string;
  group: string;
  update(dt: number, t: number, x: number, z: number): void;
}

/** The outfit that goes with a clip, to show the classes too. */
const CLIP_CLASS: Partial<Record<ClipId, ClassId>> = {
  hammer: 'builder',
  sword: 'warrior',
  mace: 'builder',
  spell: 'mage',
  sling: 'gatherer',
  dagger: 'scout',
  sing: 'bard',
  teach: 'mayor',
  look: 'scout',
  // Chantier 37: a tier-2 and a tier-3 outfit (the parent's, a cape, a circlet).
  joy: 'champion',
  dance: 'oracle',
};

const TINT = new Color(1, 1, 1);
const STEP = 1.9;
const ROW = 2.1;

function kiwiCells(rig: KiwiRig, only: string[] | null): SheetCell[] {
  return CLIP_IDS.filter((id) => !only || only.includes(id)).map((id, i) => {
    const player = new ClipPlayer();
    player.play(id, i * 0.37);
    // One-shot clips replay every 2.5 s.
    let since = 0;
    return {
      label: id,
      group: CLIPS[id].group,
      update(dt, _t, x, z) {
        since += dt;
        if (CLIPS[id].once && since > 2.5) {
          since = 0;
          player.play('idle');
          player.play(id);
        }
        rig.draw({
          x,
          y: 0,
          z,
          heading: 0.45,
          scale: 1.3,
          pose: player.pose(dt),
          tint: TINT,
          classId: CLIP_CLASS[id] ?? null,
          load: null,
        });
      },
    };
  });
}

/** Ferrets and bats: every clip at the age of Eden, then each age's look. */
function creatureCells(rig: CreatureRig, only: string[] | null): SheetCell[] {
  const cells: SheetCell[] = [];
  const add = (kind: CreatureKind, clip: CreatureClip, age: number, label: string) => {
    if (only && !only.includes(label)) return;
    const pose = restCreaturePose();
    let t = cells.length * 0.29;
    cells.push({
      label,
      group: kind,
      update(dt, _time, x, z) {
        t += dt;
        // One-shot clips replay every 2.5 s.
        if ((clip === 'fall' || clip === 'hurt') && t > 2.5) t = 0;
        rig.draw({
          kind,
          x,
          y: kind === 'bat' ? 0.55 : 0,
          z,
          heading: 0.6,
          scale: 1.3,
          pose: sampleCreature(kind, clip, t, pose),
          age,
        });
      },
    });
  };
  for (const kind of ['ferret', 'bat'] as const)
    for (const clip of CREATURE_CLIPS[kind]) add(kind, clip, 0, `${kind} ${clip}`);
  for (const kind of ['ferret', 'bat'] as const)
    for (let age = 1; age <= 3; age++)
      add(kind, kind === 'ferret' ? 'run' : 'flap', age, `${kind} age ${age}`);
  return cells;
}

/** The grouped effects of `particles.ts`, replayed in a loop (fire burns on). */
function effectCells(particles: Particles, only: string[] | null): SheetCell[] {
  const at = new Vector3();
  return (Object.keys(EFFECTS) as EffectId[])
    .filter((id) => !only || only.includes(`fx ${id}`))
    .map((id) => {
      const every = id === 'fire' ? 0.12 : id === 'soot' ? 0.5 : 1.2;
      let wait = 0;
      return {
        label: `fx ${id}`,
        group: 'effect',
        update(dt, _t, x, z) {
          wait -= dt;
          if (wait > 0) return;
          wait += every;
          particles.effect(id, at.set(x, id === 'fire' || id === 'soot' ? 0.05 : 0.3, z));
        },
      };
    });
}

function start(): void {
  const params = new URLSearchParams(window.location.search);
  const frozen = params.has('t') ? Number(params.get('t')) : null;
  const only = params.get('clips')?.split(',') ?? null;
  const zoom = Number(params.get('zoom') ?? 1) || 1;
  document.getElementById('loader')?.remove();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  const scene = new Scene();
  scene.background = new Color('#f3dfe6');
  const lighting = new Lighting();
  lighting.fit(20);
  lighting.setShadowMapSize(2048);
  scene.add(lighting.group);
  const ground = new Mesh(
    new PlaneGeometry(80, 80),
    new MeshStandardMaterial({ color: '#b9d48a', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const rig = new KiwiRig(64);
  for (const m of rig.group.children) m.castShadow = true;
  scene.add(rig.group);
  const creatures = new CreatureRig(32);
  for (const m of creatures.group.children) m.castShadow = true;
  scene.add(creatures.group);
  const particles = new Particles();
  scene.add(particles.mesh);
  const cells: SheetCell[] = [
    ...kiwiCells(rig, only),
    ...creatureCells(creatures, only),
    ...effectCells(particles, only),
  ];

  // Columns follow the screen's shape (three on a phone held upright).
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const perRow = Math.max(
    1,
    Math.min(8, cells.length, Math.round(Math.sqrt(cells.length * aspect))),
  );
  const rows = Math.ceil(cells.length / perRow);
  const spots = cells.map((_, i) => ({
    x: ((i % perRow) - (perRow - 1) / 2) * STEP,
    z: (Math.floor(i / perRow) - (rows - 1) / 2) * ROW,
  }));

  const camera = new PerspectiveCamera(40, 1, 0.2, 200);
  const tags = cells.map((c, i) => {
    const el = document.createElement('div');
    el.innerHTML = `${c.label} <small style="opacity:.6">${c.group}</small>`;
    el.style.cssText =
      'position:fixed;z-index:5;transform:translate(-50%,0);font:12px Georgia,serif;color:#4a3324;' +
      'background:rgba(255,248,230,.85);padding:1px 6px;border-radius:8px;white-space:nowrap';
    document.body.append(el);
    return { el, at: new Vector3(spots[i]!.x, 0, spots[i]!.z + 0.6) };
  });
  const title = document.createElement('div');
  title.textContent = 'Kiwis, creatures and effects';
  title.style.cssText =
    'position:fixed;z-index:5;top:8px;left:12px;font:600 20px Georgia,serif;color:#4a3324';
  document.body.append(title);

  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    const polar = 0.95;
    const halfWidth = (perRow * STEP) / 2 + 0.3;
    const halfDepth = (rows * ROW) / 2 + 0.4;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const distance = (Math.max(halfWidth / (tanV * camera.aspect), halfDepth / tanV) + 1.5) / zoom;
    camera.position.set(0, Math.cos(polar) * distance, Math.sin(polar) * distance);
    camera.lookAt(0, 0, 0.3);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const v = new Vector3();
    for (const t of tags) {
      v.copy(t.at).project(camera);
      t.el.style.left = `${((v.x + 1) / 2) * w}px`;
      t.el.style.top = `${((1 - v.y) / 2) * h}px`;
    }
  };
  window.addEventListener('resize', layout);
  layout();

  let last = performance.now();
  let time = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Frozen: play up to the asked time in small steps (particles too), then hold.
    const steps = frozen === null ? [dt] : [];
    if (frozen !== null)
      for (let t = time; t < frozen; t += 1 / 30) steps.push(Math.min(1 / 30, frozen - t));
    if (frozen !== null && steps.length === 0) steps.push(0);
    for (const step of steps) {
      time += step;
      cells.forEach((c, i) => c.update(step, time, spots[i]!.x, spots[i]!.z));
      rig.end();
      creatures.end();
      particles.update(step);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
