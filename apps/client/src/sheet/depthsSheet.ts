import {
  Color,
  NeutralToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  depthsMapOf,
  generateFace,
  ROOM_KINDS,
  type DepthsState,
  type Face,
  type GameState,
} from '@kiwar/shared';
import { CUT_POLAR } from '../camera/CameraRig';
import { DepthsCutView } from '../render/depths/DepthsCutView';
import { Lighting } from '../render/lighting';
import { TerrainView } from '../render/terrain';

/**
 * Chantier 49: the review sheet of the cut (`?depths`): a face of the demo seed, its quarter
 * open, every look of a room (fog, heard, seen, gallery) spread over the network.
 * `&seed=` and `&face=` pick another network, `&azimuth=` the side it opens towards,
 * `&holes=0` the low-quality look (painted discs), `&zoom=` moves closer, `&polar=` tilts.
 * It never touches a game.
 */

function start(): void {
  const params = new URLSearchParams(window.location.search);
  const seed = params.get('seed') ?? 'demo';
  const face = (params.get('face') ?? 'kiwisu') as Face;
  const azimuth = Number(params.get('azimuth') ?? 0.6);
  const holes = params.get('holes') !== '0';
  const zoom = Number(params.get('zoom') ?? 1);
  const polar = Number(params.get('polar') ?? CUT_POLAR);

  document.getElementById('loader')?.remove();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

  const scene = new Scene();
  scene.background = new Color('#f3dfe6');
  const map = generateFace(seed, face);
  const terrain = new TerrainView(map);
  scene.add(terrain.group);
  const lighting = new Lighting();
  lighting.fit(30);
  lighting.setShadowMapSize(2048);
  scene.add(lighting.group);

  // Every look of a room, spread over the network: a gallery or two near the entrance, rooms
  // seen and heard around them, the fog deeper down.
  const network = depthsMapOf({ seed, face });
  const depths: DepthsState = {
    views: {},
    galleries: {},
    door: { closed: false, fort: 0 },
    rng: { s: [1, 2, 3, 4] } as unknown as DepthsState['rng'],
    next: null,
    upwells: 0,
    lastUpwellAt: 0,
  };
  network.rooms.forEach((r, i) => {
    const kind = ROOM_KINDS[i % ROOM_KINDS.length]!;
    const look =
      r.depth === 1
        ? i % 2 === 0
          ? 'gallery'
          : 'seen'
        : r.depth === 2
          ? i % 3 === 0
            ? 'seen'
            : i % 3 === 1
              ? 'heard'
              : 'fog'
          : 'fog';
    if (look === 'gallery') depths.galleries[r.id] = { kind, since: 0 };
    else if (look === 'seen')
      depths.views[r.id] = { at: 0, source: 'delve', kind, units: [], hazard: null };
    else if (look === 'heard') depths.views[r.id] = { at: 0, source: 'edge', kind };
  });
  // Miners in each gallery, and a crew on its way down to the deepest room seen.
  const villagers: unknown[] = [];
  const kiwi = (id: string, job: unknown, classId: string | null = null) =>
    villagers.push({
      id,
      stats: { strength: 5, endurance: 5 },
      job,
      classId,
      shiny: id === 'k3' ? 'gold' : null,
    });
  let n = 0;
  for (const id of Object.keys(depths.galleries))
    for (let i = 0; i < 2 + (n % 2); i++) kiwi(`k${n++}`, { kind: 'mine', roomId: id });
  const goal = [...network.rooms].reverse().find((r) => depths.views[r.id] && r.depth === 2);
  const crew = ['d0', 'd1', 'd2', 'd3'];
  crew.forEach((id, i) => kiwi(id, { kind: 'expedition' }, i === 0 ? 'spelunker' : null));
  const now = 1_000_000;
  const expeditions = goal
    ? [
        {
          mission: 'delve',
          room: goal.id,
          status: 'outbound',
          crew,
          departedAt: now - 6_000,
          arriveAt: now + 4_000,
          returnAt: now + 14_000,
        },
      ]
    : [];
  const state = {
    seed,
    face,
    depths,
    villagers,
    expeditions,
    buildings: [],
    calendarStart: 0,
    now,
  } as unknown as GameState;

  const cut = new DepthsCutView(map, (planes) => terrain.setDomeClip(planes), holes);
  scene.add(cut.group);
  cut.open(azimuth);
  cut.sync(state);
  // Fully open at once.
  cut.update(10, now);

  const camera = new PerspectiveCamera(30, 1, 0.25, 2000);
  const target = new Vector3();
  let radius = cut.frame(target);
  // `&close` frames the first gallery up close (the miners).
  const first = Object.keys(depths.galleries)[0];
  if (params.has('close') && first) {
    cut.floorSpot(network.byId.get(first)!, 0, 0, target);
    radius = cut.roomRadius * 2.2;
  }
  const layout = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const distance =
      (Math.max((radius * 0.8) / Math.tan(vHalf), (radius * 0.98) / Math.tan(hHalf)) * 1.05) / zoom;
    camera.position.set(
      target.x + Math.sin(azimuth) * Math.sin(polar) * distance,
      target.y + Math.cos(polar) * distance,
      target.z + Math.cos(azimuth) * Math.sin(polar) * distance,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', layout);
  layout();
  (window as unknown as { __sheet: unknown }).__sheet = { cut, camera, renderer, scene };

  const title = document.createElement('div');
  title.textContent = `The cut of the depths (${seed}/${face}${holes ? '' : ', low'})`;
  title.style.cssText =
    'position:fixed;z-index:5;top:8px;left:12px;font:600 20px Georgia,serif;color:#4a3324';
  document.body.append(title);

  // `&t=` freezes the show at that time (headless screenshots).
  const frozen = params.get('t');
  let frozenAt = 0;
  let last = performance.now();
  const frame = (time: number) => {
    let dt = Math.min(0.1, (time - last) / 1000);
    last = time;
    if (frozen !== null) {
      dt = Math.max(0, Math.min(1 / 30, Number(frozen) - frozenAt));
      if (dt === 0) {
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
        return;
      }
    }
    frozenAt += dt;
    cut.update(dt, now + frozenAt * 1000);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

start();
