import * as THREE from 'three';
import { wallLength } from '../data/apartment';
import type { Apartment, Fixture, Room, Wall } from '../data/types';

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

/** Along-wall runs that get skirting: corner to corner, interrupted at each opening plus its casing. */
export function skirtingSegments(room: Room, wall: Wall, thickness: number, casing = room.finishes.casing): [number, number][] {
  const len = wallLength(room, wall);
  const ext = wall === 'north' || wall === 'south' ? thickness : 0;
  const gaps = room.openings
    .filter((o) => o.wall === wall)
    .map((o) => [o.from - casing, o.to + casing] as const)
    .sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  let cursor = 0 - ext;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor + 1e-9) runs.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (len + ext > cursor + 1e-9) runs.push([cursor, len + ext]);
  return runs;
}

/**
 * With rotation.y = wallYaw(wall), local +z points into the room on the south and east walls
 * and out of it on the north and west walls.
 */
const INTO_ROOM_Z: Record<Wall, 1 | -1> = { south: 1, east: 1, north: -1, west: -1 };

/** A switch, socket or thermostat on the inner face of its wall. Local frame: x along the wall, y up. */
function buildPlate(f: Fixture, wall: Wall, mats: { plate: THREE.Material; dark: THREE.Material; dial: THREE.Material }): THREE.Group {
  const k = INTO_ROOM_Z[wall];
  const g = new THREE.Group();
  g.name = `fixture-${f.id}`;
  const w = f.to - f.from;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, f.height, f.depth), mats.plate);
  plate.position.z = (k * f.depth) / 2;
  g.add(plate);
  if (f.type === 'switch') {
    const pitch = f.height / f.gangs;
    for (let i = 0; i < f.gangs; i++) {
      const rocker = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, pitch * 0.6, 0.006), mats.plate);
      rocker.name = 'rocker';
      rocker.position.set(0, -f.height / 2 + pitch * (i + 0.5), k * (f.depth + 0.003));
      g.add(rocker);
    }
  } else if (f.type === 'socket') {
    for (const dx of [-0.012, 0.012]) {
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.002), mats.dark);
      hole.position.set(dx, 0, k * (f.depth + 0.001));
      g.add(hole);
    }
  } else if (f.type === 'thermostat') {
    const dialGeo = new THREE.CylinderGeometry(Math.min(w, f.height) * 0.3, Math.min(w, f.height) * 0.3, 0.004, 24);
    dialGeo.rotateX(Math.PI / 2);
    const dial = new THREE.Mesh(dialGeo, mats.dial);
    dial.position.set(w * 0.12, 0, k * (f.depth + 0.002));
    g.add(dial);
  }
  return g;
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
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#d8ccb4', roughness: 0.35 });
  const sillMat = new THREE.MeshStandardMaterial({ color: '#e6e1d8', roughness: 0.25 });
  const plateMats = {
    plate: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 }),
    dial: new THREE.MeshStandardMaterial({ color: '#d9d9d6', roughness: 0.5 }),
  };

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
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, a: number, y: number, out: number, name = '') => {
      const m = new THREE.Mesh(geo, mat);
      const c = wallPoint(room, wall, a, out);
      m.position.set(c.x, y, c.z);
      m.rotation.y = wallYaw(wall);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
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
      const cw = room.finishes.casing;
      add(new THREE.BoxGeometry(cw, top, 0.02), woodMat, o.from - cw / 2, top / 2, -0.01);
      add(new THREE.BoxGeometry(cw, top, 0.02), woodMat, o.to + cw / 2, top / 2, -0.01);
      add(new THREE.BoxGeometry(width + 2 * cw, cw, 0.02), woodMat, mid, top + cw / 2, -0.01);
      if (o.transom > 0) {
        add(new THREE.BoxGeometry(width, 0.05, T), woodMat, mid, o.height + 0.025, T / 2);
        add(new THREE.BoxGeometry(width, o.transom - 0.05, 0.01), glassMat, mid, o.height + 0.05 + (o.transom - 0.05) / 2, T / 2);
      }
      // Dark threshold beyond the doorway: neighbouring rooms are not modelled.
      const threshold = new THREE.PlaneGeometry(width, 0.8);
      threshold.rotateX(-Math.PI / 2);
      add(threshold, voidMat, mid, 0.001, T + 0.4);
      if (room.finishes.sills) add(new THREE.BoxGeometry(width, 0.005, T), sillMat, mid, 0.0005, T / 2, `sill-${o.id}`);
    }
    const skirting = room.finishes.skirting;
    if (skirting) {
      for (const [a0, a1] of skirtingSegments(room, wall, skirting.thickness)) {
        add(new THREE.BoxGeometry(a1 - a0, skirting.height, skirting.thickness), skirtMat, (a0 + a1) / 2, skirting.height / 2, -skirting.thickness / 2, 'skirting');
      }
    }
    for (const f of room.fixtures.filter((x) => x.wall === wall && x.type !== 'radiator')) {
      const plate = buildPlate(f, wall, plateMats);
      const c = wallPoint(room, wall, (f.from + f.to) / 2, 0);
      plate.position.set(c.x, f.elevation + f.height / 2, c.z);
      plate.rotation.y = wallYaw(wall);
      wg.add(plate);
    }
    walls.set(wall, wg);
    group.add(wg);
  }

  for (const f of room.fixtures.filter((x) => x.type === 'radiator')) {
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
