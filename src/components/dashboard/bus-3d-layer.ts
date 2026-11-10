import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TRANSIT_DISPLAY_SCALE, modelMinimumZoom, type TransitModelKind } from "./transit-display";

export type BusLivery = "tcm" | "transmac";
type ModelKind = TransitModelKind;

export interface TransitLandmark {
  id: string;
  coordinates: [number, number];
  bearing: number | null;
  model: "bus-stop" | "lrt-platform" | "lrt-car";
  selected?: boolean;
}
type TransitItem = Bus3DVehicle | TransitLandmark;
const modelKind = (item: TransitItem): ModelKind => "model" in item ? item.model : item.livery;

export interface Bus3DVehicle {
  id: string;
  coordinates: [number, number];
  bearing: number | null;
  livery: BusLivery;
}

export class Bus3DLayer implements CustomLayerInterface {
  readonly id = "bus-3d";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();
  private readonly models = new Map<ModelKind, THREE.Object3D>();
  private readonly groups = new Map<string, THREE.Group>();
  private vehicles: Bus3DVehicle[] = [];
  private landmarks: TransitLandmark[] = [];
  private trainCars: TransitLandmark[] = [];
  private visible = false;
  private readonly requested = new Set<ModelKind>();

  private readonly handleZoom = () => {
    this.ensureModels();
  };

