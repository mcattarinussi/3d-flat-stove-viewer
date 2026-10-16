export type Wall = 'north' | 'south' | 'east' | 'west';
export type FlueOutlet = 'top' | 'rear' | 'side';
export type EnergyClass = 'A+' | 'A';

export interface Dims {
  w: number;
  d: number;
  h: number;
}

export interface Safety {
  rear: number | null;
  side: number | null;
  front: number | null;
  ceiling: number | null;
  floorFront: number | null;
  notes: string | null;
}

export interface Emissions {
  co: number | null;
  pm: number | null;
  nox: number | null;
  ogc: number | null;
}

export interface SourceRef {
  file: string;
  page: number | null;
}

/** A normalised catalogue entry. All lengths in metres. */
export interface Stove {
  id: string;
  brand: string;
  model: string;
  category: string;
  description: string | null;
  dims: Dims | null;
  weightKg: number | null;
  kw: number | null;
  kwMin: number | null;
  kwMax: number | null;
  kwWater: number | null;
  efficiency: number | null;
  seasonalEfficiency: number | null;
  heatingVolume: number | null;
  energyClass: EnergyClass | null;
  stars: number | null;
  flueDiameter: number | null;
  flueOutlets: FlueOutlet[];
  safety: Safety | null;
  emissions: Emissions | null;
  hasOven: boolean;
  finishes: string[];
  certifications: string[];
  price: number | null;
  round: boolean;
  sources: SourceRef[];
}

export interface Catalogue {
  stoves: Stove[];
  categories: Record<string, string>;
  brands: string[];
}

/** Raw `stoves.json` entry (only the fields the app reads). Lengths in mm. */
export interface RawStove {
  id: string;
  brand: string;
  model: string | number;
  category: string;
  description: string | null;
  dimensions_mm: { width: number | null; depth: number | null; height: number | null } | null;
  weight_kg: number | null;
  heat_output_kw: { nominal: number | null; min: number | null; max: number | null; water: number | null } | null;
  efficiency_pct: number | null;
  seasonal_efficiency_pct: number | null;
  heating_volume_m3: number | null;
  energy_class: string | null;
  environmental_stars: number | null;
  flue: { diameter_mm: number | null; outlet: string[] | null } | null;
  safety_distances_mm: {
    rear: number | null;
    side: number | null;
    front: number | null;
    ceiling: number | null;
    floor_front: number | null;
    notes: string | null;
  } | null;
  emissions_13pct_o2: {
    co_mg_nm3: number | null;
    pm_mg_nm3: number | null;
    nox_mg_nm3: number | null;
    ogc_mg_nm3: number | null;
  } | null;
  certifications: string[];
  has_oven: boolean;
  finishes: (string | number)[];
  pricing: { indicative_price_eur: number | null }[];
  sources: { file: string; pages: number | string | null }[];
  bespoke: Record<string, unknown> | null;
}

export interface RawCatalogue {
  categories: Record<string, string>;
  stoves: RawStove[];
}

export interface DoorSpec {
  hinge: 'from' | 'to';
  swing: 'in' | 'out';
  glazed: boolean;
}

export interface Opening {
  id: string;
  name: string;
  wall: Wall;
  from: number;
  to: number;
  height: number;
  transom: number;
  door: DoorSpec | null;
}

export type FixtureType = 'radiator' | 'switch' | 'socket' | 'thermostat';

export interface Fixture {
  id: string;
  type: FixtureType;
  /** Number of rockers on a switch plate (1 for every other type). */
  gangs: 1 | 2;
  wall: Wall;
  from: number;
  to: number;
  height: number;
  depth: number;
  elevation: number;
}

export interface Room {
  id: string;
  name: string;
  width: number;
  depth: number;
  floorMaterial: string;
  openings: Opening[];
  fixtures: Fixture[];
  finishes: Finishes;
}

export interface Finishes {
  skirting: { height: number; thickness: number } | null;
  sills: boolean;
}

export interface Apartment {
  ceilingHeight: number;
  wallThickness: number;
  room: Room;
}
