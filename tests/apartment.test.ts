import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FREE_WALL, parseApartment, wallLength } from '../src/data/apartment';

const realRaw = () => JSON.parse(readFileSync('data/apartment.json', 'utf8'));

describe('parseApartment', () => {
  it('parses the real file', () => {
    const apt = parseApartment(realRaw());
    expect(apt.ceilingHeight).toBe(2.7);
    expect(apt.wallThickness).toBe(0.2);
    expect(apt.room.width).toBe(2);
    expect(apt.room.openings.map((o) => o.id)).toEqual(['entrata', 'disimpegno', 'scale', 'cucina', 'soggiorno']);
    expect(apt.room.openings.find((o) => o.id === 'disimpegno')!.transom).toBe(0.5);
    expect(apt.room.openings.find((o) => o.id === 'cucina')!.transom).toBe(0);
    expect(apt.room.fixtures[0].type).toBe('radiator');
  });

  it('parses wall fixtures, finishes and the stairs door', () => {
    const apt = parseApartment(realRaw());
    const byId = Object.fromEntries(apt.room.fixtures.map((f) => [f.id, f]));
    expect(byId['interruttore-notte']).toMatchObject({ type: 'switch', gangs: 2, wall: 'north' });
    expect(byId['termostato'].type).toBe('thermostat');
    expect(byId['presa']).toMatchObject({ type: 'socket', gangs: 1 });
    expect(byId['radiatore'].gangs).toBe(1);
    expect(apt.room.finishes).toEqual({ skirting: { height: 0.08, thickness: 0.01 }, sills: true });
    expect(apt.room.openings.find((o) => o.id === 'scale')!.door!.swing).toBe('out');
  });

  it('allows items on the same span at different heights, rejects real overlaps', () => {
    const raw = realRaw();
    raw.room.fixtures.push({ id: 'x', type: 'switch', wall: 'east', from: 0.8, to: 0.88, height: 0.08, depth: 0.01, elevation: 1 });
    expect(() => parseApartment(raw)).toThrow(/si sovrappongono/);
  });

  it('defaults finishes to none and validates them', () => {
    const raw = realRaw();
    delete raw.room.finishes;
    expect(parseApartment(raw).room.finishes).toEqual({ skirting: null, sills: false });
    const bad = realRaw();
    bad.room.finishes.skirting.height = -1;
    expect(() => parseApartment(bad)).toThrow(/skirting/);
  });

  it('rejects unknown fixture types and bad gang counts', () => {
    const raw = realRaw();
    raw.room.fixtures[1].type = 'lamp';
    expect(() => parseApartment(raw)).toThrow(/type/);
    const raw2 = realRaw();
    raw2.room.fixtures[1].gangs = 3;
    expect(() => parseApartment(raw2)).toThrow(/gangs/);
  });

  it('rejects an opening outside its wall', () => {
    const raw = realRaw();
    raw.room.openings[0].to = 2.3;
    expect(() => parseApartment(raw)).toThrow(/fuori dalla parete/);
  });

  it('rejects overlapping items on the same wall', () => {
    const raw = realRaw();
    raw.room.fixtures[0].to = 0.9;
    expect(() => parseApartment(raw)).toThrow(/si sovrappongono/);
  });

  it('rejects an opening taller than the ceiling', () => {
    const raw = realRaw();
    raw.room.openings[1].transom = 0.7;
    expect(() => parseApartment(raw)).toThrow(/soffitto/);
  });

  it('rejects missing numbers and bad walls', () => {
    const raw = realRaw();
    delete raw.ceiling_height;
    expect(() => parseApartment(raw)).toThrow(/ceiling_height/);
    const raw2 = realRaw();
    raw2.room.openings[0].wall = 'up';
    expect(() => parseApartment(raw2)).toThrow(/wall/);
  });

  it('rejects duplicate ids', () => {
    const raw = realRaw();
    raw.room.openings[1].id = 'entrata';
    expect(() => parseApartment(raw)).toThrow(/duplicato/);
  });
});

describe('helpers', () => {
  it('wallLength', () => {
    const room = { width: 2, depth: 3.4 };
    expect(wallLength(room, 'north')).toBe(2);
    expect(wallLength(room, 'east')).toBe(3.4);
  });

  it('FREE_WALL is the east segment north of the soggiorno door', () => {
    expect(FREE_WALL).toEqual({ wall: 'east', from: 1.52, to: 3.4, maxDepth: 0.57 });
  });
});
