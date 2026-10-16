import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { firstPage, fixSourcePath, normaliseCatalogue, normaliseStove } from '../src/data/stoves';
import { rawStove } from './fixtures';

describe('normaliseStove', () => {
  it('converts mm to m', () => {
    const s = normaliseStove(rawStove());
    expect(s.dims).toEqual({ w: 0.504, d: 0.433, h: 1.282 });
    expect(s.safety).toEqual({ rear: 0.2, side: 0.4, front: 1.5, ceiling: 0.75, floorFront: 1, notes: 'EN 16510' });
    expect(s.flueDiameter).toBe(0.15);
  });

  it('nulls dims when any dimension is missing', () => {
    expect(normaliseStove(rawStove({ dimensions_mm: { width: 500, depth: null, height: 1000 } })).dims).toBeNull();
    expect(normaliseStove(rawStove({ dimensions_mm: null })).dims).toBeNull();
  });

  it('never invents safety distances', () => {
    expect(normaliseStove(rawStove({ safety_distances_mm: null })).safety).toBeNull();
    const partial = normaliseStove(
      rawStove({ safety_distances_mm: { rear: null, side: 300, front: null, ceiling: null, floor_front: null, notes: null } }),
    );
    expect(partial.safety).toEqual({ rear: null, side: 0.3, front: null, ceiling: null, floorFront: null, notes: null });
  });

  it('uses the lowest indicative price and ignores null rows', () => {
    const s = normaliseStove(
      rawStove({ pricing: [{ indicative_price_eur: 2400 }, { indicative_price_eur: null }, { indicative_price_eur: 2100 }] }),
    );
    expect(s.price).toBe(2100);
    expect(normaliseStove(rawStove({ pricing: [] })).price).toBeNull();
  });

  it('stringifies numeric models and finishes', () => {
    const s = normaliseStove(rawStove({ model: 45, finishes: [3, 'Nero'] }));
    expect(s.model).toBe('45');
    expect(s.finishes).toEqual(['3', 'Nero']);
  });

  it('detects round stoves only when width equals depth and the text says so', () => {
    const round = rawStove({ model: 'Round', dimensions_mm: { width: 500, depth: 500, height: 1100 } });
    expect(normaliseStove(round).round).toBe(true);
    const square = rawStove({ model: 'Cubo', dimensions_mm: { width: 500, depth: 500, height: 1100 } });
    expect(normaliseStove(square).round).toBe(false);
    const cylNotes = rawStove({ bespoke: { shape: 'cilindrica' }, dimensions_mm: { width: 480, depth: 480, height: 1000 } });
    expect(normaliseStove(cylNotes).round).toBe(true);
  });

  it('keeps only known energy classes, outlets and valid stars', () => {
    const s = normaliseStove(
      rawStove({ energy_class: 'B', environmental_stars: 7, flue: { diameter_mm: null, outlet: ['top', 'weird'] } }),
    );
    expect(s.energyClass).toBeNull();
    expect(s.stars).toBeNull();
    expect(s.flueOutlets).toEqual(['top']);
    expect(s.flueDiameter).toBeNull();
  });
});

describe('sources', () => {
  it('takes the first page of a range or list', () => {
    expect(firstPage(55)).toBe(55);
    expect(firstPage('1-3')).toBe(1);
    expect(firstPage('40-41,77')).toBe(40);
    expect(firstPage(null)).toBeNull();
    expect(firstPage('n/a')).toBeNull();
  });

  it('fixes the doubled catalogues prefix', () => {
    expect(fixSourcePath('assets/catalogues/catalogues/La Nordica/x.pdf')).toBe('assets/catalogues/La Nordica/x.pdf');
    expect(fixSourcePath('assets/catalogues/Eva Calor/y.pdf')).toBe('assets/catalogues/Eva Calor/y.pdf');
  });

  it('normalises sources', () => {
    const s = normaliseStove(rawStove({ sources: [{ file: 'assets/catalogues/catalogues/A/b.pdf', pages: '40-41,77' }] }));
    expect(s.sources).toEqual([{ file: 'assets/catalogues/A/b.pdf', page: 40 }]);
  });
});

describe('real catalogue', () => {
  const raw = JSON.parse(readFileSync('data/stoves.json', 'utf8'));
  const cat = normaliseCatalogue(raw);

  it('matches the summary counts', () => {
    expect(cat.stoves).toHaveLength(668);
    expect(cat.stoves.filter((s) => s.dims).length).toBe(602);
    expect(cat.stoves.filter((s) => s.safety).length).toBe(219);
  });

  it('lists brands sorted and unique', () => {
    expect(cat.brands.length).toBe(23);
    expect([...cat.brands].sort((a, b) => a.localeCompare(b))).toEqual(cat.brands);
  });

  // The catalogue PDFs are kept out of git, so this only runs where they exist locally.
  it.skipIf(!existsSync('assets/catalogues'))('every source path points to an existing file', () => {
    const missing = cat.stoves.flatMap((s) => s.sources.map((x) => x.file)).filter((f) => !existsSync(f));
    expect(missing).toEqual([]);
  });
});
