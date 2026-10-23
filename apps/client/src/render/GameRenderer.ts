import {
  Fog,
  NeutralToneMapping,
  NoToneMapping,
  BasicShadowMap,
  PCFShadowMap,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  ageOf,
  BIOMES,
  buildingAt,
  calendarAt,
  depletedTiles,
  depotDistance,
  getTile,
  harvestedTileType,
  hexDisk,
  catchmentRadius,
  coveredRampart,
  isTurret,
  rampartSectorOf,
  type BuildingType,
  logisticsEfficiency,
  hexKey,
  parseHexKey,
  seasonOf,
  type Face,
  type AllySnapshot,
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
import { windUniforms } from './wind';
import { CropsView, type CropZone } from './crops';
import { DEFAULT_FPS_CAP, FrameLimiter, IdleWatch, type FpsCap } from './frameLimiter';
import { GpuTimer } from './gpuTimer';
import { liteShadows } from './shadowChunk';
import { PerfStats, type FrameStats } from './perfStats';
import { Lighting } from './lighting';
import { PALETTE } from './palette';
import { pick, screenRay, TapDetector } from './picking';
import { PathPainter } from './pathPainter';
import { PathsView } from './paths';
import { MeteorsView } from './meteors';
import { CometsView } from './comets';
import { ObstaclesView } from './obstacles';
import { ShipsView } from './ship';
import { PredatorShow } from './predators';
import { PostFx } from './postfx';
import { PropsView } from './props';
import {
  detectQuality,
  gpuRendererName,
  isIntegratedGpu,
  lowerPreset,
  pixelRatioFor,
  QUALITY,
  type QualityChoice,
  type QualityPreset,
} from './quality';
import { SelectionView } from './selection';
import { TerrainView, worldPosition } from './terrain';
import { SECTOR_COLORS } from './sectors';
import { efficiencyGlow, LogisticsBadges, type PercentBadge } from './logisticsBadges';
import { WaterView } from './water';
import { TwinView, type TwinOptions } from './twin';
import { SIEGE_FX_SECONDS, SiegeFx, type SiegeFxKind } from './siegeFx';
import { AlliesView } from './allies';
import { twinPlace, type PlanetRef } from './space';
import { IntroScene, type IntroHandlers, type IntroLayout } from './intro';
import { DayCycle } from './dayCycle';
import { updateSeasonLook, seasonUniforms } from './seasonLook';
import { WeatherView } from './weather';
import { PlacementGhost } from './placementGhost';
import { TileWaves } from './tileWave';
import { bootMark } from '../game/bootTimes';

export interface RendererCallbacks {
  /** Current simulation time (for smooth progress animations between ticks). */
  now(): number;
  /**
   * Runs at the end of every animation frame, drawn or not (menu open): the simulation tick is
   * driven from here, so its work lands right after a frame instead of at random.
   */
  afterFrame?(): void;
  /** A tile was tapped (`touch`: by a finger, not a mouse). */
  onTileTap(tile: Tile | null, touch: boolean): void;
  /** Chantier 16: while placing, the pointer moved onto another tile (mouse only). */
  onPlacementHover?(tile: Tile | null): void;
  /** A path stroke painted in path mode. */
  onPaint?(tiles: Tile[], erase: boolean): void;
  /** The stroke being painted changed (empty when it ends or is cancelled). */
  onPaintPreview?(tiles: Tile[], erase: boolean): void;
  /** The camera turned (compass). */
  onAzimuth?(azimuth: number): void;
  /** Detailed frame timing, twice a second (debug panel). */
  onStats?(stats: FrameStats): void;
  onQualityChange?(preset: QualityPreset): void;
  /** Average frame rate over the last seconds, every 10 s while drawing at full rhythm. */
  onSlowFrames?(fps: number): void;
  /** A kiwi was tapped (it speaks instead of selecting its tile). */
  onKiwiTap?(id: string, pos: { x: number; z: number }): void;
  /** The player moved the camera while it was following a kiwi (or the kiwi left the map). */
  onFollowEnd?(): void;
  /** An ally's planet was tapped (shared universes). */
  /** Chantier 24: a far planet was tapped (the twin or a member's). */
  onPlanetTap?(planet: PlanetRef): void;
  /** Chantier 24: the pointer is over a far planet (null: over none), at screen x/y. */
  onPlanetHover?(planet: PlanetRef | null, x: number, y: number): void;
}

const tmpV = new Vector3();
const tmpTarget = new Vector3();
const tmpSize = new Vector2();
/**
 * Auto steps medium up to high only if a medium frame costs the GPU less than this (high costs
 * about twice as much: it must stay well within a 60 fps frame).
 */
const AUTO_HIGH_GPU_MS = 5;
/** Inputs that end the idle slowdown (captured on the window: the interface counts too). */
const WAKE_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart'] as const;
/** Level badges show up below this share of the framing distance (chantier 11: medium zoom). */
const BADGE_ZOOM = 0.6;
/** Chantier 16: constructions that ended longer ago than this get no wave (offline). */
const WAVE_RECENT_MS = 15_000;
/** Chantier 16: one colour per producer in the zones overlay. */
const ZONE_COLORS = ['#8df06e', '#6ec8f0', '#f0c36e', '#d58ff0', '#f08f8f', '#6ef0c8'];

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
  private readonly perf = new PerfStats();
  /** Chantier 23: frames drawn at most at the player's cap, fewer while nothing happens. */
  private readonly limiter = new FrameLimiter();
  private readonly idle = new IdleWatch();
  private fpsCap: FpsCap = DEFAULT_FPS_CAP;
  private drawTarget: number = DEFAULT_FPS_CAP;
  private drawnFrames = 0;
  private lastGpuMs: number | null = null;
  private skippedFrames = 0;
  private readonly gpuTimer: GpuTimer;
  private lastFrameAt = 0;
  private terrain: TerrainView | null = null;
  private water: WaterView | null = null;
  private twin: TwinView | null = null;
  private readonly allies = new AlliesView();
  /** Chantier 19: the 3D staging of a siege fight seen from home. */
  private readonly siegeFx = new SiegeFx();
  /** Camera distance before a siege show zoomed out (restored after it). */
  private siegeZoom: number | null = null;
  /** Ally planet the camera visits (null: at home). */
  private visiting: PlanetRef | null = null;
  private homeView: { position: Vector3; target: Vector3 } | null = null;
  private intro: IntroScene | null = null;
  private props: PropsView | null = null;
  private buildings: BuildingsView | null = null;
  private kiwis: KiwisView | null = null;
  private followId: string | null = null;
  private followLost = 0;
  /** True while the renderer itself moves the camera (not a player gesture). */
  private following = false;
  private paths: PathsView | null = null;
  private meteors: MeteorsView | null = null;
  /** Chantier 16: the land waking up around a finished building. */
  private waves: TileWaves | null = null;
  private pendingWaves: string[] = [];
  private comets: CometsView | null = null;
  private readonly cometTarget = new Vector3();
  private obstacles: ObstaclesView | null = null;
  private ships: ShipsView | null = null;
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
  private crops: CropsView | null = null;
  private lastState: GameState | null = null;
  private postfx: PostFx | null = null;
  /** The post-processing chain that got the current size (a new one needs it). */
  private postfxSized: PostFx | null = null;
  private map: FaceMap | null = null;
  /** Timestamp of the last drawn frame (the browser's frame clock, ms). */
  private lastDrawTime = 0;
  private readonly resizeObserver: ResizeObserver;
  private elapsed = 0;
  private hoverPoint: { x: number; y: number } | null = null;
  /** Chantier 20: the building tile under the mouse (its zone shows, paler). */
  private hoverBuildingTile: Tile | null = null;
  private qualityChoice: QualityChoice = 'auto';
  /** In auto, the preset the device may step up to when the GPU has room (chantier 23). */
  private autoCeiling: QualityPreset | null = null;
  private readonly integrated = isIntegratedGpu(gpuRendererName());
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
    // Chantier 32: no forced read-back of every shader's log outside development.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    // Post-processing renders several passes: count the whole frame.
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Shadows only change when buildings change: render them on demand.
    this.renderer.shadowMap.autoUpdate = false;
    this.gpuTimer = new GpuTimer(this.renderer.getContext());

    // Near plane at 1: the camera never comes closer than 11 (better depth precision).
    this.camera = new PerspectiveCamera(30, 1, 1, 2000);
    this.rig = new CameraRig(this.camera, canvas);
    this.environment = new Environment(this.scene);
    this.scene.fog = new Fog(PALETTE.skyHorizon, 90, 260);
    this.scene.add(
      this.lighting.group,
      this.selection.group,
      this.allies.group,
      this.siegeFx.group,
      this.logistics.group,
      this.ghost.group,
    );

    // Any camera gesture by the player ends the follow mode.
    this.rig.controls.addEventListener('controlstart', () => {
      if (this.followId && !this.following) {
        this.followId = null;
        this.callbacks.onFollowEnd?.();
      }
    });

    this.tap = new TapDetector(canvas, {
      onTap: (x, y, touch) => {
        if (this.painter.enabled || this.intro) return;
        const planet = this.planetAt(x, y);
        if (this.visiting !== null) {
          // Visiting is read-only: only another planet can be tapped.
          if (planet !== null && planet !== this.visiting) this.callbacks.onPlanetTap?.(planet);
          return;
        }
        const tile = this.pickTile(x, y);
        if (planet !== null && !tile) {
          this.callbacks.onPlanetTap?.(planet);
          return;
        }
        // A building (or its site) wins over a kiwi walking by: its sheet is what one wants.
        const kiwi =
          this.callbacks.onKiwiTap && !(tile && this.hasStructure(tile)) ? this.kiwiAt(x, y) : null;
        if (kiwi && !this.placingGhost) this.callbacks.onKiwiTap!(kiwi.id, kiwi.pos);
        else this.callbacks.onTileTap(tile, touch);
      },
      // Double tap: fly to the tile (the first tap already selected it).
      onDoubleTap: (x, y) => {
        if (this.painter.enabled || this.intro || this.visiting !== null) return;
        const tile = this.pickTile(x, y);
        if (tile) this.focusTile(tile);
      },
      onHover: (x, y) => (this.hoverPoint = this.intro ? null : { x, y }),
      onHoverEnd: () => {
        this.hoverPoint = null;
        this.hoverPlanet(null, 0, 0);
        this.selection.setHover(null);
        if (this.hoverBuildingTile) {
          this.hoverBuildingTile = null;
          this.refreshCatchment();
        }
      },
    });

    this.painter = new PathPainter(canvas, () => this.map, {
      pickTile: (x, y) => this.pickTile(x, y),
      isPath: (tile) => this.lastState?.paths.includes(hexKey(tile)) ?? false,
      onPreview: (tiles, erase) => {
        this.paths?.setPreview(tiles, erase);
        this.callbacks.onPaintPreview?.(tiles, erase);
      },
      onStroke: (tiles, erase) => this.callbacks.onPaint?.(tiles, erase),
    });

    this.setQuality(qualityChoice);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    for (const type of WAKE_EVENTS)
      window.addEventListener(type, this.wake, { capture: true, passive: true });
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Any input (on the scene or the interface) brings the full frame rate back at once. */
  readonly wake = (): void => {
    const slowed = this.drawTarget !== this.fpsCap;
    this.idle.wake(performance.now());
    if (slowed) this.limiter.reset();
  };

  setFpsCap(cap: FpsCap): void {
    this.fpsCap = cap;
    this.limiter.reset();
    this.wake();
  }

  get qualityPreset(): QualityPreset {
    return this.preset;
  }

  setQuality(choice: QualityChoice): void {
    this.qualityChoice = choice;
    if (choice !== 'auto') {
      this.autoCeiling = null;
      this.applyPreset(choice);
      return;
    }
    // Chantier 23: auto starts a strong GPU on medium and only steps up to high once the GPU
    // timer shows room to spare (high made laptops run hot for little gain).
    const detected = detectQuality();
    this.autoCeiling = detected === 'high' ? 'high' : null;
    this.applyPreset(detected === 'high' ? 'medium' : detected);
  }

  private applyPreset(preset: QualityPreset): void {
    this.preset = preset;
    const q = QUALITY[preset];
    this.lighting.setShadowMapSize(q.shadowMapSize);
    this.renderer.shadowMap.enabled = q.shadowMapSize > 0;
    this.renderer.shadowMap.type = q.softShadows
      ? PCFSoftShadowMap
      : q.liteShadows && liteShadows
        ? BasicShadowMap
        : PCFShadowMap;
    this.postfx?.dispose();
    this.postfx = q.postprocessing ? new PostFx(this.renderer, this.scene, this.camera, q) : null;
    const toneMapping = q.postprocessing ? NoToneMapping : NeutralToneMapping;
    const recompile = toneMapping !== this.renderer.toneMapping;
    this.renderer.toneMapping = toneMapping;
    this.renderer.toneMappingExposure = 1.05;
    // Materials must recompile when tone mapping changes (only then: it is a long hitch).
    if (recompile)
      this.scene.traverse((o) => {
        const m = (o as { material?: { needsUpdate: boolean } | { needsUpdate: boolean }[] })
          .material;
        if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
        else if (m) m.needsUpdate = true;
      });
    if (this.map) this.rebuildProps();
    this.buildings?.setAnimated(q.buildingAnimations, q.particles);
    this.environment.setLite(preset === 'low');
    this.siegeFx.setLite(preset === 'low');
    this.lighting.setRim(preset !== 'low');
    windUniforms.uWindAmount.value = preset === 'low' ? 0 : 1;
    this.weather?.setDensity(q.particles ? 1 : 0.35);
    this.ships?.setParticles(q.particles);
    this.resize();
    this.renderer.shadowMap.needsUpdate = true;
    this.fpsMeter.reset();
    this.adaptiveTimer = 0;
    this.callbacks.onQualityChange?.(preset);
  }

  /**
   * The same face with reshaped tiles (titan works): the scene is rebuilt from the new map, the
   * camera, the visit and the selection stay as they are.
   */
  reshape(map: FaceMap): void {
    const visiting = this.visiting;
    const homeView = this.homeView;
    const state = this.lastState;
    this.setFace(map, true);
    this.visiting = visiting;
    this.homeView = homeView;
    if (state) this.setGameState(state);
  }

  setFace(map: FaceMap, keepView = false): void {
    this.map = map;
    this.visiting = null;
    this.homeView = null;
    for (const view of [
      this.terrain,
      this.water,
      this.buildings,
      this.kiwis,
      this.paths,
      this.weather,
      this.meteors,
      this.comets,
      this.obstacles,
      this.predators,
      this.ships,
      this.waves,
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
    this.waves = new TileWaves(this.buildings.particles);
    this.pendingWaves = [];
    this.scene.add(this.waves.group);
    this.kiwis = new KiwisView(map);
    this.scene.add(this.kiwis.group);
    this.terrain = new TerrainView(map);
    this.scene.add(this.terrain.group);
    this.paths = new PathsView(map);
    this.scene.add(this.paths.group);
    this.meteors = new MeteorsView(map);
    this.scene.add(this.meteors.group);
    this.comets = new CometsView(map);
    this.scene.add(this.comets.group);
    this.obstacles = new ObstaclesView(map, () => (this.renderer.shadowMap.needsUpdate = true));
    this.scene.add(this.obstacles.group);
    this.ships = new ShipsView(map);
    this.ships.setParticles(QUALITY[this.preset].particles);
    this.scene.add(this.ships.group);
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
    if (!keepView) {
      this.rig.frame(e.x, e.z);
      this.selection.setSelected(null);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The other half of our kiwi, floating above (fogged unless a friend lives there). */
  setTwin(map: FaceMap | null, opts: TwinOptions = { fog: true }): void {
    if (this.twin) {
      this.scene.remove(this.twin.group);
      this.twin.dispose();
      this.twin = null;
    }
    if (!map) {
      if (this.visiting === 'twin') this.travelTo(null);
      return;
    }
    this.twin = new TwinView(map, opts);
    this.twin.place(twinPlace(this.twinApproach));
    this.scene.add(this.twin.group);
  }

  private twinApproach = 0;
  private twinApproachTarget = 0;

  /**
   * Chantier 24, for the siege show of chantier 19: brings the twin closer along the front
   * (0 = its resting place, 1 = `TWIN_CLOSEST`), eased over a couple of seconds.
   */
  setTwinApproach(approach: number): void {
    this.twinApproachTarget = Math.min(1, Math.max(0, approach));
  }

  /**
   * Chantier 19: plays a siege fight in 3D from home — the camera rises towards space, the
   * twin comes closer, the fight, then everything goes back. False when it cannot be seen
   * (visiting a planet, no twin): the 2D caption is then the whole show.
   */
  playSiege(kind: SiegeFxKind, sector: number | null): boolean {
    if (!this.twin || this.visiting !== null) return false;
    this.siegeFx.play(kind, sector);
    this.setTwinApproach(1);
    if (this.siegeZoom === null) {
      this.siegeZoom = this.rig.controls.distance;
      void this.rig.controls.dollyTo(Math.max(this.siegeZoom, this.rig.frameDistance * 2.4), true);
    }
    this.wake();
    return true;
  }

  /** Seconds a 3D siege show lasts. */
  readonly siegeSeconds = SIEGE_FX_SECONDS;

  /** The other players' colonies, far away (shared universes). */
  setAllies(allies: AllySnapshot[], myKiwi: number): void {
    this.allies.set(allies, myKiwi);
    const visiting = this.visiting;
    if (typeof visiting === 'number') {
      // Rebuilt from a fresh snapshot: keep visiting the same kiwi, if it is still there.
      const planet = this.allies.find(visiting);
      if (planet) this.allies.setVisited(planet);
      else this.travelTo(null);
    }
  }

  /** The view of a far planet, if drawn. */
  private planetView(planet: PlanetRef): TwinView | null {
    return planet === 'twin' ? this.twin : (this.allies.find(planet)?.view ?? null);
  }

  /**
   * Chantier 24: flies the camera to a far planet (the twin under its fog, or a member's, read
   * only) and orbits it there, or back home (null). Returns false when that planet is not drawn.
   */
  travelTo(planet: PlanetRef | null): boolean {
    if (planet === null) {
      if (this.visiting === null && !this.homeView) return true;
      this.visiting = null;
      this.allies.setVisited(null);
      this.twin?.setLabelVisible(true);
      const e = this.terrain?.extent() ?? { x: 20, z: 20 };
      this.rig.returnHome(e.x, e.z, this.homeView);
      this.homeView = null;
      return true;
    }
    const view = this.planetView(planet);
    if (!view) return false;
    if (this.visiting === null) {
      const c = this.rig.controls;
      this.homeView = {
        position: c.getPosition(new Vector3()),
        target: c.getTarget(new Vector3()),
      };
    }
    if (this.followId) {
      this.followId = null;
      this.callbacks.onFollowEnd?.();
    }
    this.visiting = planet;
    this.allies.setVisited(typeof planet === 'number' ? this.allies.find(planet) : null);
    // The name ribbon would cover the planet being visited.
    this.twin?.setLabelVisible(planet !== 'twin');
    this.selection.setHover(null);
    this.rig.visit(view.home, view.radius);
    return true;
  }

  /** The far planet the camera is visiting (null: at home). */
  get visitedPlanet(): PlanetRef | null {
    return this.visiting;
  }

  private hasStructure(tile: Tile): boolean {
    const s = this.lastState;
    if (!s) return false;
    return (
      !!buildingAt(s, tile.q, tile.r) ||
      s.queue.some((i) => i.kind === 'build' && i.q === tile.q && i.r === tile.r)
    );
  }

  /** The far planet under a screen point (chantier 24): the twin or a member's, nearest first. */
  planetAt(x: number, y: number): PlanetRef | null {
    const ray = screenRay(this.canvas, this.camera, x, y).ray;
    const twin = this.twin?.rayHit(ray) ?? null;
    const ally = this.allies.pick(ray);
    if (ally && (twin === null || ally.distance < twin)) return ally.planet.kiwiIndex;
    return twin !== null ? 'twin' : null;
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
    if (this.crops) {
      this.scene.remove(this.crops.group);
      this.crops.dispose();
    }
    this.crops = new CropsView(this.map, QUALITY[this.preset].propDensity);
    this.scene.add(this.crops.group);
    if (this.lastState) this.syncCrops(this.lastState, depletedTiles(this.lastState, this.map));
    for (const key of this.clearedTiles) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      this.props.setTileCleared({ q, r }, true);
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /**
   * Chantier 23: the producers' tiles (their pools) with the fill ratio of the deposit, for the
   * crops. Returns the keys of the cultivated tiles.
   */
  private syncCrops(
    state: GameState,
    depleted: ReadonlyMap<string, number>,
    occupied?: ReadonlySet<string>,
  ): string[] {
    const map = this.map;
    if (!map || !this.crops) return [];
    const taken =
      occupied ??
      new Set([
        ...state.paths,
        ...state.buildings.map(hexKey),
        ...state.queue.map(hexKey),
        ...state.obstacles.map(hexKey),
      ]);
    const zones: CropZone[] = [];
    for (const b of state.buildings) {
      if (!b.pool || b.type === 'camp') continue;
      const type = harvestedTileType(map, b);
      if (!type) continue;
      for (const key of b.pool.tiles)
        if (!taken.has(key)) zones.push({ key, type, ratio: depleted.get(key) ?? 1 });
    }
    this.crops.sync(zones, seasonOf(state));
    return zones.map((z) => z.key);
  }

  /** Chantier 16: a wave over the catchment (or the rampart) of each building just finished. */
  private startWaves(state: GameState): void {
    const map = this.map;
    const ids = this.pendingWaves;
    this.pendingWaves = [];
    if (!map || !this.waves || this.visiting !== null) return;
    for (const id of ids) {
      const b = state.buildings.find((x) => x.id === id);
      const origin = b && getTile(map, b);
      if (!b || !origin) continue;
      if (isTurret(b.type)) {
        const covered = coveredRampart(map, b.type, b.level, b);
        this.waves.start(
          origin,
          covered.map((x) => x.tile),
          covered.map((x) => SECTOR_COLORS[x.sector]),
        );
      } else if (b.pool && b.type !== 'camp') {
        const tiles = b.pool.tiles
          .map((k) => getTile(map, parseHexKey(k)))
          .filter((t): t is Tile => !!t);
        this.waves.start(origin, tiles, []);
      }
    }
  }

  /** Mirrors the game state (buildings, construction sites). Cheap when nothing changed. */
  setGameState(state: GameState): void {
    if (state === this.lastState) return;
    this.lastState = state;
    this.buildings?.sync(state);
    if (this.pendingWaves.length > 0) this.startWaves(state);
    this.kiwis?.sync(state);
    this.paths?.sync(
      state.paths,
      ageOf(state),
      new Set([...state.buildings.map(hexKey), ...state.queue.map(hexKey)]),
    );
    this.meteors?.sync(state);
    this.comets?.sync(state);
    this.obstacles?.sync(state);
    this.ships?.sync(state);
    this.weather?.sync(state, this.buildings?.lit ?? null);
    const depleted = this.map ? depletedTiles(state, this.map) : null;
    if (depleted) this.terrain?.setDepletion(depleted);
    this.water?.setFlooded(BIOMES[state.params.biome].floods === seasonOf(state));
    this.refreshCatchment();
    this.refreshLogistics();
    // Clear decorative props under buildings, construction sites and paths.
    const occupied = new Set<string>(state.paths);
    for (const b of state.buildings) occupied.add(hexKey(b));
    for (const i of state.queue) occupied.add(hexKey(i));
    for (const o of state.obstacles) occupied.add(hexKey(o));
    // Chantier 23: cultivated tiles trade their wild props for crops.
    const crops = depleted ? this.syncCrops(state, depleted, occupied) : [];
    for (const key of crops) occupied.add(key);
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
      if (e.type === 'constructionComplete') {
        this.buildings?.celebrate(e.buildingId, e.q, e.r);
        // Chantier 16: only for constructions ending now (not those of an offline catch-up);
        // the building's catchment is known with the next state.
        if (this.callbacks.now() - e.at < WAVE_RECENT_MS) this.pendingWaves.push(e.buildingId);
      }
      if (e.type === 'repaired') this.buildings?.burst(e.q, e.r);
      if (e.type === 'obstacleCleared') this.buildings?.burst(e.q, e.r);
      // A new age: fireworks over the monument (chantier 08).
      if (e.type === 'ageReached') {
        for (let i = 0; i < 5; i++)
          window.setTimeout(
            () => {
              const monument = this.lastState?.buildings.find((x) => x.type === 'monument');
              if (monument) this.buildings?.burst(monument.q, monument.r);
            },
            300 + i * 350,
          );
      }
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

  /** Chantier 11: level badges everywhere (otherwise only at medium zoom). */
  setLevelBadges(always: boolean): void {
    this.levelBadges = always;
  }

  private levelBadges = false;

  /** Chantier 12: logistics labels (overlay above the producers, or placement tiles). */
  private readonly logistics = new LogisticsBadges();
  private logisticsOverlay = false;
  private placementLabels: PercentBadge[] = [];
  private placementHover = '';
  private placementHoverTile: Tile | null = null;
  private placingTurret: BuildingType | null = null;

  /** Chantier 16: the translucent building that follows the pointer while placing. */
  private readonly ghost = new PlacementGhost();
  private placingGhost = false;

  /** Chantier 16: the building being placed (null: placement over) and the colony's age. */
  setGhostModel(type: BuildingType | null, age: number): void {
    this.placingGhost = type !== null;
    this.ghost.setModel(type, age);
    if (!type) {
      this.placementHover = '';
      this.placementHoverTile = null;
    }
  }

  /** Chantier 16: where the ghost hovers (the pointed or tapped tile) and if it can go there. */
  setGhostTile(tile: Tile | null, valid: boolean): void {
    this.ghost.setTile(tile, valid);
    // On a phone (no hover) the tapped tile also shows its logistics % or turret range.
    const key = tile ? `t${tile.q},${tile.r}` : '';
    if (tile && key !== this.placementHover) {
      this.placementHover = key;
      this.placementHoverTile = tile;
      this.refreshLogistics();
      this.refreshCatchment();
    }
  }

  /** Chantier 16: the catchment a producer would have under the ghost (empty: none). */
  setPlannedCatchment(free: readonly Tile[], taken: readonly Tile[]): void {
    this.selection.setPlanned(free, taken);
  }

  /** Chantier 12: the logistics overlay (efficiency of every producer). */
  setLogisticsOverlay(on: boolean): void {
    this.logisticsOverlay = on;
    this.refreshLogistics();
  }

  private zonesKey = '';

  /**
   * Chantier 16: with the logistics overlay, every producer's catchment in its own colour and
   * the tiles within reach of several producers ringed in grey (they go to the oldest).
   */
  private refreshZones(): void {
    const state = this.lastState;
    const map = this.map;
    const on =
      this.logisticsOverlay && this.placementLabels.length === 0 && !this.placingGhost && !!map;
    const producers = on && state ? state.buildings.filter((b) => harvestedTileType(map!, b)) : [];
    const key = producers
      .map((b) => `${b.id}:${b.level}:${b.pool?.tiles.join(';') ?? ''}`)
      .join('|');
    if (key === this.zonesKey) return;
    this.zonesKey = key;
    const tiles: Tile[] = [];
    const colors: string[] = [];
    const reach = new Map<string, number>();
    producers.forEach((b, i) => {
      for (const k of b.pool?.tiles ?? []) {
        const t = getTile(map!, parseHexKey(k));
        if (!t) continue;
        tiles.push(t);
        colors.push(ZONE_COLORS[i % ZONE_COLORS.length]!);
      }
      const type = harvestedTileType(map!, b);
      for (const h of hexDisk(b, catchmentRadius(b))) {
        if (getTile(map!, h)?.type !== type) continue;
        const k = `${type}:${hexKey(h)}`;
        reach.set(k, (reach.get(k) ?? 0) + 1);
      }
    });
    const contested: Tile[] = [];
    for (const [k, n] of reach) {
      if (n < 2) continue;
      const t = getTile(map!, parseHexKey(k.slice(k.indexOf(':') + 1)));
      if (t) contested.push(t);
    }
    this.selection.setZones(tiles, colors, contested);
  }

  private refreshLogistics(): void {
    this.refreshZones();
    const state = this.lastState;
    // While placing, only the hovered tile shows its number (the others are tinted).
    let rows = this.placementLabels.filter((b) => b.key === this.placementHover);
    if (
      this.placementLabels.length === 0 &&
      this.logisticsOverlay &&
      state &&
      this.map &&
      this.buildings
    ) {
      const map = this.map;
      rows = [];
      for (const b of state.buildings) {
        if (!harvestedTileType(map, b)) continue;
        const a = this.buildings.anchorOf(b.id);
        if (!a) continue;
        const value = logisticsEfficiency(depotDistance(state, map, b));
        rows.push({ key: b.id, ...a, value, q: b.q, r: b.r });
      }
    }
    this.logistics.show(rows);
  }

  /**
   * Chantier 11: lights the tiles where the building chosen in the tree can go; chantier 12:
   * with the logistics efficiency a producer would have on each.
   */
  setPlacement(
    tiles: readonly Tile[],
    efficiencies?: readonly number[],
    turret: BuildingType | null = null,
  ): void {
    this.placingTurret = turret;
    if (tiles.length === 0) {
      this.placementHover = '';
      this.placementHoverTile = null;
    }
    // A turret: the rampart tiles take the colour of their sector (front or flank).
    const colors = turret
      ? tiles.map((t) => SECTOR_COLORS[rampartSectorOf(t)])
      : efficiencies?.map(efficiencyGlow);
    this.selection.setPlacement(tiles, colors);
    this.placementLabels = efficiencies
      ? tiles.map((t, i) => {
          const p = worldPosition(t);
          return {
            key: `t${t.q},${t.r}`,
            x: p.x,
            // Above the hovering ghost (chantier 16).
            y: t.height + 1.45,
            z: p.z,
            value: efficiencies[i]!,
            q: t.q,
            r: t.r,
          };
        })
      : [];
    this.refreshLogistics();
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
    const selected = t && this.lastState ? buildingAt(this.lastState, t.q, t.r) : undefined;
    // Chantier 20: with nothing selected, the building under the mouse shows its zone (paler).
    const h = this.hoverBuildingTile;
    const hoveredBuilding =
      !selected && !this.placingGhost && !this.placingTurret && h && this.lastState
        ? buildingAt(this.lastState, h.q, h.r)
        : undefined;
    const b = selected ?? hoveredBuilding;
    const faint = !selected && !!hoveredBuilding;
    // Chantier 12: the rampart a turret defends (selected, or hovered while placing one).
    const hovered = this.placingTurret && this.placementHover ? this.placementHoverTile : null;
    if (this.map && (hovered || (b && isTurret(b.type)))) {
      const covered = hovered
        ? coveredRampart(this.map, this.placingTurret!, 1, hovered)
        : coveredRampart(this.map, b!.type, b!.level, b!);
      this.selection.setCatchment(
        covered.map((x) => x.tile),
        covered.map((x) => SECTOR_COLORS[x.sector]),
        faint && !hovered,
      );
      return;
    }
    const tiles: Tile[] = [];
    if (b?.pool && this.map) {
      for (const k of b.pool.tiles) {
        const tile = getTile(this.map, parseHexKey(k));
        if (tile) tiles.push(tile);
      }
    }
    this.selection.setCatchment(tiles, undefined, faint);
  }

  setBottomInset(fraction: number): void {
    this.rig.setBottomInset(fraction);
  }

  recenter(): void {
    if (!this.terrain) return;
    const e = this.terrain.extent();
    this.rig.frame(e.x, e.z, true);
  }

  /** Flies to the Nest (compass). */
  focusNest(): void {
    const nest = this.lastState?.buildings.find((b) => b.type === 'nest');
    const tile = nest && this.map ? getTile(this.map, nest) : undefined;
    if (tile) this.focusTile(tile);
    else this.recenter();
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
    const ratio = pixelRatioFor(
      QUALITY[this.preset],
      w,
      h,
      window.devicePixelRatio,
      this.integrated,
    );
    const size = this.renderer.getSize(tmpSize);
    const changed = ratio !== this.renderer.getPixelRatio() || size.x !== w || size.y !== h;
    if (ratio !== this.renderer.getPixelRatio()) this.renderer.setPixelRatio(ratio);
    // Reallocating the buffers is costly: only when the size or the ratio changed (a new
    // post-processing chain always needs its size).
    if (changed) this.renderer.setSize(w, h, false);
    if (changed || this.postfxSized !== this.postfx) {
      this.postfx?.setSize(w, h);
      this.postfxSized = this.postfx;
    }
    this.camera.aspect = w / h;
    // Keep the disc comfortably framed in portrait.
    this.camera.fov = this.camera.aspect < 0.8 ? 40 : 30;
    this.camera.updateProjectionMatrix();
    this.intro?.resize(w, h);
    this.weather?.setViewScale(
      (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360)),
    );
  }

  /**
   * A menu covers the scene: after a couple of frames the 3D stops drawing, so the GPU and the
   * main thread belong to the menu (the scene is dimmed behind it anyway).
   */
  setBackground(background: boolean): void {
    if (background === this.background) return;
    this.background = background;
    this.backgroundFrames = 2;
    // The paused time is not a slow frame.
    if (!background) {
      this.lastFrameAt = 0;
      this.wake();
    }
  }

  private background = false;
  private backgroundFrames = 0;

  private frame(time: number): void {
    const start = performance.now();
    // A hidden tab normally gets no frames at all; if one comes, only the tick runs.
    if (document.hidden && !this.intro) {
      this.runAfterFrame();
      return;
    }
    if (this.background && !this.intro) {
      if (this.backgroundFrames <= 0) {
        this.runAfterFrame();
        return;
      }
      this.backgroundFrames--;
    }
    if (!this.intro && !this.firstDrawn && this.lastState && !this.warmed()) {
      this.runAfterFrame();
      return;
    }
    const target = this.intro ? this.fpsCap : this.idle.target(time, this.fpsCap);
    if (target !== this.drawTarget) {
      this.drawTarget = target;
      // The measures of another rhythm say nothing about this one.
      this.fpsMeter.reset();
      this.adaptiveTimer = 0;
      this.lastFrameAt = 0;
    }
    if (!this.limiter.shouldDraw(time, target)) {
      this.skippedFrames++;
      this.runAfterFrame();
      return;
    }
    this.drawnFrames++;
    if (this.lastFrameAt > 0) {
      // Recorded at the start of the next frame: the cost of the previous one is known.
      this.perf.record(start - this.lastFrameAt, this.lastCpu);
      // Real interval (the animation step below is clamped, the measure must not be).
      this.fpsMeter.tick((start - this.lastFrameAt) / 1000);
    }
    this.lastFrameAt = start;
    this.renderer.info.reset();
    this.drawFrame(time);
    this.lastCpu = performance.now() - start;
    this.runAfterFrame();
  }

  private runAfterFrame(): void {
    try {
      this.callbacks.afterFrame?.();
    } catch (e) {
      // An exception here would stop the animation loop for good.
      this.reportFrameError(e);
    }
  }

  private lastCpu = 0;
  /** Chantier 32: the first frame of the colony was drawn (boot measures, loader). */
  private firstDrawn = false;
  private warming: 'no' | 'busy' | 'done' = 'no';

  /**
   * Chantier 32: before the first frame, the shaders compile with `compileAsync` (in parallel
   * where the browser has KHR_parallel_shader_compile), so the loader keeps moving instead of
   * one long frozen first frame. Gives up waiting after 4 s.
   */
  private warmed(): boolean {
    if (this.warming === 'no') {
      this.warming = 'busy';
      bootMark('compile');
      const done = () => {
        if (this.warming === 'done') return;
        this.warming = 'done';
        bootMark('compiled');
      };
      // Without the extension compiling ahead gains nothing (the first frame waits anyway).
      if (!this.renderer.extensions.has('KHR_parallel_shader_compile')) {
        done();
        return true;
      }
      window.setTimeout(done, 4000);
      try {
        this.renderer.compileAsync(this.scene, this.camera).then(done, done);
      } catch {
        done();
      }
    }
    return this.warming === 'done';
  }

  /** The colony's first frame is on screen, or the intro plays (the loader may go). */
  get ready(): boolean {
    return this.firstDrawn || this.intro !== null;
  }
  private lastAzimuth = NaN;
  private hoveredPlanet: PlanetRef | null = null;

  /** Tells the interface which far planet is under the pointer (its name follows the pointer). */
  private hoverPlanet(planet: PlanetRef | null, x: number, y: number): void {
    if (planet === null && this.hoveredPlanet === null) return;
    this.hoveredPlanet = planet;
    this.callbacks.onPlanetHover?.(planet, x, y);
  }

  private drawFrame(time: number): void {
    // The browser's frame timestamp (aligned on the display), not the clock read mid-callback:
    // the camera smoothing gets even steps.
    const dt =
      this.lastDrawTime > 0 ? Math.min(Math.max(0, time - this.lastDrawTime) / 1000, 0.1) : 0;
    this.lastDrawTime = time;
    this.elapsed += dt;
    const intro = this.intro;
    if (intro) {
      intro.update(dt);
      // The intro may end during its update (the camera reached the chosen face).
      if (this.intro === intro) {
        this.renderer.render(intro.scene, intro.camera);
        return;
      }
    }
    // Signs of life that keep the full frame rate: the camera moving or gliding, a tool in
    // hand, a show on screen.
    if (
      this.rig.update(dt) ||
      this.painter.enabled ||
      this.placingGhost ||
      this.waves?.active ||
      this.predators?.playing ||
      this.pendingShow ||
      this.siegeFx.playing ||
      this.twinApproach !== this.twinApproachTarget
    )
      this.idle.wake(time);
    const azimuth = this.rig.controls.azimuthAngle;
    if (!(Math.abs(azimuth - this.lastAzimuth) <= 0.004)) {
      this.lastAzimuth = azimuth;
      this.callbacks.onAzimuth?.(azimuth);
    }
    const point = this.hoverPoint;
    this.hoverPoint = null;
    // Visiting is read-only: only the planets answer the pointer there.
    const away = this.visiting !== null;
    const hoverTile = point && !away ? this.pickTile(point.x, point.y) : null;
    if (point)
      this.hoverPlanet(hoverTile ? null : this.planetAt(point.x, point.y), point.x, point.y);
    if (point && !away) {
      const tile = hoverTile;
      this.selection.setHover(tile);
      const onBuilding =
        tile && this.lastState && buildingAt(this.lastState, tile.q, tile.r) ? tile : null;
      const was = this.hoverBuildingTile;
      if (onBuilding?.q !== was?.q || onBuilding?.r !== was?.r) {
        this.hoverBuildingTile = onBuilding;
        this.refreshCatchment();
      }
      const key = tile ? `t${tile.q},${tile.r}` : '';
      if (
        (this.placementLabels.length > 0 || this.placingTurret || this.placingGhost) &&
        key !== this.placementHover
      ) {
        this.placementHover = key;
        this.placementHoverTile = tile;
        this.refreshLogistics();
        this.refreshCatchment();
        if (this.placingGhost) this.callbacks.onPlacementHover?.(tile);
      }
    }
    const first = !this.firstDrawn && this.lastState !== null;
    if (first) bootMark('scene');
    try {
      this.updateScene(dt);
    } catch (e) {
      // One broken view must not leave the screen empty: keep drawing the rest.
      this.reportFrameError(e);
    }
    if (first) bootMark('updated');
    this.gpuTimer.begin();
    if (this.postfx) this.postfx.render(dt);
    else this.renderer.render(this.scene, this.camera);
    this.gpuTimer.end();
    if (first) {
      this.firstDrawn = true;
      bootMark('drawn');
    }

    this.fpsReportTimer += dt;
    if (this.fpsReportTimer > 0.5) {
      this.fpsReportTimer = 0;
      this.reportStats();
    }
    this.adaptQuality(dt);
    this.watchFrames(dt);
  }

  private framesTimer = 0;

  /** Reports a lasting low frame rate (the interface may advise the player). */
  private watchFrames(dt: number): void {
    this.framesTimer += dt;
    if (this.framesTimer < 10) return;
    this.framesTimer = 0;
    // An idle, slowed-down rhythm is not a slow device.
    if (document.hidden || this.fpsMeter.sampleCount < 8 || this.drawTarget !== this.fpsCap) return;
    const fps = this.fpsMeter.slowAverage;
    const slow = this.drawTarget > 0 ? Math.min(30, this.drawTarget * 0.67) : 30;
    if (fps < slow) this.callbacks.onSlowFrames?.(fps);
  }

  private reportStats(): void {
    this.lastGpuMs = this.gpuTimer.take();
    const drawn = this.drawnFrames;
    const skipped = this.skippedFrames;
    this.drawnFrames = 0;
    this.skippedFrames = 0;
    if (!this.callbacks.onStats) return;
    const size = this.renderer.getDrawingBufferSize(tmpSize);
    this.callbacks.onStats({
      ...this.perf.summary(),
      gpuMs: this.lastGpuMs,
      targetFps: this.drawTarget,
      idle: this.drawTarget !== this.fpsCap,
      drawnShare: drawn + skipped > 0 ? drawn / (drawn + skipped) : 1,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      width: size.x,
      height: size.y,
      dpr: this.renderer.getPixelRatio(),
    });
  }

  private frameErrors = new Set<string>();

  private reportFrameError(e: unknown): void {
    const key = e instanceof Error ? e.message : String(e);
    if (this.frameErrors.has(key)) return;
    this.frameErrors.add(key);
    console.error(e);
  }

  /** Everything animated before the frame is drawn. */
  private updateScene(dt: number): void {
    this.updateCycles();
    windUniforms.uWindTime.value = this.elapsed;
    this.crops?.update(dt);
    this.environment.update(this.elapsed, this.camera.position);
    this.water?.update(this.elapsed);
    if (this.twinApproach !== this.twinApproachTarget) {
      const gap = this.twinApproachTarget - this.twinApproach;
      this.twinApproach =
        Math.abs(gap) < 1e-3
          ? this.twinApproachTarget
          : this.twinApproach + gap * Math.min(1, dt * 1.5);
      this.twin?.place(twinPlace(this.twinApproach));
    }
    this.allies.update(dt, this.elapsed, this.camera.position);
    this.twin?.update(dt, this.elapsed, this.camera.position, this.visiting === 'twin');
    if (this.siegeFx.playing) {
      this.siegeFx.update(dt, this.twin);
      // The fight is over: the twin goes back to its place and the camera to the player's zoom.
      if (this.siegeFx.retreating || !this.siegeFx.playing) {
        this.setTwinApproach(0);
        if (this.siegeZoom !== null) {
          void this.rig.controls.dollyTo(this.siegeZoom, true);
          this.siegeZoom = null;
        }
      }
    }
    // The haze follows the zoom, so zooming out does not drown the colony in it.
    const fog = this.scene.fog as Fog;
    fog.near = Math.max(90, this.rig.controls.distance + 25);
    fog.far = fog.near + 170;
    this.buildings?.update(dt, this.callbacks.now());
    this.waves?.update(dt);
    this.logistics.group.visible = this.visiting === null;
    this.buildings?.badges.setVisible(
      this.visiting === null &&
        !this.logisticsOverlay &&
        this.placementLabels.length === 0 &&
        (this.levelBadges || this.rig.controls.distance < this.rig.frameDistance * BADGE_ZOOM),
    );
    this.meteors?.update(dt, this.callbacks.now());
    this.comets?.update(
      dt,
      this.callbacks.now(),
      this.camera,
      this.rig.controls.getTarget(this.cometTarget),
    );
    this.obstacles?.update(dt);
    this.ships?.update(
      dt,
      this.elapsed,
      this.callbacks.now(),
      this.twin?.group.position ?? null,
      (a) =>
        this.allies.planets.find((p) =>
          a.kiwiIndex === null ? p.owner === a.owner : p.kiwiIndex === a.kiwiIndex,
        )?.view.group.position ?? null,
    );
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
    this.ghost.update(this.elapsed);
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
    this.allies.setSky(sky.cloud, sky.cloudShade);
    (this.scene.fog as Fog).color.copy(sky.horizon);
    updateSeasonLook(c, now);
    seasonUniforms.uNight.value = 1 - sky.daylight;
    // Lamps come on as the sun sets and go out after sunrise.
    const dim = Math.min(1, Math.max(0, (0.85 - sky.daylight) / 0.5));
    const lamps = dim * dim * (3 - 2 * dim);
    this.buildings?.windows.setGlow(lamps);
    this.paths?.setGlow(lamps);
    this.water?.setIce(seasonUniforms.uSnow.value);
    this.weather?.update(this.elapsed, c, sky.night);
    this.comets?.setNight(sky.night);
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
    this.adaptiveTimer = 0;
    // Judged against the rhythm aimed at: an idle 20 fps is not a slow device.
    const target = this.drawTarget || 60;
    const fps = this.fpsMeter.slowAverage;
    if (fps < Math.min(40, target * 0.67)) {
      const lower = lowerPreset(this.preset);
      // Once stepped down, never back up (no see-saw between presets).
      this.autoCeiling = null;
      if (lower) this.applyPreset(lower);
      return;
    }
    const higher = this.autoCeiling && this.preset !== this.autoCeiling ? 'high' : null;
    if (
      higher &&
      target >= 55 &&
      fps >= target * 0.92 &&
      this.lastGpuMs !== null &&
      this.lastGpuMs < AUTO_HIGH_GPU_MS
    )
      this.applyPreset(higher);
  }

  dispose(): void {
    this.logistics.dispose();
    this.ghost.dispose();
    this.renderer.setAnimationLoop(null);
    for (const type of WAKE_EVENTS) window.removeEventListener(type, this.wake, { capture: true });
    this.resizeObserver.disconnect();
    this.tap.dispose();
    this.painter.dispose();
    this.paths?.dispose();
    this.weather?.dispose();
    this.rig.dispose();
    this.terrain?.dispose();
    this.water?.dispose();
    this.twin?.dispose();
    this.allies.dispose();
    this.intro?.dispose();
    this.props?.dispose();
    this.buildings?.dispose();
    this.kiwis?.dispose();
    this.postfx?.dispose();
    this.renderer.dispose();
  }
}
