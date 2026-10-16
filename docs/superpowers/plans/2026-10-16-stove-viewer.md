# Stove Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Vite + TypeScript + Three.js app to choose a wood stove for the ingresso: filter the catalogue, place a stove in a 3D model of the room with its safety-distance buffer, shortlist and compare candidates, deployable to GitHub Pages.

**Architecture:** Two Vite pages (`index.html` viewer, `compare.html` compare) sharing pure TypeScript data modules (`src/data/*`, unit-tested with Vitest). Three.js scene modules (`src/scene/*`) build geometry in *room coordinates* inside a root group mirrored on z so the plan is north-up/east-right on screen. Plain-DOM UI modules (`src/ui/*`) render sidebar sections and talk to the scene only through callbacks wired in the page entry files.

**Tech Stack:** Node 24.8.0 (asdf), Vite 8, TypeScript, three 0.186, Vitest 5, GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-10-16-stove-viewer-design.md`

## Global Constraints

- Node via asdf: `.tool-versions` contains `nodejs 24.8.0`. CI uses Node 24.
- All UI copy in **Italian**.
- Internal units are **metres**; mm from `stoves.json` are converted only in `src/data/stoves.ts`.
- Room coordinates: origin at the ingresso's south-west inner corner, **x east (0→2.00), z north (0→3.40), y up**. All scene content lives under `viewer.root`, which has `scale.z = -1`; code inside it uses room coordinates directly. World ↔ room: `world = (x, y, -z)`.
- Stove local frame: footprint centre on the floor at origin, **front faces local +z**. Pose `{x, z, r}`; `yaw(r) = -π/2 + r·π/180`; `r = 0` → front faces west (−x); increasing `r` turns clockwise on the north-up plan.
- **No safety-distance fallback**: null `safety` → nothing drawn; null fields contribute 0.
- **No violation logic / alerts** anywhere.
- Vite `base: './'`; all runtime fetches use relative URLs (`./data/...`, `./models/...`, `./assets/catalogues/...`).
- No UI framework. Three.js addons imported from `three/examples/jsm/...`.
- Free east-wall segment: `wall: 'east', from: 1.52, to: 3.40`; room width in front of it 2.00 m.
- Ceiling 2.70 m, walls 0.20 m.

## Review Focus

1. Stove footprint larger than the room on one axis (e.g. 1.389 m wide stove rotated 90° in a 2.00 m room is fine, but a hypothetical 2.2 m one isn't) → pose is centred on that axis, never NaN or outside. Pinned in Task 9.
2. Shared URL with garbage (`x=abc`, `r=`, unknown stove id, pose outside the room) → bad values ignored, pose re-clamped, toast for unknown id. Pinned in Task 4 (decode) and Task 9 (clamp).
3. `safety_distances_mm` present but `rear/side/front` all null (only `ceiling`/`floor_front`) → no buffer box, but the floor patch / ceiling line are still drawn. Pinned in Task 8.
4. Source paths with a doubled `assets/catalogues/catalogues/` prefix (45 in the data) and page strings like `"40-41,77"` → link to the existing file, page 40. Pinned in Task 1.
5. `localStorage` that throws (Safari private mode, storage disabled) → shortlist still works in memory. Pinned in Task 4.

---

## File map

```
.tool-versions, package.json, tsconfig.json, vite.config.ts, .gitignore
index.html, compare.html
data/apartment.json, data/stoves.json
public/models/index.json
.github/workflows/deploy.yml
src/style.css
src/viewer.ts                 viewer entry (wiring only)
src/compare.ts                compare entry (wiring only)
src/data/types.ts             all shared types
src/data/stoves.ts            stoves.json → Stove[]
src/data/apartment.ts         apartment.json → Apartment (+ FREE_WALL, wallLength)
src/data/filters.ts           filter/sort/extents (pure)
src/data/shortlist.ts         shortlist store
src/data/urlState.ts          viewer state <-> query string
src/scene/setup.ts            renderer, scene, mirrored root, loop
src/scene/room.ts             floor, walls, casings, transom, radiator, ceiling, light, cutaway
src/scene/camera.ts           CameraRig (3D orbit / plan / reset)
src/scene/pick.ts             raycast + tap helpers
src/scene/doors.ts            door poses, leaves, animation, swing arcs
src/scene/stoveModel.ts       parametric stove, flue hint, GLB override
src/scene/buffer.ts           safety buffer meshes
src/scene/placement.ts        pose math + PlacementController
src/ui/dom.ts                 el() helper
src/ui/format.ts              number formatting
src/ui/fatal.ts, toast.ts, viewPanel.ts, doorsPanel.ts, placementPanel.ts,
src/ui/filtersPanel.ts, resultsList.ts, stoveCard.ts, sharePanel.ts
src/compare/table.ts          compare rows, CSV, footprint SVG (pure)
tests/*.test.ts, tests/fixtures.ts
```

---

### Task 1: Project scaffold, types and stove catalogue normalisation

**Files:**
- Create: `.tool-versions`, `package.json`, `tsconfig.json`, `vite.config.ts`
- Modify: `.gitignore`
- Create: `src/data/types.ts`, `src/data/stoves.ts`
- Test: `tests/fixtures.ts`, `tests/stoves.test.ts`

**Interfaces:**
- Produces: all types in `src/data/types.ts` (exact definitions below); `normaliseStove(raw: RawStove): Stove`, `normaliseCatalogue(raw: RawCatalogue): Catalogue`, `loadCatalogue(url: string): Promise<Catalogue>`, `firstPage(pages): number | null`, `fixSourcePath(file: string): string`. Test helpers `rawStove(over?)`, `stove(over?)`.

- [ ] **Step 1: Scaffold the project**

`.tool-versions`:
```
nodejs 24.8.0
```

`package.json`:
```json
{
  "name": "campone-stufa-3d",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

Run:
```bash
npm install three
npm install -D vite typescript vitest @types/three @types/node
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: `${root}index.html` },
    },
  },
  plugins: [
    {
      name: 'copy-site-data',
      apply: 'build',
      closeBundle() {
        // The dev server serves these from the project root; the static build needs them next to the pages.
        for (const dir of ['data', 'assets/catalogues']) {
          cpSync(`${root}${dir}`, `${root}dist/${dir}`, { recursive: true });
        }
      },
    },
  ],
  test: { environment: 'node' },
});
```

`.gitignore` (replace contents):
```
node_modules/
dist/
.DS_Store
```

- [ ] **Step 2: Write the types**

`src/data/types.ts`:
```ts
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

export interface Fixture {
  id: string;
  type: 'radiator';
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
}

export interface Apartment {
  ceilingHeight: number;
  wallThickness: number;
  room: Room;
}
```

- [ ] **Step 3: Write test fixtures and the failing tests**

`tests/fixtures.ts`:
```ts
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
```

`tests/stoves.test.ts`:
```ts
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

  it('every source path points to an existing file', () => {
    const missing = cat.stoves.flatMap((s) => s.sources.map((x) => x.file)).filter((f) => !existsSync(f));
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run tests/stoves.test.ts`
Expected: FAIL — cannot resolve `../src/data/stoves`.

- [ ] **Step 5: Implement `src/data/stoves.ts`**

```ts
import type { Catalogue, Dims, EnergyClass, FlueOutlet, RawCatalogue, RawStove, Safety, SourceRef, Stove } from './types';

const ROUND_RE = /cilindr|rotond|round/i;
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
  const stoves = raw.stoves.map(normaliseStove);
  const brands = [...new Set(stoves.map((s) => s.brand))].sort((a, b) => a.localeCompare(b));
  return { stoves, categories: raw.categories, brands };
}

export async function loadCatalogue(url: string): Promise<Catalogue> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile caricare ${url} (HTTP ${res.status})`);
  return normaliseCatalogue((await res.json()) as RawCatalogue);
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/stoves.test.ts && npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add .tool-versions package.json package-lock.json tsconfig.json vite.config.ts .gitignore src/data tests data/stoves.json
git commit -m "feat: scaffold project and normalise stove catalogue"
```

---

### Task 2: Apartment data and validation

**Files:**
- Create: `data/apartment.json`, `src/data/apartment.ts`
- Test: `tests/apartment.test.ts`

**Interfaces:**
- Consumes: `Apartment`, `Room`, `Opening`, `Fixture`, `Wall` from `src/data/types.ts`.
- Produces: `FREE_WALL: { wall: Wall; from: number; to: number; depth: number }`, `wallLength(room: Pick<Room,'width'|'depth'>, wall: Wall): number`, `parseApartment(raw: unknown): Apartment`, `loadApartment(url: string): Promise<Apartment>`.

- [ ] **Step 1: Write `data/apartment.json`**

```json
{
  "units": "m",
  "ceiling_height": 2.7,
  "wall_thickness": 0.2,
  "room": {
    "id": "ingresso",
    "name": "Ingresso",
    "width": 2.0,
    "depth": 3.4,
    "floor": { "material": "marble" },
    "openings": [
      { "id": "entrata", "name": "Porta d'ingresso", "wall": "south", "from": 0.55, "to": 1.45, "height": 2.1, "door": { "hinge": "to", "swing": "in", "glazed": true } },
      { "id": "disimpegno", "name": "Disimpegno (zona notte)", "wall": "north", "from": 0.63, "to": 1.43, "height": 2.1, "transom": 0.5, "door": { "hinge": "from", "swing": "out", "glazed": true } },
      { "id": "scale", "name": "Scale", "wall": "west", "from": 2.25, "to": 3.05, "height": 2.1, "door": { "hinge": "to", "swing": "in", "glazed": true } },
      { "id": "cucina", "name": "Cucina", "wall": "west", "from": 0.72, "to": 1.52, "height": 2.1, "door": { "hinge": "from", "swing": "out", "glazed": false } },
      { "id": "soggiorno", "name": "Soggiorno", "wall": "east", "from": 0.72, "to": 1.52, "height": 2.1, "door": { "hinge": "from", "swing": "out", "glazed": false } }
    ],
    "fixtures": [
      { "id": "radiatore", "type": "radiator", "wall": "east", "from": 0.1, "to": 0.6, "height": 0.85, "depth": 0.12, "elevation": 0.12 }
    ]
  }
}
```

- [ ] **Step 2: Write the failing tests**

`tests/apartment.test.ts`:
```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/apartment.test.ts`
Expected: FAIL — cannot resolve `../src/data/apartment`.

- [ ] **Step 4: Implement `src/data/apartment.ts`**

```ts
import type { Apartment, DoorSpec, Fixture, Opening, Room, Wall } from './types';

/** Free east-wall segment between the soggiorno door and the north corner; `depth` is the room width in front of it. */
export const FREE_WALL: { wall: Wall; from: number; to: number; depth: number } = {
  wall: 'east',
  from: 1.52,
  to: 3.4,
  depth: 2,
};

const WALLS: Wall[] = ['north', 'south', 'east', 'west'];
const EPS = 1e-9;

export function wallLength(room: Pick<Room, 'width' | 'depth'>, wall: Wall): number {
  return wall === 'north' || wall === 'south' ? room.width : room.depth;
}

function fail(msg: string): never {
  throw new Error(`apartment.json: ${msg}`);
}

type Obj = Record<string, unknown>;

function obj(v: unknown, where: string): Obj {
  if (typeof v !== 'object' || v === null) fail(`${where} deve essere un oggetto`);
  return v as Obj;
}

function reqNum(o: Obj, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}${key} deve essere un numero`);
  return v;
}

function reqStr(o: Obj, key: string, where: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '') fail(`${where}${key} deve essere una stringa`);
  return v;
}

function reqWall(o: Obj, where: string): Wall {
  const v = o.wall;
  if (!WALLS.includes(v as Wall)) fail(`${where}wall deve essere north|south|east|west`);
  return v as Wall;
}

function parseDoor(v: unknown, where: string): DoorSpec | null {
  if (v === undefined || v === null) return null;
  const d = obj(v, `${where}door`);
  if (d.hinge !== 'from' && d.hinge !== 'to') fail(`${where}door.hinge deve essere from|to`);
  if (d.swing !== 'in' && d.swing !== 'out') fail(`${where}door.swing deve essere in|out`);
  return { hinge: d.hinge, swing: d.swing, glazed: d.glazed === true };
}

function parseOpening(v: unknown, i: number): Opening {
  const o = obj(v, `room.openings[${i}]`);
  const where = `room.openings[${i}].`;
  return {
    id: reqStr(o, 'id', where),
    name: reqStr(o, 'name', where),
    wall: reqWall(o, where),
    from: reqNum(o, 'from', where),
    to: reqNum(o, 'to', where),
    height: reqNum(o, 'height', where),
    transom: o.transom === undefined ? 0 : reqNum(o, 'transom', where),
    door: parseDoor(o.door, where),
  };
}

function parseFixture(v: unknown, i: number): Fixture {
  const o = obj(v, `room.fixtures[${i}]`);
  const where = `room.fixtures[${i}].`;
  if (o.type !== 'radiator') fail(`${where}type deve essere radiator`);
  return {
    id: reqStr(o, 'id', where),
    type: 'radiator',
    wall: reqWall(o, where),
    from: reqNum(o, 'from', where),
    to: reqNum(o, 'to', where),
    height: reqNum(o, 'height', where),
    depth: reqNum(o, 'depth', where),
    elevation: reqNum(o, 'elevation', where),
  };
}

function validate(apt: Apartment): void {
  const { room, ceilingHeight } = apt;
  const items = [...room.openings, ...room.fixtures];
  const ids = new Set<string>();
  for (const it of items) {
    if (ids.has(it.id)) fail(`id duplicato "${it.id}"`);
    ids.add(it.id);
    const len = wallLength(room, it.wall);
    if (it.from < -EPS || it.to > len + EPS || it.from >= it.to) {
      fail(`"${it.id}" è fuori dalla parete ${it.wall} (lunga ${len} m)`);
    }
  }
  for (const o of room.openings) {
    if (o.height + o.transom > ceilingHeight + EPS) fail(`"${o.id}" supera l'altezza del soffitto`);
  }
  for (const f of room.fixtures) {
    if (f.elevation + f.height > ceilingHeight + EPS) fail(`"${f.id}" supera l'altezza del soffitto`);
  }
  for (const wall of WALLS) {
    const onWall = items.filter((it) => it.wall === wall).sort((a, b) => a.from - b.from);
    for (let i = 1; i < onWall.length; i++) {
      if (onWall[i].from < onWall[i - 1].to - EPS) {
        fail(`"${onWall[i - 1].id}" e "${onWall[i].id}" si sovrappongono sulla parete ${wall}`);
      }
    }
  }
}

export function parseApartment(raw: unknown): Apartment {
  const r = obj(raw, 'radice');
  const room = obj(r.room, 'room');
  const openings = room.openings;
  const fixtures = room.fixtures ?? [];
  if (!Array.isArray(openings)) fail('room.openings deve essere una lista');
  if (!Array.isArray(fixtures)) fail('room.fixtures deve essere una lista');
  const floor = room.floor === undefined ? {} : obj(room.floor, 'room.floor');
  const apt: Apartment = {
    ceilingHeight: reqNum(r, 'ceiling_height', ''),
    wallThickness: reqNum(r, 'wall_thickness', ''),
    room: {
      id: reqStr(room, 'id', 'room.'),
      name: reqStr(room, 'name', 'room.'),
      width: reqNum(room, 'width', 'room.'),
      depth: reqNum(room, 'depth', 'room.'),
      floorMaterial: typeof floor.material === 'string' ? floor.material : 'marble',
      openings: openings.map(parseOpening),
      fixtures: fixtures.map(parseFixture),
    },
  };
  validate(apt);
  return apt;
}

export async function loadApartment(url: string): Promise<Apartment> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Impossibile caricare ${url} (HTTP ${res.status})`);
  return parseApartment(await res.json());
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/apartment.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add data/apartment.json src/data/apartment.ts tests/apartment.test.ts assets/floor-plan.svg
git commit -m "feat: apartment model for the ingresso with validation"
```

---

### Task 3: Filters, sorting and extents

**Files:**
- Create: `src/data/filters.ts`
- Test: `tests/filters.test.ts`

**Interfaces:**
- Consumes: `Stove`, `EnergyClass` (types), `FREE_WALL` (apartment.ts), `stove()` fixture.
- Produces:
  - `type RangeKey = 'kw' | 'price' | 'width' | 'depth' | 'height'`; `RANGE_KEYS: RangeKey[]`
  - `interface Range { min: number; max: number }`
  - `interface FilterState { categories: Set<string>; brands: Set<string>; ranges: Record<RangeKey, Range | null>; minStars: number | null; energyClasses: Set<EnergyClass>; onlyWithSafety: boolean; onlyWithPrice: boolean; onlyWithOven: boolean; fitsFreeWall: boolean; text: string }`
  - `defaultFilters(categories: Record<string,string>): FilterState`
  - `rangeValue(s: Stove, key: RangeKey): number | null`
  - `fitsFreeWall(s: Stove): boolean`
  - `interface FilterResult { visible: Stove[]; hiddenMissingData: number; noDims: number }`
  - `applyFilters(stoves: Stove[], f: FilterState): FilterResult`
  - `type SortKey = 'price' | 'kw' | 'width' | 'name'`; `sortStoves(stoves: Stove[], key: SortKey): Stove[]`
  - `extents(stoves: Stove[]): Record<RangeKey, Range>`

Semantics: an empty `brands` / `energyClasses` set means "all". A `null` range is untouched (stoves with null values pass); a non-null range excludes stoves whose value is null. `hiddenMissingData` = stoves with dims that pass when null values are treated as passing but fail strictly. Stoves without dims are never visible; `noDims` counts them.

- [ ] **Step 1: Write the failing tests**

`tests/filters.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyFilters, defaultFilters, extents, fitsFreeWall, sortStoves, type FilterState } from '../src/data/filters';
import { stove } from './fixtures';

const CATS = { stove: 'Stufa', insert: 'Inserto', cookstove: 'Cucina' };
const base = (): FilterState => defaultFilters(CATS);
const ids = (r: { visible: { id: string }[] }) => r.visible.map((s) => s.id);

describe('defaultFilters', () => {
  it('enables every category except insert', () => {
    expect([...base().categories].sort()).toEqual(['cookstove', 'stove']);
  });
});

describe('applyFilters', () => {
  const a = stove({ id: 'a', brand: 'Alfa', model: 'Uno', kw: 8, price: 2000, category: 'stove' });
  const b = stove({ id: 'b', brand: 'Beta', model: 'Due', kw: 12, price: null, category: 'cookstove', hasOven: true });
  const c = stove({ id: 'c', brand: 'Alfa', model: 'Tre', kw: null, price: 3000, category: 'insert' });
  const noDims = stove({ id: 'n', dims: null });
  const all = [a, b, c, noDims];

  it('hides stoves without dims and counts them', () => {
    const r = applyFilters(all, base());
    expect(ids(r)).toEqual(['a', 'b']);
    expect(r.noDims).toBe(1);
  });

  it('untouched ranges let nulls through; narrowed ranges exclude them and count them', () => {
    const f = base();
    f.categories.add('insert');
    expect(ids(applyFilters(all, f))).toEqual(['a', 'b', 'c']);
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
    expect(ids(applyFilters(all, p))).toEqual(['a']);

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
});

describe('fitsFreeWall', () => {
  it('accepts footprints that fit in either orientation', () => {
    expect(fitsFreeWall(stove({ dims: { w: 0.5, d: 0.43, h: 1.2 } }))).toBe(true);
    expect(fitsFreeWall(stove({ dims: { w: 1.95, d: 0.6, h: 1 } }))).toBe(true);
    expect(fitsFreeWall(stove({ dims: { w: 2.1, d: 1.9, h: 1 } }))).toBe(false);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/filters.test.ts`
Expected: FAIL — cannot resolve `../src/data/filters`.

- [ ] **Step 3: Implement `src/data/filters.ts`**

