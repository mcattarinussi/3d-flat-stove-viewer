import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ViewMode = '3d' | 'plan';

interface RoomBox {
  width: number;
  depth: number;
  ceiling: number;
}

/** Room coordinates → world coordinates (the scene root mirrors z). */
const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -z);

export class CameraRig {
  readonly perspective = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
  readonly plan = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  mode: ViewMode = '3d';
  private orbit3d: OrbitControls;
  private orbitPlan: OrbitControls;
  private aspect = 1;

  constructor(dom: HTMLElement, private room: RoomBox) {
    this.orbit3d = new OrbitControls(this.perspective, dom);
    this.orbit3d.enableDamping = true;
    this.orbit3d.minDistance = 1;
    this.orbit3d.maxDistance = 10;
    this.orbit3d.maxPolarAngle = Math.PI * 0.49;

    // Screen-up = room north (world −z) in plan view.
    this.plan.up.set(0, 0, -1);
    this.orbitPlan = new OrbitControls(this.plan, dom);
    this.orbitPlan.enableRotate = false;
    this.orbitPlan.screenSpacePanning = true;
    this.orbitPlan.enabled = false;
    this.reset();
  }

  get camera(): THREE.Camera {
    return this.mode === '3d' ? this.perspective : this.plan;
  }

  get controls(): OrbitControls {
    return this.mode === '3d' ? this.orbit3d : this.orbitPlan;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.orbit3d.enabled = mode === '3d';
    this.orbitPlan.enabled = mode === 'plan';
  }

  reset(): void {
    const { width, depth } = this.room;
    this.perspective.position.copy(toWorld(-1.6, 4.6, -2.2));
    this.orbit3d.target.copy(toWorld(width / 2, 0.9, depth / 2));
    this.orbit3d.update();

    this.plan.position.copy(toWorld(width / 2, 10, depth / 2));
    this.plan.zoom = 1;
    this.orbitPlan.target.copy(toWorld(width / 2, 0, depth / 2));
    this.plan.lookAt(this.orbitPlan.target);
    this.fitPlan();
    this.orbitPlan.update();
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.perspective.aspect = this.aspect;
    this.perspective.updateProjectionMatrix();
    this.fitPlan();
  }

  private fitPlan(): void {
    const margin = 0.8;
    const halfH = (this.room.depth + 2 * margin) / 2;
    const halfW = (this.room.width + 2 * margin) / 2;
    const hh = Math.max(halfH, halfW / this.aspect);
    this.plan.left = -hh * this.aspect;
    this.plan.right = hh * this.aspect;
    this.plan.top = hh;
    this.plan.bottom = -hh;
    this.plan.updateProjectionMatrix();
  }
}
