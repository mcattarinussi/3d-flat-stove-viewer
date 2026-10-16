import * as THREE from 'three';
import type { Dims, Safety } from '../data/types';

export interface Extents {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const AMBER = '#f59e0b';

/** Stove-local extents (front +z) of the declared clearances; null fields add nothing. */
export function bufferExtents(dims: Dims, safety: Safety | null): Extents | null {
  if (!safety || (safety.rear === null && safety.side === null && safety.front === null)) return null;
  const side = safety.side ?? 0;
  return {
    x0: -dims.w / 2 - side,
    x1: dims.w / 2 + side,
    z0: -dims.d / 2 - (safety.rear ?? 0),
    z1: dims.d / 2 + (safety.front ?? 0),
  };
}

export function buildBuffer(dims: Dims, safety: Safety | null): THREE.Group | null {
  if (!safety) return null;
  const g = new THREE.Group();
  g.name = 'buffer';

  const ext = bufferExtents(dims, safety);
  if (ext) {
    const geo = new THREE.BoxGeometry(ext.x1 - ext.x0, dims.h, ext.z1 - ext.z0);
    const box = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.16, depthWrite: false }));
    box.name = 'buffer-box';
    box.position.set((ext.x0 + ext.x1) / 2, dims.h / 2, (ext.z0 + ext.z1) / 2);
    box.renderOrder = 2;
    g.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.7 }));
    edges.name = 'buffer-edges';
    edges.position.copy(box.position);
    g.add(edges);
  }

  if (safety.floorFront !== null) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.w, safety.floorFront),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    floor.name = 'buffer-floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.004, dims.d / 2 + safety.floorFront / 2);
    g.add(floor);
  }

  if (safety.ceiling !== null) {
    const y = dims.h + safety.ceiling;
    const hw = dims.w / 2;
    const hd = dims.d / 2;
    const pts = [
      new THREE.Vector3(-hw, y, -hd),
      new THREE.Vector3(hw, y, -hd),
      new THREE.Vector3(hw, y, hd),
      new THREE.Vector3(-hw, y, hd),
      new THREE.Vector3(-hw, y, -hd),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.05, gapSize: 0.04 }));
    line.computeLineDistances();
    line.name = 'buffer-ceiling';
    g.add(line);
  }

  return g.children.length ? g : null;
}
