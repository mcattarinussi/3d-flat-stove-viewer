import * as THREE from 'three';
import { pointerNdc } from './pick';
import { FREE_WALL } from '../data/apartment';
import type { Dims, Safety } from '../data/types';

export interface Pose {
  x: number;
  z: number;
  r: number;
}

export interface RoomRect {
  width: number;
  depth: number;
}

export type NudgeDir = 'forward' | 'back' | 'left' | 'right';

export interface WallDistances {
  west: number;
  east: number;
  south: number;
  north: number;
}

type Footprint = Pick<Dims, 'w' | 'd'>;

const DEG = Math.PI / 180;

export const normaliseDeg = (r: number): number => (((r % 360) + 360) % 360) + 0;

/** rotation.y of the stove holder: r = 0 faces west, increasing r turns clockwise on the north-up plan. */
export const yaw = (r: number): number => -Math.PI / 2 + r * DEG;

export function facing(r: number): { x: number; z: number } {
  const y = yaw(r);
  return { x: Math.sin(y), z: Math.cos(y) };
}

/** The viewer's right when standing in front of the stove, looking at it (= stove-local −X). */
export function rightOf(r: number): { x: number; z: number } {
  const y = yaw(r);
  return { x: -Math.cos(y), z: Math.sin(y) };
}

export function halfExtents(r: number, dims: Footprint): { hx: number; hz: number } {
  const y = yaw(r);
  const c = Math.abs(Math.cos(y));
  const s = Math.abs(Math.sin(y));
  return { hx: (c * dims.w) / 2 + (s * dims.d) / 2, hz: (s * dims.w) / 2 + (c * dims.d) / 2 };
}

const clampAxis = (v: number, half: number, len: number) => (2 * half >= len ? len / 2 : Math.min(Math.max(v, half), len - half));

export function clampPose(p: Pose, dims: Footprint, room: RoomRect): Pose {
  const r = normaliseDeg(p.r);
  const { hx, hz } = halfExtents(r, dims);
  return { x: clampAxis(p.x, hx, room.width), z: clampAxis(p.z, hz, room.depth), r };
}

export function nudge(p: Pose, dir: NudgeDir, step: number, dims: Footprint, room: RoomRect): Pose {
  const f = facing(p.r);
  const rt = rightOf(p.r);
  const v = dir === 'forward' ? f : dir === 'back' ? { x: -f.x, z: -f.z } : dir === 'right' ? rt : { x: -rt.x, z: -rt.z };
  return clampPose({ x: p.x + v.x * step, z: p.z + v.z * step, r: p.r }, dims, room);
}

export function rotateBy(p: Pose, delta: number, dims: Footprint, room: RoomRect): Pose {
  return clampPose({ ...p, r: p.r + delta }, dims, room);
}

export function distancesToWalls(p: Pose, dims: Footprint, room: RoomRect): WallDistances {
  const { hx, hz } = halfExtents(p.r, dims);
  return { west: p.x - hx, east: room.width - p.x - hx, south: p.z - hz, north: room.depth - p.z - hz };
}

export function snapToNearestWall(p: Pose, dims: Footprint, room: RoomRect, rearGap: number): Pose {
  const d: WallDistances = { west: p.x, east: room.width - p.x, south: p.z, north: room.depth - p.z };
  const wall = (Object.keys(d) as (keyof WallDistances)[]).reduce((a, b) => (d[b] < d[a] ? b : a));
  const back = rearGap + dims.d / 2;
  switch (wall) {
    case 'east':
      return clampPose({ x: room.width - back, z: p.z, r: 0 }, dims, room);
    case 'west':
      return clampPose({ x: back, z: p.z, r: 180 }, dims, room);
    case 'north':
      return clampPose({ x: p.x, z: room.depth - back, r: 270 }, dims, room);
    case 'south':
      return clampPose({ x: p.x, z: back, r: 90 }, dims, room);
  }
}

export function initialPose(dims: Footprint, safety: Safety | null, room: RoomRect): Pose {
  return clampPose({ x: room.width - (safety?.rear ?? 0) - dims.d / 2, z: (FREE_WALL.from + FREE_WALL.to) / 2, r: 0 }, dims, room);
}

export interface StoveHandle {
  object: THREE.Object3D;
  dims: Dims;
  safety: Safety | null;
}

interface ControllerOptions {
  dom: HTMLElement;
  root: THREE.Object3D;
  room: RoomRect;
  getCamera: () => THREE.Camera;
  /** Active orbit controls; disabled while the stove is being dragged. */
  getControls: () => { enabled: boolean };
}

interface Drag {
  kind: 'move' | 'rotate';
  pointerId: number;
  dx: number;
  dz: number;
  phi0: number;
  r0: number;
}