```ts
import { FREE_WALL } from './apartment';
import type { EnergyClass, Stove } from './types';

export type RangeKey = 'kw' | 'price' | 'width' | 'depth' | 'height';
export const RANGE_KEYS: RangeKey[] = ['kw', 'price', 'width', 'depth', 'height'];

export interface Range {
  min: number;
  max: number;
}

export interface FilterState {
  categories: Set<string>;
  brands: Set<string>;
  ranges: Record<RangeKey, Range | null>;
  minStars: number | null;
  energyClasses: Set<EnergyClass>;
  onlyWithSafety: boolean;
  onlyWithPrice: boolean;
  onlyWithOven: boolean;
  fitsFreeWall: boolean;
  text: string;
}

export interface FilterResult {
  visible: Stove[];
  hiddenMissingData: number;
  noDims: number;
}

export type SortKey = 'price' | 'kw' | 'width' | 'name';

export function defaultFilters(categories: Record<string, string>): FilterState {
  return {
    categories: new Set(Object.keys(categories).filter((c) => c !== 'insert')),
    brands: new Set(),
    ranges: { kw: null, price: null, width: null, depth: null, height: null },
    minStars: null,
    energyClasses: new Set(),
    onlyWithSafety: false,
    onlyWithPrice: false,
    onlyWithOven: false,
    fitsFreeWall: false,
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

export function fitsFreeWall(s: Stove): boolean {
  if (!s.dims) return false;
  const len = FREE_WALL.to - FREE_WALL.from;
  const { w, d } = s.dims;
  return (w <= len && d <= FREE_WALL.depth) || (d <= len && w <= FREE_WALL.depth);
}

/** `lenient` treats null values as passing the data-dependent filters (ranges, stars, energy class). */
function passes(s: Stove, f: FilterState, lenient: boolean): boolean {
  if (!f.categories.has(s.category)) return false;
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
  if (f.fitsFreeWall && !fitsFreeWall(s)) return false;
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
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/filters.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/filters.ts tests/filters.test.ts
git commit -m "feat: stove filters, sorting and extents"
```

---

### Task 4: Shortlist store and URL state

**Files:**
- Create: `src/data/shortlist.ts`, `src/data/urlState.ts`
- Test: `tests/shortlist.test.ts`, `tests/urlState.test.ts`

**Interfaces:**
- Produces:
  - `interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }`
  - `SHORTLIST_KEY = 'stufa3d.shortlist'`
  - `safeLocalStorage(): KeyValueStore | null`
  - `class Shortlist { constructor(store: KeyValueStore | null); ids(): string[]; has(id): boolean; add(id): void; remove(id): void; toggle(id): void; move(id, delta: -1 | 1): void; merge(ids: string[]): void; onChange(cb: () => void): () => void }`
  - `interface ViewerState { stove: string | null; x: number | null; z: number | null; r: number | null; doors: string[]; shortlist: string[]; buffer: boolean }`
  - `EMPTY_STATE: ViewerState`
  - `decodeState(search: string): ViewerState`, `encodeState(s: ViewerState): string` (returns `''` or `'?…'`)

- [ ] **Step 1: Write the failing tests**

`tests/shortlist.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { Shortlist, SHORTLIST_KEY, type KeyValueStore } from '../src/data/shortlist';

function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('Shortlist', () => {
  it('adds, removes, toggles and persists', () => {
    const store = memStore();
    const s = new Shortlist(store);
    s.add('a');
    s.add('b');
    s.add('a');
    expect(s.ids()).toEqual(['a', 'b']);
    s.toggle('a');
    expect(s.ids()).toEqual(['b']);
    s.toggle('c');
    expect(JSON.parse(store.data[SHORTLIST_KEY])).toEqual(['b', 'c']);
    s.remove('b');
    expect(s.has('b')).toBe(false);
  });

  it('reads existing data and ignores garbage', () => {
    expect(new Shortlist(memStore({ [SHORTLIST_KEY]: '["x",1,"y"]' })).ids()).toEqual(['x', 'y']);
    expect(new Shortlist(memStore({ [SHORTLIST_KEY]: '{not json' })).ids()).toEqual([]);
  });

  it('moves items within bounds', () => {
    const s = new Shortlist(memStore());
    s.merge(['a', 'b', 'c']);
    s.move('c', -1);
    expect(s.ids()).toEqual(['a', 'c', 'b']);
    s.move('a', -1);
    expect(s.ids()).toEqual(['a', 'c', 'b']);
    s.move('b', 1);
    expect(s.ids()).toEqual(['a', 'c', 'b']);
  });

  it('merges without duplicates and notifies once', () => {
    const s = new Shortlist(memStore());
    s.add('a');
    const cb = vi.fn();
    s.onChange(cb);
    s.merge(['b', 'a', 'c']);
    expect(s.ids()).toEqual(['a', 'b', 'c']);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('works in memory when storage throws', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    const s = new Shortlist(broken);
    s.add('a');
    s.add('b');
    expect(s.ids()).toEqual(['a', 'b']);
  });

  it('works with no storage at all', () => {
    const s = new Shortlist(null);
    s.add('a');
    expect(s.ids()).toEqual(['a']);
  });
});
```

`tests/urlState.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeState, EMPTY_STATE, encodeState } from '../src/data/urlState';

describe('urlState', () => {
  it('round-trips a full state', () => {
    const s = { stove: 'eva-calor-alberta', x: 1.234, z: 2.5, r: 90, doors: ['entrata', 'cucina'], shortlist: ['a', 'b'], buffer: false };
    expect(decodeState(encodeState(s))).toEqual(s);
  });

  it('encodes the empty state as an empty string', () => {
    expect(encodeState(EMPTY_STATE)).toBe('');
    expect(decodeState('')).toEqual(EMPTY_STATE);
  });

  it('rounds numbers', () => {
    expect(encodeState({ ...EMPTY_STATE, x: 1.23456, r: 12.345 })).toBe('?x=1.235&r=12.3');
  });

  it('ignores garbage values', () => {
    const s = decodeState('?x=abc&z=&r=Infinity&doors=,,entrata,&buffer=maybe&stove=');
    expect(s).toEqual({ ...EMPTY_STATE, doors: ['entrata'] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shortlist.test.ts tests/urlState.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/data/shortlist.ts`**

```ts
export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const SHORTLIST_KEY = 'stufa3d.shortlist';

export function safeLocalStorage(): KeyValueStore | null {
  try {
    const ls = window.localStorage;
    ls.setItem('__stufa3d', '1');
    ls.removeItem('__stufa3d');
    return ls;
  } catch {
    return null;
  }
}

export class Shortlist {
  private list: string[];
  private listeners = new Set<() => void>();

  constructor(private store: KeyValueStore | null) {
    this.list = this.read();
  }

  private read(): string[] {
    try {
      const v: unknown = JSON.parse(this.store?.getItem(SHORTLIST_KEY) ?? '[]');
      return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
    } catch {
      return [];
    }
  }

  private commit(): void {
    try {
      this.store?.setItem(SHORTLIST_KEY, JSON.stringify(this.list));
    } catch {
      this.store = null;
    }
    this.listeners.forEach((l) => l());
  }

  ids(): string[] {
    return [...this.list];
  }

  has(id: string): boolean {
    return this.list.includes(id);
  }

  add(id: string): void {
    if (this.has(id)) return;
    this.list.push(id);
    this.commit();
  }

  remove(id: string): void {
    if (!this.has(id)) return;
    this.list = this.list.filter((x) => x !== id);
    this.commit();
  }

  toggle(id: string): void {
    if (this.has(id)) this.remove(id);
    else this.add(id);
  }

  move(id: string, delta: -1 | 1): void {
    const i = this.list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.list.length) return;
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this.commit();
  }

  merge(ids: string[]): void {
    const missing = ids.filter((id, i) => !this.has(id) && ids.indexOf(id) === i);
    if (!missing.length) return;
    this.list.push(...missing);
    this.commit();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
```

- [ ] **Step 4: Implement `src/data/urlState.ts`**

```ts
export interface ViewerState {
  stove: string | null;
  x: number | null;
  z: number | null;
  r: number | null;
  doors: string[];
  shortlist: string[];
  buffer: boolean;
}

export const EMPTY_STATE: ViewerState = { stove: null, x: null, z: null, r: null, doors: [], shortlist: [], buffer: true };

function numParam(p: URLSearchParams, key: string): number | null {
  const v = p.get(key);
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function listParam(p: URLSearchParams, key: string): string[] {
  return (p.get(key) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function decodeState(search: string): ViewerState {
  const p = new URLSearchParams(search);
  const stove = p.get('stove')?.trim() || null;
  return {
    stove,
    x: numParam(p, 'x'),
    z: numParam(p, 'z'),
    r: numParam(p, 'r'),
    doors: listParam(p, 'doors'),
    shortlist: listParam(p, 'shortlist'),
    buffer: p.get('buffer') !== '0',
  };
}

export function encodeState(s: ViewerState): string {
  const p = new URLSearchParams();
  if (s.stove) p.set('stove', s.stove);
  if (s.x !== null) p.set('x', String(Number(s.x.toFixed(3))));
  if (s.z !== null) p.set('z', String(Number(s.z.toFixed(3))));
  if (s.r !== null) p.set('r', String(Number(s.r.toFixed(1))));
  if (s.doors.length) p.set('doors', s.doors.join(','));
  if (s.shortlist.length) p.set('shortlist', s.shortlist.join(','));
  if (!s.buffer) p.set('buffer', '0');
  const q = p.toString().replace(/%2C/g, ',');
  return q ? `?${q}` : '';
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/shortlist.test.ts tests/urlState.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/shortlist.ts src/data/urlState.ts tests/shortlist.test.ts tests/urlState.test.ts
git commit -m "feat: shortlist store and URL state encoding"
```

---
### Task 5: Scene foundation — renderer, room, camera, viewer page

**Files:**
- Create: `src/scene/setup.ts`, `src/scene/room.ts`, `src/scene/camera.ts`
- Create: `src/ui/dom.ts`, `src/ui/fatal.ts`, `src/ui/viewPanel.ts`
- Create: `index.html`, `src/style.css`, `src/viewer.ts`
- Test: `tests/room.test.ts`