  constructor(private readonly onReady?: (kind: ModelKind) => void) {}

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x84949f, .6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-2, 3, 4);
    this.scene.add(sun);

    map.on("zoom", this.handleZoom);
  }

  onRemove() {
    this.map?.off("zoom", this.handleZoom);
    for (const group of this.groups.values()) this.scene.remove(group);
    this.groups.clear();
    for (const model of this.models.values()) model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
      }
    });
    this.models.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    this.ensureModels();
    this.map?.triggerRepaint();
  }

  setLandmarks(landmarks: TransitLandmark[]) {
    this.landmarks = landmarks;
    this.ensureModels();
    this.syncVehicles();
    this.map?.triggerRepaint();
  }

  setTrainCars(cars: TransitLandmark[]) {
    this.trainCars = cars;
    this.ensureModels();
    this.syncVehicles();
    this.map?.triggerRepaint();
  }

  private items(): TransitItem[] { return [...this.vehicles, ...this.trainCars, ...this.landmarks]; }

  setVehicles(vehicles: Bus3DVehicle[]) {
    this.vehicles = vehicles;
    this.ensureModels();
    this.syncVehicles();
    this.map?.triggerRepaint();
  }

  render(_gl: WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const map = this.map;
    if (
      !this.visible ||
      !this.renderer ||
      !map ||
      map.getZoom() < 12
    ) {
      return;
    }

    const baseMatrix = new THREE.Matrix4().fromArray(
      args.defaultProjectionData.mainMatrix as ArrayLike<number>,
    );
    this.renderer.resetState();
    const context = this.renderer.getContext();
    this.renderer.setViewport(
      0,
      0,
      context.drawingBufferWidth,
      context.drawingBufferHeight,
    );
    this.renderer.clearDepth();

    for (const group of this.groups.values()) group.visible = false;
    const bounds = map.getBounds();
    const landmarkPixels: Array<{ x: number; y: number; radius: number }> = [];
    const visible = this.items().filter((item) => bounds.contains(item.coordinates) && map.getZoom() >= modelMinimumZoom(modelKind(item))).sort((a, b) => Number("selected" in b && b.selected) - Number("selected" in a && a.selected));
    let drawn = 0;
    for (const vehicle of visible) {
      if (drawn >= 40) break;
      if ("model" in vehicle && vehicle.model !== "lrt-car") {
        const pixel = map.project(vehicle.coordinates);
        const radius = vehicle.model === "lrt-platform" ? 96 : 36;
        if (landmarkPixels.some((other) => Math.hypot(other.x-pixel.x, other.y-pixel.y) < radius + other.radius)) continue;
        landmarkPixels.push({ x: pixel.x, y: pixel.y, radius });
      }
      const group = this.groups.get(vehicle.id);
      if (!group) continue;
      group.visible = true;
      const projection = baseMatrix.clone().multiply(this.vehicleMatrix(vehicle));
      this.camera.projectionMatrix.copy(projection);
      this.camera.projectionMatrixInverse.copy(projection).invert();
      this.renderer.render(this.scene, this.camera);
      group.visible = false;
      drawn += 1;
    }
    for (const group of this.groups.values()) group.visible = true;
  }

  private ensureModels() {
    if (!this.visible || !this.map) return;
    for (const kind of new Set(this.items().map(modelKind))) {
      if (this.map.getZoom() < modelMinimumZoom(kind)) continue;
      if (this.requested.has(kind)) continue;
      this.requested.add(kind);
      void this.loadModel(kind);
    }
  }

  private async loadModel(kind: ModelKind) {
    try {
      const loader = new GLTFLoader();
      const file = kind === "tcm" || kind === "transmac" ? `bus-${kind}` : kind;
      const model = await loader.loadAsync(`/models/${file}.glb`);
      if (!this.map) return;
      this.prepareModel(model.scene);
      this.models.set(kind, model.scene);
      this.syncVehicles();
      this.onReady?.(kind);
      this.map?.triggerRepaint();
    } catch (error) {
      console.error(`Transit model ${kind} failed to load`, error);
    }
  }

  private syncVehicles() {
    const items = this.items();
    const wanted = new Set(items.map((vehicle) => vehicle.id));
    for (const [id, group] of this.groups) {
      if (wanted.has(id)) continue;
      this.scene.remove(group);
      this.groups.delete(id);
    }

    for (const vehicle of items) {
      let group = this.groups.get(vehicle.id);
      if (!group) {
        group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.matrix.identity();
        group.matrixWorld.identity();
        this.groups.set(vehicle.id, group);
        this.scene.add(group);
      }

      const kind = modelKind(vehicle);
      const model = this.models.get(kind);
      if (model && group.userData.livery !== kind) {
        group.clear();
        group.add(model.clone(true));
        group.userData.livery = kind;
      }
    }
  }

  private prepareModel(model: THREE.Object3D) {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.frustumCulled = false;
      // Map markers have no reflection environment. Diffuse shading keeps
      // operator colours readable instead of turning metal surfaces dark.
      const convert = (material: THREE.Material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material;
        const diffuse = new THREE.MeshLambertMaterial({ color: material.color.clone(), side: material.side });
        material.dispose();
        return diffuse;
      };
      child.material = Array.isArray(child.material) ? child.material.map(convert) : convert(child.material);
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
        material.depthTest = true;
        material.depthWrite = true;
      }
    });
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 1.1, size.z * 1.35),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        vertexShader: "varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader: "varying vec2 vUv; void main(){vec2 p=vUv*2.0-1.0; float a=pow(max(0.0,1.0-dot(p,p)),2.0)*0.32; gl_FragColor=vec4(0.04,0.07,0.1,a);}",
      }),
    );
    shadow.name = "schematic contact shadow";
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = .015;
    shadow.frustumCulled = false;
    model.add(shadow);
  }

  private vehicleMatrix(vehicle: TransitItem): THREE.Matrix4 {
    const map = this.map;
    if (!map) return new THREE.Matrix4();

    const [lng, lat] = vehicle.coordinates;
    const elevation = map.queryTerrainElevation([lng, lat]) ?? 0;
    const mercator = MercatorCoordinate.fromLngLat([lng, lat], elevation + 0.06);
    const scale =
      mercator.meterInMercatorCoordinateUnits() *
      TRANSIT_DISPLAY_SCALE;
    const bearing = vehicle.bearing ?? 0;
    return new THREE.Matrix4()
      .makeTranslation(mercator.x, mercator.y, mercator.z)
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(
        new THREE.Matrix4().makeRotationY(((bearing - 90) * Math.PI) / 180),
      )
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
  }
}
