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
  getTile,
  hexKey,
  type FaceMap,
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

export interface RendererCallbacks {
  /** Current simulation time (for smooth progress animations between ticks). */
  now(): number;
  onTileTap(tile: Tile | null): void;
  onFps?(fps: number): void;
  onQualityChange?(preset: QualityPreset): void;
}

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
  private props: PropsView | null = null;
  private buildings: BuildingsView | null = null;
  private kiwis: KiwisView | null = null;
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

    this.tap = new TapDetector(canvas, {
      onTap: (x, y) => this.callbacks.onTileTap(this.pickTile(x, y)),
      onHover: (x, y) => (this.hoverPoint = { x, y }),
      onHoverEnd: () => {
        this.hoverPoint = null;
        this.selection.setHover(null);
      },
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
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
    this.fpsMeter.reset();
    this.adaptiveTimer = 0;
    this.callbacks.onQualityChange?.(preset);
  }

  setFace(map: FaceMap): void {
    this.map = map;
    for (const view of [this.terrain, this.water, this.buildings, this.kiwis]) {
      if (!view) continue;
      this.scene.remove('group' in view ? view.group : view.mesh);
      view.dispose();
    }
    this.clearedTiles.clear();
    this.lastState = null;
    this.buildings = new BuildingsView(map, () => (this.renderer.shadowMap.needsUpdate = true));
    this.scene.add(this.buildings.group);
    this.kiwis = new KiwisView(map);
    this.scene.add(this.kiwis.group);
    this.terrain = new TerrainView(map);
    this.scene.add(this.terrain.group);
    this.water = new WaterView(map, this.lighting.sun.position);
    this.scene.add(this.water.mesh);
    this.rebuildProps();
    const e = this.terrain.extent();
    this.lighting.fit(Math.max(e.x, e.z) + 3);
    this.rig.frame(e.x, e.z);
    this.selection.setSelected(null);
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
    // Clear decorative props under buildings and construction sites.
    const occupied = new Set<string>();
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
      if (e.type === 'hatched') this.buildings?.burst(0, 0);
    }
  }

  setSelectedTile(tile: Tile | null): void {
    this.selection.setSelected(tile);
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
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    this.fpsMeter.tick(dt);
    this.rig.update(dt);
    if (this.hoverPoint) {
      this.selection.setHover(this.pickTile(this.hoverPoint.x, this.hoverPoint.y));
      this.hoverPoint = null;
    }
    this.environment.update(this.elapsed);
    this.water?.update(this.elapsed);
    this.buildings?.update(dt, this.callbacks.now());
    this.kiwis?.update(dt, this.elapsed);
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
    this.rig.dispose();
    this.terrain?.dispose();
    this.water?.dispose();
    this.props?.dispose();
    this.buildings?.dispose();
    this.kiwis?.dispose();
    this.postfx?.dispose();
    this.renderer.dispose();
  }
}
