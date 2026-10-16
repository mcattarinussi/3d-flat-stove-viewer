import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseApartment } from '../src/data/apartment';
import { doorPose, Doors, leafDir } from '../src/scene/doors';

const apt = parseApartment(JSON.parse(readFileSync('data/apartment.json', 'utf8')));
const opening = (id: string) => apt.room.openings.find((o) => o.id === id)!;
const INWARD = { south: { x: 0, z: 1 }, north: { x: 0, z: -1 }, west: { x: 1, z: 0 }, east: { x: -1, z: 0 } };

describe('doorPose', () => {
  it('front door: hinge at the east jamb, opens into the room', () => {
    const p = doorPose(apt.room, opening('entrata'), apt.wallThickness);
    expect(p.hinge.x).toBeCloseTo(1.45);
    expect(p.hinge.z).toBeCloseTo(-0.03);
    expect(p.width).toBeCloseTo(0.9);
    const closed = leafDir(p.closed);
    expect(closed.x).toBeCloseTo(-1);
    const open = leafDir(p.open);
    expect(open.x).toBeCloseTo(0);
    expect(open.z).toBeCloseTo(1);
  });

  it('kitchen door opens west, into the kitchen', () => {
    const p = doorPose(apt.room, opening('cucina'), apt.wallThickness);
    expect(p.hinge.x).toBeCloseTo(-0.17);
    expect(p.hinge.z).toBeCloseTo(0.72);
    const open = leafDir(p.open);
    expect(open.x).toBeCloseTo(-1);
    expect(open.z).toBeCloseTo(0);
  });

  it('every door opens towards its swing side and is closed along its wall', () => {
    for (const o of apt.room.openings.filter((x) => x.door)) {
      const p = doorPose(apt.room, o, apt.wallThickness);
      const n = INWARD[o.wall];
      const open = leafDir(p.open);
      const dot = open.x * n.x + open.z * n.z;
      expect(o.door!.swing === 'in' ? dot : -dot).toBeCloseTo(1);
      const closed = leafDir(p.closed);
      expect(closed.x * n.x + closed.z * n.z).toBeCloseTo(0);
    }
  });
});

describe('Doors', () => {
  it('starts closed and lists every door', () => {
    const doors = new Doors(apt);
    expect(doors.list().map((d) => d.id)).toEqual(['entrata', 'disimpegno', 'scale', 'cucina', 'soggiorno']);
    expect(doors.openIds()).toEqual([]);
  });

  it('toggles, animates and notifies', () => {
    const doors = new Doors(apt);
    const cb = vi.fn();
    doors.onChange(cb);
    doors.toggle('entrata');
    expect(doors.isOpen('entrata')).toBe(true);
    expect(cb).toHaveBeenCalledTimes(1);
    const pivot = doors.pickables()[0];
    const pose = doorPose(apt.room, opening('entrata'), apt.wallThickness);
    expect(pivot.rotation.y).toBeCloseTo(pose.closed);
    doors.update(0.15);
    expect(pivot.rotation.y).not.toBeCloseTo(pose.closed);
    doors.update(1);
    expect(pivot.rotation.y).toBeCloseTo(pose.open);
  });

  it('setOpen without animation jumps; setAll opens everything', () => {
    const doors = new Doors(apt);
    doors.setOpen('cucina', true, false);
    const pose = doorPose(apt.room, opening('cucina'), apt.wallThickness);
    expect(doors.pickables()[3].rotation.y).toBeCloseTo(pose.open);
    doors.setAll(true);
    expect(doors.openIds()).toHaveLength(5);
    doors.setAll(false);
    expect(doors.openIds()).toEqual([]);
  });

  it('resolves a door id from a nested mesh', () => {
    const doors = new Doors(apt);
    const leaf = doors.pickables()[2].children[0];
    expect(doors.idFromObject(leaf)).toBe('scale');
    expect(doors.idFromObject(null)).toBeNull();
  });

  it('hides closed leaves on cut-away walls but keeps open ones', () => {
    const doors = new Doors(apt);
    doors.setOpen('entrata', true, false);
    doors.setHiddenWalls(new Set(['south', 'west']));
    const visible = Object.fromEntries(doors.list().map((d, i) => [d.id, doors.pickables()[i].visible]));
    expect(visible).toEqual({ entrata: true, disimpegno: true, scale: false, cucina: false, soggiorno: true });
    doors.setOpen('cucina', true, false);
    expect(doors.pickables()[3].visible).toBe(true);
  });
});
