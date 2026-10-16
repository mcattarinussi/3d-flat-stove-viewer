import { normaliseStove } from '../src/data/stoves';
import type { RawStove, Stove } from '../src/data/types';

export function rawStove(over: Partial<RawStove> = {}): RawStove {
  return {
    id: 'eva-calor-alberta',
    brand: 'Eva Calor',
    model: 'Alberta',
    category: 'stove',
    description: null,
    dimensions_mm: { width: 504, depth: 433, height: 1282 },
    weight_kg: 147,
    heat_output_kw: { nominal: 8, min: null, max: null, water: null },
    efficiency_pct: 86,
    seasonal_efficiency_pct: 76,
    heating_volume_m3: 200,
    energy_class: 'A+',
    environmental_stars: 5,
    flue: { diameter_mm: 150, outlet: ['top', 'rear'] },
    safety_distances_mm: { rear: 200, side: 400, front: 1500, ceiling: 750, floor_front: 1000, notes: 'EN 16510' },
    emissions_13pct_o2: { co_mg_nm3: 644, pm_mg_nm3: 24, nox_mg_nm3: 87, ogc_mg_nm3: 25 },
    certifications: ['EN 16510-2-1:2022'],
    has_oven: false,
    finishes: ['Reddish brown', 'Brass'],
    pricing: [{ indicative_price_eur: 2106 }],
    sources: [{ file: 'assets/catalogues/Eva Calor/Eva_Calor_Alberta_scheda_tecnica.pdf', pages: '1-3' }],
    bespoke: {},
    ...over,
  };
}

export function stove(over: Partial<Stove> = {}): Stove {
  return { ...normaliseStove(rawStove()), ...over };
}
