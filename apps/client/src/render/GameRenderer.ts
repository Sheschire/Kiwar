import {
  Clock,
  Fog,
  NeutralToneMapping,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BIOMES,
  buildingAt,
  calendarAt,
  depletedTiles,
  getTile,
  hexKey,
  parseHexKey,
  seasonOf,
  type Face,
  type FaceMap,
  type TwinSnapshot,
  type GameEvent,
  type GameState,
  type Tile,
} from '@kiwar/shared';
import { BuildingsView } from './buildings';
import { KiwisView } from './kiwis';
import { CameraRig } from '../camera/CameraRig';
import { Environment } from './environment';
import { FpsMeter } from './fpsMeter';
import { Lighting } from './lighting';
import { PALETTE } from './palette';
import { pick, TapDetector } from './picking';
import { PathPainter } from './pathPainter';
import { PathsView } from './paths';
import { MeteorsView } from './meteors';
import { PredatorShow } from './predators';
import { PostFx } from './postfx';
import { PropsView } from './props';
import {
  detectQuality,
  lowerPreset,
  QUALITY,
  type QualityChoice,
  type QualityPreset,
} from './quality';
import { SelectionView } from './selection';
import { TerrainView } from './terrain';
import { WaterView } from './water';
import { TwinView } from './twin';
import { IntroScene, type IntroHandlers, type IntroLayout } from './intro';
import { DayCycle } from './dayCycle';
import { updateSeasonLook, seasonUniforms } from './seasonLook';
import { WeatherView } from './weather';

export interface RendererCallbacks {
  /** Current simulation time (for smooth progress animations between ticks). */
  now(): number;
  onTileTap(tile: Tile | null): void;
  /** A path stroke painted in path mode. */
  onPaint?(tiles: Tile[], erase: boolean): void;
  onFps?(fps: number): void;
  onQualityChange?(preset: QualityPreset): void;
  /** A kiwi was tapped (it speaks instead of selecting its tile). */
  onKiwiTap?(id: string, pos: { x: number; z: number }): void;
  /** The player moved the camera while it was following a kiwi (or the kiwi left the map). */
  onFollowEnd?(): void;
}

const tmpV = new Vector3();
const tmpTarget = new Vector3();

