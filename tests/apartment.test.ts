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
    expect(FREE_WALL).toEqual({ wall: 'east', from: 1.52, to: 3.4, depth: 2 });
  });
});
