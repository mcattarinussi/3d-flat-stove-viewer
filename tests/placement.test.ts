import { describe, expect, it } from 'vitest';
import {
  clampPose,
  distancesToWalls,
  facing,
  halfExtents,
  initialPose,
  normaliseDeg,
  nudge,
  rightOf,
  rotateBy,
  snapToNearestWall,
} from '../src/scene/placement';

const room = { width: 2, depth: 3.4 };
const dims = { w: 0.5, d: 0.4, h: 1.2 };

const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

describe('orientation', () => {
  it('r=0 faces west and turns clockwise on the plan', () => {
    close(facing(0), { x: -1, z: 0 });
    close(facing(90), { x: 0, z: 1 });
    close(facing(180), { x: 1, z: 0 });
    close(facing(270), { x: 0, z: -1 });
  });

  it("viewer's right when facing an east-wall stove is south", () => {
    close(rightOf(0), { x: 0, z: -1 });
    close(rightOf(90), { x: -1, z: 0 });
  });

  it('normalises degrees', () => {
    expect(normaliseDeg(-15)).toBe(345);
    expect(normaliseDeg(720)).toBe(0);
  });
});

describe('halfExtents', () => {
  it('swaps axes with rotation', () => {
    const a = halfExtents(0, dims);
    expect(a.hx).toBeCloseTo(0.2);
    expect(a.hz).toBeCloseTo(0.25);
    const b = halfExtents(90, dims);
    expect(b.hx).toBeCloseTo(0.25);
    expect(b.hz).toBeCloseTo(0.2);
    const c = halfExtents(45, dims);
    expect(c.hx).toBeCloseTo(0.45 * Math.SQRT1_2);
  });
});

describe('clampPose', () => {
  it('keeps the body inside the room', () => {
    const p = clampPose({ x: 5, z: -1, r: 0 }, dims, room);
    expect(p.x).toBeCloseTo(1.8);
    expect(p.z).toBeCloseTo(0.25);
    expect(p.r).toBe(0);
  });

  it('centres an axis the stove cannot fit on', () => {
    const p = clampPose({ x: 0.1, z: 1, r: 90 }, { w: 2.2, d: 0.5 }, room);
    expect(p.x).toBe(1);
    expect(Number.isFinite(p.z)).toBe(true);
  });

  it('normalises rotation', () => {
    expect(clampPose({ x: 1, z: 1, r: -90 }, dims, room).r).toBe(270);
  });
});

describe('nudge / rotate', () => {
  const p = { x: 1, z: 2, r: 0 };
  it('moves relative to the stove facing', () => {
    close(nudge(p, 'forward', 0.1, dims, room), { x: 0.9, z: 2 });
    close(nudge(p, 'back', 0.1, dims, room), { x: 1.1, z: 2 });
    close(nudge(p, 'right', 0.1, dims, room), { x: 1, z: 1.9 });
    close(nudge(p, 'left', 0.1, dims, room), { x: 1, z: 2.1 });
  });

  it('clamps after moving and rotating', () => {
    expect(nudge({ x: 1.75, z: 2, r: 0 }, 'back', 0.5, dims, room).x).toBeCloseTo(1.8);
    const r = rotateBy({ x: 1.8, z: 3.2, r: 0 }, 90, dims, room);
    expect(r.r).toBe(90);
    expect(r.x).toBeCloseTo(1.75);
    expect(r.z).toBeCloseTo(3.2);
  });
});

describe('walls', () => {
  it('measures body-to-wall distances', () => {
    const d = distancesToWalls({ x: 1.8, z: 2, r: 0 }, dims, room);
    expect(d.east).toBeCloseTo(0);
    expect(d.west).toBeCloseTo(1.6);
    expect(d.south).toBeCloseTo(1.75);
    expect(d.north).toBeCloseTo(1.15);
  });

  it('snaps the rear to the nearest wall with the rear gap', () => {
    const east = snapToNearestWall({ x: 1.5, z: 2, r: 45 }, dims, room, 0.2);
    expect(east.r).toBe(0);
    expect(east.x).toBeCloseTo(2 - 0.2 - 0.2);
    expect(east.z).toBeCloseTo(2);
    const south = snapToNearestWall({ x: 1, z: 0.3, r: 0 }, dims, room, 0);
    expect(south.r).toBe(90);
    expect(south.z).toBeCloseTo(0.2);
    const west = snapToNearestWall({ x: 0.3, z: 1.7, r: 0 }, dims, room, 0.1);
    expect(west.r).toBe(180);
    expect(west.x).toBeCloseTo(0.3);
    const north = snapToNearestWall({ x: 1, z: 3.2, r: 0 }, dims, room, 0);
    expect(north.r).toBe(270);
    expect(north.z).toBeCloseTo(3.2);
  });
});

describe('initialPose', () => {
  it('centres on the free east wall, respecting the rear distance', () => {
    const safety = { rear: 0.2, side: 0.4, front: 1.5, ceiling: null, floorFront: null, notes: null };
    const p = initialPose(dims, safety, room);
    expect(p.r).toBe(0);
    expect(p.x).toBeCloseTo(2 - 0.2 - 0.2);
    expect(p.z).toBeCloseTo(2.46);
  });

  it('touches the wall without safety data', () => {
    expect(initialPose(dims, null, room).x).toBeCloseTo(1.8);
  });
});