**Interfaces:**
- Consumes: `Apartment`, `Room`, `Wall` (types); `wallLength`, `loadApartment` (apartment.ts).
- Produces:
  - `createViewer(canvas): Viewer` with `Viewer { renderer; scene; root: THREE.Group; onFrame(cb: (dt: number) => void): void; onResize(cb: (w: number, h: number) => void): void; start(getCamera: () => THREE.Camera): void }`
  - `interface WallPiece { a0: number; a1: number; y0: number; y1: number }`; `wallPieces(room: Room, wall: Wall, ceiling: number, thickness: number): WallPiece[]`
  - `wallPoint(room: Pick<Room,'width'|'depth'>, wall: Wall, a: number, out?: number): { x: number; z: number }` (`out` > 0 goes into the wall, < 0 into the room)
  - `wallYaw(wall: Wall): number` (rotation.y mapping local +X onto the wall's along-axis)
  - `buildRoom(apt: Apartment): RoomView` with `RoomView { group: THREE.Group; walls: Map<Wall, THREE.Group>; setCeilingVisible(v: boolean): void; updateCutaway(cam: { x: number; z: number }): void }`
  - `type ViewMode = '3d' | 'plan'`; `class CameraRig { constructor(dom: HTMLElement, room: { width: number; depth: number; ceiling: number }); mode: ViewMode; get camera(): THREE.Camera; get controls(): OrbitControls; setMode(m: ViewMode): void; reset(): void; resize(w: number, h: number): void }`
  - `el(tag, props?, ...children)` DOM helper; `showFatal(message: string, retry: () => void): void`; `renderViewPanel(container, { setMode, reset }): void`
  - `src/viewer.ts` contains the anchor comments `// [doors]` and `// [stove]` that later tasks replace.

- [ ] **Step 1: Write the failing room tests**

`tests/room.test.ts`:
```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/room.test.ts`
Expected: FAIL — cannot resolve `../src/scene/room`.

- [ ] **Step 3: Implement `src/scene/room.ts`**

```ts
import * as THREE from 'three';
import { wallLength } from '../data/apartment';
import type { Apartment, Room, Wall } from '../data/types';

export interface WallPiece {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

export interface RoomView {
  group: THREE.Group;
  walls: Map<Wall, THREE.Group>;
  setCeilingVisible(visible: boolean): void;
  updateCutaway(cam: { x: number; z: number }): void;
}

const WALLS: Wall[] = ['north', 'south', 'east', 'west'];
const OUTWARD: Record<Wall, { x: number; z: number }> = {
  south: { x: 0, z: -1 },
  north: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  east: { x: 1, z: 0 },
};

/**
 * Solid parts of one wall in along-coordinates (x for north/south, z for east/west).
 * North/south walls run past the corners by the wall thickness so the corners close.
 */
export function wallPieces(room: Room, wall: Wall, ceiling: number, thickness: number): WallPiece[] {
  const len = wallLength(room, wall);
  const ext = wall === 'north' || wall === 'south' ? thickness : 0;
  const openings = room.openings.filter((o) => o.wall === wall).sort((a, b) => a.from - b.from);
  const pieces: WallPiece[] = [];
  let cursor = -ext;
  for (const o of openings) {
    if (o.from > cursor) pieces.push({ a0: cursor, a1: o.from, y0: 0, y1: ceiling });
    const top = o.height + o.transom;
    if (top < ceiling) pieces.push({ a0: o.from, a1: o.to, y0: top, y1: ceiling });
    cursor = o.to;
  }
  if (len + ext > cursor) pieces.push({ a0: cursor, a1: len + ext, y0: 0, y1: ceiling });
  return pieces;
}

/** Point on the inner face of `wall` at along-coordinate `a`; `out` > 0 moves into the wall, < 0 into the room. */
export function wallPoint(room: Pick<Room, 'width' | 'depth'>, wall: Wall, a: number, out = 0): { x: number; z: number } {
  switch (wall) {
    case 'south':
      return { x: a, z: -out };
    case 'north':
      return { x: a, z: room.depth + out };
    case 'west':
      return { x: -out, z: a };
    case 'east':
      return { x: room.width + out, z: a };
  }
}

/** rotation.y that maps local +X onto the wall's along-axis (local Z then points across the wall). */
export function wallYaw(wall: Wall): number {
  return wall === 'north' || wall === 'south' ? 0 : -Math.PI / 2;
}

function marbleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d6d2ca';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 20 + Math.random() * 60;
    const shade = 170 + Math.floor(Math.random() * 70);
    g.fillStyle = `rgba(${shade},${shade - 4},${shade - 10},0.55)`;
    g.beginPath();
    const n = 5 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.6;
      const rr = r * (0.6 + Math.random() * 0.5);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(120,115,108,0.35)';
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1.5, 2.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildRoom(apt: Apartment): RoomView {
  const { room, ceilingHeight: H, wallThickness: T } = apt;
  const group = new THREE.Group();
  group.name = 'room';

  const wallMat = new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#5a2e1a', roughness: 0.45 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#dfe7ea', roughness: 0.55, transmission: 0.5, transparent: true, opacity: 0.75 });
  const voidMat = new THREE.MeshBasicMaterial({ color: '#0d0d0f' });
  const radMat = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.35 });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, map: marbleTexture() }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(room.width / 2, 0, room.depth / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const walls = new Map<Wall, THREE.Group>();
  for (const wall of WALLS) {
    const wg = new THREE.Group();
    wg.name = `wall-${wall}`;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, a: number, y: number, out: number) => {
      const m = new THREE.Mesh(geo, mat);
      const c = wallPoint(room, wall, a, out);
      m.position.set(c.x, y, c.z);
      m.rotation.y = wallYaw(wall);
      m.castShadow = true;
      m.receiveShadow = true;
      wg.add(m);
    };
    for (const p of wallPieces(room, wall, H, T)) {
      add(new THREE.BoxGeometry(p.a1 - p.a0, p.y1 - p.y0, T), wallMat, (p.a0 + p.a1) / 2, (p.y0 + p.y1) / 2, T / 2);
    }
    for (const o of room.openings.filter((x) => x.wall === wall)) {
      const top = o.height + o.transom;
      const mid = (o.from + o.to) / 2;
      const width = o.to - o.from;
      // Casing on the room side.
      add(new THREE.BoxGeometry(0.07, top, 0.02), woodMat, o.from - 0.035, top / 2, -0.01);
      add(new THREE.BoxGeometry(0.07, top, 0.02), woodMat, o.to + 0.035, top / 2, -0.01);
      add(new THREE.BoxGeometry(width + 0.14, 0.07, 0.02), woodMat, mid, top + 0.035, -0.01);
      if (o.transom > 0) {
        add(new THREE.BoxGeometry(width, 0.05, T), woodMat, mid, o.height + 0.025, T / 2);
        add(new THREE.BoxGeometry(width, o.transom - 0.05, 0.01), glassMat, mid, o.height + 0.05 + (o.transom - 0.05) / 2, T / 2);
      }
      // Dark threshold beyond the doorway: neighbouring rooms are not modelled.
      const threshold = new THREE.PlaneGeometry(width, 0.8);
      threshold.rotateX(-Math.PI / 2);
      add(threshold, voidMat, mid, 0.001, T + 0.4);
    }
    walls.set(wall, wg);
    group.add(wg);
  }

  for (const f of room.fixtures) {
    const len = f.to - f.from;
    const n = Math.max(3, Math.round(len / 0.06));
    const pitch = len / n;
    for (let i = 0; i < n; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(pitch * 0.75, f.height, f.depth), radMat);
      const c = wallPoint(room, f.wall, f.from + pitch * (i + 0.5), -(f.depth / 2 + 0.03));
      rib.position.set(c.x, f.elevation + f.height / 2, c.z);
      rib.rotation.y = wallYaw(f.wall);
      rib.castShadow = true;
      group.add(rib);
    }
  }

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(room.width, room.depth),
    new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(room.width / 2, H, room.depth / 2);
  group.add(ceiling);

  const light = new THREE.PointLight('#fff4e5', 25, 0, 2);
  light.position.set(room.width / 2, H - 0.3, room.depth / 2);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.002;
  group.add(light);

  return {
    group,
    walls,
    setCeilingVisible(visible) {
      ceiling.visible = visible;
    },
    updateCutaway(cam) {
      for (const [wall, wg] of walls) {
        const c = wallPoint(room, wall, wallLength(room, wall) / 2, T / 2);
        const n = OUTWARD[wall];
        wg.visible = (cam.x - c.x) * n.x + (cam.z - c.z) * n.z <= 0;
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/scene/setup.ts`**

```ts
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Viewer {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** Room-coordinate root (x east, z north, y up), mirrored on z so the plan reads north-up, east-right. */
  root: THREE.Group;
  onFrame(cb: (dt: number) => void): void;
  onResize(cb: (w: number, h: number) => void): void;
  start(getCamera: () => THREE.Camera): void;
}

export function createViewer(canvas: HTMLCanvasElement): Viewer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#202124');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8580', 0.5));

  const root = new THREE.Group();
  root.scale.z = -1;
  scene.add(root);

  const frameCbs: ((dt: number) => void)[] = [];
  const resizeCbs: ((w: number, h: number) => void)[] = [];
  let size = { w: 0, h: 0 };
  let last = performance.now();

  function checkResize(): void {
    const w = canvas.clientWidth;
    const h = Math.max(canvas.clientHeight, 1);
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
    resizeCbs.forEach((cb) => cb(w, h));
  }

  return {
    renderer,
    scene,
    root,
    onFrame: (cb) => void frameCbs.push(cb),
    onResize: (cb) => void resizeCbs.push(cb),
    start(getCamera) {
      renderer.setAnimationLoop(() => {
        checkResize();
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        frameCbs.forEach((cb) => cb(dt));
        renderer.render(scene, getCamera());
      });
    },
  };
}
```

- [ ] **Step 6: Implement `src/scene/camera.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ViewMode = '3d' | 'plan';

interface RoomBox {
  width: number;
  depth: number;
  ceiling: number;
}

/** Room coordinates → world coordinates (the scene root mirrors z). */
const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, -z);

export class CameraRig {
  readonly perspective = new THREE.PerspectiveCamera(55, 1, 0.05, 100);
  readonly plan = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  mode: ViewMode = '3d';
  private orbit3d: OrbitControls;
  private orbitPlan: OrbitControls;
  private aspect = 1;

  constructor(dom: HTMLElement, private room: RoomBox) {
    this.orbit3d = new OrbitControls(this.perspective, dom);
    this.orbit3d.enableDamping = true;
    this.orbit3d.minDistance = 1;
    this.orbit3d.maxDistance = 10;
    this.orbit3d.maxPolarAngle = Math.PI * 0.49;

    // Screen-up = room north (world −z) in plan view.
    this.plan.up.set(0, 0, -1);
    this.orbitPlan = new OrbitControls(this.plan, dom);
    this.orbitPlan.enableRotate = false;
    this.orbitPlan.screenSpacePanning = true;
    this.orbitPlan.enabled = false;
    this.reset();
  }

  get camera(): THREE.Camera {
    return this.mode === '3d' ? this.perspective : this.plan;
  }

  get controls(): OrbitControls {
    return this.mode === '3d' ? this.orbit3d : this.orbitPlan;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.orbit3d.enabled = mode === '3d';
    this.orbitPlan.enabled = mode === 'plan';
  }

  reset(): void {
    const { width, depth } = this.room;
    this.perspective.position.copy(toWorld(-1.6, 4.6, -2.2));
    this.orbit3d.target.copy(toWorld(width / 2, 0.9, depth / 2));
    this.orbit3d.update();

    this.plan.position.copy(toWorld(width / 2, 10, depth / 2));
    this.plan.zoom = 1;
    this.orbitPlan.target.copy(toWorld(width / 2, 0, depth / 2));
    this.plan.lookAt(this.orbitPlan.target);
    this.fitPlan();
    this.orbitPlan.update();
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.perspective.aspect = this.aspect;
    this.perspective.updateProjectionMatrix();
    this.fitPlan();
  }

  private fitPlan(): void {
    const margin = 0.8;
    const halfH = (this.room.depth + 2 * margin) / 2;
    const halfW = (this.room.width + 2 * margin) / 2;
    const hh = Math.max(halfH, halfW / this.aspect);
    this.plan.left = -hh * this.aspect;
    this.plan.right = hh * this.aspect;
    this.plan.top = hh;
    this.plan.bottom = -hh;
    this.plan.updateProjectionMatrix();
  }
}
```

- [ ] **Step 7: Implement the UI helpers**

`src/ui/dom.ts`:
```ts
type Child = Node | string | number | null | undefined | false;

/**
 * Tiny element factory. Props starting with "on" become listeners, "class" sets className,
 * known DOM properties are assigned (in insertion order: put `type`, `min`, `max` before `value`),
 * anything else becomes an attribute.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') node.className = String(v);
    else if (k in node) (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'number' ? String(c) : c);
  }
  return node;
}
```

`src/ui/fatal.ts`:
```ts
import { el } from './dom';

export function showFatal(message: string, retry: () => void): void {
  document.body.replaceChildren(
    el('div', { class: 'fatal' }, el('h1', {}, 'Qualcosa è andato storto'), el('p', {}, message), el('button', { class: 'primary', onclick: retry }, 'Riprova')),
  );
}
```

`src/ui/viewPanel.ts`:
```ts
import type { ViewMode } from '../scene/camera';
import { el } from './dom';

export function renderViewPanel(container: HTMLElement, h: { setMode(mode: ViewMode): void; reset(): void }): void {
  const b3d = el('button', { class: 'active' }, 'Vista 3D');
  const bPlan = el('button', {}, 'Pianta');
  const select = (mode: ViewMode) => {
    b3d.classList.toggle('active', mode === '3d');
    bPlan.classList.toggle('active', mode === 'plan');
    h.setMode(mode);
  };
  b3d.addEventListener('click', () => select('3d'));
  bPlan.addEventListener('click', () => select('plan'));
  container.append(el('div', { class: 'row' }, b3d, bPlan, el('button', { onclick: () => h.reset() }, 'Reset')));
}
```

- [ ] **Step 8: Write the page, styles and viewer entry**

`index.html`:
```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Stufa nell'ingresso</title>
  </head>
  <body>
    <div class="app">
      <aside class="sidebar">
        <header class="sidebar-head">
          <h1>Stufa nell'ingresso</h1>
          <a href="./compare.html" id="compare-link">Confronta</a>
        </header>
        <section id="filters"><h2>Filtri</h2></section>
        <section id="results"><h2>Risultati</h2></section>
        <section id="stove-card"><h2>Stufa selezionata</h2></section>
        <section id="placement"><h2>Posizionamento</h2></section>
        <section id="doors"><h2>Porte</h2></section>
        <section id="view"><h2>Vista</h2></section>
        <section id="share"><h2>Condividi</h2></section>
      </aside>
      <main class="stage"><canvas id="scene"></canvas></main>
    </div>
    <div id="toasts"></div>
    <script type="module" src="/src/viewer.ts"></script>
  </body>
</html>
```

`src/style.css` (covers every page and component in this plan):
```css
:root {
  --bg: #f7f6f3;
  --panel: #ffffff;
  --ink: #1f2328;
  --muted: #6b7280;
  --line: #e4e2dc;
  --accent: #c2410c;
  --best: #dcfce7;
  --star: #d97706;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  color: var(--ink);
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); }
a { color: var(--accent); }

.app { display: grid; grid-template-columns: 380px 1fr; height: 100vh; }
.sidebar { overflow-y: auto; background: var(--panel); border-right: 1px solid var(--line); padding: 0 16px 40px; }
.sidebar-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; position: sticky; top: 0; z-index: 2; background: var(--panel); padding: 12px 0 8px; }
.sidebar-head h1 { font-size: 17px; margin: 0; }
.sidebar section { border-top: 1px solid var(--line); padding: 10px 0; }
.sidebar h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 4px 0 8px; }
.stage { position: relative; min-width: 0; }
#scene { width: 100%; height: 100%; display: block; touch-action: none; }

button { font: inherit; font-size: 13px; padding: 5px 10px; border: 1px solid var(--line); background: #fff; border-radius: 6px; cursor: pointer; color: var(--ink); }
button:hover { border-color: #c9c6bd; }
button.active, button.primary { background: var(--ink); color: #fff; border-color: var(--ink); }
button:disabled { opacity: 0.45; cursor: default; }
input[type='text'], input[type='search'], select { font: inherit; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; width: 100%; }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.muted { color: var(--muted); font-size: 12px; }

/* Filters */
.filter-group { margin: 8px 0; }
.filter-group > label, .filter-group > .label { display: block; font-weight: 600; font-size: 12px; margin-bottom: 4px; }
.checks { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 13px; }
.checks.scroll { max-height: 120px; overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
.range-inputs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.range-inputs input { width: 100%; }
.range-out { float: right; font-weight: 400; color: var(--muted); }

/* Results */
.results-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
.results-head select { width: auto; }
.results-viewport { height: 320px; overflow-y: auto; position: relative; border: 1px solid var(--line); border-radius: 6px; }
.result { position: absolute; left: 0; right: 0; height: 56px; padding: 6px 8px; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; cursor: pointer; }
.result:hover { background: #faf9f6; }
.result.selected { background: #fff3e8; }
.result .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.result .meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.star { border: none; background: none; font-size: 18px; color: #c9c6bd; padding: 0 4px; }
.star.on { color: var(--star); }

/* Stove card */
.card h3 { margin: 0 0 2px; font-size: 16px; }
.card dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 8px 0; font-size: 13px; }
.card dt { color: var(--muted); }
.card dd { margin: 0; }
.card details { font-size: 12px; margin: 6px 0; }
.card .warn { color: var(--accent); font-size: 13px; }

/* Placement */
.dpad { display: grid; grid-template-columns: repeat(3, 72px); gap: 4px; justify-content: start; margin: 6px 0; }
.dpad button { padding: 6px 0; }
.distances { font-size: 12px; color: var(--muted); margin-top: 6px; }
.doors { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }

/* Toasts & fatal */
#toasts { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 6px; z-index: 10; }
.toast { background: var(--ink); color: #fff; padding: 8px 14px; border-radius: 8px; font-size: 13px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); }
.fatal { max-width: 480px; margin: 15vh auto; padding: 0 16px; text-align: center; }

/* Compare page */
.compare { padding: 16px; max-width: 100%; }
.compare header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.compare h1 { font-size: 20px; margin: 0; }
.table-wrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
table.cmp { border-collapse: collapse; font-size: 13px; min-width: 100%; }
table.cmp th, table.cmp td { border-bottom: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; min-width: 150px; }
table.cmp th:first-child, table.cmp td:first-child { position: sticky; left: 0; background: var(--panel); color: var(--muted); min-width: 160px; }
table.cmp tr.group td { background: #f1efe9; font-weight: 600; color: var(--ink); }
table.cmp td.best { background: var(--best); font-weight: 600; }
.col-actions { display: flex; gap: 4px; margin-top: 6px; }
.col-actions button { padding: 2px 6px; }
.footprints { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; }
.footprints figure { margin: 0; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
.footprints figcaption { font-size: 12px; margin-top: 4px; }
.footprint .wall { stroke: #2b2b2b; stroke-width: 6; }
.footprint .body { fill: #3a3a3c; }
.footprint .buffer { fill: rgba(245, 158, 11, 0.2); stroke: #f59e0b; stroke-dasharray: 4 3; }

@media (max-width: 800px) {
  .app { grid-template-columns: 1fr; grid-template-rows: 55vh auto; height: auto; }
  .stage { grid-row: 1; height: 55vh; }
  .sidebar { grid-row: 2; border-right: none; overflow: visible; }
}
```

`src/viewer.ts`:
```ts
import * as THREE from 'three';
import './style.css';
import { loadApartment } from './data/apartment';
import { CameraRig } from './scene/camera';
import { buildRoom } from './scene/room';
import { createViewer } from './scene/setup';
import { showFatal } from './ui/fatal';
import { renderViewPanel } from './ui/viewPanel';

const section = (id: string) => document.getElementById(id)!;

async function main(): Promise<void> {
  const apartment = await loadApartment('./data/apartment.json');
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
  const viewer = createViewer(canvas);
  const roomView = buildRoom(apartment);
  viewer.root.add(roomView.group);

  const rig = new CameraRig(canvas, { width: apartment.room.width, depth: apartment.room.depth, ceiling: apartment.ceilingHeight });
  viewer.onResize((w, h) => rig.resize(w, h));
  renderViewPanel(section('view'), {
    setMode: (mode) => {
      rig.setMode(mode);
      roomView.setCeilingVisible(mode === '3d');
    },
    reset: () => rig.reset(),
  });

  // [doors]

  // [stove]

  const camPos = new THREE.Vector3();
  viewer.onFrame(() => {
    rig.controls.update();
    rig.camera.getWorldPosition(camPos);
    const local = viewer.root.worldToLocal(camPos);
    roomView.updateCutaway({ x: local.x, z: local.z });
  });
  viewer.start(() => rig.camera);
}

main().catch((err: unknown) => showFatal(err instanceof Error ? err.message : String(err), () => location.reload()));
```

- [ ] **Step 9: Typecheck, build and check in the browser**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors, all tests PASS, build succeeds and `dist/data/apartment.json` exists.

Run: `npm run dev` and open the printed URL.
Expected: the ingresso renders with marble floor, white walls with five doorways (wood casings, glazed transom above the north door), the radiator at the south end of the east wall, dark thresholds beyond doorways. The walls between camera and room are hidden (cutaway). "Pianta" shows a top-down view with north up (entrance door at the bottom, soggiorno doorway on the right); "Reset" restores the view. If the scene is too dark or too bright, adjust `PointLight` intensity in `room.ts` and `environmentIntensity` in `setup.ts`.

Then check the error page: temporarily change `'./data/apartment.json'` in `viewer.ts` to `'./data/missing.json'`, reload, confirm the "Qualcosa è andato storto" page with a "Riprova" button, then revert the change.

- [ ] **Step 10: Commit**

```bash
git add index.html src/style.css src/viewer.ts src/scene src/ui tests/room.test.ts
git commit -m "feat: 3D ingresso with cutaway walls, orbit and plan views"
```

---

### Task 6: Doors that open and close

**Files:**
- Create: `src/scene/doors.ts`, `src/scene/pick.ts`, `src/ui/doorsPanel.ts`
- Modify: `src/viewer.ts` (replace `// [doors]`, add imports)
- Test: `tests/doors.test.ts`

**Interfaces:**
- Consumes: `wallPoint` (room.ts), `Apartment`, `Room`, `Opening`.
- Produces:
  - `interface DoorPose { hinge: { x: number; z: number }; width: number; closed: number; open: number }`
  - `doorPose(room: Room, o: Opening, thickness: number): DoorPose` (angles are `rotation.y` of a pivot whose leaf extends along local +X)
  - `leafDir(angle: number): { x: number; z: number }`
  - `class Doors { readonly group: THREE.Group; constructor(apt: Apartment); list(): { id: string; name: string }[]; isOpen(id: string): boolean; openIds(): string[]; setOpen(id: string, open: boolean, animate?: boolean): void; toggle(id: string): void; setAll(open: boolean): void; update(dt: number): void; pickables(): THREE.Object3D[]; idFromObject(obj: THREE.Object3D | null): string | null; onChange(cb: () => void): () => void }`
  - `pointerNdc(ev, dom): THREE.Vector2`, `pickAt(ev, dom, camera, objects): THREE.Intersection | null`, `onTap(dom, cb: (ev: PointerEvent) => void): void`
  - `renderDoorsPanel(container, doors: {id,name}[], h: { toggle(id: string): void; setAll(open: boolean): void }): { update(openIds: string[]): void }`

- [ ] **Step 1: Write the failing tests**

`tests/doors.test.ts`:
```ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/doors.test.ts`
Expected: FAIL — cannot resolve `../src/scene/doors`.

- [ ] **Step 3: Implement `src/scene/doors.ts`**

```ts
import * as THREE from 'three';
import type { Apartment, Opening, Room, Wall } from '../data/types';
import { wallPoint } from './room';

export interface DoorPose {
  hinge: { x: number; z: number };
  width: number;
  closed: number;
  open: number;
}

const INWARD: Record<Wall, { x: number; z: number }> = {
  south: { x: 0, z: 1 },
  north: { x: 0, z: -1 },
  west: { x: 1, z: 0 },
  east: { x: -1, z: 0 },
};
const SPEED = Math.PI / 2 / 0.3;

/** Direction of a leaf extending along local +X of a pivot with this rotation.y. */
export function leafDir(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: -Math.sin(angle) };
}

export function doorPose(room: Room, o: Opening, thickness: number): DoorPose {
  const door = o.door!;
  const hingeA = door.hinge === 'from' ? o.from : o.to;
  const freeA = door.hinge === 'from' ? o.to : o.from;
  // Leaves swinging in sit near the room face, leaves swinging out near the far face.
  const depthInWall = door.swing === 'in' ? 0.03 : thickness - 0.03;
  const hinge = wallPoint(room, o.wall, hingeA, depthInWall);
  const free = wallPoint(room, o.wall, freeA, depthInWall);
  const dx = free.x - hinge.x;
  const dz = free.z - hinge.z;
  const closed = Math.atan2(-dz, dx);
  // Adding +90° turns direction (dx, dz) into (dz, -dx).
  const inward = INWARD[o.wall];
  const target = door.swing === 'in' ? inward : { x: -inward.x, z: -inward.z };
  const plus = dz * target.x - dx * target.z > 0;
  return { hinge, width: Math.abs(o.to - o.from), closed, open: closed + (plus ? Math.PI / 2 : -Math.PI / 2) };
}

interface DoorEntry {
  id: string;
  name: string;
  pivot: THREE.Group;
  pose: DoorPose;
  target: number;
}

export class Doors {
  readonly group = new THREE.Group();
  private entries = new Map<string, DoorEntry>();
  private listeners = new Set<() => void>();

  constructor(apt: Apartment) {
    this.group.name = 'doors';
    const wood = new THREE.MeshStandardMaterial({ color: '#6b3a22', roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e8eef0', roughness: 0.5, transmission: 0.5, transparent: true, opacity: 0.7 });
    const brass = new THREE.MeshStandardMaterial({ color: '#c9b37e', metalness: 0.9, roughness: 0.3 });
    const arcMat = new THREE.LineDashedMaterial({ color: '#8a8f98', dashSize: 0.05, gapSize: 0.04 });

    for (const o of apt.room.openings) {
      if (!o.door) continue;
      const pose = doorPose(apt.room, o, apt.wallThickness);
      const pivot = new THREE.Group();
      pivot.position.set(pose.hinge.x, 0, pose.hinge.z);
      pivot.rotation.y = pose.closed;
      pivot.userData.doorId = o.id;

      const w = pose.width - 0.01;
      const h = o.height - 0.01;
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), wood);
      leaf.position.set(pose.width / 2, h / 2, 0);
      leaf.castShadow = true;
      pivot.add(leaf);
      if (o.door.glazed) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, h * 0.55, 0.045), glass);
        pane.position.set(pose.width / 2, h * 0.58, 0);
        pivot.add(pane);
      }
      for (const side of [1, -1]) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), brass);
        handle.position.set(pose.width - 0.12, 1.0, side * 0.035);
        pivot.add(handle);
      }
      this.group.add(pivot);

      if (o.door.swing === 'in') {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 24; i++) {
          const d = leafDir(pose.closed + ((pose.open - pose.closed) * i) / 24);
          pts.push(new THREE.Vector3(pose.hinge.x + d.x * pose.width, 0.003, pose.hinge.z + d.z * pose.width));
        }
        const arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), arcMat);
        arc.computeLineDistances();
        this.group.add(arc);
      }
      this.entries.set(o.id, { id: o.id, name: o.name, pivot, pose, target: pose.closed });
    }
  }

  list(): { id: string; name: string }[] {
    return [...this.entries.values()].map(({ id, name }) => ({ id, name }));
  }

  isOpen(id: string): boolean {
    const e = this.entries.get(id);
    return !!e && e.target === e.pose.open;
  }

  openIds(): string[] {
    return [...this.entries.keys()].filter((id) => this.isOpen(id));
  }

  setOpen(id: string, open: boolean, animate = true): void {
    const e = this.entries.get(id);
    if (!e) return;
    e.target = open ? e.pose.open : e.pose.closed;
    if (!animate) e.pivot.rotation.y = e.target;
    this.emit();
  }

  toggle(id: string): void {
    this.setOpen(id, !this.isOpen(id));
  }

  setAll(open: boolean): void {
    for (const e of this.entries.values()) e.target = open ? e.pose.open : e.pose.closed;
    this.emit();
  }

  update(dt: number): void {
    for (const e of this.entries.values()) {
      const cur = e.pivot.rotation.y;
      const diff = e.target - cur;
      if (Math.abs(diff) < 1e-4) {
        e.pivot.rotation.y = e.target;
        continue;
      }
      e.pivot.rotation.y = cur + Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
    }
  }

  pickables(): THREE.Object3D[] {
    return [...this.entries.values()].map((e) => e.pivot);
  }

  idFromObject(obj: THREE.Object3D | null): string | null {
    for (let o = obj; o; o = o.parent) {
      if (typeof o.userData.doorId === 'string') return o.userData.doorId;
    }
    return null;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/doors.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/scene/pick.ts` and `src/ui/doorsPanel.ts`**

`src/scene/pick.ts`:
```ts
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

export function pointerNdc(ev: { clientX: number; clientY: number }, dom: HTMLElement): THREE.Vector2 {
  const r = dom.getBoundingClientRect();
  return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
}

export function pickAt(
  ev: { clientX: number; clientY: number },
  dom: HTMLElement,
  camera: THREE.Camera,
  objects: THREE.Object3D[],
): THREE.Intersection | null {
  raycaster.setFromCamera(pointerNdc(ev, dom), camera);
  return raycaster.intersectObjects(objects, true)[0] ?? null;
}

/** Calls `cb` for a click that did not move (so orbit drags don't count as clicks). */
export function onTap(dom: HTMLElement, cb: (ev: PointerEvent) => void): void {
  let start: { x: number; y: number; t: number } | null = null;
  dom.addEventListener('pointerdown', (e) => {
    start = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  dom.addEventListener('pointerup', (e) => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5 && performance.now() - start.t < 400) cb(e);
    start = null;
  });
}
```

`src/ui/doorsPanel.ts`:
```ts
import { el } from './dom';

export function renderDoorsPanel(
  container: HTMLElement,
  doors: { id: string; name: string }[],
  h: { toggle(id: string): void; setAll(open: boolean): void },
): { update(openIds: string[]): void } {
  const buttons = new Map<string, HTMLButtonElement>();
  const list = el(
    'div',
    { class: 'doors' },
    ...doors.map((d) => {
      const b = el('button', { onclick: () => h.toggle(d.id) }, d.name);
      buttons.set(d.id, b);
      return b;
    }),
  );
  container.append(
    list,
    el('div', { class: 'row' }, el('button', { onclick: () => h.setAll(true) }, 'Apri tutte'), el('button', { onclick: () => h.setAll(false) }, 'Chiudi tutte')),
    el('p', { class: 'muted' }, 'Clicca una porta nella scena per aprirla o chiuderla.'),
  );
  return {
    update(openIds) {
      for (const [id, b] of buttons) {
        const open = openIds.includes(id);
        b.classList.toggle('active', open);
        b.title = open ? 'Aperta — clic per chiudere' : 'Chiusa — clic per aprire';
      }
    },
  };
}
```

- [ ] **Step 6: Wire doors into the viewer**

In `src/viewer.ts`, add these imports after `import { CameraRig } from './scene/camera';`:
```ts
import { Doors } from './scene/doors';
import { onTap, pickAt } from './scene/pick';
import { renderDoorsPanel } from './ui/doorsPanel';
```

Replace the line `  // [doors]` with:
```ts
  const doors = new Doors(apartment);
  viewer.root.add(doors.group);
  const doorsPanel = renderDoorsPanel(section('doors'), doors.list(), {
    toggle: (id) => doors.toggle(id),
    setAll: (open) => doors.setAll(open),
  });
  doors.onChange(() => doorsPanel.update(doors.openIds()));
  viewer.onFrame((dt) => doors.update(dt));
  onTap(canvas, (ev) => {
    const hit = pickAt(ev, canvas, rig.camera, doors.pickables());
    const id = doors.idFromObject(hit?.object ?? null);
    if (id) doors.toggle(id);
  });
```

- [ ] **Step 7: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run`, then `npm run dev`.
Expected: five closed doors; clicking a leaf animates it open (entrata and scale swing into the ingresso, cucina/soggiorno/disimpegno swing away into the dark thresholds); dashed swing arcs on the floor for entrata and scale; panel buttons highlight open doors; "Apri tutte"/"Chiudi tutte" work; orbit-dragging over a door does not toggle it.

- [ ] **Step 8: Commit**

```bash
git add src/scene/doors.ts src/scene/pick.ts src/ui/doorsPanel.ts src/viewer.ts tests/doors.test.ts
git commit -m "feat: doors that open and close with swing arcs"
```

---

### Task 7: Parametric stove model

**Files:**
- Create: `src/scene/stoveModel.ts`
- Test: `tests/stoveModel.test.ts`

**Interfaces:**
- Consumes: `Stove`, `Dims` (types); `stove()` fixture.
- Produces:
  - `interface Panel { kind: 'glass' | 'oven' | 'ash'; x0: number; x1: number; y0: number; y1: number }` (stove-local metres; front face)
  - `baseHeight(s: Stove): number` — 0.08 (legs) for `stove`, 0.06 (plinth) otherwise
  - `interface Collar { diameter: number; height: number; position: 'top' | 'rear'; center: { x: number; y: number; z: number } }`; `collarOf(s: Stove): Collar`
  - `frontLayout(s: Stove): Panel[]`
  - `buildStove(s: Stove): THREE.Group` — bounding box exactly `w × h × d`, min y 0, centred on x/z, front +z, throws if `dims` is null
  - `buildFlueHint(s: Stove, ceiling: number): THREE.Line` — dashed route from the collar to the ceiling (not part of the bbox)

- [ ] **Step 1: Write the failing tests**

`tests/stoveModel.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { baseHeight, buildFlueHint, buildStove, collarOf, frontLayout } from '../src/scene/stoveModel';
import { stove } from './fixtures';

function expectBox(obj: THREE.Object3D, w: number, h: number, d: number) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(w, 6);
  expect(size.y).toBeCloseTo(h, 6);
  expect(size.z).toBeCloseTo(d, 6);
  expect(box.min.y).toBeCloseTo(0, 6);
  expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 6);
  expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 6);
}

