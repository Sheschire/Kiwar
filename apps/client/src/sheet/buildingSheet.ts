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
import { AGE_IDS, type BuildingType } from '@kiwar/shared';
import { buildingModel } from '../render/buildingModels';
import { Lighting } from '../render/lighting';

/**
 * Chantier 17: a contact sheet of every building, levels 1 to 3, for one age
 * (`?sheet&age=0..3`), lit like the game and seen from its default camera pitch. A tool to
 * check that each building reads at a glance; it never touches a game.
 */

const TYPES: readonly BuildingType[] = [
  'nest',
  'hut',
  'warehouse',
  'launchpad',
  'pulpery',
  'fiberWorkshop',
  'seedQuarry',
  'juiceWell',
  'school',
  'library',
  'monument',
  'lab',
  'seedTurret',
  'skyTurret',
  'camp',
];
const PER_ROW_MAX = 4;
const STEP = 1.9;
const ROW = 3.3;

function start(): void {
  const params = new URLSearchParams(window.location.search);
  const age = Math.max(0, Math.min(AGE_IDS.length - 1, Number(params.get('age') ?? 0) || 0));
  // `&types=a,b` shows only those, bigger (close-up checks).
  const only = params.get('types')?.split(',');
  const types = only ? TYPES.filter((t) => only.includes(t)) : TYPES;
  const PER_ROW = Math.min(PER_ROW_MAX, types.length);
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
  lighting.fit(30);
  lighting.setShadowMapSize(2048);
  scene.add(lighting.group);

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    flatShading: true,
  });
  const ground = new Mesh(
    new PlaneGeometry(80, 80),
    new MeshStandardMaterial({ color: '#b9d48a', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const cellWidth = 3 * STEP + 0.8;
  const rows = Math.ceil(types.length / PER_ROW);
  const labels: { text: string; at: Vector3 }[] = [];
  types.forEach((type, i) => {
    const cx = ((i % PER_ROW) - (PER_ROW - 1) / 2) * cellWidth;
    const cz = (Math.floor(i / PER_ROW) - (rows - 1) / 2) * ROW;
    for (let level = 1; level <= 3; level++) {
      const model = buildingModel(type, level, false, age);
      const x = cx + (level - 2) * STEP;
      const mesh = new Mesh(model.geometry, material);
      mesh.position.set(x, 0, cz);
      mesh.castShadow = true;
      scene.add(mesh);
      for (const r of model.rigs) {
        const part = new Mesh(r.geometry, material);
        part.position.set(x + r.pivot.x, r.pivot.y, cz + r.pivot.z);
        part.castShadow = true;
        scene.add(part);
      }
    }
    labels.push({ text: type, at: new Vector3(cx, 0, cz + 1.05) });
  });

  const camera = new PerspectiveCamera(40, 1, 0.5, 400);
  const title = document.createElement('div');
  title.textContent = `Age ${age} — ${AGE_IDS[age]}`;
  title.style.cssText =
    'position:fixed;top:8px;left:12px;font:600 20px Georgia,serif;color:#4a3324';
  document.body.append(title);
  const tags = labels.map((l) => {
    const el = document.createElement('div');
    el.textContent = l.text;
    el.style.cssText =
      'position:fixed;transform:translate(-50%,0);font:13px Georgia,serif;color:#4a3324;' +
      'background:rgba(255,248,230,.85);padding:1px 6px;border-radius:8px';
    document.body.append(el);
    return el;
  });

  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    // The game's default pitch (CameraRig polar 0.78), far enough to fit the sheet.
    const polar = 0.78;
    const halfWidth = (PER_ROW * cellWidth) / 2 + 0.6;
    const halfDepth = (rows * ROW) / 2 + 1;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const distance = Math.max(halfWidth / (tanV * camera.aspect), halfDepth / tanV) * 0.85 + 2;
    camera.position.set(0, Math.cos(polar) * distance, Math.sin(polar) * distance);
    camera.lookAt(0, 0, 0.6);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const v = new Vector3();
    labels.forEach((l, i) => {
      v.copy(l.at).project(camera);
      tags[i]!.style.left = `${((v.x + 1) / 2) * w}px`;
      tags[i]!.style.top = `${((1 - v.y) / 2) * h}px`;
    });
  };
  window.addEventListener('resize', layout);
  layout();
}

start();
