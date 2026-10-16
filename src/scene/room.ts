import * as THREE from 'three';
import { wallLength } from '../data/apartment';
import type { Apartment, Room, Wall } from '../data/types';

export interface WallPiece {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

export interface RoomView {
  group: THREE.Group;
  walls: Map<Wall, THREE.Group>;
  setCeilingVisible(visible: boolean): void;
  updateCutaway(cam: { x: number; z: number }): void;
}

const WALLS: Wall[] = ['north', 'south', 'east', 'west'];
const OUTWARD: Record<Wall, { x: number; z: number }> = {
  south: { x: 0, z: -1 },
  north: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  east: { x: 1, z: 0 },
};

/**
 * Solid parts of one wall in along-coordinates (x for north/south, z for east/west).
 * North/south walls run past the corners by the wall thickness so the corners close.
 */
export function wallPieces(room: Room, wall: Wall, ceiling: number, thickness: number): WallPiece[] {
  const len = wallLength(room, wall);
  const ext = wall === 'north' || wall === 'south' ? thickness : 0;
  const openings = room.openings.filter((o) => o.wall === wall).sort((a, b) => a.from - b.from);
  const pieces: WallPiece[] = [];
  let cursor = 0 - ext;
  for (const o of openings) {
    if (o.from > cursor) pieces.push({ a0: cursor, a1: o.from, y0: 0, y1: ceiling });
    const top = o.height + o.transom;
    if (top < ceiling) pieces.push({ a0: o.from, a1: o.to, y0: top, y1: ceiling });
    cursor = o.to;
  }
  if (len + ext > cursor) pieces.push({ a0: cursor, a1: len + ext, y0: 0, y1: ceiling });
  return pieces;
}

/** Point on the inner face of `wall` at along-coordinate `a`; `out` > 0 moves into the wall, < 0 into the room. */
export function wallPoint(room: Pick<Room, 'width' | 'depth'>, wall: Wall, a: number, out = 0): { x: number; z: number } {
  switch (wall) {
    case 'south':
      return { x: a, z: -out };
    case 'north':
      return { x: a, z: room.depth + out };
    case 'west':
      return { x: -out, z: a };
    case 'east':
      return { x: room.width + out, z: a };
  }
}

/** rotation.y that maps local +X onto the wall's along-axis (local Z then points across the wall). */
export function wallYaw(wall: Wall): number {
  return wall === 'north' || wall === 'south' ? 0 : -Math.PI / 2;
}

function marbleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6d2ca';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 20 + Math.random() * 60;
    const shade = 170 + Math.floor(Math.random() * 70);
    g.fillStyle = `rgba(${shade},${shade - 4},${shade - 10},0.55)`;
    g.beginPath();
    const n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const rr = r * (0.6 + Math.random() * 0.5);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,115,108,0.35)';
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 2.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRoom(apt: Apartment): RoomView {
  const { room, ceilingHeight: H, wallThickness: T } = apt;
  const group = new THREE.Group();
  group.name = 'room';

  const wallMat = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#5a2e1a', roughness: 0.45 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#dfe7ea', roughness: 0.55, transmission: 0.5, transparent: true, opacity: 0.75 });
  const voidMat = new THREE.MeshBasicMaterial({ color: '#0d0d0f' });
  const radMat = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.35 });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, map: marbleTexture() }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.width / 2, 0, room.depth / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const walls = new Map<Wall, THREE.Group>();
  for (const wall of WALLS) {
    const wg = new THREE.Group();
    wg.name = `wall-${wall}`;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, a: number, y: number, out: number) => {
      const m = new THREE.Mesh(geo, mat);
      const c = wallPoint(room, wall, a, out);
      m.position.set(c.x, y, c.z);
      m.rotation.y = wallYaw(wall);
      m.castShadow = true;
      m.receiveShadow = true;
      wg.add(m);
    };
    for (const p of wallPieces(room, wall, H, T)) {
      add(new THREE.BoxGeometry(p.a1 - p.a0, p.y1 - p.y0, T), wallMat, (p.a0 + p.a1) / 2, (p.y0 + p.y1) / 2, T / 2);
    }
    for (const o of room.openings.filter((x) => x.wall === wall)) {
      const top = o.height + o.transom;
      const mid = (o.from + o.to) / 2;
      const width = o.to - o.from;
      // Casing on the room side.
      add(new THREE.BoxGeometry(0.07, top, 0.02), woodMat, o.from - 0.035, top / 2, -0.01);
      add(new THREE.BoxGeometry(0.07, top, 0.02), woodMat, o.to + 0.035, top / 2, -0.01);
      add(new THREE.BoxGeometry(width + 0.14, 0.07, 0.02), woodMat, mid, top + 0.035, -0.01);
      if (o.transom > 0) {
        add(new THREE.BoxGeometry(width, 0.05, T), woodMat, mid, o.height + 0.025, T / 2);
        add(new THREE.BoxGeometry(width, o.transom - 0.05, 0.01), glassMat, mid, o.height + 0.05 + (o.transom - 0.05) / 2, T / 2);
      }
      // Dark threshold beyond the doorway: neighbouring rooms are not modelled.
      const threshold = new THREE.PlaneGeometry(width, 0.8);
      threshold.rotateX(-Math.PI / 2);
      add(threshold, voidMat, mid, 0.001, T + 0.4);
    }
    walls.set(wall, wg);
    group.add(wg);
  }

  for (const f of room.fixtures) {
    const len = f.to - f.from;
    const n = Math.max(3, Math.round(len / 0.06));
    const pitch = len / n;
    for (let i = 0; i < n; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(pitch * 0.75, f.height, f.depth), radMat);
      const c = wallPoint(room, f.wall, f.from + pitch * (i + 0.5), -(f.depth / 2 + 0.03));
      rib.position.set(c.x, f.elevation + f.height / 2, c.z);
      rib.rotation.y = wallYaw(f.wall);
      rib.castShadow = true;
      group.add(rib);
    }
  }

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(room.width / 2, H, room.depth / 2);
  group.add(ceiling);

  const light = new THREE.PointLight('#fff4e5', 25, 0, 2);
  light.position.set(room.width / 2, H - 0.3, room.depth / 2);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.002;
  group.add(light);

  return {
    group,
    walls,
    setCeilingVisible(visible) {
      ceiling.visible = visible;
    },
    updateCutaway(cam) {
      for (const [wall, wg] of walls) {
        const c = wallPoint(room, wall, wallLength(room, wall) / 2, T / 2);
        const n = OUTWARD[wall];
        wg.visible = (cam.x - c.x) * n.x + (cam.z - c.z) * n.z <= 0;
      }
    },
  };
}
