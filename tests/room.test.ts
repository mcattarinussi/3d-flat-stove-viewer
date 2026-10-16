import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { parseApartment } from '../src/data/apartment';
import { buildRoom, wallPieces, wallPoint, wallYaw } from '../src/scene/room';

const apt = parseApartment(JSON.parse(readFileSync('data/apartment.json', 'utf8')));
const room = apt.room;

describe('wallPieces', () => {
  it('splits the east wall around the soggiorno doorway', () => {
    expect(wallPieces(room, 'east', 2.7, 0.2)).toEqual([
      { a0: 0, a1: 0.72, y0: 0, y1: 2.7 },
      { a0: 0.72, a1: 1.52, y0: 2.1, y1: 2.7 },
      { a0: 1.52, a1: 3.4, y0: 0, y1: 2.7 },
    ]);
  });

  it('extends north/south walls past the corners and leaves room for the transom', () => {
    const north = wallPieces(room, 'north', 2.7, 0.2);
    expect(north[0]).toEqual({ a0: -0.2, a1: 0.63, y0: 0, y1: 2.7 });
    expect(north[1].a0).toBe(0.63);
    expect(north[1].a1).toBe(1.43);
    expect(north[1].y0).toBeCloseTo(2.6);
    expect(north[2]).toEqual({ a0: 1.43, a1: 2.2, y0: 0, y1: 2.7 });
  });

  it('handles two openings on the west wall', () => {
    const west = wallPieces(room, 'west', 2.7, 0.2);
    expect(west.map((p) => [p.a0, p.a1])).toEqual([
      [0, 0.72],
      [0.72, 1.52],
      [1.52, 2.25],
      [2.25, 3.05],
      [3.05, 3.4],
    ]);
  });
});

describe('wallPoint / wallYaw', () => {
  it('places points on the inner face, pushed outward', () => {
    expect(wallPoint(room, 'south', 1, 0.1)).toEqual({ x: 1, z: -0.1 });
    expect(wallPoint(room, 'north', 1, 0.1)).toEqual({ x: 1, z: 3.5 });
    expect(wallPoint(room, 'west', 2, 0.1)).toEqual({ x: -0.1, z: 2 });
    expect(wallPoint(room, 'east', 2, -0.1)).toEqual({ x: 1.9, z: 2 });
  });

  it('maps local +X onto the along-axis', () => {
    const along = (yawY: number) => new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yawY, 0));
    expect(along(wallYaw('south')).x).toBeCloseTo(1);
    const e = along(wallYaw('east'));
    expect(e.x).toBeCloseTo(0);
    expect(e.z).toBeCloseTo(1);
  });
});

describe('buildRoom cutaway', () => {
  it('hides walls whose outside faces the camera', () => {
    const view = buildRoom(apt);
    view.updateCutaway({ x: -2, z: -3 });
    expect(view.walls.get('south')!.visible).toBe(false);
    expect(view.walls.get('west')!.visible).toBe(false);
    expect(view.walls.get('north')!.visible).toBe(true);
    expect(view.walls.get('east')!.visible).toBe(true);
    view.updateCutaway({ x: 1, z: 1.7 });
    expect([...view.walls.values()].every((w) => w.visible)).toBe(true);
  });
});
