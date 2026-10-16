import type { Catalogue, Dims, EnergyClass, FlueOutlet, RawCatalogue, RawStove, Safety, SourceRef, Stove } from './types';

const ROUND_RE = /cilindr|rotond|round/i;

/** Not stufe a legna: cookers, boiler stoves and fireplace inserts. Unknown categories are kept. */
export const EXCLUDED_CATEGORIES = ['cookstove', 'thermo_stove', 'thermo_cookstove', 'insert'];
const OUTLETS: FlueOutlet[] = ['top', 'rear', 'side'];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const mm = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : n / 1000;
};

export function firstPage(pages: number | string | null | undefined): number | null {
  if (typeof pages === 'number') return Number.isFinite(pages) ? pages : null;
  if (typeof pages === 'string') {
    const n = parseInt(pages, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function fixSourcePath(file: string): string {
  return file.replace(/^assets\/catalogues\/catalogues\//, 'assets/catalogues/');
}

function dimsOf(raw: RawStove): Dims | null {
  const w = mm(raw.dimensions_mm?.width);
  const d = mm(raw.dimensions_mm?.depth);
  const h = mm(raw.dimensions_mm?.height);
  return w === null || d === null || h === null ? null : { w, d, h };
}

function safetyOf(raw: RawStove): Safety | null {
  const s = raw.safety_distances_mm;
  if (!s) return null;
  return {
    rear: mm(s.rear),
    side: mm(s.side),
    front: mm(s.front),
    ceiling: mm(s.ceiling),
    floorFront: mm(s.floor_front),
    notes: s.notes ?? null,
  };
}

function priceOf(raw: RawStove): number | null {
  const prices = raw.pricing.map((p) => num(p.indicative_price_eur)).filter((p): p is number => p !== null);
  return prices.length ? Math.min(...prices) : null;
}

export function normaliseStove(raw: RawStove): Stove {
  const dims = dimsOf(raw);
  const stars = num(raw.environmental_stars);
  const energyClass = raw.energy_class === 'A+' || raw.energy_class === 'A' ? (raw.energy_class as EnergyClass) : null;
  const shapeText = [raw.model, raw.description ?? '', JSON.stringify(raw.bespoke ?? {})].join(' ');
  const e = raw.emissions_13pct_o2;
  return {
    id: raw.id,
    brand: raw.brand,
    model: String(raw.model),
    category: raw.category,
    description: raw.description,
    dims,
    weightKg: num(raw.weight_kg),
    kw: num(raw.heat_output_kw?.nominal),
    kwMin: num(raw.heat_output_kw?.min),
    kwMax: num(raw.heat_output_kw?.max),
    kwWater: num(raw.heat_output_kw?.water),
    efficiency: num(raw.efficiency_pct),
    seasonalEfficiency: num(raw.seasonal_efficiency_pct),
    heatingVolume: num(raw.heating_volume_m3),
    energyClass,
    stars: stars !== null && stars >= 1 && stars <= 5 ? stars : null,
    flueDiameter: mm(raw.flue?.diameter_mm),
    flueOutlets: (raw.flue?.outlet ?? []).filter((o): o is FlueOutlet => OUTLETS.includes(o as FlueOutlet)),
    safety: safetyOf(raw),
    emissions: e ? { co: num(e.co_mg_nm3), pm: num(e.pm_mg_nm3), nox: num(e.nox_mg_nm3), ogc: num(e.ogc_mg_nm3) } : null,
    hasOven: raw.has_oven === true,
    finishes: raw.finishes.map(String),
    certifications: raw.certifications ?? [],
    price: priceOf(raw),
    round: dims !== null && raw.dimensions_mm?.width === raw.dimensions_mm?.depth && ROUND_RE.test(shapeText),
    sources: raw.sources.map((s): SourceRef => ({ file: fixSourcePath(s.file), page: firstPage(s.pages) })),
  };
}

export function normaliseCatalogue(raw: RawCatalogue): Catalogue {
  const stoves = raw.stoves.filter((s) => !EXCLUDED_CATEGORIES.includes(s.category)).map(normaliseStove);
  const brands = [...new Set(stoves.map((s) => s.brand))].sort((a, b) => a.localeCompare(b));
  const categories = Object.fromEntries(Object.entries(raw.categories).filter(([k]) => !EXCLUDED_CATEGORIES.includes(k)));
  return { stoves, categories, brands };
}

export async function loadCatalogue(url: string): Promise<Catalogue> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile caricare ${url} (HTTP ${res.status})`);
  return normaliseCatalogue((await res.json()) as RawCatalogue);
}
