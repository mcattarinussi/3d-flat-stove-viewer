import type { EnergyClass, Stove } from './types';

export type RangeKey = 'kw' | 'price' | 'width' | 'depth' | 'height';
export const RANGE_KEYS: RangeKey[] = ['kw', 'price', 'width', 'depth', 'height'];

export interface Range {
  min: number;
  max: number;
}

export type FreeWallMode = 'door' | 'wall';

export interface FilterState {
  brands: Set<string>;
  ranges: Record<RangeKey, Range | null>;
  minStars: number | null;
  energyClasses: Set<EnergyClass>;
  onlyWithSafety: boolean;
  onlyWithPrice: boolean;
  onlyWithOven: boolean;
  /** Depth limit for the free wall, or null when the filter is off. */
  freeWall: { mode: FreeWallMode; maxDepth: number } | null;
  text: string;
}

export interface FilterResult {
  visible: Stove[];
  hiddenMissingData: number;
  noDims: number;
}

export type SortKey = 'price' | 'kw' | 'width' | 'name';

export function defaultFilters(): FilterState {
  return {
    brands: new Set(),
    ranges: { kw: null, price: null, width: null, depth: null, height: null },
    minStars: null,
    energyClasses: new Set(),
    onlyWithSafety: false,
    onlyWithPrice: false,
    onlyWithOven: false,
    freeWall: null,
    text: '',
  };
}

export function rangeValue(s: Stove, key: RangeKey): number | null {
  switch (key) {
    case 'kw':
      return s.kw;
    case 'price':
      return s.price;
    case 'width':
      return s.dims?.w ?? null;
    case 'depth':
      return s.dims?.d ?? null;
    case 'height':
      return s.dims?.h ?? null;
  }
}

export function fitsDepth(s: Stove, maxDepth: number): boolean {
  return s.dims !== null && s.dims.d <= maxDepth + 1e-9;
}

/** `lenient` treats null values as passing the data-dependent filters (ranges, stars, energy class). */
function passes(s: Stove, f: FilterState, lenient: boolean): boolean {
  if (f.brands.size > 0 && !f.brands.has(s.brand)) return false;
  for (const key of RANGE_KEYS) {
    const r = f.ranges[key];
    if (!r) continue;
    const v = rangeValue(s, key);
    if (v === null) {
      if (!lenient) return false;
    } else if (v < r.min - 1e-9 || v > r.max + 1e-9) {
      return false;
    }
  }
  if (f.minStars !== null) {
    if (s.stars === null) {
      if (!lenient) return false;
    } else if (s.stars < f.minStars) return false;
  }
  if (f.energyClasses.size > 0) {
    if (s.energyClass === null) {
      if (!lenient) return false;
    } else if (!f.energyClasses.has(s.energyClass)) return false;
  }
  if (f.onlyWithSafety && !s.safety) return false;
  if (f.onlyWithPrice && s.price === null) return false;
  if (f.onlyWithOven && !s.hasOven) return false;
  if (f.freeWall && !fitsDepth(s, f.freeWall.maxDepth)) return false;
  const tokens = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const hay = `${s.brand} ${s.model}`.toLowerCase();
    if (!tokens.every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function applyFilters(stoves: Stove[], f: FilterState): FilterResult {
  const visible: Stove[] = [];
  let hiddenMissingData = 0;
  let noDims = 0;
  for (const s of stoves) {
    if (!s.dims) {
      noDims++;
      continue;
    }
    if (passes(s, f, false)) visible.push(s);
    else if (passes(s, f, true)) hiddenMissingData++;
  }
  return { visible, hiddenMissingData, noDims };
}

const nameOf = (s: Stove) => `${s.brand} ${s.model}`;

export function sortStoves(stoves: Stove[], key: SortKey): Stove[] {
  const copy = [...stoves];
  if (key === 'name') return copy.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'it'));
  const value = (s: Stove) => (key === 'width' ? rangeValue(s, 'width') : key === 'kw' ? s.kw : s.price);
  return copy.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return nameOf(a).localeCompare(nameOf(b), 'it');
    if (va === null) return 1;
    if (vb === null) return -1;
    return va - vb;
  });
}

export function extents(stoves: Stove[]): Record<RangeKey, Range> {
  const out = {} as Record<RangeKey, Range>;
  for (const key of RANGE_KEYS) {
    const vals = stoves.map((s) => rangeValue(s, key)).filter((v): v is number => v !== null);
    out[key] = vals.length ? { min: Math.min(...vals), max: Math.max(...vals) } : { min: 0, max: 0 };
  }
  return out;
}
