import { describe, expect, it } from 'vitest';
import { applyFilters, defaultFilters, extents, fitsFreeWall, sortStoves, type FilterState } from '../src/data/filters';
import { stove } from './fixtures';

const base = (): FilterState => defaultFilters();
const ids = (r: { visible: { id: string }[] }) => r.visible.map((s) => s.id);

describe('defaultFilters', () => {
  it('starts with every filter untouched', () => {
    const f = base();
    expect(f.brands.size).toBe(0);
    expect(Object.values(f.ranges).every((r) => r === null)).toBe(true);
    expect(f.fitsFreeWall).toBe(false);
    expect('categories' in f).toBe(false);
  });
});

describe('applyFilters', () => {
  const a = stove({ id: 'a', brand: 'Alfa', model: 'Uno', kw: 8, price: 2000, category: 'stove' });
  const b = stove({ id: 'b', brand: 'Beta', model: 'Due', kw: 12, price: null, category: 'stove_with_oven', hasOven: true });
  const c = stove({ id: 'c', brand: 'Alfa', model: 'Tre', kw: null, price: 3000, category: 'storage_stove' });
  const noDims = stove({ id: 'n', dims: null });
  const all = [a, b, c, noDims];

  it('hides stoves without dims and counts them, whatever the category', () => {
    const r = applyFilters(all, base());
    expect(ids(r)).toEqual(['a', 'b', 'c']);
    expect(r.noDims).toBe(1);
  });

  it('untouched ranges let nulls through; narrowed ranges exclude them and count them', () => {
    const f = base();
    f.ranges.kw = { min: 4, max: 10 };
    const r = applyFilters(all, f);
    expect(ids(r)).toEqual(['a']);
    expect(r.hiddenMissingData).toBe(1);
  });

  it('filters by brand, text, oven, price presence and safety presence', () => {
    const f = base();
    f.brands = new Set(['Beta']);
    expect(ids(applyFilters(all, f))).toEqual(['b']);

    const g = base();
    g.text = 'alfa uno';
    expect(ids(applyFilters(all, g))).toEqual(['a']);

    const h = base();
    h.onlyWithOven = true;
    expect(ids(applyFilters(all, h))).toEqual(['b']);

    const p = base();
    p.onlyWithPrice = true;
    expect(ids(applyFilters(all, p))).toEqual(['a', 'c']);

    const s = base();
    s.onlyWithSafety = true;
    expect(ids(applyFilters([a, stove({ id: 'x', safety: null })], s))).toEqual(['a']);
  });

  it('filters by stars and energy class, counting nulls as missing data', () => {
    const f = base();
    f.minStars = 5;
    const r = applyFilters([stove({ id: 's5', stars: 5 }), stove({ id: 's4', stars: 4 }), stove({ id: 'sn', stars: null })], f);
    expect(ids(r)).toEqual(['s5']);
    expect(r.hiddenMissingData).toBe(1);

    const g = base();
    g.energyClasses = new Set(['A']);
    expect(ids(applyFilters([stove({ id: 'p', energyClass: 'A+' }), stove({ id: 'q', energyClass: 'A' })], g))).toEqual(['q']);
  });

  it('dimension ranges use metres', () => {
    const f = base();
    f.ranges.width = { min: 0.4, max: 0.5 };
    expect(ids(applyFilters([stove({ id: 'w', dims: { w: 0.45, d: 0.4, h: 1 } }), stove({ id: 'v', dims: { w: 0.6, d: 0.4, h: 1 } })], f))).toEqual(['w']);
  });

  it('free-wall toggle keeps stoves at most 57 cm deep', () => {
    const f = base();
    f.fitsFreeWall = true;
    const list = [stove({ id: 'ok', dims: { w: 1.2, d: 0.57, h: 1 } }), stove({ id: 'deep', dims: { w: 0.4, d: 0.58, h: 1 } })];
    expect(ids(applyFilters(list, f))).toEqual(['ok']);
  });
});

describe('fitsFreeWall', () => {
  it('only looks at depth', () => {
    expect(fitsFreeWall(stove({ dims: { w: 0.5, d: 0.43, h: 1.2 } }))).toBe(true);
    expect(fitsFreeWall(stove({ dims: { w: 1.95, d: 0.5, h: 1 } }))).toBe(true);
    expect(fitsFreeWall(stove({ dims: { w: 0.5, d: 0.57, h: 1 } }))).toBe(true);
    expect(fitsFreeWall(stove({ dims: { w: 0.4, d: 0.571, h: 1 } }))).toBe(false);
    expect(fitsFreeWall(stove({ dims: null }))).toBe(false);
  });
});

describe('sortStoves', () => {
  const x = stove({ id: 'x', brand: 'B', model: 'b', price: 3000, kw: 6, dims: { w: 0.6, d: 0.4, h: 1 } });
  const y = stove({ id: 'y', brand: 'A', model: 'z', price: null, kw: 9, dims: { w: 0.4, d: 0.4, h: 1 } });
  const z = stove({ id: 'z', brand: 'A', model: 'a', price: 1000, kw: null, dims: { w: 0.5, d: 0.4, h: 1 } });

  it('sorts ascending with nulls last', () => {
    expect(sortStoves([x, y, z], 'price').map((s) => s.id)).toEqual(['z', 'x', 'y']);
    expect(sortStoves([x, y, z], 'kw').map((s) => s.id)).toEqual(['x', 'y', 'z']);
    expect(sortStoves([x, y, z], 'width').map((s) => s.id)).toEqual(['y', 'z', 'x']);
    expect(sortStoves([x, y, z], 'name').map((s) => s.id)).toEqual(['z', 'y', 'x']);
  });

  it('does not mutate the input', () => {
    const input = [x, y, z];
    sortStoves(input, 'price');
    expect(input.map((s) => s.id)).toEqual(['x', 'y', 'z']);
  });
});

describe('extents', () => {
  it('covers non-null values only', () => {
    const e = extents([stove({ kw: 4, price: null }), stove({ kw: 23, price: 710 })]);
    expect(e.kw).toEqual({ min: 4, max: 23 });
    expect(e.price).toEqual({ min: 710, max: 710 });
  });
});