/** Owns the WebGL renderer, the scene graph and the frame loop. */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;
  private readonly environment: Environment;
  private readonly lighting = new Lighting();
  private readonly selection = new SelectionView();
  private readonly tap: TapDetector;
  private readonly fpsMeter = new FpsMeter();
  private terrain: TerrainView | null = null;
  private water: WaterView | null = null;
  private twin: TwinView | null = null;
  private intro: IntroScene | null = null;
  private readonly twinTarget = new Vector3();
  private props: PropsView | null = null;
  private buildings: BuildingsView | null = null;
  private kiwis: KiwisView | null = null;
  private followId: string | null = null;
  private followLost = 0;
  /** True while the renderer itself moves the camera (not a player gesture). */
  private following = false;
  private paths: PathsView | null = null;
  private meteors: MeteorsView | null = null;
  private predators: PredatorShow | null = null;
  /** Turret shots of the wave show (wired to the audio by `installGameAudio`). */
  onTurretShot: ((x: number, z: number) => void) | null = null;
  /** Wave whose show starts as soon as its report is in the state. */
  private pendingShow: string | null = null;
  private weather: WeatherView | null = null;
  private readonly dayCycle = new DayCycle();
  private readonly lastLightDir = new Vector3();
  private readonly painter: PathPainter;
  private selectedTile: Tile | null = null;
  private clearedTiles = new Set<string>();
  private lastState: GameState | null = null;
  private postfx: PostFx | null = null;
  private map: FaceMap | null = null;
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver;
  private elapsed = 0;
  private hoverPoint: { x: number; y: number } | null = null;
  private qualityChoice: QualityChoice = 'auto';
  private preset: QualityPreset = 'medium';
  private fpsReportTimer = 0;
  private adaptiveTimer = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: RendererCallbacks,
    qualityChoice: QualityChoice,
  ) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Shadows only change when buildings change: render them on demand.
    this.renderer.shadowMap.autoUpdate = false;

    this.camera = new PerspectiveCamera(30, 1, 0.5, 2000);
    this.rig = new CameraRig(this.camera, canvas);
    this.environment = new Environment(this.scene);
    this.scene.fog = new Fog(PALETTE.skyHorizon, 90, 260);
    this.scene.add(this.lighting.group, this.selection.group);

    // Any camera gesture by the player ends the follow mode.
    this.rig.controls.addEventListener('controlstart', () => {
      if (this.followId && !this.following) {
        this.followId = null;
        this.callbacks.onFollowEnd?.();
      }
    });

    this.tap = new TapDetector(canvas, {
      onTap: (x, y) => {
        if (this.painter.enabled || this.intro) return;
        const kiwi = this.callbacks.onKiwiTap ? this.kiwiAt(x, y) : null;
        if (kiwi) this.callbacks.onKiwiTap!(kiwi.id, kiwi.pos);
        else this.callbacks.onTileTap(this.pickTile(x, y));
      },
      onHover: (x, y) => (this.hoverPoint = this.intro ? null : { x, y }),
      onHoverEnd: () => {
        this.hoverPoint = null;
        this.selection.setHover(null);
      },
    });

    this.painter = new PathPainter(canvas, () => this.map, {
      pickTile: (x, y) => this.pickTile(x, y),
      isPath: (tile) => this.lastState?.paths.includes(hexKey(tile)) ?? false,
      onPreview: (tiles, erase) => this.paths?.setPreview(tiles, erase),
      onStroke: (tiles, erase) => this.callbacks.onPaint?.(tiles, erase),
    });

    this.setQuality(qualityChoice);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  get qualityPreset(): QualityPreset {
    return this.preset;
  }

  setQuality(choice: QualityChoice): void {
    this.qualityChoice = choice;
    this.applyPreset(choice === 'auto' ? detectQuality() : choice);
  }

  private applyPreset(preset: QualityPreset): void {
    this.preset = preset;
    const q = QUALITY[preset];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio));
    this.lighting.setShadowMapSize(q.shadowMapSize);
    this.renderer.shadowMap.enabled = q.shadowMapSize > 0;
    this.postfx?.dispose();
    this.postfx = q.postprocessing ? new PostFx(this.renderer, this.scene, this.camera, q) : null;
    this.renderer.toneMapping = q.postprocessing ? NoToneMapping : NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Materials must recompile when tone mapping changes.
    this.scene.traverse((o) => {
      const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] })
        .material;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    if (this.map) this.rebuildProps();
    this.buildings?.setAnimated(q.buildingAnimations, q.particles);
    this.weather?.setDensity(q.particles ? 1 : 0.35);
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
    this.fpsMeter.reset();
    this.adaptiveTimer = 0;
    this.callbacks.onQualityChange?.(preset);
  }

  setFace(map: FaceMap): void {
    this.map = map;
    for (const view of [
      this.terrain,
      this.water,
      this.buildings,
      this.kiwis,
      this.paths,
      this.weather,
      this.meteors,
      this.predators,
    ]) {
      if (!view) continue;
      this.scene.remove('group' in view ? view.group : view.mesh);
      view.dispose();
    }
    this.setTwin(null);
    this.clearedTiles.clear();
    this.lastState = null;
    this.buildings = new BuildingsView(map, () => (this.renderer.shadowMap.needsUpdate = true));
    this.buildings.setAnimated(
      QUALITY[this.preset].buildingAnimations,
      QUALITY[this.preset].particles,
    );
    this.scene.add(this.buildings.group);
    this.kiwis = new KiwisView(map);
    this.scene.add(this.kiwis.group);
    this.terrain = new TerrainView(map);
    this.scene.add(this.terrain.group);
    this.paths = new PathsView(map);
    this.scene.add(this.paths.group);
    this.meteors = new MeteorsView(map);
    this.scene.add(this.meteors.group);
    this.predators = new PredatorShow(map);
    this.predators.onShot = (x, z) => this.onTurretShot?.(x, z);
    this.scene.add(this.predators.group);
    this.water = new WaterView(map, this.lighting.sun.position);
    this.scene.add(this.water.mesh);
    this.rebuildProps();
    const e = this.terrain.extent();
    this.weather = new WeatherView(map, Math.max(e.x, e.z));
    this.weather.setDensity(QUALITY[this.preset].particles ? 1 : 0.35);
    this.scene.add(this.weather.group);
    this.resize();
    this.lighting.fit(Math.max(e.x, e.z) + 3);
    this.rig.frame(e.x, e.z);
    this.selection.setSelected(null);
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The other half of our kiwi, floating above (fogged unless a friend lives there). */
  setTwin(
    map: FaceMap | null,
    opts: { fog: boolean; friend?: TwinSnapshot | null } = { fog: true },
  ): void {
    if (this.twin) {
      this.scene.remove(this.twin.group);
      this.twin.dispose();
      this.twin = null;
    }
    if (!map) return;
    this.twin = new TwinView(map, opts);
    this.scene.add(this.twin.group);
  }

  /**
   * Plays the intro (chantier 05) instead of the game view until `endIntro`: the whole kiwi
   * sliced in two, then the choice between its two faces.
   */
  playIntro(maps: Record<Face, FaceMap>, handlers: IntroHandlers, skip: boolean): IntroScene {
    this.endIntro();
    this.intro = new IntroScene(this.canvas, maps, handlers, { skip });
    this.intro.resize(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1);
    this.rig.controls.enabled = false;
    this.selection.setHover(null);
    return this.intro;
  }

  setIntroLayout(layout: IntroLayout): void {
    this.intro?.setLayout(layout);
  }

  endIntro(): void {
    if (!this.intro) return;
    this.intro.dispose();
    this.intro = null;
    this.rig.controls.enabled = true;
    this.renderer.shadowMap.needsUpdate = true;
  }

  private rebuildProps(): void {
    if (!this.map) return;
    if (this.props) {
      this.scene.remove(this.props.group);
      this.props.dispose();
    }
    this.props = new PropsView(this.map, QUALITY[this.preset].propDensity);
    this.scene.add(this.props.group);
    for (const key of this.clearedTiles) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      this.props.setTileCleared({ q, r }, true);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Mirrors the game state (buildings, construction sites). Cheap when nothing changed. */
  setGameState(state: GameState): void {
    if (state === this.lastState) return;
    this.lastState = state;
    this.buildings?.sync(state);
    this.kiwis?.sync(state);
    this.paths?.sync(state.paths);
    this.meteors?.sync(state);
    this.weather?.sync(state);
    if (this.map) this.terrain?.setDepletion(depletedTiles(state, this.map));
    this.water?.setFlooded(BIOMES[state.params.biome].floods === seasonOf(state));
    this.refreshCatchment();
    // Clear decorative props under buildings, construction sites and paths.
    const occupied = new Set<string>(state.paths);
    for (const b of state.buildings) occupied.add(hexKey(b));
    for (const i of state.queue) occupied.add(hexKey(i));
    for (const key of occupied) {
      if (this.clearedTiles.has(key)) continue;
      this.clearedTiles.add(key);
      const [q, r] = key.split(',').map(Number) as [number, number];
      this.props?.setTileCleared({ q, r }, true);
      this.renderer.shadowMap.needsUpdate = true;
    }
    for (const key of [...this.clearedTiles]) {
      if (occupied.has(key)) continue;
      this.clearedTiles.delete(key);
      const [q, r] = key.split(',').map(Number) as [number, number];
      this.props?.setTileCleared({ q, r }, false);
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  onGameEvents(events: GameEvent[]): void {
    for (const e of events) {
      if (e.type === 'constructionComplete') this.buildings?.celebrate(e.buildingId, e.q, e.r);
      if (e.type === 'repaired') this.buildings?.burst(e.q, e.r);
      // A wave that strikes while the player watches gets its show (not offline catch-ups).
      if (e.type === 'waveStruck' && Math.abs(this.callbacks.now() - e.at) < 20_000)
        this.pendingShow = e.waveId;
      // The rock reaches the ground at the end of its fall animation.
      if (e.type === 'meteorLanded') window.setTimeout(() => this.buildings?.burst(e.q, e.r), 1300);
      if (e.type === 'hatched') {
        this.buildings?.burst(0, 0);
        // A shiny hatches with a second, longer burst of sparkles.
        if (e.shiny) window.setTimeout(() => this.buildings?.burst(0, 0), 400);
      }
    }
  }

  setSelectedTile(tile: Tile | null): void {
    this.selectedTile = tile;
    this.selection.setSelected(tile);
    this.refreshCatchment();
  }

  /** Path mode: one-finger / left drags paint paths instead of moving the camera. */
  setPaintMode(on: boolean): void {
    this.painter.enabled = on;
    if (!on) this.painter.cancel();
    this.rig.setPaintMode(on);
  }

  private refreshCatchment(): void {
    const t = this.selectedTile;
    const b = t && this.lastState ? buildingAt(this.lastState, t.q, t.r) : undefined;
    const tiles: Tile[] = [];
    if (b?.pool && this.map) {
      for (const k of b.pool.tiles) {
        const tile = getTile(this.map, parseHexKey(k));
        if (tile) tiles.push(tile);
      }
    }
    this.selection.setCatchment(tiles);
  }

  setBottomInset(fraction: number): void {
    this.rig.setBottomInset(fraction);
  }

  recenter(): void {
    if (!this.terrain) return;
    const e = this.terrain.extent();
    this.rig.frame(e.x, e.z, true);
  }

  focusTile(tile: Tile): void {
    const p = this.terrain?.tileTop(tile, new Vector3());
    if (p) this.rig.focus(p.x, p.y, p.z);
  }

  // ---- Audio helpers ----

  /** Camera zoom for sounds: 0 = closest, 1 = farthest. */
  audioZoom(): number {
    const c = this.rig.controls;
    return Math.min(
      1,
      Math.max(0, (c.distance - c.minDistance) / (c.maxDistance - c.minDistance || 1)),
    );
  }

  /** Gain and stereo pan of a sound at a world position, heard from the camera. */
  spatialize(pos: { x: number; z: number }): { gain: number; pan: number } {
    const c = this.rig.controls;
    c.getTarget(tmpTarget);
    const d = Math.hypot(pos.x - tmpTarget.x, pos.z - tmpTarget.z);
    const radius = c.distance * 0.6;
    tmpV.set(pos.x, tmpTarget.y, pos.z).project(this.camera);
    const offscreen = Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1;
    const far = Math.min(1, Math.max(0.45, 30 / c.distance));
    return {
      gain: (far * (offscreen ? 0.5 : 1)) / (1 + (d / radius) ** 2),
      pan: Math.max(-1, Math.min(1, tmpV.x)) * 0.7,
    };
  }

  /** Follows a kiwi with the camera (null stops). */
  followKiwi(id: string | null): void {
    this.followId = id;
    this.followLost = 0;
    if (id) void this.rig.controls.dollyTo(Math.min(this.rig.controls.distance, 16), true);
  }

  /** A ring under a kiwi (its sheet is open or it is followed). */
  highlightKiwi(id: string | null): void {
    this.kiwis?.setHighlight(id);
  }

  private updateFollow(dt: number): void {
    if (!this.followId) return;
    const k = this.kiwis?.visible().find((x) => x.id === this.followId);
    if (!k) {
      // Away (expedition) or gone: give up after a short while.
      this.followLost += dt;
      if (this.followLost > 1.5) {
        this.followId = null;
        this.callbacks.onFollowEnd?.();
      }
      return;
    }
    this.followLost = 0;
    const c = this.rig.controls;
    c.getTarget(tmpTarget);
    const t = Math.min(1, dt * 4);
    this.following = true;
    void c.moveTo(
      tmpTarget.x + (k.pos.x - tmpTarget.x) * t,
      tmpTarget.y + (k.pos.y - tmpTarget.y) * t,
      tmpTarget.z + (k.pos.z - tmpTarget.z) * t,
      false,
    );
    this.following = false;
  }

  /** The kiwi drawn closest to a screen point (generous radius: kiwis are small). */
  kiwiAt(clientX: number, clientY: number): { id: string; pos: { x: number; z: number } } | null {
    const kiwis = this.kiwis?.visible();
    if (!kiwis?.length) return null;
    const rect = this.canvas.getBoundingClientRect();
    const reach = window.matchMedia?.('(pointer: coarse)').matches ? 30 : 22;
    let best: (typeof kiwis)[number] | null = null;
    let bestD = reach * reach;
    for (const k of kiwis) {
      tmpV.copy(k.pos).project(this.camera);
      if (tmpV.z > 1) continue;
      const dx = rect.left + ((tmpV.x + 1) / 2) * rect.width - clientX;
      const dy = rect.top + ((1 - tmpV.y) / 2) * rect.height - clientY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = k;
      }
    }
    return best ? { id: best.id, pos: { x: best.pos.x, z: best.pos.z } } : null;
  }

  /** A random kiwi on screen (ambient chirps), or null. */
  randomVisibleKiwi(): { id: string; pos: { x: number; z: number } } | null {
    const onScreen = (this.kiwis?.visible() ?? []).filter((k) => {
      tmpV.copy(k.pos).project(this.camera);
      return Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1 && tmpV.z < 1;
    });
    const k = onScreen[Math.floor(Math.random() * onScreen.length)];
    return k ? { id: k.id, pos: { x: k.pos.x, z: k.pos.z } } : null;
  }

  private pickTile(x: number, y: number): Tile | null {
    if (!this.terrain || !this.map) return null;
    const objects = this.buildings ? [this.buildings.group] : [];
    const hit = pick(this.canvas, this.camera, this.terrain.tiles, objects, x, y);
    if (!hit) return null;
    if (hit.kind === 'tile') return this.terrain.tileOfInstance(hit.instanceId) ?? null;
    return getTile(this.map, hit) ?? null;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.postfx?.setSize(w, h);
    this.camera.aspect = w / h;
    // Keep the disc comfortably framed in portrait.
    this.camera.fov = this.camera.aspect < 0.8 ? 40 : 30;
    this.camera.updateProjectionMatrix();
    this.intro?.resize(w, h);
    this.weather?.setViewScale(
      (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)),
    );
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    this.fpsMeter.tick(dt);
    const intro = this.intro;
    if (intro) {
      intro.update(dt);
      // The intro may end during its update (the camera reached the chosen face).
      if (this.intro === intro) {
        this.renderer.render(intro.scene, intro.camera);
        return;
      }
    }
    this.rig.update(dt);
    if (this.hoverPoint) {
      this.selection.setHover(this.pickTile(this.hoverPoint.x, this.hoverPoint.y));
      this.hoverPoint = null;
    }
    this.updateCycles();
    this.environment.update(this.elapsed);
    this.water?.update(this.elapsed);
    if (this.twin) {
      const c = this.rig.controls;
      this.twin.update(
        this.elapsed,
        this.camera,
        c.getTarget(this.twinTarget),
        c.distance / this.rig.frameDistance,
      );
    }
    // The haze follows the zoom, so zooming out does not drown the colony in it.
    const fog = this.scene.fog as Fog;
    fog.near = Math.max(90, this.rig.controls.distance + 25);
    fog.far = fog.near + 170;
    this.buildings?.update(dt, this.callbacks.now());
    this.meteors?.update(dt, this.callbacks.now());
    if (this.pendingShow && this.lastState && this.predators) {
      const report = this.lastState.threats.reports.find((r) => r.id === this.pendingShow);
      if (report) {
        this.predators.play(this.lastState, report);
        this.pendingShow = null;
      }
    }
    this.predators?.update(dt);
    this.kiwis?.update(dt, this.elapsed, this.callbacks.now());
    this.updateFollow(dt);
    this.selection.update(this.elapsed);
    if (this.postfx) this.postfx.render(dt);
    else this.renderer.render(this.scene, this.camera);

    this.fpsReportTimer += dt;
    if (this.fpsReportTimer > 0.5) {
      this.fpsReportTimer = 0;
      this.callbacks.onFps?.(this.fpsMeter.fps);
    }
    this.adaptQuality(dt);
  }

  /** Day/night light and sky, season look and weather, from the simulation clock. */
  private updateCycles(): void {
    const state = this.lastState;
    if (!state) return;
    const now = this.callbacks.now();
    const c = calendarAt(state.calendarStart, now);
    const sky = this.dayCycle.update(c);
    this.lighting.applySky(sky);
    this.environment.setSky(sky);
    this.twin?.setSky(sky.cloud, sky.cloudShade);
    (this.scene.fog as Fog).color.copy(sky.horizon);
    updateSeasonLook(c, now);
    seasonUniforms.uNight.value = 1 - sky.daylight;
    this.water?.setIce(seasonUniforms.uSnow.value);
    this.weather?.update(this.elapsed, c, sky.night);
    // Shadows are static: refresh them when the sun has moved a little.
    if (sky.lightDir.dot(this.lastLightDir) < 0.99985) {
      this.lastLightDir.copy(sky.lightDir);
      this.water?.setSunDirection(sky.lightDir);
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  /** In auto mode, step the preset down when the device cannot keep up. */
  private adaptQuality(dt: number): void {
    if (this.qualityChoice !== 'auto' || document.hidden) return;
    this.adaptiveTimer += dt;
    if (this.adaptiveTimer < 6 || this.fpsMeter.sampleCount < 8) return;
    if (this.fpsMeter.slowAverage < 40) {
      const lower = lowerPreset(this.preset);
      if (lower) this.applyPreset(lower);
    }
    this.adaptiveTimer = 0;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.tap.dispose();
    this.painter.dispose();
    this.paths?.dispose();
    this.weather?.dispose();
    this.rig.dispose();
    this.terrain?.dispose();
    this.water?.dispose();
    this.twin?.dispose();
    this.intro?.dispose();
    this.props?.dispose();
    this.buildings?.dispose();
    this.kiwis?.dispose();
    this.postfx?.dispose();
    this.renderer.dispose();
  }
}