/** Owns the stove holder (pose → transform) and the pointer interactions on it. */
export class PlacementController {
  readonly holder = new THREE.Group();
  private stove: StoveHandle | null = null;
  private ringHit: THREE.Mesh | null = null;
  private pose: Pose | null = null;
  private drag: Drag | null = null;
  private listeners = new Set<(p: Pose | null) => void>();
  private raycaster = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private opts: ControllerOptions) {
    this.holder.name = 'stove-holder';
    opts.root.add(this.holder);
    opts.dom.addEventListener('pointerdown', this.onDown);
    opts.dom.addEventListener('pointermove', this.onMove);
    opts.dom.addEventListener('pointerup', this.onUp);
    opts.dom.addEventListener('pointercancel', this.onUp);
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Shows a stove; keeps the current pose (re-clamped), or uses the initial pose the first time. */
  setStove(handle: StoveHandle | null, extras: THREE.Object3D[] = []): void {
    this.holder.clear();
    this.stove = handle;
    this.ringHit = null;
    if (!handle) {
      this.emit();
      return;
    }
    this.holder.add(handle.object, ...extras);
    const radius = Math.hypot(handle.dims.w, handle.dims.d) / 2 + 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: '#3b82f6' }));
    const hit = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.06, 6, 48),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    for (const m of [ring, hit]) {
      m.rotation.x = Math.PI / 2;
      m.position.y = 0.01;
    }
    this.holder.add(ring, hit);
    this.ringHit = hit;
    this.setPose(this.pose ?? initialPose(handle.dims, handle.safety, this.opts.room));
  }

  /** Swaps the stove mesh (e.g. when its GLB finishes loading) without touching pose, buffer or ring. */
  replaceObject(object: THREE.Object3D): void {
    if (!this.stove) return;
    this.holder.remove(this.stove.object);
    this.stove = { ...this.stove, object };
    this.holder.add(object);
  }

  getPose(): Pose | null {
    return this.stove ? this.pose : null;
  }

  setPose(p: Pose): void {
    if (!this.stove) {
      this.pose = p;
      return;
    }
    this.pose = clampPose(p, this.stove.dims, this.opts.room);
    this.holder.position.set(this.pose.x, 0, this.pose.z);
    this.holder.rotation.y = yaw(this.pose.r);
    this.emit();
  }

  nudge(dir: NudgeDir, step: number): void {
    if (this.stove && this.pose) this.setPose(nudge(this.pose, dir, step, this.stove.dims, this.opts.room));
  }

  rotateBy(delta: number): void {
    if (this.stove && this.pose) this.setPose(rotateBy(this.pose, delta, this.stove.dims, this.opts.room));
  }

  snap(): void {
    if (this.stove && this.pose) {
      this.setPose(snapToNearestWall(this.pose, this.stove.dims, this.opts.room, this.stove.safety?.rear ?? 0));
    }
  }

  distances(): WallDistances | null {
    return this.stove && this.pose ? distancesToWalls(this.pose, this.stove.dims, this.opts.room) : null;
  }

  onChange(cb: (p: Pose | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    const p = this.getPose();
    this.listeners.forEach((l) => l(p));
  }

  private floorPoint(ev: PointerEvent): { x: number; z: number } | null {
    this.raycaster.setFromCamera(pointerNdc(ev, this.opts.dom), this.opts.getCamera());
    const hit = this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
    if (!hit) return null;
    const local = this.opts.root.worldToLocal(hit);
    return { x: local.x, z: local.z };
  }

  private onDown = (ev: PointerEvent): void => {
    if (!this.stove || !this.pose || ev.button !== 0) return;
    this.raycaster.setFromCamera(pointerNdc(ev, this.opts.dom), this.opts.getCamera());
    const onRing = !!this.ringHit && this.raycaster.intersectObject(this.ringHit, false).length > 0;
    const onStove = !onRing && this.raycaster.intersectObject(this.stove.object, true).length > 0;
    if (!onRing && !onStove) return;
    const p = this.floorPoint(ev);
    if (!p) return;
    this.drag = {
      kind: onRing ? 'rotate' : 'move',
      pointerId: ev.pointerId,
      dx: this.pose.x - p.x,
      dz: this.pose.z - p.z,
      phi0: Math.atan2(p.x - this.pose.x, p.z - this.pose.z) / DEG,
      r0: this.pose.r,
    };
    // OrbitControls also saw this pointerdown; disabling it makes it ignore the moves.
    this.opts.getControls().enabled = false;
  };

  private onMove = (ev: PointerEvent): void => {
    if (!this.drag || !this.pose || ev.pointerId !== this.drag.pointerId) return;
    const p = this.floorPoint(ev);
    if (!p) return;
    if (this.drag.kind === 'move') {
      this.setPose({ x: p.x + this.drag.dx, z: p.z + this.drag.dz, r: this.pose.r });
      return;
    }
    // Bearing from north towards east = clockwise on the plan, same sense as r.
    const phi = Math.atan2(p.x - this.pose.x, p.z - this.pose.z) / DEG;
    let r = this.drag.r0 + (phi - this.drag.phi0);
    if (ev.shiftKey) r = Math.round(r / 15) * 15;
    this.setPose({ ...this.pose, r });
  };

  private onUp = (ev: PointerEvent): void => {
    if (!this.drag || ev.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.opts.getControls().enabled = true;
  };
}