const dims = { w: 0.504, d: 0.433, h: 1.282 };

describe('buildStove bounding box', () => {
  it('box stove with top outlet', () => expectBox(buildStove(stove({ dims })), 0.504, 1.282, 0.433));
  it('round stove', () => expectBox(buildStove(stove({ dims: { w: 0.5, d: 0.5, h: 1.1 }, round: true })), 0.5, 1.1, 0.5));
  it('rear-only outlet', () => expectBox(buildStove(stove({ dims, flueOutlets: ['rear'] })), 0.504, 1.282, 0.433));
  it('cookstove with oven', () =>
    expectBox(buildStove(stove({ dims: { w: 0.9, d: 0.6, h: 0.85 }, category: 'cookstove', hasOven: true })), 0.9, 0.85, 0.6));
  it('storage stove on a plinth', () =>
    expectBox(buildStove(stove({ dims: { w: 0.7, d: 0.5, h: 1.6 }, category: 'storage_stove' })), 0.7, 1.6, 0.5));
  it('stove with oven', () => expectBox(buildStove(stove({ dims, hasOven: true })), 0.504, 1.282, 0.433));
  it('throws without dims', () => expect(() => buildStove(stove({ dims: null }))).toThrow(/dimensioni/));
});

describe('frontLayout', () => {
  const cases = [
    stove({ dims }),
    stove({ dims, hasOven: true }),
    stove({ dims: { w: 0.9, d: 0.6, h: 0.85 }, category: 'cookstove', hasOven: true }),
    stove({ dims: { w: 0.9, d: 0.6, h: 0.85 }, category: 'thermo_cookstove', hasOven: false }),
    stove({ dims: { w: 0.7, d: 0.5, h: 1.6 }, category: 'storage_stove' }),
  ];

  it('keeps every panel inside the front face, above the base', () => {
    for (const s of cases) {
      const { w, h } = s.dims!;
      for (const p of frontLayout(s)) {
        expect(p.x0).toBeGreaterThanOrEqual(-w / 2);
        expect(p.x1).toBeLessThanOrEqual(w / 2);
        expect(p.y0).toBeGreaterThanOrEqual(baseHeight(s));
        expect(p.y1).toBeLessThanOrEqual(h);
        expect(p.x1).toBeGreaterThan(p.x0);
        expect(p.y1).toBeGreaterThan(p.y0);
      }
    }
  });

  it('has exactly one fire glass, and an oven door when has_oven', () => {
    for (const s of cases) {
      const kinds = frontLayout(s).map((p) => p.kind);
      expect(kinds.filter((k) => k === 'glass')).toHaveLength(1);
      expect(kinds.includes('oven')).toBe(s.hasOven);
    }
  });
});

describe('collar and flue hint', () => {
  it('defaults to 150 mm on top when the outlet is unknown', () => {
    const c = collarOf(stove({ dims, flueDiameter: null, flueOutlets: [] }));
    expect(c.position).toBe('top');
    expect(c.diameter).toBeCloseTo(0.15);
    expect(c.center.y).toBeCloseTo(1.282 - c.height / 2);
  });

  it('uses the rear when only rear is listed', () => {
    const c = collarOf(stove({ dims, flueOutlets: ['rear'] }));
    expect(c.position).toBe('rear');
    expect(c.center.z).toBeCloseTo(-0.433 / 2 + c.height / 2);
  });

  it('caps the collar to the stove footprint', () => {
    expect(collarOf(stove({ dims: { w: 0.2, d: 0.2, h: 1 }, flueDiameter: 0.25 })).diameter).toBeCloseTo(0.16);
  });

  it('flue hint reaches the ceiling', () => {
    const line = buildFlueHint(stove({ dims }), 2.7);
    const pos = line.geometry.getAttribute('position');
    expect(pos.getY(pos.count - 1)).toBeCloseTo(2.7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/stoveModel.test.ts`
Expected: FAIL — cannot resolve `../src/scene/stoveModel`.

- [ ] **Step 3: Implement `src/scene/stoveModel.ts`**

```ts
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Stove } from '../data/types';

export interface Panel {
  kind: 'glass' | 'oven' | 'ash';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Collar {
  diameter: number;
  height: number;
  position: 'top' | 'rear';
  center: { x: number; y: number; z: number };
}

/** Depth of the door/frame layer on the front face. */
const FRONT = 0.012;
const COLLAR_H = 0.06;

const isCook = (s: Stove) => s.category === 'cookstove' || s.category === 'thermo_cookstove';

function dimsOf(s: Stove) {
  if (!s.dims) throw new Error(`La stufa ${s.id} non ha dimensioni`);
  return s.dims;
}

export function baseHeight(s: Stove): number {
  return s.category === 'stove' ? 0.08 : 0.06;
}

export function collarOf(s: Stove): Collar {
  const { w, d, h } = dimsOf(s);
  const diameter = Math.min(s.flueDiameter ?? 0.15, 0.8 * Math.min(w, d));
  const position = s.flueOutlets.length === 0 || s.flueOutlets.includes('top') ? 'top' : 'rear';
  const base = baseHeight(s);
  const bodyBack = position === 'rear' ? -d / 2 + COLLAR_H : -d / 2;
  const bodyZ = (bodyBack + d / 2 - FRONT) / 2;
  const center =
    position === 'top'
      ? { x: 0, y: h - COLLAR_H / 2, z: bodyZ }
      : { x: 0, y: base + (h - base) * 0.8, z: -d / 2 + COLLAR_H / 2 };
  return { diameter, height: COLLAR_H, position, center };
}

function bodyTop(s: Stove): number {
  return collarOf(s).position === 'top' ? dimsOf(s).h - COLLAR_H : dimsOf(s).h;
}

export function frontLayout(s: Stove): Panel[] {
  const { w } = dimsOf(s);
  const base = baseHeight(s);
  const H = bodyTop(s) - base;
  const at = (f: number) => base + f * H;
  if (isCook(s)) {
    const fx0 = -w / 2 + 0.06;
    const fx1 = fx0 + 0.36 * w;
    const panels: Panel[] = [
      { kind: 'glass', x0: fx0, x1: fx1, y0: at(0.45), y1: at(0.8) },
      { kind: 'ash', x0: fx0, x1: fx1, y0: at(0.08), y1: at(0.35) },
    ];
    if (s.hasOven) panels.push({ kind: 'oven', x0: fx1 + 0.05, x1: w / 2 - 0.06, y0: at(0.3), y1: at(0.8) });
    return panels;
  }
  if (s.category === 'storage_stove') return [{ kind: 'glass', x0: -0.2 * w, x1: 0.2 * w, y0: at(0.25), y1: at(0.55) }];
  if (s.hasOven) {
    return [
      { kind: 'glass', x0: -0.35 * w, x1: 0.35 * w, y0: at(0.55), y1: at(0.92) },
      { kind: 'oven', x0: -0.35 * w, x1: 0.35 * w, y0: at(0.1), y1: at(0.48) },
    ];
  }
  return [{ kind: 'glass', x0: -0.35 * w, x1: 0.35 * w, y0: at(0.4), y1: at(0.85) }];
}

let shared: ReturnType<typeof makeMaterials> | null = null;
function makeMaterials() {
  return {
    metal: new THREE.MeshStandardMaterial({ color: '#2a2a2c', metalness: 0.55, roughness: 0.6 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#e6dfd2', metalness: 0, roughness: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: '#121213', metalness: 0.6, roughness: 0.4 }),
    fireGlass: new THREE.MeshPhysicalMaterial({ color: '#1a120c', emissive: '#ff6a1a', emissiveIntensity: 0.35, roughness: 0.05, clearcoat: 1 }),
    ovenGlass: new THREE.MeshPhysicalMaterial({ color: '#0d0d0e', roughness: 0.05, clearcoat: 1 }),
    hob: new THREE.MeshStandardMaterial({ color: '#3a3a3c', metalness: 0.7, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1 }),
    handle: new THREE.MeshStandardMaterial({ color: '#9a9a9a', metalness: 0.9, roughness: 0.25 }),
    flue: new THREE.LineDashedMaterial({ color: '#9ca3af', dashSize: 0.06, gapSize: 0.05 }),
  };
}
const mats = () => (shared ??= makeMaterials());

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildStove(s: Stove): THREE.Group {
  const { w, d } = dimsOf(s);
  const m = mats();
  const g = new THREE.Group();
  g.name = `stove-${s.id}`;
  g.userData.stoveId = s.id;

  const base = baseHeight(s);
  const collar = collarOf(s);
  const top = bodyTop(s);
  const bodyBack = collar.position === 'rear' ? -d / 2 + COLLAR_H : -d / 2;
  const bodyFront = d / 2 - FRONT;
  const bodyD = bodyFront - bodyBack;
  const bodyZ = (bodyFront + bodyBack) / 2;
  const bodyH = top - base;
  const bodyMat = s.category === 'storage_stove' ? m.ceramic : m.metal;

  if (s.category === 'stove') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, base, 12), m.dark, sx * (w / 2 - 0.05), base / 2, bodyZ + sz * (bodyD / 2 - 0.05)));
      }
    }
  } else {
    g.add(mesh(new THREE.BoxGeometry(w - 0.02, base, bodyD - 0.02), m.dark, 0, base / 2, bodyZ));
  }

  if (s.round) {
    const body = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 48), bodyMat, 0, base + bodyH / 2, bodyZ);
    body.scale.set(w, bodyH, bodyD);
    g.add(body);
  } else {
    g.add(mesh(new RoundedBoxGeometry(w, bodyH, bodyD, 2, 0.015), bodyMat, 0, base + bodyH / 2, bodyZ));
  }

  if (isCook(s)) g.add(mesh(new THREE.BoxGeometry(w - 0.04, 0.006, bodyD - 0.04), m.hob, 0, top - 0.003, bodyZ));

  const collarMesh = mesh(new THREE.CylinderGeometry(collar.diameter / 2, collar.diameter / 2, COLLAR_H, 32), m.dark, collar.center.x, collar.center.y, collar.center.z);
  if (collar.position === 'rear') collarMesh.rotation.x = Math.PI / 2;
  g.add(collarMesh);

  for (const p of frontLayout(s)) {
    const pw = p.x1 - p.x0;
    const ph = p.y1 - p.y0;
    const cx = (p.x0 + p.x1) / 2;
    const cy = (p.y0 + p.y1) / 2;
    // Frame stops short of the front plane; glass and handle reach it.
    g.add(mesh(new THREE.BoxGeometry(pw, ph, FRONT * 0.7), m.dark, cx, cy, d / 2 - FRONT + (FRONT * 0.7) / 2));
    if (p.kind !== 'ash') {
      const glass = p.kind === 'glass' ? m.fireGlass : m.ovenGlass;
      g.add(mesh(new THREE.BoxGeometry(pw - 0.04, ph - 0.04, FRONT * 0.5), glass, cx, cy, d / 2 - FRONT * 0.25));
    }
    g.add(mesh(new THREE.BoxGeometry(0.02, Math.min(0.1, ph * 0.5), FRONT * 0.3), m.handle, p.x1 - 0.03, cy, d / 2 - FRONT * 0.15));
  }
  return g;
}

export function buildFlueHint(s: Stove, ceiling: number): THREE.Line {
  const c = collarOf(s);
  const { h } = dimsOf(s);
  const pts =
    c.position === 'top'
      ? [new THREE.Vector3(c.center.x, h, c.center.z), new THREE.Vector3(c.center.x, ceiling, c.center.z)]
      : [
          new THREE.Vector3(c.center.x, c.center.y, -dimsOf(s).d / 2),
          new THREE.Vector3(c.center.x, c.center.y, -dimsOf(s).d / 2 - 0.25),
          new THREE.Vector3(c.center.x, ceiling, -dimsOf(s).d / 2 - 0.25),
        ];
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats().flue);
  line.computeLineDistances();
  line.name = 'flue-hint';
  return line;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/stoveModel.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/stoveModel.ts tests/stoveModel.test.ts
git commit -m "feat: parametric stove model with exact bounding box"
```

---

### Task 8: Safety buffer

**Files:**
- Create: `src/scene/buffer.ts`
- Test: `tests/buffer.test.ts`

**Interfaces:**
- Consumes: `Dims`, `Safety`.
- Produces: `interface Extents { x0: number; x1: number; z0: number; z1: number }`; `bufferExtents(dims: Dims, safety: Safety | null): Extents | null`; `buildBuffer(dims: Dims, safety: Safety | null): THREE.Group | null` with children named `buffer-box`, `buffer-edges`, `buffer-floor`, `buffer-ceiling` (each only when its data exists).

- [ ] **Step 1: Write the failing tests**

`tests/buffer.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bufferExtents, buildBuffer } from '../src/scene/buffer';
import type { Safety } from '../src/data/types';

const dims = { w: 0.5, d: 0.4, h: 1.2 };
const full: Safety = { rear: 0.2, side: 0.4, front: 1.5, ceiling: 0.75, floorFront: 1, notes: null };
const names = (g: { children: { name: string }[] } | null) => (g ? g.children.map((c) => c.name).sort() : null);
const expectExtents = (got: ReturnType<typeof bufferExtents>, want: { x0: number; x1: number; z0: number; z1: number }) => {
  expect(got).not.toBeNull();
  for (const k of ['x0', 'x1', 'z0', 'z1'] as const) expect(got![k]).toBeCloseTo(want[k]);
};

describe('bufferExtents', () => {
  it('extends the footprint by each distance', () => {
    expectExtents(bufferExtents(dims, full), { x0: -0.65, x1: 0.65, z0: -0.4, z1: 1.7 });
  });

  it('treats null sides as zero, without defaults', () => {
    expectExtents(bufferExtents(dims, { ...full, rear: null, front: null }), { x0: -0.65, x1: 0.65, z0: -0.2, z1: 0.2 });
  });

  it('returns null when nothing horizontal is declared', () => {
    expect(bufferExtents(dims, null)).toBeNull();
    expect(bufferExtents(dims, { ...full, rear: null, side: null, front: null })).toBeNull();
  });
});

