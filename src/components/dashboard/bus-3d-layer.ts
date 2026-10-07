import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MapLibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BUS_MODEL_MIN_ZOOM } from "@/lib/config";

const BUS_MODEL_FULL_SCALE_MAX_ZOOM = 19;

export type BusLivery = "tcm" | "transmac";

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
  private readonly models = new Map<BusLivery, THREE.Object3D>();
  private readonly groups = new Map<string, THREE.Group>();
  private vehicles: Bus3DVehicle[] = [];
  private visible = false;
  private failed = false;
  private modelsRequested = false;

  private readonly handleZoom = () => {
    this.ensureModels();
  };

  constructor(private readonly onReady?: () => void) {}

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8790, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 3, 4);
    this.scene.add(sun);

    map.on("zoom", this.handleZoom);
  }

  onRemove() {
    this.map?.off("zoom", this.handleZoom);
    for (const group of this.groups.values()) this.scene.remove(group);
    this.groups.clear();
    this.models.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.map?.triggerRepaint();
  }

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
      this.failed ||
      !this.renderer ||
      !map ||
      map.getZoom() < BUS_MODEL_MIN_ZOOM
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

    for (const vehicle of this.vehicles) {
      const group = this.groups.get(vehicle.id);
      if (!group) continue;
      for (const [id, item] of this.groups) item.visible = id === vehicle.id;
      const projection = baseMatrix.clone().multiply(this.vehicleMatrix(vehicle));
      this.camera.projectionMatrix.copy(projection);
      this.camera.projectionMatrixInverse.copy(projection).invert();
      this.renderer.render(this.scene, this.camera);
    }
    for (const group of this.groups.values()) group.visible = true;
  }

  // Both GLBs are 255 KB. Load them only once a route with live buses is
  // focused and the map is at a zoom where the model can be drawn.
  private ensureModels() {
    if (this.modelsRequested || this.failed || !this.map) return;
    if (this.vehicles.length === 0) return;
    if (this.map.getZoom() < BUS_MODEL_MIN_ZOOM) return;
    this.modelsRequested = true;
    void this.loadModels();
  }

  private async loadModels() {
    try {
      const loader = new GLTFLoader();
      const [tcm, transmac] = await Promise.all([
        loader.loadAsync("/models/bus-tcm.glb"),
        loader.loadAsync("/models/bus-transmac.glb"),
      ]);
      this.prepareModel(tcm.scene);
      this.prepareModel(transmac.scene);
      this.models.set("tcm", tcm.scene);
      this.models.set("transmac", transmac.scene);
      this.syncVehicles();
      this.onReady?.();
      this.map?.triggerRepaint();
    } catch (error) {
      this.failed = true;
      console.error("Bus 3D model loading failed", error);
    }
  }

  private syncVehicles() {
    const wanted = new Set(this.vehicles.map((vehicle) => vehicle.id));
    for (const [id, group] of this.groups) {
      if (wanted.has(id)) continue;
      this.scene.remove(group);
      this.groups.delete(id);
    }

    for (const vehicle of this.vehicles) {
      let group = this.groups.get(vehicle.id);
      if (!group) {
        group = new THREE.Group();
        group.matrixAutoUpdate = false;
        group.matrix.identity();
        group.matrixWorld.identity();
        this.groups.set(vehicle.id, group);
        this.scene.add(group);
      }

      const model = this.models.get(vehicle.livery);
      if (model && group.userData.livery !== vehicle.livery) {
        group.clear();
        group.add(model.clone(true));
        group.userData.livery = vehicle.livery;
      }
    }
  }

  private prepareModel(model: THREE.Object3D) {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.frustumCulled = false;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.polygonOffset = true;
        material.polygonOffsetFactor = -2;
        material.polygonOffsetUnits = -2;
        material.depthTest = false;
        material.depthWrite = false;
        material.transparent = true;
      }
    });
  }

  private vehicleMatrix(vehicle: Bus3DVehicle): THREE.Matrix4 {
    const map = this.map;
    if (!map) return new THREE.Matrix4();

    const [lng, lat] = vehicle.coordinates;
    const elevation = map.queryTerrainElevation([lng, lat]) ?? 0;
    const mercator = MercatorCoordinate.fromLngLat([lng, lat], elevation + 0.35);
    const zoom = map.getZoom();
    const screenSizeFactor =
      zoom > BUS_MODEL_FULL_SCALE_MAX_ZOOM
        ? 2 ** (BUS_MODEL_FULL_SCALE_MAX_ZOOM - zoom)
        : 1;
    const scale = mercator.meterInMercatorCoordinateUnits() * screenSizeFactor;
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
