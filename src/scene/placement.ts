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