describe('buildBuffer', () => {
  it('builds every part for full data', () => {
    expect(names(buildBuffer(dims, full))).toEqual(['buffer-box', 'buffer-ceiling', 'buffer-edges', 'buffer-floor']);
  });

  it('draws nothing without safety data', () => {
    expect(buildBuffer(dims, null)).toBeNull();
    expect(buildBuffer(dims, { rear: null, side: null, front: null, ceiling: null, floorFront: null, notes: 'x' })).toBeNull();
  });

  it('keeps floor and ceiling parts when only those are declared', () => {
    expect(names(buildBuffer(dims, { rear: null, side: null, front: null, ceiling: 0.5, floorFront: 0.3, notes: null }))).toEqual([
      'buffer-ceiling',
      'buffer-floor',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/buffer.test.ts`
Expected: FAIL — cannot resolve `../src/scene/buffer`.

- [ ] **Step 3: Implement `src/scene/buffer.ts`**

```ts
import * as THREE from 'three';
import type { Dims, Safety } from '../data/types';

export interface Extents {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

const AMBER = '#f59e0b';

/** Stove-local extents (front +z) of the declared clearances; null fields add nothing. */
export function bufferExtents(dims: Dims, safety: Safety | null): Extents | null {
  if (!safety || (safety.rear === null && safety.side === null && safety.front === null)) return null;
  const side = safety.side ?? 0;
  return {
    x0: -dims.w / 2 - side,
    x1: dims.w / 2 + side,
    z0: -dims.d / 2 - (safety.rear ?? 0),
    z1: dims.d / 2 + (safety.front ?? 0),
  };
}

export function buildBuffer(dims: Dims, safety: Safety | null): THREE.Group | null {
  if (!safety) return null;
  const g = new THREE.Group();
  g.name = 'buffer';

  const ext = bufferExtents(dims, safety);
  if (ext) {
    const geo = new THREE.BoxGeometry(ext.x1 - ext.x0, dims.h, ext.z1 - ext.z0);
    const box = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.16, depthWrite: false }));
    box.name = 'buffer-box';
    box.position.set((ext.x0 + ext.x1) / 2, dims.h / 2, (ext.z0 + ext.z1) / 2);
    box.renderOrder = 2;
    g.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.7 }));
    edges.name = 'buffer-edges';
    edges.position.copy(box.position);
    g.add(edges);
  }

  if (safety.floorFront !== null) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(dims.w, safety.floorFront),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    );
    floor.name = 'buffer-floor';
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0.004, dims.d / 2 + safety.floorFront / 2);
    g.add(floor);
  }

  if (safety.ceiling !== null) {
    const y = dims.h + safety.ceiling;
    const hw = dims.w / 2;
    const hd = dims.d / 2;
    const pts = [
      new THREE.Vector3(-hw, y, -hd),
      new THREE.Vector3(hw, y, -hd),
      new THREE.Vector3(hw, y, hd),
      new THREE.Vector3(-hw, y, hd),
      new THREE.Vector3(-hw, y, -hd),
    ];
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.05, gapSize: 0.04 }));
    line.computeLineDistances();
    line.name = 'buffer-ceiling';
    g.add(line);
  }

  return g.children.length ? g : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/buffer.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/buffer.ts tests/buffer.test.ts
git commit -m "feat: safety-distance buffer without fallbacks"
```

---

### Task 9: Placement math

**Files:**
- Create: `src/scene/placement.ts` (pure functions only in this task; the controller is added in Task 10)
- Test: `tests/placement.test.ts`

**Interfaces:**
- Consumes: `Dims`, `Safety` (types); `FREE_WALL` (apartment.ts).
- Produces:
  - `interface Pose { x: number; z: number; r: number }`; `interface RoomRect { width: number; depth: number }`; `type NudgeDir = 'forward' | 'back' | 'left' | 'right'`; `interface WallDistances { west: number; east: number; south: number; north: number }`
  - `normaliseDeg(r): number` (→ [0, 360)), `yaw(r): number`, `facing(r): {x,z}`, `rightOf(r): {x,z}` (viewer's right when looking at the stove's front)
  - `halfExtents(r, dims: {w,d}): { hx: number; hz: number }`
  - `clampPose(p: Pose, dims: {w,d}, room: RoomRect): Pose`
  - `nudge(p, dir: NudgeDir, step: number, dims, room): Pose`
  - `rotateBy(p, delta: number, dims, room): Pose`
  - `distancesToWalls(p, dims, room): WallDistances`
  - `snapToNearestWall(p, dims, room, rearGap: number): Pose`
  - `initialPose(dims, safety: Safety | null, room): Pose`

- [ ] **Step 1: Write the failing tests**

`tests/placement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  clampPose,
  distancesToWalls,
  facing,
  halfExtents,
  initialPose,
  normaliseDeg,
  nudge,
  rightOf,
  rotateBy,
  snapToNearestWall,
} from '../src/scene/placement';

const room = { width: 2, depth: 3.4 };
const dims = { w: 0.5, d: 0.4, h: 1.2 };

