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
import {
  ALIEN_BUILDINGS,
  AGE_IDS,
  footprintOf,
  LEVELS_PER_AGE,
  maxLevelOf,
  type BuildingType,
} from '@kiwar/shared';
import { buildingModel } from '../render/buildingModels';
import { alienGeometry } from '../render/models/alien';
import { Lighting } from '../render/lighting';
import { SignsView, type SignSpot } from '../render/signs';

/**
 * Chantier 17: a contact sheet of every building for one age (`?sheet&age=0..3`): the three
 * levels of that age (chantier 33: 1–3 Eden, 4–6 Stone…; the monument, the laboratory and the
 * camp show their own levels), lit like the game and seen from its default camera pitch.
 * `&levels=3,4` shows those levels instead (the passage from an age to the next). A tool to
 * check that each building reads at a glance; it never touches a game. Chantier 41:
 * `?sheet&aliens` shows the alien civilisation's buildings instead, one column per age.
 */

function levelsOf(type: BuildingType, age: number, forced: number[] | null): number[] {
  const max = maxLevelOf(type);
  if (forced) return forced.map((l) => Math.min(max, l));
  if (max < 12) return [1, 2, 3].map((l) => Math.min(max, l));
  return [1, 2, 3].map((t) => age * LEVELS_PER_AGE + t);
}

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
  'trainingCamp',
  'forge',
  'townHall',
  'campfire',
  'lanterns',
  'flowerBed',
  'vineArch',
  'fountain',
  'mayorStatue',
  'loculeTree',
  'swing',
  'skittles',
  'skipPond',
  'slide',
  'cabaret',
  'fireworks',
  'tunnel',
  'camp',
];
const PER_ROW_MAX = 4;
const BASE_STEP = 1.9;
const BASE_ROW = 3.3;

function start(): void {
  const params = new URLSearchParams(window.location.search);
  const age = Math.max(0, Math.min(AGE_IDS.length - 1, Number(params.get('age') ?? 0) || 0));
  // `&types=a,b` shows only those, bigger (close-up checks).
  const only = params.get('types')?.split(',');
  const aliens = params.has('aliens');
  const types = only ? TYPES.filter((t) => only.includes(t)) : aliens ? [] : TYPES;
  const forced = aliens ? [1, 2, 3, 4] : (params.get('levels')?.split(',').map(Number) ?? null);
  const zoom = Number(params.get('zoom') ?? 1) || 1;
  const kinds = aliens ? ALIEN_BUILDINGS.filter((k) => !only || only.includes(k)) : [];
  const PER_ROW = Math.min(PER_ROW_MAX, types.length + kinds.length);
  // Chantier 35: big buildings need room (a triangle of 3 tiles, the monument's hexagon).
  const widest = Math.max(...types.map((t) => footprintOf(t)));
  const room = widest === 7 ? 2.4 : widest === 3 ? 1.75 : 1;
  const STEP = BASE_STEP * room;
  const ROW = BASE_ROW * room;
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

  const count = forced?.length ?? 3;
  const cellWidth = count * STEP + 0.8;
  const rows = Math.ceil((types.length + kinds.length) / PER_ROW);
  const labels: { text: string; at: Vector3 }[] = [];
  const signs = new SignsView();
  const spots: SignSpot[] = [];
  scene.add(signs.mesh);
  types.forEach((type, i) => {
    const cx = ((i % PER_ROW) - (PER_ROW - 1) / 2) * cellWidth;
    const cz = (Math.floor(i / PER_ROW) - (rows - 1) / 2) * ROW;
    levelsOf(type, age, forced).forEach((level, k) => {
      const model = buildingModel(type, level, false, age);
      const x = cx + (k - (count - 1) / 2) * STEP;
      const mesh = new Mesh(model.geometry, material);
      mesh.position.set(x, 0, cz);
      mesh.castShadow = true;
      scene.add(mesh);
      if (model.sign) spots.push({ type, at: model.sign.clone().add(mesh.position) });
      for (const r of model.rigs) {
        const part = new Mesh(r.geometry, material);
        part.position.set(x + r.pivot.x, r.pivot.y, cz + r.pivot.z);
        part.castShadow = true;
        scene.add(part);
      }
    });
    labels.push({ text: type, at: new Vector3(cx, 0, cz + 1.05) });
  });

  kinds.forEach((kind, i) => {
    const cx = ((i % PER_ROW) - (PER_ROW - 1) / 2) * cellWidth;
    const cz = (Math.floor(i / PER_ROW) - (rows - 1) / 2) * ROW;
    for (let a = 0; a < 4; a++) {
      const mesh = new Mesh(alienGeometry(kind, a), material);
      mesh.position.set(cx + (a - 1.5) * STEP, 0, cz);
      mesh.castShadow = true;
      scene.add(mesh);
    }
    labels.push({ text: kind, at: new Vector3(cx, 0, cz + 1.05) });
  });
  signs.sync(spots);
  const camera = new PerspectiveCamera(40, 1, 0.5, 400);
  const title = document.createElement('div');
  title.textContent = aliens ? 'Aliens — ages 0 to 3' : `Age ${age} — ${AGE_IDS[age]}`;
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
    const distance = (Math.max(halfWidth / (tanV * camera.aspect), halfDepth / tanV) + 2.5) / zoom;
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
  // The sign icons load as images: draw again once they are in.
  window.setTimeout(layout, 600);
}

start();
