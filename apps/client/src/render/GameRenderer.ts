import {
  ACESFilmicToneMapping,
  Clock,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { FaceMap, Tile } from '@kiwar/shared';
import { CameraRig } from '../camera/CameraRig';
import { Environment } from './environment';
import { Lighting } from './lighting';
import { pickInstance, TapDetector } from './picking';
import { SelectionView } from './selection';
import { TerrainView } from './terrain';

export interface RendererCallbacks {
  onTileTap(tile: Tile | null): void;
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
  private terrain: TerrainView | null = null;
  private readonly clock = new Clock();
  private readonly resizeObserver: ResizeObserver;
  private elapsed = 0;
  private hoverPoint: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: RendererCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new PerspectiveCamera(30, 1, 0.5, 2000);
    this.rig = new CameraRig(this.camera, canvas);
    this.environment = new Environment(this.scene);
    this.lighting.setShadowMapSize(2048);
    this.scene.add(this.lighting.group, this.selection.group);

    this.tap = new TapDetector(canvas, {
      onTap: (x, y) => this.callbacks.onTileTap(this.pickTile(x, y)),
      onHover: (x, y) => (this.hoverPoint = { x, y }),
      onHoverEnd: () => {
        this.hoverPoint = null;
        this.selection.setHover(null);
      },
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setFace(map: FaceMap): void {
    if (this.terrain) {
      this.scene.remove(this.terrain.group);
      this.terrain.dispose();
    }
    this.terrain = new TerrainView(map);
    this.scene.add(this.terrain.group);
    const e = this.terrain.extent();
    this.lighting.fit(Math.max(e.x, e.z) + 2);
    this.rig.frame(e.x, e.z);
    this.selection.setSelected(null);
  }

  setSelectedTile(tile: Tile | null): void {
    this.selection.setSelected(tile);
  }

  private pickTile(x: number, y: number): Tile | null {
    if (!this.terrain) return null;
    const id = pickInstance(this.canvas, this.camera, this.terrain.tiles, x, y);
    return id === null ? null : (this.terrain.tileOfInstance(id) ?? null);
  }

  private resize(): void {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Keep the disc comfortably framed in portrait.
    this.camera.fov = this.camera.aspect < 0.8 ? 42 : 30;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.elapsed += dt;
    this.rig.update(dt);
    if (this.hoverPoint) {
      this.selection.setHover(this.pickTile(this.hoverPoint.x, this.hoverPoint.y));
      this.hoverPoint = null;
    }
    this.environment.update(this.elapsed);
    this.selection.update(this.elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.tap.dispose();
    this.rig.dispose();
    this.terrain?.dispose();
    this.renderer.dispose();
  }
}