const close = (a: { x: number; z: number }, b: { x: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};

describe('orientation', () => {
  it('r=0 faces west and turns clockwise on the plan', () => {
    close(facing(0), { x: -1, z: 0 });
    close(facing(90), { x: 0, z: 1 });
    close(facing(180), { x: 1, z: 0 });
    close(facing(270), { x: 0, z: -1 });
  });

  it("viewer's right when facing an east-wall stove is south", () => {
    close(rightOf(0), { x: 0, z: -1 });
    close(rightOf(90), { x: -1, z: 0 });
  });

  it('normalises degrees', () => {
    expect(normaliseDeg(-15)).toBe(345);
    expect(normaliseDeg(720)).toBe(0);
  });
});

describe('halfExtents', () => {
  it('swaps axes with rotation', () => {
    const a = halfExtents(0, dims);
    expect(a.hx).toBeCloseTo(0.2);
    expect(a.hz).toBeCloseTo(0.25);
    const b = halfExtents(90, dims);
    expect(b.hx).toBeCloseTo(0.25);
    expect(b.hz).toBeCloseTo(0.2);
    const c = halfExtents(45, dims);
    expect(c.hx).toBeCloseTo(0.45 * Math.SQRT1_2);
  });
});

describe('clampPose', () => {
  it('keeps the body inside the room', () => {
    const p = clampPose({ x: 5, z: -1, r: 0 }, dims, room);
    expect(p.x).toBeCloseTo(1.8);
    expect(p.z).toBeCloseTo(0.25);
    expect(p.r).toBe(0);
  });

  it('centres an axis the stove cannot fit on', () => {
    const p = clampPose({ x: 0.1, z: 1, r: 90 }, { w: 2.2, d: 0.5 }, room);
    expect(p.x).toBe(1);
    expect(Number.isFinite(p.z)).toBe(true);
  });

  it('normalises rotation', () => {
    expect(clampPose({ x: 1, z: 1, r: -90 }, dims, room).r).toBe(270);
  });
});

describe('nudge / rotate', () => {
  const p = { x: 1, z: 2, r: 0 };
  it('moves relative to the stove facing', () => {
    close(nudge(p, 'forward', 0.1, dims, room), { x: 0.9, z: 2 });
    close(nudge(p, 'back', 0.1, dims, room), { x: 1.1, z: 2 });
    close(nudge(p, 'right', 0.1, dims, room), { x: 1, z: 1.9 });
    close(nudge(p, 'left', 0.1, dims, room), { x: 1, z: 2.1 });
  });

  it('clamps after moving and rotating', () => {
    expect(nudge({ x: 1.75, z: 2, r: 0 }, 'back', 0.5, dims, room).x).toBeCloseTo(1.8);
    const r = rotateBy({ x: 1.8, z: 3.2, r: 0 }, 90, dims, room);
    expect(r.r).toBe(90);
    expect(r.x).toBeCloseTo(1.75);
    expect(r.z).toBeCloseTo(3.2);
  });
});

describe('walls', () => {
  it('measures body-to-wall distances', () => {
    const d = distancesToWalls({ x: 1.8, z: 2, r: 0 }, dims, room);
    expect(d.east).toBeCloseTo(0);
    expect(d.west).toBeCloseTo(1.6);
    expect(d.south).toBeCloseTo(1.75);
    expect(d.north).toBeCloseTo(1.15);
  });

  it('snaps the rear to the nearest wall with the rear gap', () => {
    const east = snapToNearestWall({ x: 1.5, z: 2, r: 45 }, dims, room, 0.2);
    expect(east.r).toBe(0);
    expect(east.x).toBeCloseTo(2 - 0.2 - 0.2);
    expect(east.z).toBeCloseTo(2);
    const south = snapToNearestWall({ x: 1, z: 0.3, r: 0 }, dims, room, 0);
    expect(south.r).toBe(90);
    expect(south.z).toBeCloseTo(0.2);
    const west = snapToNearestWall({ x: 0.3, z: 1.7, r: 0 }, dims, room, 0.1);
    expect(west.r).toBe(180);
    expect(west.x).toBeCloseTo(0.3);
    const north = snapToNearestWall({ x: 1, z: 3.2, r: 0 }, dims, room, 0);
    expect(north.r).toBe(270);
    expect(north.z).toBeCloseTo(3.2);
  });
});

describe('initialPose', () => {
  it('centres on the free east wall, respecting the rear distance', () => {
    const safety = { rear: 0.2, side: 0.4, front: 1.5, ceiling: null, floorFront: null, notes: null };
    const p = initialPose(dims, safety, room);
    expect(p.r).toBe(0);
    expect(p.x).toBeCloseTo(2 - 0.2 - 0.2);
    expect(p.z).toBeCloseTo(2.46);
  });

  it('touches the wall without safety data', () => {
    expect(initialPose(dims, null, room).x).toBeCloseTo(1.8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/placement.test.ts`
Expected: FAIL — cannot resolve `../src/scene/placement`.

- [ ] **Step 3: Implement the pure part of `src/scene/placement.ts`**

```ts
import { FREE_WALL } from '../data/apartment';
import type { Dims, Safety } from '../data/types';

export interface Pose {
  x: number;
  z: number;
  r: number;
}

export interface RoomRect {
  width: number;
  depth: number;
}

export type NudgeDir = 'forward' | 'back' | 'left' | 'right';

export interface WallDistances {
  west: number;
  east: number;
  south: number;
  north: number;
}

type Footprint = Pick<Dims, 'w' | 'd'>;

const DEG = Math.PI / 180;

export const normaliseDeg = (r: number): number => (((r % 360) + 360) % 360) + 0;

/** rotation.y of the stove holder: r = 0 faces west, increasing r turns clockwise on the north-up plan. */
export const yaw = (r: number): number => -Math.PI / 2 + r * DEG;

export function facing(r: number): { x: number; z: number } {
  const y = yaw(r);
  return { x: Math.sin(y), z: Math.cos(y) };
}

/** The viewer's right when standing in front of the stove, looking at it (= stove-local −X). */
export function rightOf(r: number): { x: number; z: number } {
  const y = yaw(r);
  return { x: -Math.cos(y), z: Math.sin(y) };
}

export function halfExtents(r: number, dims: Footprint): { hx: number; hz: number } {
  const y = yaw(r);
  const c = Math.abs(Math.cos(y));
  const s = Math.abs(Math.sin(y));
  return { hx: (c * dims.w) / 2 + (s * dims.d) / 2, hz: (s * dims.w) / 2 + (c * dims.d) / 2 };
}

const clampAxis = (v: number, half: number, len: number) => (2 * half >= len ? len / 2 : Math.min(Math.max(v, half), len - half));

export function clampPose(p: Pose, dims: Footprint, room: RoomRect): Pose {
  const r = normaliseDeg(p.r);
  const { hx, hz } = halfExtents(r, dims);
  return { x: clampAxis(p.x, hx, room.width), z: clampAxis(p.z, hz, room.depth), r };
}

export function nudge(p: Pose, dir: NudgeDir, step: number, dims: Footprint, room: RoomRect): Pose {
  const f = facing(p.r);
  const rt = rightOf(p.r);
  const v = dir === 'forward' ? f : dir === 'back' ? { x: -f.x, z: -f.z } : dir === 'right' ? rt : { x: -rt.x, z: -rt.z };
  return clampPose({ x: p.x + v.x * step, z: p.z + v.z * step, r: p.r }, dims, room);
}

export function rotateBy(p: Pose, delta: number, dims: Footprint, room: RoomRect): Pose {
  return clampPose({ ...p, r: p.r + delta }, dims, room);
}

export function distancesToWalls(p: Pose, dims: Footprint, room: RoomRect): WallDistances {
  const { hx, hz } = halfExtents(p.r, dims);
  return { west: p.x - hx, east: room.width - p.x - hx, south: p.z - hz, north: room.depth - p.z - hz };
}

export function snapToNearestWall(p: Pose, dims: Footprint, room: RoomRect, rearGap: number): Pose {
  const d: WallDistances = { west: p.x, east: room.width - p.x, south: p.z, north: room.depth - p.z };
  const wall = (Object.keys(d) as (keyof WallDistances)[]).reduce((a, b) => (d[b] < d[a] ? b : a));
  const back = rearGap + dims.d / 2;
  switch (wall) {
    case 'east':
      return clampPose({ x: room.width - back, z: p.z, r: 0 }, dims, room);
    case 'west':
      return clampPose({ x: back, z: p.z, r: 180 }, dims, room);
    case 'north':
      return clampPose({ x: p.x, z: room.depth - back, r: 270 }, dims, room);
    case 'south':
      return clampPose({ x: p.x, z: back, r: 90 }, dims, room);
  }
}

export function initialPose(dims: Footprint, safety: Safety | null, room: RoomRect): Pose {
  return clampPose({ x: room.width - (safety?.rear ?? 0) - dims.d / 2, z: (FREE_WALL.from + FREE_WALL.to) / 2, r: 0 }, dims, room);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/placement.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scene/placement.ts tests/placement.test.ts
git commit -m "feat: stove placement math (clamp, nudge, snap, wall distances)"
```

---
### Task 10: Place a stove — drag, rotate, nudge, snap

**Files:**
- Modify: `src/scene/placement.ts` (append `PlacementController`)
- Create: `src/ui/format.ts`, `src/ui/placementPanel.ts`
- Modify: `src/viewer.ts` (replace `// [stove]`, add imports)
- Test: `tests/format.test.ts`

**Interfaces:**
- Consumes: pure placement functions (Task 9), `pointerNdc` (pick.ts), `buildStove`, `buildFlueHint` (stoveModel.ts), `buildBuffer` (buffer.ts), `loadCatalogue` (stoves.ts), `CameraRig` (`rig.camera`, `rig.controls`).
- Produces:
  - `interface StoveHandle { object: THREE.Object3D; dims: Dims; safety: Safety | null }`
  - `class PlacementController { readonly holder: THREE.Group; constructor(opts: { dom: HTMLElement; root: THREE.Object3D; room: RoomRect; getCamera: () => THREE.Camera; getControls: () => { enabled: boolean } }); get dragging(): boolean; setStove(handle: StoveHandle | null, extras?: THREE.Object3D[]): void; getPose(): Pose | null; setPose(p: Pose): void; nudge(dir: NudgeDir, step: number): void; rotateBy(delta: number): void; snap(): void; distances(): WallDistances | null; onChange(cb: (p: Pose | null) => void): () => void }`
  - `format.ts`: `fmtCm(m: number | null)`, `fmtDims(d: Dims | null)`, `fmtPrice(p: number | null)`, `fmtKw(k: number | null)`, `fmtStars(n: number | null)`, `fmtPct(n: number | null)`, `sourceHref(file: string, page: number | null)`
  - `renderPlacementPanel(container, h: { nudge(dir: NudgeDir, step: number): void; rotate(delta: number): void; snap(): void }): { setDistances(d: WallDistances | null): void }`
  - In `viewer.ts`: `catalogue`, `byId: Map<string, Stove>`, `placement`, `current: Stove | null`, `bufferOn: boolean`, `showStove(s: Stove | null): void`, `setBuffer(on: boolean): void`, and anchors `// [sidebar]` and `// [url]`.

- [ ] **Step 1: Write the failing format tests**

`tests/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars, sourceHref } from '../src/ui/format';

describe('format', () => {
  it('formats lengths', () => {
    expect(fmtCm(0.456)).toBe('46 cm');
    expect(fmtCm(-0.004)).toBe('0 cm');
    expect(fmtCm(null)).toBe('—');
    expect(fmtDims({ w: 0.504, d: 0.433, h: 1.282 })).toBe('50 × 43 × 128 cm');
    expect(fmtDims(null)).toBe('—');
  });

  it('formats prices with Italian thousands separators', () => {
    expect(fmtPrice(2106)).toBe('2.106 €');
    expect(fmtPrice(710.4)).toBe('710 €');
    expect(fmtPrice(null)).toBe('—');
  });

  it('formats power, percentages and stars with Italian decimals', () => {
    expect(fmtKw(7.5)).toBe('7,5 kW');
    expect(fmtPct(86)).toBe('86 %');
    expect(fmtStars(4)).toBe('★★★★');
    expect(fmtStars(null)).toBe('—');
  });

  it('builds PDF links with page anchors', () => {
    expect(sourceHref('assets/catalogues/Eva Calor/x.pdf', 3)).toBe('./assets/catalogues/Eva%20Calor/x.pdf#page=3');
    expect(sourceHref('assets/catalogues/A/b.pdf', null)).toBe('./assets/catalogues/A/b.pdf');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — cannot resolve `../src/ui/format`.

- [ ] **Step 3: Implement `src/ui/format.ts`**

```ts
import type { Dims } from '../data/types';

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const comma = (n: number) => String(n).replace('.', ',');
const cm = (m: number) => Math.round(m * 100) + 0;

export const fmtCm = (m: number | null): string => (m === null ? '—' : `${cm(m)} cm`);
export const fmtDims = (d: Dims | null): string => (d ? `${cm(d.w)} × ${cm(d.d)} × ${cm(d.h)} cm` : '—');
export const fmtPrice = (p: number | null): string => (p === null ? '—' : `${thousands(Math.round(p))} €`);
export const fmtKw = (k: number | null): string => (k === null ? '—' : `${comma(k)} kW`);
export const fmtPct = (n: number | null): string => (n === null ? '—' : `${comma(n)} %`);
export const fmtStars = (n: number | null): string => (n === null ? '—' : '★'.repeat(n));

export function sourceHref(file: string, page: number | null): string {
  return `./${encodeURI(file)}${page ? `#page=${page}` : ''}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Append `PlacementController` to `src/scene/placement.ts`**

Add at the top of the file, above the existing imports:
```ts
import * as THREE from 'three';
import { pointerNdc } from './pick';
```

Append at the end of the file:
```ts
export interface StoveHandle {
  object: THREE.Object3D;
  dims: Dims;
  safety: Safety | null;
}

interface ControllerOptions {
  dom: HTMLElement;
  root: THREE.Object3D;
  room: RoomRect;
  getCamera: () => THREE.Camera;
  /** Active orbit controls; disabled while the stove is being dragged. */
  getControls: () => { enabled: boolean };
}

interface Drag {
  kind: 'move' | 'rotate';
  pointerId: number;
  dx: number;
  dz: number;
  phi0: number;
  r0: number;
}

/** Owns the stove holder (pose → transform) and the pointer interactions on it. */
export class PlacementController {
  readonly holder = new THREE.Group();
  private stove: StoveHandle | null = null;
  private ringHit: THREE.Mesh | null = null;
  private pose: Pose | null = null;
  private drag: Drag | null = null;
  private listeners = new Set<(p: Pose | null) => void>();
  private raycaster = new THREE.Raycaster();
  private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(private opts: ControllerOptions) {
    this.holder.name = 'stove-holder';
    opts.root.add(this.holder);
    opts.dom.addEventListener('pointerdown', this.onDown);
    opts.dom.addEventListener('pointermove', this.onMove);
    opts.dom.addEventListener('pointerup', this.onUp);
    opts.dom.addEventListener('pointercancel', this.onUp);
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** Shows a stove; keeps the current pose (re-clamped), or uses the initial pose the first time. */
  setStove(handle: StoveHandle | null, extras: THREE.Object3D[] = []): void {
    this.holder.clear();
    this.stove = handle;
    this.ringHit = null;
    if (!handle) {
      this.emit();
      return;
    }
    this.holder.add(handle.object, ...extras);
    const radius = Math.hypot(handle.dims.w, handle.dims.d) / 2 + 0.08;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: '#3b82f6' }));
    const hit = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.06, 6, 48),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    for (const m of [ring, hit]) {
      m.rotation.x = Math.PI / 2;
      m.position.y = 0.01;
    }
    this.holder.add(ring, hit);
    this.ringHit = hit;
    this.setPose(this.pose ?? initialPose(handle.dims, handle.safety, this.opts.room));
  }

  getPose(): Pose | null {
    return this.stove ? this.pose : null;
  }

  setPose(p: Pose): void {
    if (!this.stove) {
      this.pose = p;
      return;
    }
    this.pose = clampPose(p, this.stove.dims, this.opts.room);
    this.holder.position.set(this.pose.x, 0, this.pose.z);
    this.holder.rotation.y = yaw(this.pose.r);
    this.emit();
  }

  nudge(dir: NudgeDir, step: number): void {
    if (this.stove && this.pose) this.setPose(nudge(this.pose, dir, step, this.stove.dims, this.opts.room));
  }

  rotateBy(delta: number): void {
    if (this.stove && this.pose) this.setPose(rotateBy(this.pose, delta, this.stove.dims, this.opts.room));
  }

  snap(): void {
    if (this.stove && this.pose) {
      this.setPose(snapToNearestWall(this.pose, this.stove.dims, this.opts.room, this.stove.safety?.rear ?? 0));
    }
  }

  distances(): WallDistances | null {
    return this.stove && this.pose ? distancesToWalls(this.pose, this.stove.dims, this.opts.room) : null;
  }

  onChange(cb: (p: Pose | null) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    const p = this.getPose();
    this.listeners.forEach((l) => l(p));
  }

  private floorPoint(ev: PointerEvent): { x: number; z: number } | null {
    this.raycaster.setFromCamera(pointerNdc(ev, this.opts.dom), this.opts.getCamera());
    const hit = this.raycaster.ray.intersectPlane(this.floor, new THREE.Vector3());
    if (!hit) return null;
    const local = this.opts.root.worldToLocal(hit);
    return { x: local.x, z: local.z };
  }

  private onDown = (ev: PointerEvent): void => {
    if (!this.stove || !this.pose || ev.button !== 0) return;
    this.raycaster.setFromCamera(pointerNdc(ev, this.opts.dom), this.opts.getCamera());
    const onRing = !!this.ringHit && this.raycaster.intersectObject(this.ringHit, false).length > 0;
    const onStove = !onRing && this.raycaster.intersectObject(this.stove.object, true).length > 0;
    if (!onRing && !onStove) return;
    const p = this.floorPoint(ev);
    if (!p) return;
    this.drag = {
      kind: onRing ? 'rotate' : 'move',
      pointerId: ev.pointerId,
      dx: this.pose.x - p.x,
      dz: this.pose.z - p.z,
      phi0: Math.atan2(p.x - this.pose.x, p.z - this.pose.z) / DEG,
      r0: this.pose.r,
    };
    // OrbitControls also saw this pointerdown; disabling it makes it ignore the moves.
    this.opts.getControls().enabled = false;
  };

  private onMove = (ev: PointerEvent): void => {
    if (!this.drag || !this.pose || ev.pointerId !== this.drag.pointerId) return;
    const p = this.floorPoint(ev);
    if (!p) return;
    if (this.drag.kind === 'move') {
      this.setPose({ x: p.x + this.drag.dx, z: p.z + this.drag.dz, r: this.pose.r });
      return;
    }
    // Bearing from north towards east = clockwise on the plan, same sense as r.
    const phi = Math.atan2(p.x - this.pose.x, p.z - this.pose.z) / DEG;
    let r = this.drag.r0 + (phi - this.drag.phi0);
    if (ev.shiftKey) r = Math.round(r / 15) * 15;
    this.setPose({ ...this.pose, r });
  };

  private onUp = (ev: PointerEvent): void => {
    if (!this.drag || ev.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    this.opts.getControls().enabled = true;
  };
}
```

- [ ] **Step 6: Implement `src/ui/placementPanel.ts`**

```ts
import type { NudgeDir, WallDistances } from '../scene/placement';
import { el } from './dom';
import { fmtCm } from './format';

export interface PlacementHandlers {
  nudge(dir: NudgeDir, step: number): void;
  rotate(delta: number): void;
  snap(): void;
}

export function renderPlacementPanel(container: HTMLElement, h: PlacementHandlers): { setDistances(d: WallDistances | null): void } {
  const step = el('select', {}, ...[1, 5, 10].map((cm) => el('option', { value: String(cm), selected: cm === 5 }, `${cm} cm`)));
  const s = () => Number(step.value) / 100;
  const btn = (label: string, title: string, fn: () => void) => el('button', { title, onclick: fn }, label);
  const dpad = el(
    'div',
    { class: 'dpad' },
    el('span'),
    btn('↑ Avanti', 'Sposta in avanti', () => h.nudge('forward', s())),
    el('span'),
    btn('← Sinistra', 'Sposta a sinistra (guardando la stufa)', () => h.nudge('left', s())),
    btn('Attacca al muro', 'Appoggia il retro alla parete più vicina', () => h.snap()),
    btn('Destra →', 'Sposta a destra (guardando la stufa)', () => h.nudge('right', s())),
    el('span'),
    btn('↓ Indietro', 'Sposta indietro', () => h.nudge('back', s())),
    el('span'),
  );
  const rotate = el(
    'div',
    { class: 'row' },
    el('span', { class: 'muted' }, 'Ruota'),
    btn('↺ 15°', 'Ruota in senso antiorario', () => h.rotate(-15)),
    btn('15° ↻', 'Ruota in senso orario', () => h.rotate(15)),
    btn('90° ↻', 'Ruota di 90°', () => h.rotate(90)),
  );
  const distances = el('div', { class: 'distances' });
  const body = el(
    'div',
    {},
    el('div', { class: 'row' }, el('span', { class: 'muted' }, 'Passo'), step),
    dpad,
    rotate,
    distances,
    el('p', { class: 'muted' }, "Trascina la stufa per spostarla, l'anello blu per ruotarla (Maiusc = scatti di 15°)."),
  );
  container.append(body);

  const setDistances = (d: WallDistances | null) => {
    body.querySelectorAll('button').forEach((b) => (b.disabled = d === null));
    distances.textContent = d
      ? `Distanza dalle pareti — Nord ${fmtCm(d.north)} · Est ${fmtCm(d.east)} · Sud ${fmtCm(d.south)} · Ovest ${fmtCm(d.west)}`
      : 'Seleziona una stufa per posizionarla.';
  };
  setDistances(null);
  return { setDistances };
}
```

In `src/style.css`, replace the `.dpad` rule with:
```css
.dpad { display: grid; grid-template-columns: repeat(3, minmax(72px, auto)); gap: 4px; justify-content: start; margin: 6px 0; }
```

- [ ] **Step 7: Wire the stove into the viewer**

In `src/viewer.ts`, add these imports after `import { loadApartment } from './data/apartment';`:
```ts
import { loadCatalogue } from './data/stoves';
import type { Stove } from './data/types';
import { buildBuffer } from './scene/buffer';
import { PlacementController } from './scene/placement';
import { buildFlueHint, buildStove } from './scene/stoveModel';
import { renderPlacementPanel } from './ui/placementPanel';
```

Replace the line `  // [stove]` with:
```ts
  const catalogue = await loadCatalogue('./data/stoves.json');
  const byId = new Map(catalogue.stoves.map((s) => [s.id, s]));
  const placement = new PlacementController({
    dom: canvas,
    root: viewer.root,
    room: { width: apartment.room.width, depth: apartment.room.depth },
    getCamera: () => rig.camera,
    getControls: () => rig.controls,
  });
  const placementPanel = renderPlacementPanel(section('placement'), {
    nudge: (dir, step) => placement.nudge(dir, step),
    rotate: (delta) => placement.rotateBy(delta),
    snap: () => placement.snap(),
  });
  placement.onChange(() => placementPanel.setDistances(placement.distances()));

  let current: Stove | null = null;
  let bufferOn = true;
  let bufferGroup: THREE.Object3D | null = null;

  function showStove(s: Stove | null): void {
    current = s?.dims ? s : null;
    bufferGroup = null;
    if (!current?.dims) {
      placement.setStove(null);
      return;
    }
    bufferGroup = buildBuffer(current.dims, current.safety);
    if (bufferGroup) bufferGroup.visible = bufferOn;
    const extras: THREE.Object3D[] = [buildFlueHint(current, apartment.ceilingHeight)];
    if (bufferGroup) extras.push(bufferGroup);
    placement.setStove({ object: buildStove(current), dims: current.dims, safety: current.safety }, extras);
  }

  function setBuffer(on: boolean): void {
    bufferOn = on;
    if (bufferGroup) bufferGroup.visible = on;
  }

  // [sidebar]

  // [url]
  showStove(byId.get(new URLSearchParams(location.search).get('stove') ?? '') ?? null);
```

- [ ] **Step 8: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run`, then `npm run dev` and open `/?stove=eva-calor-alberta`.
Expected:
- A dark stove with a glowing glass door stands against the free east-wall segment (north of the soggiorno doorway), front facing west, 20 cm off the wall; an amber translucent buffer extends 20 cm behind (reaching the wall), 40 cm each side and 1.5 m in front; a floor patch 1 m in front; a dashed square 75 cm above the top; a dashed flue line up to the ceiling.
- Dragging the stove moves it on the floor without orbiting the camera and it cannot leave the room; dragging the blue ring rotates it (Shift snaps to 15°); in "Pianta" both still work.
- Panel buttons move it relative to its facing (with the stove on the east wall, "Destra →" moves it south), rotate it, "Attacca al muro" snaps it back; the distance readout updates.
- `/?stove=piazzetta-round` shows a cylindrical stove; `/` shows no stove and disabled placement buttons.

- [ ] **Step 9: Commit**

```bash
git add src/scene/placement.ts src/ui/format.ts src/ui/placementPanel.ts src/style.css src/viewer.ts tests/format.test.ts
git commit -m "feat: place, drag, rotate and nudge the selected stove"
```

---

### Task 11: Sidebar — filters, results list, stove card

**Files:**
- Create: `src/ui/filtersPanel.ts`, `src/ui/resultsList.ts`, `src/ui/stoveCard.ts`
- Modify: `src/viewer.ts` (replace `// [sidebar]`, change the selection line, add imports), `src/style.css`

**Interfaces:**
- Consumes: `FilterState`, `defaultFilters`, `applyFilters`, `sortStoves`, `extents`, `SortKey`, `Range`, `RangeKey` (filters.ts); `Shortlist`, `safeLocalStorage` (shortlist.ts); format helpers; `showStove`, `setBuffer`, `current`, `bufferOn`, `byId`, `catalogue` (viewer.ts, Task 10).
- Produces:
  - `renderFilters(container, ctx: { catalogue: Catalogue; brandCounts: Map<string, number>; extents: Record<RangeKey, Range> }, initial: FilterState, onChange: (s: FilterState) => void): void`
  - `class ResultsList { constructor(container, opts: { sort: SortKey; onSort(k: SortKey): void; onSelect(id: string): void; onToggleStar(id: string): void; isStarred(id: string): boolean }); setItems(items: Stove[], notes: string[]): void; setSelected(id: string | null): void; refresh(): void }`
  - `renderStoveCard(container, s: Stove | null, ctx: { categories: Record<string,string>; bufferOn: boolean; onBufferToggle(on: boolean): void; starred: boolean; onToggleStar(): void }): void`
  - In `viewer.ts`: `shortlist: Shortlist`, `select(s: Stove | null): void`, `renderCard(): void`, `compareLink: HTMLElement`.

The pure logic behind these panels (filters, sorting, null semantics, formatting) is already covered by Tasks 3 and 10; this task is DOM wiring verified in the browser.

- [ ] **Step 1: Implement `src/ui/filtersPanel.ts`**

```ts
import { defaultFilters, type FilterState, type Range, type RangeKey } from '../data/filters';
import type { Catalogue, EnergyClass } from '../data/types';
import { el } from './dom';

interface RangeSpec {
  key: RangeKey;
  label: string;
  unit: string;
  scale: number;
  step: number;
}

const RANGES: RangeSpec[] = [
  { key: 'kw', label: 'Potenza nominale', unit: 'kW', scale: 1, step: 0.5 },
  { key: 'price', label: 'Prezzo', unit: '€', scale: 1, step: 50 },
  { key: 'width', label: 'Larghezza', unit: 'cm', scale: 100, step: 1 },
  { key: 'depth', label: 'Profondità', unit: 'cm', scale: 100, step: 1 },
  { key: 'height', label: 'Altezza', unit: 'cm', scale: 100, step: 1 },
];

export interface FiltersContext {
  catalogue: Catalogue;
  brandCounts: Map<string, number>;
  extents: Record<RangeKey, Range>;
}

export function renderFilters(container: HTMLElement, ctx: FiltersContext, initial: FilterState, onChange: (s: FilterState) => void): void {
  const body = el('div');
  container.append(body);

  const draw = (state: FilterState) => {
    const emit = () => onChange(state);
    const stars = el(
      'select',
      {
        onchange: (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          state.minStars = v ? Number(v) : null;
          emit();
        },
      },
      el('option', { value: '', selected: state.minStars === null }, 'Qualsiasi'),
      ...[3, 4, 5].map((n) => el('option', { value: String(n), selected: state.minStars === n }, `${'★'.repeat(n)} o più`)),
    );
    body.replaceChildren(
      el('input', {
        type: 'search',
        placeholder: 'Cerca marca o modello…',
        value: state.text,
        oninput: (e: Event) => {
          state.text = (e.target as HTMLInputElement).value;
          emit();
        },
      }),
      group('Categoria', checks(Object.entries(ctx.catalogue.categories).map(([value, label]) => ({ value, label })), state.categories, emit)),
      group(
        'Marca',
        checks(ctx.catalogue.brands.map((b) => ({ value: b, label: `${b} (${ctx.brandCounts.get(b) ?? 0})` })), state.brands, emit, true),
        'Nessuna selezione = tutte',
      ),
      ...RANGES.map((spec) =>
        rangeControl(spec, ctx.extents[spec.key], state.ranges[spec.key], (r) => {
          state.ranges[spec.key] = r;
          emit();
        }),
      ),
      group('Stelle minime', stars),
      group(
        'Classe energetica',
        checks((['A+', 'A'] as EnergyClass[]).map((c) => ({ value: c, label: c })), state.energyClasses as Set<string>, emit),
        'Nessuna selezione = tutte',
      ),
      group(
        'Altro',
        el(
          'div',
          { class: 'checks' },
          toggle('Solo con distanze di sicurezza', state.onlyWithSafety, (v) => ((state.onlyWithSafety = v), emit())),
          toggle('Solo con prezzo', state.onlyWithPrice, (v) => ((state.onlyWithPrice = v), emit())),
          toggle('Con forno', state.onlyWithOven, (v) => ((state.onlyWithOven = v), emit())),
          toggle('Ci sta nella parete libera (1,88 m)', state.fitsFreeWall, (v) => ((state.fitsFreeWall = v), emit())),
        ),
      ),
      el(
        'button',
        {
          onclick: () => {
            const fresh = defaultFilters(ctx.catalogue.categories);
            draw(fresh);
            onChange(fresh);
          },
        },
        'Ripristina filtri',
      ),
    );
  };
  draw(initial);
}

function group(label: string, control: Node, hint?: string): HTMLElement {
  return el('div', { class: 'filter-group' }, el('span', { class: 'label' }, label), control, hint ? el('div', { class: 'muted' }, hint) : null);
}

function checks(items: { value: string; label: string }[], set: Set<string>, emit: () => void, scroll = false): HTMLElement {
  return el(
    'div',
    { class: scroll ? 'checks scroll' : 'checks' },
    ...items.map((it) =>
      el(
        'label',
        {},
        el('input', {
          type: 'checkbox',
          checked: set.has(it.value),
          onchange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) set.add(it.value);
            else set.delete(it.value);
            emit();
          },
        }),
        ' ',
        it.label,
      ),
    ),
  );
}

function toggle(label: string, value: boolean, set: (v: boolean) => void): HTMLElement {
  return el('label', {}, el('input', { type: 'checkbox', checked: value, onchange: (e: Event) => set((e.target as HTMLInputElement).checked) }), ' ', label);
}

/** Two sliders (min, max). Both at the extremes = untouched = null, so stoves with missing data stay visible. */
function rangeControl(spec: RangeSpec, ext: Range, value: Range | null, onChange: (r: Range | null) => void): HTMLElement {
  const lo = Math.floor((ext.min * spec.scale) / spec.step) * spec.step;
  const hi = Math.ceil((ext.max * spec.scale) / spec.step) * spec.step;
  const attrs = { type: 'range', min: lo, max: hi, step: spec.step };
  const minIn = el('input', { ...attrs, value: value ? value.min * spec.scale : lo });
  const maxIn = el('input', { ...attrs, value: value ? value.max * spec.scale : hi });
  const out = el('span', { class: 'range-out' });
  const sync = (emit: boolean) => {
    const a = Number(minIn.value);
    const b = Number(maxIn.value);
    const untouched = a <= lo && b >= hi;
    out.textContent = untouched ? 'tutti' : `${a}–${b} ${spec.unit}`;
    if (emit) onChange(untouched ? null : { min: a / spec.scale, max: b / spec.scale });
  };
  minIn.addEventListener('input', () => {
    if (Number(minIn.value) > Number(maxIn.value)) minIn.value = maxIn.value;
    sync(true);
  });
  maxIn.addEventListener('input', () => {
    if (Number(maxIn.value) < Number(minIn.value)) maxIn.value = minIn.value;
    sync(true);
  });
  sync(false);
  return el('div', { class: 'filter-group' }, el('span', { class: 'label' }, spec.label, out), el('div', { class: 'range-inputs' }, minIn, maxIn));
}
```

- [ ] **Step 2: Implement `src/ui/resultsList.ts`**

```ts
import type { SortKey } from '../data/filters';
import type { Stove } from '../data/types';
import { el } from './dom';
import { fmtDims, fmtKw, fmtPrice, fmtStars } from './format';

const ROW = 56;
const SORTS: [SortKey, string][] = [
  ['price', 'prezzo'],
  ['kw', 'potenza'],
  ['width', 'larghezza'],
  ['name', 'nome'],
];

export interface ResultsOptions {
  sort: SortKey;
  onSort(k: SortKey): void;
  onSelect(id: string): void;
  onToggleStar(id: string): void;
  isStarred(id: string): boolean;
}

/** Virtualised list: only the rows in view (plus a margin) are in the DOM. */
export class ResultsList {
  private items: Stove[] = [];
  private selected: string | null = null;
  private count = el('span', { class: 'muted' });
  private viewport = el('div', { class: 'results-viewport' });
  private spacer = el('div', { class: 'results-spacer' });
  private notes = el('div', { class: 'muted' });

  constructor(container: HTMLElement, private opts: ResultsOptions) {
    const sort = el(
      'select',
      { onchange: (e: Event) => opts.onSort((e.target as HTMLSelectElement).value as SortKey) },
      ...SORTS.map(([k, label]) => el('option', { value: k, selected: k === opts.sort }, `Ordina per ${label}`)),
    );
    this.viewport.append(this.spacer);
    this.viewport.addEventListener('scroll', () => this.render());
    container.append(el('div', { class: 'results-head' }, this.count, sort), this.viewport, this.notes);
  }

  setItems(items: Stove[], notes: string[]): void {
    this.items = items;
    this.count.textContent = `${items.length} stufe`;
    this.notes.textContent = notes.join(' · ');
    this.spacer.style.height = `${items.length * ROW}px`;
    this.viewport.scrollTop = 0;
    this.render();
  }

  setSelected(id: string | null): void {
    this.selected = id;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const top = this.viewport.scrollTop;
    const height = this.viewport.clientHeight || 320;
    const first = Math.max(0, Math.floor(top / ROW) - 5);
    const last = Math.min(this.items.length, Math.ceil((top + height) / ROW) + 5);
    this.spacer.replaceChildren(...this.items.slice(first, last).map((s, i) => this.row(s, first + i)));
  }

  private row(s: Stove, index: number): HTMLElement {
    const starred = this.opts.isStarred(s.id);
    const star = el(
      'button',
      {
        class: starred ? 'star on' : 'star',
        title: starred ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
        onclick: (e: Event) => {
          e.stopPropagation();
          this.opts.onToggleStar(s.id);
        },
      },
      '★',
    );
    const meta = [fmtKw(s.kw), fmtPrice(s.price), fmtDims(s.dims), s.stars ? fmtStars(s.stars) : ''].filter(Boolean).join(' · ');
    const row = el(
      'div',
      { class: s.id === this.selected ? 'result selected' : 'result', onclick: () => this.opts.onSelect(s.id) },
      el('div', { class: 'title' }, `${s.brand} ${s.model}`),
      star,
      el('div', { class: 'meta' }, meta),
    );
    row.style.top = `${index * ROW}px`;
    return row;
  }
}
```

Add to `src/style.css` after the `.results-viewport` rule:
```css
.results-spacer { position: relative; }
```

- [ ] **Step 3: Implement `src/ui/stoveCard.ts`**

```ts
import type { FlueOutlet, Stove } from '../data/types';
import { el } from './dom';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars, sourceHref } from './format';

const OUTLET_IT: Record<FlueOutlet, string> = { top: 'superiore', rear: 'posteriore', side: 'laterale' };

export interface CardContext {
  categories: Record<string, string>;
  bufferOn: boolean;
  onBufferToggle(on: boolean): void;
  starred: boolean;
  onToggleStar(): void;
}

function flueText(s: Stove): string {
  if (s.flueDiameter === null && !s.flueOutlets.length) return '—';
  const diameter = s.flueDiameter === null ? '' : `Ø ${Math.round(s.flueDiameter * 1000)} mm `;
  return `${diameter}${s.flueOutlets.map((o) => OUTLET_IT[o]).join(', ')}`.trim();
}

export function renderStoveCard(container: HTMLElement, s: Stove | null, ctx: CardContext): void {
  const card = container.querySelector<HTMLElement>('.card') ?? container.appendChild(el('div', { class: 'card' }));
  if (!s) {
    card.replaceChildren(el('p', { class: 'muted' }, 'Scegli una stufa dai risultati.'));
    return;
  }
  const row = (k: string, v: string) => [el('dt', {}, k), el('dd', {}, v)];
  const sd = s.safety;
  const power = s.kwMin !== null && s.kwMax !== null ? `${fmtKw(s.kw)} (${fmtKw(s.kwMin)}–${fmtKw(s.kwMax)})` : fmtKw(s.kw);
  card.replaceChildren(
    el(
      'div',
      { class: 'row', style: 'justify-content: space-between' },
      el('h3', {}, `${s.brand} ${s.model}`),
      el('button', { class: ctx.starred ? 'star on' : 'star', title: ctx.starred ? 'Togli dai preferiti' : 'Aggiungi ai preferiti', onclick: () => ctx.onToggleStar() }, '★'),
    ),
    el('div', { class: 'muted' }, ctx.categories[s.category] ?? s.category),
    el(
      'dl',
      {},
      ...row('Potenza', power),
      ...row('Prezzo indicativo', fmtPrice(s.price)),
      ...row('L × P × A', fmtDims(s.dims)),
      ...row('Peso', s.weightKg === null ? '—' : `${s.weightKg} kg`),
      ...row('Rendimento', fmtPct(s.efficiency)),
      ...row('Stelle', fmtStars(s.stars)),
      ...row('Classe', s.energyClass ?? '—'),
      ...row('Canna fumaria', flueText(s)),
    ),
    sd
      ? el(
          'dl',
          {},
          ...row('Dist. posteriore', fmtCm(sd.rear)),
          ...row('Dist. laterale', fmtCm(sd.side)),
          ...row('Dist. frontale', fmtCm(sd.front)),
          ...row('Dist. soffitto', fmtCm(sd.ceiling)),
          ...row('Pavimento davanti', fmtCm(sd.floorFront)),
        )
      : el('p', { class: 'warn' }, 'Distanze di sicurezza non dichiarate'),
    sd?.notes ? el('details', {}, el('summary', {}, 'Note del produttore'), el('p', {}, sd.notes)) : null,
    el(
      'label',
      {},
      el('input', { type: 'checkbox', checked: ctx.bufferOn, disabled: !sd, onchange: (e: Event) => ctx.onBufferToggle((e.target as HTMLInputElement).checked) }),
      ' Mostra distanze di sicurezza',
    ),
    s.sources.length
      ? el(
          'div',
          { class: 'muted' },
          'Fonti: ',
          ...s.sources.flatMap((src, i) => [
            i ? ' · ' : '',
            el('a', { href: sourceHref(src.file, src.page), target: '_blank', rel: 'noopener' }, `${src.file.split('/').pop()}${src.page ? ` p. ${src.page}` : ''}`),
          ]),
        )
      : null,
  );
}
```

- [ ] **Step 4: Wire the sidebar into the viewer**

In `src/viewer.ts`, add these imports after `import { loadCatalogue } from './data/stoves';`:
```ts
import { applyFilters, defaultFilters, extents, sortStoves, type SortKey } from './data/filters';
import { safeLocalStorage, Shortlist } from './data/shortlist';
import { renderFilters } from './ui/filtersPanel';
import { ResultsList } from './ui/resultsList';
import { renderStoveCard } from './ui/stoveCard';
```

Replace the line `  // [sidebar]` with:
```ts
  const shortlist = new Shortlist(safeLocalStorage());
  const brandCounts = new Map<string, number>();
  for (const s of catalogue.stoves) brandCounts.set(s.brand, (brandCounts.get(s.brand) ?? 0) + 1);
  let filters = defaultFilters(catalogue.categories);
  let sortKey: SortKey = 'price';

  const results = new ResultsList(section('results'), {
    sort: sortKey,
    onSort: (k) => {
      sortKey = k;
      refreshResults();
    },
    onSelect: (id) => select(byId.get(id) ?? null),
    onToggleStar: (id) => shortlist.toggle(id),
    isStarred: (id) => shortlist.has(id),
  });
  renderFilters(section('filters'), { catalogue, brandCounts, extents: extents(catalogue.stoves.filter((s) => s.dims)) }, filters, (f) => {
    filters = f;
    refreshResults();
  });

  function refreshResults(): void {
    const r = applyFilters(catalogue.stoves, filters);
    const notes = [r.hiddenMissingData ? `${r.hiddenMissingData} nascoste per dati mancanti` : '', `${r.noDims} senza dimensioni non mostrate`];
    results.setItems(sortStoves(r.visible, sortKey), notes.filter(Boolean));
  }

  function renderCard(): void {
    renderStoveCard(section('stove-card'), current, {
      categories: catalogue.categories,
      bufferOn,
      onBufferToggle: (on) => setBuffer(on),
      starred: current ? shortlist.has(current.id) : false,
      onToggleStar: () => {
        if (current) shortlist.toggle(current.id);
      },
    });
  }

  function select(s: Stove | null): void {
    showStove(s);
    results.setSelected(current?.id ?? null);
    renderCard();
  }

  const compareLink = document.getElementById('compare-link')!;
  const updateCompareLink = () => (compareLink.textContent = `Confronta (${shortlist.ids().length})`);
  shortlist.onChange(() => {
    results.refresh();
    renderCard();
    updateCompareLink();
  });
  updateCompareLink();
  refreshResults();
```

Replace the line
```ts
  showStove(byId.get(new URLSearchParams(location.search).get('stove') ?? '') ?? null);
```
with
```ts
  select(byId.get(new URLSearchParams(location.search).get('stove') ?? '') ?? null);
```

- [ ] **Step 5: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run`, then `npm run dev`.
Expected:
- Results show "N stufe" sorted by price, with "66 senza dimensioni non mostrate"; inserts are hidden by default (Categoria "Inserto…" unchecked).
- Moving the kW slider in from the extremes hides stoves without kW and shows "… nascoste per dati mancanti"; dragging both back to the extremes shows "tutti" and restores them.
- Brand, stars, energy class, toggles, search and "Ripristina filtri" each change the list; "Ci sta nella parete libera" hides only very large stoves.
- The list scrolls smoothly (only ~20 rows in the DOM — check in devtools).
- Clicking a row places the stove and fills "Stufa selezionata" (specs, safety distances or "Distanze di sicurezza non dichiarate", notes, PDF links that open the right page). The buffer checkbox hides/shows the amber buffer and is disabled for stoves without distances.
- ★ toggles in the list and card stay in sync, and the header link shows "Confronta (N)"; reloading keeps the stars.

- [ ] **Step 6: Commit**

```bash
git add src/ui/filtersPanel.ts src/ui/resultsList.ts src/ui/stoveCard.ts src/viewer.ts src/style.css
git commit -m "feat: sidebar filters, virtualised results and stove details"
```

---

### Task 12: Shareable URL state

**Files:**
- Create: `src/ui/toast.ts`, `src/ui/sharePanel.ts`
- Modify: `src/viewer.ts` (replace the `// [url]` block, update `renderCard`, add imports)

**Interfaces:**
- Consumes: `decodeState`, `encodeState`, `EMPTY_STATE` (urlState.ts); `doors`, `placement`, `shortlist`, `select`, `setBuffer`, `renderCard`, `compareLink`, `current`, `bufferOn` (viewer.ts).
- Produces: `toast(message: string, ms?: number): void`; `renderSharePanel(container, getUrl: () => string, notify: (msg: string) => void): void`.

URL parsing/encoding and clamping are covered by Tasks 4 and 9; this task is wiring verified in the browser.

- [ ] **Step 1: Implement `src/ui/toast.ts` and `src/ui/sharePanel.ts`**

`src/ui/toast.ts`:
```ts
import { el } from './dom';

export function toast(message: string, ms = 3000): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const t = el('div', { class: 'toast', role: 'status' }, message);
  host.append(t);
  window.setTimeout(() => t.remove(), ms);
}
```

`src/ui/sharePanel.ts`:
```ts
import { el } from './dom';

export function renderSharePanel(container: HTMLElement, getUrl: () => string, notify: (msg: string) => void): void {
  const copy = async () => {
    const url = getUrl();
    try {
      await navigator.clipboard.writeText(url);
      notify('Link copiato negli appunti');
    } catch {
      window.prompt('Copia questo link:', url);
    }
  };
  container.append(
    el('button', { class: 'primary', onclick: copy }, 'Copia link'),
    el('p', { class: 'muted' }, 'Il link include stufa, posizione, porte aperte e preferiti.'),
  );
}
```

- [ ] **Step 2: Wire URL state into the viewer**

In `src/viewer.ts`, add these imports after `import { safeLocalStorage, Shortlist } from './data/shortlist';`:
```ts
import { decodeState, EMPTY_STATE, encodeState } from './data/urlState';
import { renderSharePanel } from './ui/sharePanel';
import { toast } from './ui/toast';
```

In `renderCard()`, replace
```ts
      onBufferToggle: (on) => setBuffer(on),
```
with
```ts
      onBufferToggle: (on) => {
        setBuffer(on);
        syncUrl();
      },
```

Replace
```ts
  const updateCompareLink = () => (compareLink.textContent = `Confronta (${shortlist.ids().length})`);
```
with
```ts
  const updateCompareLink = () => {
    compareLink.textContent = `Confronta (${shortlist.ids().length})`;
    // Carry the shortlist in the link too, in case localStorage is unavailable.
    compareLink.setAttribute('href', `./compare.html${encodeState({ ...EMPTY_STATE, shortlist: shortlist.ids() })}`);
  };
```

Replace the block
```ts
  // [url]
  select(byId.get(new URLSearchParams(location.search).get('stove') ?? '') ?? null);
```
with
```ts
  let urlTimer: number | undefined;
  function currentQuery(): string {
    const pose = placement.getPose();
    return encodeState({
      stove: current?.id ?? null,
      x: pose?.x ?? null,
      z: pose?.z ?? null,
      r: pose?.r ?? null,
      doors: doors.openIds(),
      shortlist: shortlist.ids(),
      buffer: bufferOn,
    });
  }
  function syncUrl(): void {
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => history.replaceState(null, '', `${location.pathname}${currentQuery()}`), 200);
  }

  const initial = decodeState(location.search);
  shortlist.merge(initial.shortlist);
  setBuffer(initial.buffer);
  for (const id of initial.doors) doors.setOpen(id, true, false);
  const requested = initial.stove ? byId.get(initial.stove) : undefined;
  if (initial.stove && !requested) toast(`Stufa "${initial.stove}" non trovata nel catalogo`);
  else if (requested && !requested.dims) toast(`${requested.brand} ${requested.model} non ha dimensioni: non posizionabile`);
  select(requested?.dims ? requested : null);
  const start = placement.getPose();
  if (start) placement.setPose({ x: initial.x ?? start.x, z: initial.z ?? start.z, r: initial.r ?? start.r });

  placement.onChange(syncUrl);
  doors.onChange(syncUrl);
  shortlist.onChange(syncUrl);
  renderSharePanel(section('share'), () => `${location.origin}${location.pathname}${currentQuery()}`, toast);
```

In `function select(...)`, replace
```ts
    results.setSelected(current?.id ?? null);
    renderCard();
  }
```
with
```ts
    results.setSelected(current?.id ?? null);
    renderCard();
    syncUrl();
  }
```
(`syncUrl` is a hoisted function declaration; `let urlTimer` is declared before the first `select()` call above runs.)

- [ ] **Step 3: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run`, then `npm run dev`.
Expected:
- Selecting, dragging, rotating, opening doors, toggling the buffer and starring all update the address bar (≈200 ms later), e.g. `?stove=eva-calor-alberta&x=1.6&z=2.46&r=0&doors=entrata&shortlist=eva-calor-alberta`.
- Reloading that URL restores the stove, pose, open doors (without animation), buffer state and stars.
- "Copia link" copies the current URL and shows a toast.
- `?stove=nope` shows the "non trovata" toast and no stove; `?stove=eva-calor-alberta&x=99&r=abc` places the stove clamped inside the room with r = 0.
- "Confronta (N)" links to `compare.html?shortlist=…`.

- [ ] **Step 4: Commit**

```bash
git add src/ui/toast.ts src/ui/sharePanel.ts src/viewer.ts
git commit -m "feat: shareable URL with stove, pose, doors and shortlist"
```

---
### Task 13: Compare page

**Files:**
- Create: `src/compare/table.ts`, `src/compare.ts`, `compare.html`
- Modify: `vite.config.ts` (add the compare entry)
- Test: `tests/compareTable.test.ts`

**Interfaces:**
- Consumes: `Stove`; `bufferExtents` (buffer.ts); `FREE_WALL` (apartment.ts); format helpers incl. `sourceHref`; `Shortlist`, `safeLocalStorage`; `loadCatalogue`; `decodeState`, `encodeState`, `EMPTY_STATE`; `el`, `showFatal`.
- Produces:
  - `interface CompareRow { group: string; label: string; values: string[]; best: number[] }` (`best` = column indices to highlight)
  - `buildCompareRows(stoves: Stove[]): CompareRow[]` — last group is `'Fonti'`
  - `toCsv(stoves: Stove[], rows: CompareRow[]): string` — `;`-separated, quoted when needed
  - `footprintSvg(s: Stove): string` — top-down SVG at 100 px/m: wall line (class `wall`, 1.88 m), buffer rect (class `buffer`, only with extents), body rect (class `body`)

- [ ] **Step 1: Write the failing tests**

`tests/compareTable.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildCompareRows, footprintSvg, toCsv } from '../src/compare/table';
import { stove } from './fixtures';

const a = stove({ id: 'a', brand: 'Alfa', model: 'Uno', price: 2000, stars: 5, efficiency: 80 });
const b = stove({ id: 'b', brand: 'Beta', model: 'Due; bis', price: 3000, stars: 4, efficiency: 88 });
const c = stove({ id: 'c', brand: 'Gamma', model: 'Tre', price: null, stars: null, efficiency: null, safety: null });
const rowOf = (label: string, group?: string) =>
  buildCompareRows([a, b, c]).find((r) => r.label === label && (!group || r.group === group))!;

describe('buildCompareRows', () => {
  it('formats values and uses — for missing data', () => {
    expect(rowOf('Prezzo indicativo').values).toEqual(['2.000 €', '3.000 €', '—']);
  });

  it('highlights the lowest price and the highest efficiency and stars', () => {
    expect(rowOf('Prezzo indicativo').best).toEqual([0]);
    expect(rowOf('Nominale', 'Rendimento').best).toEqual([1]);
    expect(rowOf('Stelle').best).toEqual([0]);
  });

  it('does not highlight rows without a direction, ties of everyone, or a single value', () => {
    expect(rowOf('Nominale', 'Potenza').best).toEqual([]);
    expect(buildCompareRows([a, stove({ id: 'x', price: 2000 })]).find((r) => r.label === 'Prezzo indicativo')!.best).toEqual([]);
    expect(buildCompareRows([a, c]).find((r) => r.label === 'Prezzo indicativo')!.best).toEqual([]);
  });

  it('shows safety distances in cm and ends with the sources group', () => {
    expect(rowOf('Posteriore').values).toEqual(['20 cm', '20 cm', '—']);
    const rows = buildCompareRows([a]);
    expect(rows[rows.length - 1].group).toBe('Fonti');
  });
});

describe('toCsv', () => {
  it('writes a header and quotes cells containing separators', () => {
    const csv = toCsv([a, b], buildCompareRows([a, b]));
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Gruppo;Voce;Alfa Uno;"Beta Due; bis"');
    expect(lines).toContain('Prezzo;Prezzo indicativo;2.000 €;3.000 €');
  });
});

describe('footprintSvg', () => {
  const width = (svg: string, cls: string) => Number(new RegExp(`class="${cls}"[^>]*width="([\\d.]+)"`).exec(svg)![1]);

  it('draws body, buffer and the 1.88 m wall to scale', () => {
    const svg = footprintSvg(stove({ dims: { w: 0.5, d: 0.4, h: 1 } }));
    expect(width(svg, 'body')).toBe(50);
    expect(width(svg, 'buffer')).toBe(130);
    const m = /class="wall" x1="([\d.]+)"[^>]*x2="([\d.]+)"/.exec(svg)!;
    expect(Number(m[2]) - Number(m[1])).toBeCloseTo(188);
  });

  it('omits the buffer without safety data', () => {
    expect(footprintSvg(stove({ safety: null }))).not.toContain('class="buffer"');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/compareTable.test.ts`
Expected: FAIL — cannot resolve `../src/compare/table`.

- [ ] **Step 3: Implement `src/compare/table.ts`**

```ts
import { FREE_WALL } from '../data/apartment';
import type { FlueOutlet, Stove } from '../data/types';
import { bufferExtents } from '../scene/buffer';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars } from '../ui/format';

export interface CompareRow {
  group: string;
  label: string;
  values: string[];
  best: number[];
}

type Value = number | string | null;

interface RowDef {
  group: string;
  label: string;
  get(s: Stove): Value;
  fmt?(v: number): string;
  better?: 'low' | 'high';
}

const OUTLET_IT: Record<FlueOutlet, string> = { top: 'superiore', rear: 'posteriore', side: 'laterale' };
const fileName = (f: string) => f.split('/').pop() ?? f;

const ROWS: RowDef[] = [
  { group: 'Prezzo', label: 'Prezzo indicativo', get: (s) => s.price, fmt: fmtPrice, better: 'low' },
  { group: 'Potenza', label: 'Nominale', get: (s) => s.kw, fmt: fmtKw },
  { group: 'Potenza', label: 'Min–max', get: (s) => (s.kwMin === null && s.kwMax === null ? null : `${fmtKw(s.kwMin)} – ${fmtKw(s.kwMax)}`) },
  { group: 'Potenza', label: "All'acqua", get: (s) => s.kwWater, fmt: fmtKw },
  { group: 'Dimensioni e peso', label: 'L × P × A', get: (s) => (s.dims ? fmtDims(s.dims) : null) },
  { group: 'Dimensioni e peso', label: 'Peso', get: (s) => s.weightKg, fmt: (v) => `${v} kg` },
  { group: 'Distanze di sicurezza', label: 'Posteriore', get: (s) => s.safety?.rear ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Laterale', get: (s) => s.safety?.side ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Frontale', get: (s) => s.safety?.front ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Soffitto', get: (s) => s.safety?.ceiling ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Distanze di sicurezza', label: 'Pavimento davanti', get: (s) => s.safety?.floorFront ?? null, fmt: fmtCm, better: 'low' },
  { group: 'Rendimento', label: 'Nominale', get: (s) => s.efficiency, fmt: fmtPct, better: 'high' },
  { group: 'Rendimento', label: 'Stagionale', get: (s) => s.seasonalEfficiency, fmt: fmtPct, better: 'high' },
  { group: 'Classificazione', label: 'Stelle', get: (s) => s.stars, fmt: fmtStars, better: 'high' },
  { group: 'Classificazione', label: 'Classe energetica', get: (s) => s.energyClass },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'CO', get: (s) => s.emissions?.co ?? null, fmt: String, better: 'low' },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'Polveri (PM)', get: (s) => s.emissions?.pm ?? null, fmt: String, better: 'low' },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'NOx', get: (s) => s.emissions?.nox ?? null, fmt: String, better: 'low' },
  { group: 'Emissioni (mg/Nm³ al 13% O₂)', label: 'OGC', get: (s) => s.emissions?.ogc ?? null, fmt: String, better: 'low' },
  { group: 'Canna fumaria', label: 'Diametro', get: (s) => s.flueDiameter, fmt: (v) => `Ø ${Math.round(v * 1000)} mm` },
  { group: 'Canna fumaria', label: 'Uscite', get: (s) => (s.flueOutlets.length ? s.flueOutlets.map((o) => OUTLET_IT[o]).join(', ') : null) },
  { group: 'Altro', label: 'Volume riscaldabile', get: (s) => s.heatingVolume, fmt: (v) => `${v} m³` },
  { group: 'Altro', label: 'Forno', get: (s) => (s.hasOven ? 'Sì' : 'No') },
  { group: 'Altro', label: 'Finiture', get: (s) => (s.finishes.length ? s.finishes.join(', ') : null) },
  { group: 'Fonti', label: 'Schede tecniche', get: (s) => (s.sources.length ? s.sources.map((x) => fileName(x.file)).join(', ') : null) },
];

export function buildCompareRows(stoves: Stove[]): CompareRow[] {
  return ROWS.map((def) => {
    const raw = stoves.map((s) => def.get(s));
    const values = raw.map((v) => (v === null ? '—' : typeof v === 'number' && def.fmt ? def.fmt(v) : String(v)));
    const nums = raw.map((v) => (typeof v === 'number' ? v : null));
    const valid = nums.filter((v): v is number => v !== null);
    let best: number[] = [];
    if (def.better && valid.length >= 2) {
      const target = def.better === 'low' ? Math.min(...valid) : Math.max(...valid);
      if (valid.some((v) => v !== target)) best = nums.flatMap((v, i) => (v === target ? [i] : []));
    }
    return { group: def.group, label: def.label, values, best };
  });
}

const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Semicolon-separated so Excel with Italian locale opens it in columns. */
export function toCsv(stoves: Stove[], rows: CompareRow[]): string {
  const lines = [['Gruppo', 'Voce', ...stoves.map((s) => `${s.brand} ${s.model}`)], ...rows.map((r) => [r.group, r.label, ...r.values])];
  return lines.map((l) => l.map(csvCell).join(';')).join('\n');
}

const PX = 100;
const n1 = (v: number) => v.toFixed(1);

/** Top-down footprint: the free wall at the top, the stove's rear `safety.rear` away from it, front facing down. */
export function footprintSvg(s: Stove): string {
  if (!s.dims) return '';
  const { w, d } = s.dims;
  const wallLen = FREE_WALL.to - FREE_WALL.from;
  const ext = bufferExtents(s.dims, s.safety);
  const rear = s.safety?.rear ?? 0;
  const margin = 0.1;
  const halfSpan = Math.max(wallLen / 2, w / 2, ext ? ext.x1 : 0);
  const depth = rear + d / 2 + (ext ? ext.z1 : d / 2);
  const W = (2 * halfSpan + 2 * margin) * PX;
  const H = (depth + 2 * margin) * PX;
  const cx = W / 2;
  const wallY = margin * PX;
  // Stove-local z (front +z) → SVG y.
  const yOf = (z: number) => wallY + (rear + d / 2 + z) * PX;
  const rect = (x: number, y: number, rw: number, rh: number, cls: string) =>
    `<rect class="${cls}" x="${n1(x)}" y="${n1(y)}" width="${n1(rw)}" height="${n1(rh)}"/>`;
  const parts = [`<line class="wall" x1="${n1(cx - (wallLen / 2) * PX)}" y1="${n1(wallY - 3)}" x2="${n1(cx + (wallLen / 2) * PX)}" y2="${n1(wallY - 3)}"/>`];
  if (ext) parts.push(rect(cx + ext.x0 * PX, yOf(ext.z0), (ext.x1 - ext.x0) * PX, (ext.z1 - ext.z0) * PX, 'buffer'));
  parts.push(rect(cx - (w / 2) * PX, yOf(-d / 2), w * PX, d * PX, 'body'));
  return `<svg class="footprint" xmlns="http://www.w3.org/2000/svg" width="${Math.round(W)}" height="${Math.round(H)}" viewBox="0 0 ${n1(W)} ${n1(H)}">${parts.join('')}</svg>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/compareTable.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Write the compare page**

`compare.html`:
```html
<!doctype html>
<html lang="it">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Confronto stufe</title>
  </head>
  <body>
    <main id="app" class="compare"></main>
    <div id="toasts"></div>
    <script type="module" src="/src/compare.ts"></script>
  </body>
</html>
```

`src/compare.ts`:
```ts
import './style.css';
import { buildCompareRows, footprintSvg, toCsv } from './compare/table';
import { safeLocalStorage, Shortlist } from './data/shortlist';
import { loadCatalogue } from './data/stoves';
import type { Stove } from './data/types';
import { decodeState, EMPTY_STATE, encodeState } from './data/urlState';
import { el } from './ui/dom';
import { showFatal } from './ui/fatal';
import { sourceHref } from './ui/format';

function download(text: string, filename: string): void {
  // BOM so Excel reads the file as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

async function main(): Promise<void> {
  const catalogue = await loadCatalogue('./data/stoves.json');
  const byId = new Map(catalogue.stoves.map((s) => [s.id, s]));
  const shortlist = new Shortlist(safeLocalStorage());
  shortlist.merge(decodeState(location.search).shortlist);
  const app = document.getElementById('app')!;

  const viewerLink = (stove: string | null, ids: string[]) => `./index.html${encodeState({ ...EMPTY_STATE, stove, shortlist: ids })}`;

  function table(stoves: Stove[]): HTMLTableElement {
    const ids = stoves.map((s) => s.id);
    const head = el(
      'tr',
      {},
      el('th', {}, ''),
      ...stoves.map((s, i) =>
        el(
          'th',
          {},
          el('div', {}, el('strong', {}, `${s.brand} ${s.model}`)),
          el('div', { class: 'muted' }, catalogue.categories[s.category] ?? s.category),
          el(
            'div',
            { class: 'col-actions' },
            el('button', { title: 'Sposta a sinistra', disabled: i === 0, onclick: () => shortlist.move(s.id, -1) }, '◀'),
            el('button', { title: 'Sposta a destra', disabled: i === stoves.length - 1, onclick: () => shortlist.move(s.id, 1) }, '▶'),
            el('button', { title: 'Rimuovi dal confronto', onclick: () => shortlist.remove(s.id) }, '✕'),
          ),
          el('a', { href: viewerLink(s.id, ids) }, 'Apri nel visualizzatore'),
        ),
      ),
    );
    const body: HTMLElement[] = [];
    let group = '';
    for (const row of buildCompareRows(stoves)) {
      if (row.group !== group) {
        group = row.group;
        body.push(el('tr', { class: 'group' }, el('td', { colspan: stoves.length + 1 }, group)));
      }
      const cells =
        row.group === 'Fonti'
          ? stoves.map((s) =>
              el(
                'td',
                {},
                ...s.sources.flatMap((src, i) => [
                  i ? el('br') : null,
                  el('a', { href: sourceHref(src.file, src.page), target: '_blank', rel: 'noopener' }, `${src.file.split('/').pop()}${src.page ? ` p. ${src.page}` : ''}`),
                ]),
              ),
            )
          : row.values.map((v, i) => el('td', { class: row.best.includes(i) ? 'best' : '' }, v));
      body.push(el('tr', {}, el('td', {}, row.label), ...cells));
    }
    return el('table', { class: 'cmp' }, el('thead', {}, head), el('tbody', {}, ...body));
  }

  function figure(s: Stove): HTMLElement {
    const fig = el('figure');
    // Safe: the SVG is built only from numbers.
    fig.innerHTML = footprintSvg(s);
    fig.append(el('figcaption', {}, `${s.brand} ${s.model}${s.safety ? '' : ' — distanze non dichiarate'}`));
    return fig;
  }

  function render(): void {
    const stoves = shortlist.ids().map((id) => byId.get(id)).filter((s): s is Stove => !!s);
    const ids = stoves.map((s) => s.id);
    history.replaceState(null, '', `${location.pathname}${encodeState({ ...EMPTY_STATE, shortlist: ids })}`);
    const header = el(
      'header',
      {},
      el('h1', {}, `Confronto stufe (${stoves.length})`),
      el(
        'div',
        { class: 'row' },
        el('a', { href: viewerLink(null, ids) }, '← Torna al visualizzatore'),
        el('button', { disabled: !stoves.length, onclick: () => download(toCsv(stoves, buildCompareRows(stoves)), 'confronto-stufe.csv') }, 'Esporta CSV'),
      ),
    );
    if (!stoves.length) {
      app.replaceChildren(header, el('p', {}, 'Nessuna stufa nei preferiti. Aggiungile con ★ nel visualizzatore.'));
      return;
    }
    const withDims = stoves.filter((s) => s.dims);
    app.replaceChildren(
      header,
      el('div', { class: 'table-wrap' }, table(stoves)),
      el('h2', {}, 'Ingombro sulla parete libera (1,88 m)'),
      el('p', { class: 'muted' }, 'Vista dall’alto: parete in alto, stufa (grigio) con le distanze di sicurezza dichiarate (arancione).'),
      el('div', { class: 'footprints' }, ...withDims.map(figure)),
    );
  }

  shortlist.onChange(render);
  render();
}

main().catch((err: unknown) => showFatal(err instanceof Error ? err.message : String(err), () => location.reload()));
```

In `vite.config.ts`, replace
```ts
      input: { main: `${root}index.html` },
```
with
```ts
      input: { main: `${root}index.html`, compare: `${root}compare.html` },
```

- [ ] **Step 6: Verify in the browser**

Run: `npx tsc --noEmit && npx vitest run && npm run build`, then `npm run dev`.
Expected:
- Star 3+ stoves in the viewer (including one without safety distances), click "Confronta (N)".
- The table shows one column per stove with grouped rows, "—" for missing values, green highlight on the best price/efficiency/stars/emissions/distances, PDF links in "Fonti".
- ◀ ▶ reorder columns, ✕ removes one, "Apri nel visualizzatore" opens the viewer with that stove placed and the shortlist intact.
- Footprints are drawn to the same scale under a 188 px wall; the stove without distances has no amber area and says so in its caption.
- "Esporta CSV" downloads a file that opens in columns in Excel/Numbers.
- With an empty shortlist, the page shows the "Nessuna stufa nei preferiti" message.

- [ ] **Step 7: Commit**

```bash
git add compare.html src/compare.ts src/compare/table.ts vite.config.ts tests/compareTable.test.ts
git commit -m "feat: shortlist compare page with table, footprints and CSV"
```

---

### Task 14: GLB model override

**Files:**
- Modify: `src/scene/stoveModel.ts` (append loaders), `src/scene/placement.ts` (add `replaceObject`), `src/viewer.ts`
- Create: `public/models/index.json`
- Test: `tests/glb.test.ts`

**Interfaces:**
- Consumes: `buildStove`, `Stove`, `Dims`; `PlacementController`.
- Produces:
  - `loadModelIndex(url: string): Promise<Set<string>>` — empty set on any failure
  - `fitToDims(obj: THREE.Object3D, dims: Dims): THREE.Group` — wrapper whose bbox is exactly `w × h × d`, min y 0, centred, with `scale.x = -1` to undo the room root's mirror
  - `loadStoveObject(s: Stove, overrides: Set<string>, loadGlb?: (url: string) => Promise<THREE.Object3D>): Promise<THREE.Object3D>` — GLB when listed and loadable, otherwise `buildStove(s)` (with `console.warn` on failure)
  - `PlacementController.replaceObject(object: THREE.Object3D): void`

- [ ] **Step 1: Write the failing tests**

`tests/glb.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { fitToDims, loadModelIndex, loadStoveObject } from '../src/scene/stoveModel';
import { stove } from './fixtures';

const dims = { w: 0.5, d: 0.4, h: 1.2 };

function fakeModel(): THREE.Object3D {
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 3));
  m.position.set(5, 5, 5);
  return m;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fitToDims', () => {
  it('scales and recentres any model to the catalogue box', () => {
    const wrapper = fitToDims(fakeModel(), dims);
    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.5);
    expect(size.y).toBeCloseTo(1.2);
    expect(size.z).toBeCloseTo(0.4);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.min.x + box.max.x).toBeCloseTo(0);
    expect(box.min.z + box.max.z).toBeCloseTo(0);
    expect(wrapper.scale.x).toBe(-1);
  });
});

describe('loadStoveObject', () => {
  const s = stove({ id: 'eva-calor-alberta', dims });

  it('uses the GLB when listed', async () => {
    const loader = vi.fn(async () => fakeModel());
    const obj = await loadStoveObject(s, new Set(['eva-calor-alberta']), loader);
    expect(loader).toHaveBeenCalledWith('./models/eva-calor-alberta.glb');
    expect(obj.scale.x).toBe(-1);
  });

  it('falls back to the parametric model when loading fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const obj = await loadStoveObject(s, new Set(['eva-calor-alberta']), async () => {
      throw new Error('404');
    });
    expect(obj.name).toBe('stove-eva-calor-alberta');
    expect(warn).toHaveBeenCalled();
  });

  it('does not load anything for unlisted stoves', async () => {
    const loader = vi.fn(async () => fakeModel());
    const obj = await loadStoveObject(s, new Set(), loader);
    expect(loader).not.toHaveBeenCalled();
    expect(obj.name).toBe('stove-eva-calor-alberta');
  });
});

describe('loadModelIndex', () => {
  it('returns the listed ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(['a', 3, 'b']))));
    expect([...(await loadModelIndex('./models/index.json'))]).toEqual(['a', 'b']);
  });

  it('returns an empty set on HTTP errors or bad JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect((await loadModelIndex('x')).size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{bad')));
    expect((await loadModelIndex('x')).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/glb.test.ts`
Expected: FAIL — `fitToDims` / `loadModelIndex` / `loadStoveObject` are not exported.

- [ ] **Step 3: Append the loaders to `src/scene/stoveModel.ts`**

Change the type import at the top of the file to:
```ts
import type { Dims, Stove } from '../data/types';
```

Append at the end of the file:
```ts
export async function loadModelIndex(url: string): Promise<Set<string>> {
  try {
    const res = await fetch(url);
    if (!res.ok) return new Set();
    const ids: unknown = await res.json();
    return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Fits any model into the catalogue box (front assumed +z, glTF convention). */
export function fitToDims(obj: THREE.Object3D, dims: Dims): THREE.Group {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(centre.x, box.min.y, centre.z));
  const inner = new THREE.Group();
  inner.add(obj);
  inner.scale.set(dims.w / size.x, dims.h / size.y, dims.d / size.z);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  // The room root mirrors z; mirroring x as well turns that into a rotation, keeping the model's handedness.
  wrapper.scale.x = -1;
  return wrapper;
}

async function gltfLoad(url: string): Promise<THREE.Object3D> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return gltf.scene;
}

export async function loadStoveObject(
  s: Stove,
  overrides: Set<string>,
  loadGlb: (url: string) => Promise<THREE.Object3D> = gltfLoad,
): Promise<THREE.Object3D> {
  const dims = dimsOf(s);
  if (overrides.has(s.id)) {
    try {
      return fitToDims(await loadGlb(`./models/${s.id}.glb`), dims);
    } catch (err) {
      console.warn(`Modello 3D per ${s.id} non caricato, uso quello parametrico`, err);
    }
  }
  return buildStove(s);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/glb.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Add `replaceObject` to `PlacementController`**

In `src/scene/placement.ts`, inside `class PlacementController`, add after the `setStove` method:
```ts
  /** Swaps the stove mesh (e.g. when its GLB finishes loading) without touching pose, buffer or ring. */
  replaceObject(object: THREE.Object3D): void {
    if (!this.stove) return;
    this.holder.remove(this.stove.object);
    this.stove = { ...this.stove, object };
    this.holder.add(object);
  }
```

- [ ] **Step 6: Use the override in the viewer**

Create `public/models/index.json`:
```json
[]
```

In `src/viewer.ts`, replace
```ts
import { buildFlueHint, buildStove } from './scene/stoveModel';
```
with
```ts
import { buildFlueHint, buildStove, loadModelIndex, loadStoveObject } from './scene/stoveModel';
```

Replace
```ts
  let current: Stove | null = null;
```
with
```ts
  const overrides = await loadModelIndex('./models/index.json');
  let showToken = 0;
  let current: Stove | null = null;
```

In `function showStove(...)`, replace
```ts
    current = s?.dims ? s : null;
```
with
```ts
    // Every call invalidates a GLB still loading for a previously selected stove.
    const token = ++showToken;
    current = s?.dims ? s : null;
```

and replace
```ts
    placement.setStove({ object: buildStove(current), dims: current.dims, safety: current.safety }, extras);
  }
```
with
```ts
    placement.setStove({ object: buildStove(current), dims: current.dims, safety: current.safety }, extras);
    if (overrides.has(current.id)) {
      // Show the parametric stove at once, swap in the GLB when (and if) it arrives.
      void loadStoveObject(current, overrides).then((obj) => {
        if (token === showToken) placement.replaceObject(obj);
      });
    }
  }
```

- [ ] **Step 7: Verify in the browser with a sample GLB**

Download a small sample model for a quick check (not committed):
```bash
curl -L -o public/models/eva-calor-alberta.glb https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/BoxTextured/glTF-Binary/BoxTextured.glb
echo '["eva-calor-alberta"]' > public/models/index.json
```
Run `npm run dev`, open `/?stove=eva-calor-alberta`.
Expected: the parametric stove appears, then is replaced by the textured box stretched to 50 × 43 × 128 cm in the same place; dragging/rotating/buffer still work. Rename the file to break it and reload: the parametric stove stays and the console shows the "Modello 3D … non caricato" warning.

Then restore:
```bash
rm public/models/eva-calor-alberta.glb
echo '[]' > public/models/index.json
```

- [ ] **Step 8: Commit**

```bash
git add src/scene/stoveModel.ts src/scene/placement.ts src/viewer.ts public/models/index.json tests/glb.test.ts
git commit -m "feat: per-stove GLB override with parametric fallback"
```

---

### Task 15: GitHub Pages deployment

**Files:**
- Create: `.github/workflows/deploy.yml`
- Add to git: `assets/catalogues/`

**Interfaces:**
- Consumes: `npm test`, `npm run build` (the build copies `data/` and `assets/catalogues/` into `dist/`; Vite copies `public/models/`).

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Full local verification of the production build**

Run:
```bash
npx tsc --noEmit && npx vitest run && npm run build
ls dist dist/data dist/models && du -sh dist/assets/catalogues
```
Expected: all tests PASS; `dist/` contains `index.html`, `compare.html`, `data/stoves.json`, `data/apartment.json`, `models/index.json`, and `assets/catalogues` (~580 MB).

Run: `npx vite preview` and open the printed URL.
Expected: the viewer and compare page work exactly as in dev; a PDF link in the stove card opens the PDF at the right page (served from `dist/assets/catalogues`); the app works when served from a sub-path (relative URLs — check `http://localhost:4173/index.html?stove=eva-calor-alberta`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml assets/catalogues
git commit -m "ci: deploy to GitHub Pages with catalogue PDFs"
```

- [ ] **Step 4: Hand-off note for the user (no action by the implementer)**

Report to the user: to go live, create the GitHub repository, push `main`, and set *Settings → Pages → Source* to **GitHub Actions**. Pushing ~580 MB of PDFs takes a while; the largest file is 91 MB, under GitHub's 100 MB limit.
