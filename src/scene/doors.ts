import * as THREE from 'three';
import type { Apartment, Opening, Room, Wall } from '../data/types';
import { wallPoint } from './room';

export interface DoorPose {
  hinge: { x: number; z: number };
  width: number;
  closed: number;
  open: number;
}

const INWARD: Record<Wall, { x: number; z: number }> = {
  south: { x: 0, z: 1 },
  north: { x: 0, z: -1 },
  west: { x: 1, z: 0 },
  east: { x: -1, z: 0 },
};
const SPEED = Math.PI / 2 / 0.3;

/** Direction of a leaf extending along local +X of a pivot with this rotation.y. */
export function leafDir(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

export function doorPose(room: Room, o: Opening, thickness: number): DoorPose {
  const door = o.door!;
  const hingeA = door.hinge === 'from' ? o.from : o.to;
  const freeA = door.hinge === 'from' ? o.to : o.from;
  // Leaves swinging in sit near the room face, leaves swinging out near the far face.
  const depthInWall = door.swing === 'in' ? 0.03 : thickness - 0.03;
  const hinge = wallPoint(room, o.wall, hingeA, depthInWall);
  const free = wallPoint(room, o.wall, freeA, depthInWall);
  const dx = free.x - hinge.x;
  const dz = free.z - hinge.z;
  const closed = Math.atan2(-dz, dx);
  // Adding +90° turns direction (dx, dz) into (dz, -dx).
  const inward = INWARD[o.wall];
  const target = door.swing === 'in' ? inward : { x: -inward.x, z: -inward.z };
  const plus = dz * target.x - dx * target.z > 0;
  return { hinge, width: Math.abs(o.to - o.from), closed, open: closed + (plus ? Math.PI / 2 : -Math.PI / 2) };
}

interface DoorEntry {
  id: string;
  name: string;
  wall: Wall;
  pivot: THREE.Group;
  pose: DoorPose;
  target: number;
}

export class Doors {
  readonly group = new THREE.Group();
  private entries = new Map<string, DoorEntry>();
  private listeners = new Set<() => void>();
  private hiddenWalls = new Set<Wall>();

  constructor(apt: Apartment) {
    this.group.name = 'doors';
    const wood = new THREE.MeshStandardMaterial({ color: '#6b3a22', roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e8eef0', roughness: 0.5, transmission: 0.5, transparent: true, opacity: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: '#c9b37e', metalness: 0.9, roughness: 0.3 });
    const arcMat = new THREE.LineDashedMaterial({ color: '#8a8f98', dashSize: 0.05, gapSize: 0.04 });

    for (const o of apt.room.openings) {
      if (!o.door) continue;
      const pose = doorPose(apt.room, o, apt.wallThickness);
      const pivot = new THREE.Group();
      pivot.position.set(pose.hinge.x, 0, pose.hinge.z);
      pivot.rotation.y = pose.closed;
      pivot.userData.doorId = o.id;

      const w = pose.width - 0.01;
      const h = o.height - 0.01;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), wood);
      leaf.position.set(pose.width / 2, h / 2, 0);
      leaf.castShadow = true;
      pivot.add(leaf);
      if (o.door.glazed) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.55, 0.045), glass);
        pane.position.set(pose.width / 2, h * 0.58, 0);
        pivot.add(pane);
      }
      for (const side of [1, -1]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), brass);
        handle.position.set(pose.width - 0.12, 1.0, side * 0.035);
        pivot.add(handle);
      }
      this.group.add(pivot);

      if (o.door.swing === 'in') {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 24; i++) {
          const d = leafDir(pose.closed + ((pose.open - pose.closed) * i) / 24);
          pts.push(new THREE.Vector3(pose.hinge.x + d.x * pose.width, 0.003, pose.hinge.z + d.z * pose.width));
        }
        const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat);
        arc.computeLineDistances();
        this.group.add(arc);
      }
      this.entries.set(o.id, { id: o.id, name: o.name, wall: o.wall, pivot, pose, target: pose.closed });
    }
  }

  list(): { id: string; name: string }[] {
    return [...this.entries.values()].map(({ id, name }) => ({ id, name }));
  }

  isOpen(id: string): boolean {
    const e = this.entries.get(id);
    return !!e && e.target === e.pose.open;
  }

  openIds(): string[] {
    return [...this.entries.keys()].filter((id) => this.isOpen(id));
  }

  setOpen(id: string, open: boolean, animate = true): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.target = open ? e.pose.open : e.pose.closed;
    if (!animate) e.pivot.rotation.y = e.target;
    this.emit();
  }

  toggle(id: string): void {
    this.setOpen(id, !this.isOpen(id));
  }

  setAll(open: boolean): void {
    for (const e of this.entries.values()) e.target = open ? e.pose.open : e.pose.closed;
    this.emit();
  }

  update(dt: number): void {
    for (const e of this.entries.values()) {
      const cur = e.pivot.rotation.y;
      const diff = e.target - cur;
      if (Math.abs(diff) < 1e-4) {
        e.pivot.rotation.y = e.target;
        continue;
      }
      e.pivot.rotation.y = cur + Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
    }
  }

  pickables(): THREE.Object3D[] {
    return [...this.entries.values()].map((e) => e.pivot);
  }

  idFromObject(obj: THREE.Object3D | null): string | null {
    for (let o = obj; o; o = o.parent) {
      if (typeof o.userData.doorId === 'string') return o.userData.doorId;
    }
    return null;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Closed leaves in walls hidden by the cutaway would float in mid-air, so hide them too. */
  setHiddenWalls(walls: Set<Wall>): void {
    this.hiddenWalls = walls;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    for (const e of this.entries.values()) e.pivot.visible = !this.hiddenWalls.has(e.wall) || this.isOpen(e.id);
  }

  private emit(): void {
    this.applyVisibility();
    this.listeners.forEach((l) => l());
  }
}
