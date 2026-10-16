# Stove Viewer v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the app to wood stoves with a depth-based free-wall filter, add catalogue pictures (details window, compare page, optional front photo on the 3D stove with a dev-only cropper), a real chimney pipe, and the room details from the photos.

**Architecture:** Same two-page Vite app as v1. New pure modules (`src/data/images.ts`, `src/ui/cropMath.ts`, `scripts/frontsMiddleware.ts`) are unit-tested; an offline Python script fills `public/stove-images/`; new DOM components (`detailsWindow`, `lightbox`, `cropper`) are wired in the page entries and checked in the browser.

**Tech Stack:** Node 24.8.0 (asdf), Vite 8, TypeScript, three 0.186, Vitest 5; Python 3 + PyMuPDF + Pillow for the extraction script only.

**Spec:** `docs/superpowers/specs/2026-10-16-stove-viewer-v2-design.md` (addendum to `docs/superpowers/specs/2026-10-16-stove-viewer-design.md`)

## Global Constraints

- All v1 constraints in CLAUDE.md still hold: metres everywhere, room coordinates under the z-mirrored `viewer.root`, stove front = local +z, no safety-distance fallback, no violation logic, relative URLs, Italian UI copy.
- Excluded categories, exactly: `cookstove`, `thermo_stove`, `thermo_cookstove`, `insert`. Everything else is kept (539 models in the current data).
- Free-wall filter: stove depth ≤ `0.57` m; width ignored.
- Pictures live in `public/stove-images/` (`img/<16-hex>.jpg`, `index.json`, `fronts.json`), committed and deployed; served at `./stove-images/…`.
- Image extraction rules: skip short side < 200 px, aspect > 3, colour-space-less (mask) images, duplicate pixels; long side ≤ 900 px; JPEG quality 80.
- The cropper and `/__fronts` API exist only on the dev server (`import.meta.env.DEV`, Vite `apply: 'serve'`).
- `buildStove()` keeps an exact `w × h × d` bounding box in every mode (panels or front photo). The chimney is a separate object, not part of that box.
- Shared materials from `mats()` are never disposed; per-instance materials get `userData.disposable = true`.
- New room fixtures and finishes are estimates and stay editable in `data/apartment.json`.

## Review Focus

1. A stove with images but whose saved front crop points at an image no longer in `index.json` (re-extraction changed hashes) → the front entry is ignored, the "Foto frontale" toggle is disabled, nothing breaks. Pinned in Task 6 (`parseFronts`).
2. `index.json` or `fronts.json` missing/corrupt on the deployed site → app works with no pictures. Pinned in Task 6 (`loadImages`).
3. A crop dragged outside the image or to zero size in the cropper → clamped to the image, minimum size kept, never saved out of bounds. Pinned in Task 9 (`cropMath`) and the middleware validation.
4. Selecting stove B while stove A's front texture is still loading → A's texture must not end up on B. Pinned by the `showToken` guard in Task 8 (browser check) — reviewer to verify the wiring.
5. The details window dragged so it would leave the stage, or a saved position from a larger screen → clamped back inside the stage. Reviewer to verify in `detailsWindow.ts`.

## File map (new / changed)

```
data/apartment.json                      fixtures, finishes, stairs door swing
public/stove-images/{img/,index.json,fronts.json}
scripts/extract_images.py, scripts/requirements.txt
scripts/frontsMiddleware.ts              dev-only save/delete of front crops
src/data/types.ts                        Fixture types, Finishes
src/data/stoves.ts                       EXCLUDED_CATEGORIES
src/data/filters.ts                      no categories, depth rule
src/data/apartment.ts                    FREE_WALL.maxDepth, new fixtures, finishes, 2D overlap
src/data/images.ts                       index/fronts parsing, picturesFor, loadImages
src/data/urlState.ts                     front=1
src/scene/room.ts                        skirting, sills, wall plates
src/scene/stoveModel.ts                  buildChimney, front photo, cropUv, frontPhotoRect
src/ui/cropMath.ts                       pure crop helpers
src/ui/lightbox.ts, detailsWindow.ts, cropper.ts
src/ui/stoveCard.ts                      compact card
src/ui/filtersPanel.ts, placementPanel.ts
src/viewer.ts, src/compare.ts, src/style.css, vite.config.ts, tsconfig.json
README.md, CLAUDE.md
```

---

### Task 1: Wood stoves only, depth-based free-wall filter

**Files:**
- Modify: `src/data/stoves.ts`, `src/data/filters.ts`, `src/data/apartment.ts`, `src/ui/filtersPanel.ts`, `src/viewer.ts`
- Test: `tests/stoves.test.ts`, `tests/filters.test.ts` (rewritten), `tests/apartment.test.ts`

**Interfaces:**
- Produces: `EXCLUDED_CATEGORIES: string[]` (stoves.ts); `FREE_WALL: { wall: Wall; from: number; to: number; maxDepth: number }`; `defaultFilters(): FilterState` (no argument); `FilterState` without `categories`; `fitsFreeWall(s)` = depth ≤ `FREE_WALL.maxDepth`.

- [ ] **Step 1: Write the failing tests**

In `tests/stoves.test.ts` replace:
```ts
  it('matches the summary counts', () => {
    expect(cat.stoves).toHaveLength(668);
    expect(cat.stoves.filter((s) => s.dims).length).toBe(602);
    expect(cat.stoves.filter((s) => s.safety).length).toBe(219);
  });
```
with:
```ts
  it('keeps only wood stoves', () => {
    expect(cat.stoves).toHaveLength(539);
    expect(cat.stoves.filter((s) => s.dims).length).toBe(473);
    expect(cat.stoves.filter((s) => s.safety).length).toBe(198);
    expect(Object.keys(cat.categories).sort()).toEqual(['fireplace_stove', 'storage_stove', 'stove', 'stove_with_oven']);
  });
```

and replace:
```ts
describe('real catalogue', () => {
```
with:
```ts
describe('normaliseCatalogue scope', () => {
  it('drops cookers, boiler stoves and inserts, keeps unknown categories', () => {
    const cat = normaliseCatalogue({
      categories: { stove: 'Stufa', cookstove: 'Cucina', weird: 'Altro', insert: 'Inserto' },
      stoves: [
        rawStove({ id: 'a' }),
        rawStove({ id: 'b', category: 'cookstove' }),
        rawStove({ id: 'c', category: 'weird', brand: 'Zeta' }),
        rawStove({ id: 'd', category: 'insert', brand: 'Gone' }),
        rawStove({ id: 'e', category: 'thermo_stove' }),
        rawStove({ id: 'f', category: 'thermo_cookstove' }),
      ],
    });
    expect(cat.stoves.map((s) => s.id)).toEqual(['a', 'c']);
    expect(Object.keys(cat.categories)).toEqual(['stove', 'weird']);
    expect(cat.brands).toEqual(['Eva Calor', 'Zeta']);
  });
});

describe('real catalogue', () => {
```

Replace the whole of `tests/filters.test.ts` with:
```ts
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
```

In `tests/apartment.test.ts` replace:
```ts
    expect(FREE_WALL).toEqual({ wall: 'east', from: 1.52, to: 3.4, depth: 2 });
```
with:
```ts
    expect(FREE_WALL).toEqual({ wall: 'east', from: 1.52, to: 3.4, maxDepth: 0.57 });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/stoves.test.ts tests/filters.test.ts tests/apartment.test.ts`
Expected: FAIL — 668 ≠ 539, unknown categories test fails, `fitsFreeWall` depth cases fail, `'categories' in f` is true, FREE_WALL shape differs.

- [ ] **Step 3: Implement**

In `src/data/stoves.ts` replace:
```ts
const ROUND_RE = /cilindr|rotond|round/i;
```
with:
```ts
const ROUND_RE = /cilindr|rotond|round/i;

/** Not stufe a legna: cookers, boiler stoves and fireplace inserts. Unknown categories are kept. */
export const EXCLUDED_CATEGORIES = ['cookstove', 'thermo_stove', 'thermo_cookstove', 'insert'];
```

and replace:
```ts
export function normaliseCatalogue(raw: RawCatalogue): Catalogue {
  const stoves = raw.stoves.map(normaliseStove);
  const brands = [...new Set(stoves.map((s) => s.brand))].sort((a, b) => a.localeCompare(b));
  return { stoves, categories: raw.categories, brands };
}
```
with:
```ts
export function normaliseCatalogue(raw: RawCatalogue): Catalogue {
  const stoves = raw.stoves.filter((s) => !EXCLUDED_CATEGORIES.includes(s.category)).map(normaliseStove);
  const brands = [...new Set(stoves.map((s) => s.brand))].sort((a, b) => a.localeCompare(b));
  const categories = Object.fromEntries(Object.entries(raw.categories).filter(([k]) => !EXCLUDED_CATEGORIES.includes(k)));
  return { stoves, categories, brands };
}
```

In `src/data/apartment.ts` replace:
```ts
/** Free east-wall segment between the soggiorno door and the north corner; `depth` is the room width in front of it. */
export const FREE_WALL: { wall: Wall; from: number; to: number; depth: number } = {
  wall: 'east',
  from: 1.52,
  to: 3.4,
  depth: 2,
};
```
with:
```ts
/** Free east-wall segment between the soggiorno door and the north corner; `maxDepth` keeps the passage clear. */
export const FREE_WALL: { wall: Wall; from: number; to: number; maxDepth: number } = {
  wall: 'east',
  from: 1.52,
  to: 3.4,
  maxDepth: 0.57,
};
```

In `src/data/filters.ts`:
- remove the line `  categories: Set<string>;` from `FilterState`;
- replace the `defaultFilters` signature line and its `categories:` line:
```ts
export function defaultFilters(categories: Record<string, string>): FilterState {
  return {
    categories: new Set(Object.keys(categories).filter((c) => c !== 'insert')),
    brands: new Set(),
```
with:
```ts
export function defaultFilters(): FilterState {
  return {
    brands: new Set(),
```
- remove the line `  if (!f.categories.has(s.category)) return false;` from `passes`;
- replace the body of `fitsFreeWall`:
```ts
  if (!s.dims) return false;
  const len = FREE_WALL.to - FREE_WALL.from;
  const { w, d } = s.dims;
  return (w <= len && d <= FREE_WALL.depth) || (d <= len && w <= FREE_WALL.depth);
```
with:
```ts
  return s.dims !== null && s.dims.d <= FREE_WALL.maxDepth + 1e-9;
```

In `src/ui/filtersPanel.ts`:
- delete the line `      group('Categoria', checks(Object.entries(ctx.catalogue.categories).map(([value, label]) => ({ value, label })), state.categories, emit)),`
- replace `toggle('Ci sta nella parete libera (1,88 m)',` with `toggle('Profondità max 57 cm (parete libera)',`
- replace `const fresh = defaultFilters(ctx.catalogue.categories);` with `const fresh = defaultFilters();`

In `src/viewer.ts` replace `  let filters = defaultFilters(catalogue.categories);` with `  let filters = defaultFilters();`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Verify in the browser**

`npm run dev`: the Categoria filter is gone; the count reads "4xx stufe" with "66 senza dimensioni" replaced by the new number (539 − 473 = 66 → still 66); ticking "Profondità max 57 cm (parete libera)" leaves 398 stoves (with all other filters untouched).

- [ ] **Step 6: Commit**

```bash
git add src/data/stoves.ts src/data/filters.ts src/data/apartment.ts src/ui/filtersPanel.ts src/viewer.ts tests/stoves.test.ts tests/filters.test.ts tests/apartment.test.ts
git commit -m "feat: wood stoves only, free-wall filter by depth (max 57 cm)"
```

---

### Task 2: Room data — wall fixtures, finishes, stairs door

**Files:**
- Modify: `src/data/types.ts`, `src/data/apartment.ts`, `data/apartment.json`
- Test: `tests/apartment.test.ts`, `tests/doors.test.ts`

**Interfaces:**
- Produces: `type FixtureType = 'radiator' | 'switch' | 'socket' | 'thermostat'`; `Fixture { …; type: FixtureType; gangs: 1 | 2 }`; `interface Finishes { skirting: { height: number; thickness: number } | null; sills: boolean }`; `Room.finishes: Finishes`.

- [ ] **Step 1: Update `data/apartment.json`**

Replace the `scale` opening line:
```json
      { "id": "scale", "name": "Scale", "wall": "west", "from": 2.25, "to": 3.05, "height": 2.1, "door": { "hinge": "to", "swing": "in", "glazed": true } },
```
with:
```json
      { "id": "scale", "name": "Scale", "wall": "west", "from": 2.25, "to": 3.05, "height": 2.1, "door": { "hinge": "to", "swing": "out", "glazed": true } },
```

Replace the `fixtures` array:
```json
    "fixtures": [
      { "id": "radiatore", "type": "radiator", "wall": "east", "from": 0.1, "to": 0.6, "height": 0.85, "depth": 0.12, "elevation": 0.12 }
    ]
```
with:
```json
    "fixtures": [
      { "id": "radiatore", "type": "radiator", "wall": "east", "from": 0.1, "to": 0.6, "height": 0.85, "depth": 0.12, "elevation": 0.12 },
      { "id": "interruttore-notte", "type": "switch", "gangs": 2, "wall": "north", "from": 0.26, "to": 0.34, "height": 0.12, "depth": 0.01, "elevation": 1.04 },
      { "id": "termostato", "type": "thermostat", "wall": "north", "from": 1.69, "to": 1.81, "height": 0.08, "depth": 0.03, "elevation": 1.46 },
      { "id": "interruttore-soggiorno", "type": "switch", "gangs": 1, "wall": "east", "from": 1.61, "to": 1.69, "height": 0.08, "depth": 0.01, "elevation": 1.06 },
      { "id": "presa", "type": "socket", "wall": "east", "from": 1.61, "to": 1.69, "height": 0.08, "depth": 0.01, "elevation": 0.2 }
    ],
    "finishes": { "skirting": { "height": 0.08, "thickness": 0.01 }, "sills": true }
```

- [ ] **Step 2: Write the failing tests**

In `tests/apartment.test.ts`, inside `describe('parseApartment', …)`, after the `it('parses the real file', …)` block add:
```ts
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
```

In `tests/doors.test.ts`, inside `describe('doorPose', …)` add:
```ts
  it('stairs door opens towards the stairs (west)', () => {
    const p = doorPose(apt.room, opening('scale'), apt.wallThickness);
    const open = leafDir(p.open);
    expect(open.x).toBeCloseTo(-1);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/apartment.test.ts tests/doors.test.ts`
Expected: FAIL — `type deve essere radiator` for the new fixtures, `finishes` undefined.

- [ ] **Step 4: Implement**

In `src/data/types.ts` replace:
```ts
export interface Fixture {
  id: string;
  type: 'radiator';
```
with:
```ts
export type FixtureType = 'radiator' | 'switch' | 'socket' | 'thermostat';

export interface Fixture {
  id: string;
  type: FixtureType;
  /** Number of rockers on a switch plate (1 for every other type). */
  gangs: 1 | 2;
```

and replace:
```ts
  fixtures: Fixture[];
}
```
with:
```ts
  fixtures: Fixture[];
  finishes: Finishes;
}

export interface Finishes {
  skirting: { height: number; thickness: number } | null;
  sills: boolean;
}
```

In `src/data/apartment.ts`:

replace the import line with:
```ts
import type { Apartment, DoorSpec, Finishes, Fixture, FixtureType, Opening, Room, Wall } from './types';
```

replace:
```ts
  if (o.type !== 'radiator') fail(`${where}type deve essere radiator`);
  return {
    id: reqStr(o, 'id', where),
    type: 'radiator',
```
with:
```ts
  if (!FIXTURE_TYPES.includes(o.type as FixtureType)) fail(`${where}type deve essere ${FIXTURE_TYPES.join('|')}`);
  if (o.gangs !== undefined && o.gangs !== 1 && o.gangs !== 2) fail(`${where}gangs deve essere 1 o 2`);
  return {
    id: reqStr(o, 'id', where),
    type: o.type as FixtureType,
    gangs: o.type === 'switch' && o.gangs === 2 ? 2 : 1,
```

replace:
```ts
const WALLS: Wall[] = ['north', 'south', 'east', 'west'];
```
with:
```ts
const WALLS: Wall[] = ['north', 'south', 'east', 'west'];
const FIXTURE_TYPES: FixtureType[] = ['radiator', 'switch', 'socket', 'thermostat'];

function parseFinishes(v: unknown): Finishes {
  if (v === undefined || v === null) return { skirting: null, sills: false };
  const f = obj(v, 'room.finishes');
  let skirting: Finishes['skirting'] = null;
  if (f.skirting !== undefined && f.skirting !== null) {
    const s = obj(f.skirting, 'room.finishes.skirting');
    const height = reqNum(s, 'height', 'room.finishes.skirting.');
    const thickness = reqNum(s, 'thickness', 'room.finishes.skirting.');
    if (height <= 0 || thickness <= 0) fail('room.finishes.skirting: height e thickness devono essere positivi');
    skirting = { height, thickness };
  }
  return { skirting, sills: f.sills === true };
}

/** Vertical extent of an item on its wall: openings from the floor to the top of door + transom. */
function verticalRange(it: Opening | Fixture): [number, number] {
  return 'elevation' in it ? [it.elevation, it.elevation + it.height] : [0, it.height + it.transom];
}
```

replace:
```ts
  for (const wall of WALLS) {
    const onWall = items.filter((it) => it.wall === wall).sort((a, b) => a.from - b.from);
    for (let i = 1; i < onWall.length; i++) {
      if (onWall[i].from < onWall[i - 1].to - EPS) {
        fail(`"${onWall[i - 1].id}" e "${onWall[i].id}" si sovrappongono sulla parete ${wall}`);
      }
    }
  }
```
with:
```ts
  for (const wall of WALLS) {
    const onWall = items.filter((it) => it.wall === wall);
    for (let i = 0; i < onWall.length; i++) {
      for (let j = i + 1; j < onWall.length; j++) {
        const a = onWall[i];
        const b = onWall[j];
        const [ay0, ay1] = verticalRange(a);
        const [by0, by1] = verticalRange(b);
        const along = a.from < b.to - EPS && b.from < a.to - EPS;
        const vertical = ay0 < by1 - EPS && by0 < ay1 - EPS;
        if (along && vertical) fail(`"${a.id}" e "${b.id}" si sovrappongono sulla parete ${wall}`);
      }
    }
  }
```

replace:
```ts
      fixtures: fixtures.map(parseFixture),
    },
```
with:
```ts
      fixtures: fixtures.map(parseFixture),
      finishes: parseFinishes(room.finishes),
    },
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS (the existing radiator-overlap test still throws because the radiator and the soggiorno opening overlap both ways), no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/apartment.ts data/apartment.json tests/apartment.test.ts tests/doors.test.ts
git commit -m "feat: wall fixtures, finishes and stairs door swing in apartment data"
```

---

### Task 3: Render skirting, sills and wall plates

**Files:**
- Modify: `src/scene/room.ts`
- Test: `tests/room.test.ts`

**Interfaces:**
- Consumes: `Room.finishes`, `Fixture.type/gangs` (Task 2).
- Produces: `skirtingSegments(room: Room, wall: Wall, thickness: number, casing?: number): [number, number][]`; meshes named `skirting`, `sill-<openingId>`, groups named `fixture-<fixtureId>` inside the wall groups.

- [ ] **Step 1: Write the failing tests**

In `tests/room.test.ts` change the import to:
```ts
import { buildRoom, skirtingSegments, wallPieces, wallPoint, wallYaw } from '../src/scene/room';
```
and append:
```ts
describe('skirtingSegments', () => {
  const close = (got: [number, number][], want: [number, number][]) => {
    expect(got).toHaveLength(want.length);
    got.forEach(([a, b], i) => {
      expect(a).toBeCloseTo(want[i][0]);
      expect(b).toBeCloseTo(want[i][1]);
    });
  };

  it('runs between the door casings, closing the corners on north/south walls', () => {
    close(skirtingSegments(room, 'east', 0.01), [[0, 0.65], [1.59, 3.4]]);
    close(skirtingSegments(room, 'west', 0.01), [[0, 0.65], [1.59, 2.18], [3.12, 3.4]]);
    close(skirtingSegments(room, 'north', 0.01), [[-0.01, 0.56], [1.5, 2.01]]);
    close(skirtingSegments(room, 'south', 0.01), [[-0.01, 0.48], [1.52, 2.01]]);
  });
});

describe('buildRoom details', () => {
  const view = buildRoom(apt);
  const names = (wall: 'north' | 'south' | 'east' | 'west') => view.walls.get(wall)!.children.map((c) => c.name);

  it('adds skirting, sills and wall plates to their walls', () => {
    expect(names('north').filter((n) => n === 'skirting')).toHaveLength(2);
    expect(names('north')).toEqual(expect.arrayContaining(['sill-disimpegno', 'fixture-interruttore-notte', 'fixture-termostato']));
    expect(names('east')).toEqual(expect.arrayContaining(['fixture-interruttore-soggiorno', 'fixture-presa', 'sill-soggiorno']));
  });

  it('draws one rocker per gang', () => {
    const plate = view.walls.get('north')!.getObjectByName('fixture-interruttore-notte')!;
    expect(plate.children.filter((c) => c.name === 'rocker')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/room.test.ts`
Expected: FAIL — `skirtingSegments` is not exported.

- [ ] **Step 3: Implement in `src/scene/room.ts`**

Replace the import line `import type { Apartment, Room, Wall } from '../data/types';` with:
```ts
import type { Apartment, Fixture, Room, Wall } from '../data/types';
```

After the `wallYaw` function add:
```ts
/** Along-wall runs that get skirting: corner to corner, interrupted at each opening plus its casing. */
export function skirtingSegments(room: Room, wall: Wall, thickness: number, casing = 0.07): [number, number][] {
  const len = wallLength(room, wall);
  const ext = wall === 'north' || wall === 'south' ? thickness : 0;
  const gaps = room.openings
    .filter((o) => o.wall === wall)
    .map((o) => [o.from - casing, o.to + casing] as const)
    .sort((a, b) => a[0] - b[0]);
  const runs: [number, number][] = [];
  let cursor = 0 - ext;
  for (const [g0, g1] of gaps) {
    if (g0 > cursor + 1e-9) runs.push([cursor, g0]);
    cursor = Math.max(cursor, g1);
  }
  if (len + ext > cursor + 1e-9) runs.push([cursor, len + ext]);
  return runs;
}

/**
 * With rotation.y = wallYaw(wall), local +z points into the room on the south and east walls
 * and out of it on the north and west walls.
 */
const INTO_ROOM_Z: Record<Wall, 1 | -1> = { south: 1, east: 1, north: -1, west: -1 };

/** A switch, socket or thermostat on the inner face of its wall. Local frame: x along the wall, y up. */
function buildPlate(f: Fixture, wall: Wall, mats: { plate: THREE.Material; dark: THREE.Material; dial: THREE.Material }): THREE.Group {
  const k = INTO_ROOM_Z[wall];
  const g = new THREE.Group();
  g.name = `fixture-${f.id}`;
  const w = f.to - f.from;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, f.height, f.depth), mats.plate);
  plate.position.z = (k * f.depth) / 2;
  g.add(plate);
  if (f.type === 'switch') {
    const pitch = f.height / f.gangs;
    for (let i = 0; i < f.gangs; i++) {
      const rocker = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, pitch * 0.6, 0.006), mats.plate);
      rocker.name = 'rocker';
      rocker.position.set(0, -f.height / 2 + pitch * (i + 0.5), k * (f.depth + 0.003));
      g.add(rocker);
    }
  } else if (f.type === 'socket') {
    for (const dx of [-0.012, 0.012]) {
      const hole = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.012, 0.002), mats.dark);
      hole.position.set(dx, 0, k * (f.depth + 0.001));
      g.add(hole);
    }
  } else if (f.type === 'thermostat') {
    const dialGeo = new THREE.CylinderGeometry(Math.min(w, f.height) * 0.3, Math.min(w, f.height) * 0.3, 0.004, 24);
    dialGeo.rotateX(Math.PI / 2);
    const dial = new THREE.Mesh(dialGeo, mats.dial);
    dial.position.set(w * 0.12, 0, k * (f.depth + 0.002));
    g.add(dial);
  }
  return g;
}
```

Inside `buildRoom`, after the line `  const radMat = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.35 });` add:
```ts
  const skirtMat = new THREE.MeshStandardMaterial({ color: '#d8ccb4', roughness: 0.35 });
  const sillMat = new THREE.MeshStandardMaterial({ color: '#e6e1d8', roughness: 0.25 });
  const plateMats = {
    plate: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.6 }),
    dial: new THREE.MeshStandardMaterial({ color: '#d9d9d6', roughness: 0.5 }),
  };
```

In the per-wall loop, the `add` helper returns nothing today; replace it:
```ts
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, a: number, y: number, out: number) => {
      const m = new THREE.Mesh(geo, mat);
      const c = wallPoint(room, wall, a, out);
      m.position.set(c.x, y, c.z);
      m.rotation.y = wallYaw(wall);
      m.castShadow = true;
      m.receiveShadow = true;
      wg.add(m);
    };
```
with:
```ts
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, a: number, y: number, out: number, name = '') => {
      const m = new THREE.Mesh(geo, mat);
      const c = wallPoint(room, wall, a, out);
      m.position.set(c.x, y, c.z);
      m.rotation.y = wallYaw(wall);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      wg.add(m);
    };
```

Still inside the per-wall loop, replace:
```ts
      add(threshold, voidMat, mid, 0.001, T + 0.4);
    }
    walls.set(wall, wg);
```
with:
```ts
      add(threshold, voidMat, mid, 0.001, T + 0.4);
      if (room.finishes.sills) add(new THREE.BoxGeometry(width, 0.005, T), sillMat, mid, 0.0005, T / 2, `sill-${o.id}`);
    }
    const skirting = room.finishes.skirting;
    if (skirting) {
      for (const [a0, a1] of skirtingSegments(room, wall, skirting.thickness)) {
        add(new THREE.BoxGeometry(a1 - a0, skirting.height, skirting.thickness), skirtMat, (a0 + a1) / 2, skirting.height / 2, -skirting.thickness / 2, 'skirting');
      }
    }
    for (const f of room.fixtures.filter((x) => x.wall === wall && x.type !== 'radiator')) {
      const plate = buildPlate(f, wall, plateMats);
      const c = wallPoint(room, wall, (f.from + f.to) / 2, 0);
      plate.position.set(c.x, f.elevation + f.height / 2, c.z);
      plate.rotation.y = wallYaw(wall);
      wg.add(plate);
    }
    walls.set(wall, wg);
```

Replace the radiator loop header `  for (const f of room.fixtures) {` with:
```ts
  for (const f of room.fixtures.filter((x) => x.type === 'radiator')) {
```

Add to `tests/room.test.ts` inside `describe('buildRoom details', …)` a check that plates sit on the room side:
```ts
  it('puts plates on the room side of their wall', () => {
    view.group.updateMatrixWorld(true);
    const centre = (name: string) => new THREE.Box3().setFromObject(view.group.getObjectByName(name)!).getCenter(new THREE.Vector3());
    expect(centre('fixture-termostato').z).toBeLessThan(3.4);
    expect(centre('fixture-termostato').z).toBeGreaterThan(3.4 - 0.05);
    expect(centre('fixture-presa').x).toBeLessThan(2);
    expect(centre('fixture-presa').x).toBeGreaterThan(2 - 0.05);
  });
```
(Add it in Step 1 with the other tests so it fails first.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/room.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

`npm run dev`, 3D view, orbit around:
- beige skirting along all four walls, stopping at each door casing, corners closed;
- light marble sills in each doorway;
- 2-gang switch on the north wall left of the night-area door (~1.1 m), thermostat right of it near the corner (~1.5 m), 1-gang switch and a low socket on the east wall just north of the soggiorno doorway;
- every plate sits on the room side of its wall (not buried); the stairs door now swings out (no floor arc at the stairs door).
Compare with `assets/photos/apartment/corridor-day-area/IMG_5474.jpeg` and `corridor-night-area/door-day-night-area.jpeg`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/room.ts tests/room.test.ts
git commit -m "feat: skirting, door sills, switches, socket and thermostat in the ingresso"
```

---

### Task 4: Chimney pipe

**Files:**
- Modify: `src/scene/stoveModel.ts`, `src/viewer.ts`
- Test: `tests/stoveModel.test.ts`

**Interfaces:**
- Produces: `buildChimney(s: Stove, ceiling: number): THREE.Group` with children named `chimney-vertical`, `chimney-ceiling`, and for rear outlets `chimney-run`, `chimney-elbow`. Removes `buildFlueHint`.

- [ ] **Step 1: Write the failing tests**

In `tests/stoveModel.test.ts` change the import to:
```ts
import { baseHeight, buildChimney, buildStove, collarOf, frontLayout } from '../src/scene/stoveModel';
```
and replace:
```ts
  it('flue hint reaches the ceiling', () => {
    const line = buildFlueHint(stove({ dims }), 2.7);
    const pos = line.geometry.getAttribute('position');
    expect(pos.getY(pos.count - 1)).toBeCloseTo(2.7);
  });
```
with:
```ts
  const boxOf = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

  it('top outlet: pipe from the stove top to the ceiling, with a ceiling collar', () => {
    const s = stove({ dims, flueOutlets: ['top'], flueDiameter: 0.15 });
    const g = buildChimney(s, 2.7);
    const pipe = boxOf(g.getObjectByName('chimney-vertical')!);
    expect(pipe.min.y).toBeCloseTo(1.282);
    expect(pipe.max.y).toBeCloseTo(2.7);
    expect(pipe.max.x - pipe.min.x).toBeCloseTo(0.15);
    expect((pipe.min.z + pipe.max.z) / 2).toBeCloseTo(collarOf(s).center.z);
    expect(boxOf(g.getObjectByName('chimney-ceiling')!).max.y).toBeCloseTo(2.7);
    expect(g.getObjectByName('chimney-run')).toBeUndefined();
  });

  it('rear outlet: 25 cm run backwards, elbow, then up to the ceiling', () => {
    const s = stove({ dims, flueOutlets: ['rear'] });
    const c = collarOf(s);
    const g = buildChimney(s, 2.7);
    const run = boxOf(g.getObjectByName('chimney-run')!);
    expect(run.max.z).toBeCloseTo(-0.433 / 2);
    expect(run.min.z).toBeCloseTo(-0.433 / 2 - 0.25);
    const up = boxOf(g.getObjectByName('chimney-vertical')!);
    expect(up.min.y).toBeCloseTo(c.center.y);
    expect(up.max.y).toBeCloseTo(2.7);
    expect((up.min.z + up.max.z) / 2).toBeCloseTo(-0.433 / 2 - 0.25);
    expect(g.getObjectByName('chimney-elbow')).toBeDefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/stoveModel.test.ts`
Expected: FAIL — `buildChimney` is not exported.

- [ ] **Step 3: Implement**

In `src/scene/stoveModel.ts`, in `makeMaterials()` replace:
```ts
    flue: new THREE.LineDashedMaterial({ color: '#9ca3af', dashSize: 0.06, gapSize: 0.05 }),
```
with:
```ts
    pipe: new THREE.MeshStandardMaterial({ color: '#1b1b1c', metalness: 0.6, roughness: 0.5 }),
```

Replace the whole `buildFlueHint` function with:
```ts
const REAR_RUN = 0.25;
const CEILING_COLLAR_H = 0.02;

/** Black steel flue pipe from the stove collar to the ceiling (stove-local frame, front +z). */
export function buildChimney(s: Stove, ceiling: number): THREE.Group {
  const c = collarOf(s);
  const { h, d } = dimsOf(s);
  const r = c.diameter / 2;
  const pipe = mats().pipe;
  const g = new THREE.Group();
  g.name = 'chimney';

  const named = (m: THREE.Mesh, name: string) => {
    m.name = name;
    g.add(m);
    return m;
  };
  const vertical = (z: number, y0: number) => {
    const len = Math.max(ceiling - y0, 0.01);
    named(mesh(new THREE.CylinderGeometry(r, r, len, 24), pipe, c.center.x, y0 + len / 2, z), 'chimney-vertical');
  };

  let topZ = c.center.z;
  if (c.position === 'top') {
    vertical(c.center.z, h);
  } else {
    topZ = -d / 2 - REAR_RUN;
    const run = named(mesh(new THREE.CylinderGeometry(r, r, REAR_RUN, 24), pipe, c.center.x, c.center.y, -d / 2 - REAR_RUN / 2), 'chimney-run');
    run.rotation.x = Math.PI / 2;
    named(mesh(new THREE.SphereGeometry(r * 1.05, 16, 12), pipe, c.center.x, c.center.y, topZ), 'chimney-elbow');
    vertical(topZ, c.center.y);
  }
  named(mesh(new THREE.CylinderGeometry(r + 0.03, r + 0.03, CEILING_COLLAR_H, 32), pipe, c.center.x, ceiling - CEILING_COLLAR_H / 2, topZ), 'chimney-ceiling');
  return g;
}
```

In `src/viewer.ts`:
- in the import from `./scene/stoveModel`, replace `buildFlueHint` with `buildChimney`;
- replace `const extras: THREE.Object3D[] = [buildFlueHint(current, apartment.ceilingHeight)];` with `const extras: THREE.Object3D[] = [buildChimney(current, apartment.ceilingHeight)];`

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Verify in the browser**

`/?stove=eva-calor-alberta`: a black pipe rises from the stove top to the ceiling with a ring at the ceiling; dragging/rotating moves it with the stove; plan view shows its circle. Pick a rear-only stove (e.g. find one with `flueOutlets` = rear via the console: `fetch('./data/stoves.json').then(r=>r.json()).then(d=>d.stoves.filter(s=>s.flue.outlet&&!s.flue.outlet.includes('top')).map(s=>s.id))`) and check the run–elbow–riser shape behind it.

- [ ] **Step 6: Commit**

```bash
git add src/scene/stoveModel.ts src/viewer.ts tests/stoveModel.test.ts
git commit -m "feat: chimney pipe from the stove collar to the ceiling"
```

---
### Task 5: Extract stove pictures from the catalogues

**Files:**
- Create: `scripts/extract_images.py`, `scripts/requirements.txt`, `public/stove-images/fronts.json`
- Generate: `public/stove-images/img/*.jpg`, `public/stove-images/index.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `public/stove-images/index.json` — `{ "<stove-id>": ["img/<16-hex>.jpg", …] }`, keys sorted; `public/stove-images/fronts.json` — `{}` initially.

The script is a one-off data tool (not part of the app or its test suite); it is verified by running it and inspecting the output.

- [ ] **Step 1: Write `scripts/requirements.txt`**

```
pymupdf>=1.26
pillow>=10
```

- [ ] **Step 2: Write `scripts/extract_images.py`**

```python
#!/usr/bin/env python3
"""Extract stove pictures from the catalogue PDFs into public/stove-images/.

Usage:  python3 scripts/extract_images.py [--only STOVE_ID]

Needs assets/catalogues/ locally (it is not in git) and the packages in
scripts/requirements.txt. Never touches public/stove-images/fronts.json.
"""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'stove-images'
IMG_DIR = OUT / 'img'
INDEX = OUT / 'index.json'
EXCLUDED = {'cookstove', 'thermo_stove', 'thermo_cookstove', 'insert'}
MIN_SIDE = 200
MAX_ASPECT = 3.0
MAX_SIDE = 900
QUALITY = 80


def page_numbers(spec):
    """55 → [55]; "1-3" → [1, 2, 3]; "40-41,77" → [40, 41, 77]."""
    if isinstance(spec, int):
        return [spec]
    out = []
    for part in str(spec).split(','):
        m = re.fullmatch(r'\s*(\d+)\s*(?:-\s*(\d+))?\s*', part)
        if m:
            a = int(m[1])
            out.extend(range(a, int(m[2] or a) + 1))
    return out


def load_image(doc, xref, smask):
    pix = pymupdf.Pixmap(doc, xref)
    if smask:
        pix = pymupdf.Pixmap(pix, pymupdf.Pixmap(doc, smask))
    if pix.n - pix.alpha > 3:  # CMYK and friends
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    im = Image.open(io.BytesIO(pix.tobytes('png')))
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, 'white')
        bg.paste(im, mask=im.split()[3])
        return bg
    return im.convert('RGB')


def page_images(doc, page_no):
    page = doc[page_no - 1]
    for xref, smask, w, h, _bpc, colorspace, *_ in page.get_images(full=True):
        if not colorspace or min(w, h) < MIN_SIDE or max(w, h) / min(w, h) > MAX_ASPECT:
            continue
        try:
            yield load_image(doc, xref, smask)
        except Exception as err:  # broken or exotic image streams
            print(f'    skip xref {xref}: {err}')


def save(im):
    digest = hashlib.sha1(im.tobytes()).hexdigest()[:16]
    rel = f'img/{digest}.jpg'
    path = OUT / rel
    if not path.exists():
        im = im.copy()
        im.thumbnail((MAX_SIDE, MAX_SIDE))
        im.save(path, 'JPEG', quality=QUALITY, optimize=True)
    return rel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only', help='re-extract a single stove id and merge into the index')
    args = parser.parse_args()

    stoves = [s for s in json.loads((ROOT / 'data' / 'stoves.json').read_text())['stoves'] if s['category'] not in EXCLUDED]
    if args.only:
        stoves = [s for s in stoves if s['id'] == args.only]
        if not stoves:
            raise SystemExit(f'unknown or excluded stove id: {args.only}')
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    index = json.loads(INDEX.read_text()) if args.only and INDEX.exists() else {}
    docs = {}

    for s in stoves:
        pictures = []
        for src in s['sources']:
            path = ROOT / src['file'].replace('assets/catalogues/catalogues/', 'assets/catalogues/', 1)
            if not path.exists():
                print(f'  {s["id"]}: missing {path.relative_to(ROOT)}')
                continue
            doc = docs.get(path) or docs.setdefault(path, pymupdf.open(path))
            for page_no in page_numbers(src['pages']):
                if 1 <= page_no <= doc.page_count:
                    for im in page_images(doc, page_no):
                        rel = save(im)
                        if rel not in pictures:
                            pictures.append(rel)
        if pictures:
            index[s['id']] = pictures
        else:
            index.pop(s['id'], None)

    INDEX.write_text(json.dumps(dict(sorted(index.items())), indent=1) + '\n')

    used = {p for paths in index.values() for p in paths}
    if not args.only:
        for f in IMG_DIR.glob('*.jpg'):
            if f'img/{f.name}' not in used:
                f.unlink()
    size = sum((OUT / p).stat().st_size for p in used)
    print(f'{len(index)} stoves with pictures, {len(used)} images, {size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
```

- [ ] **Step 3: Set up Python and ignore the venv**

Append to `.gitignore`:
```
.venv/
```

Run:
```bash
python3 -m venv .venv && .venv/bin/pip install -q -r scripts/requirements.txt
```

- [ ] **Step 4: Smoke-test on two stoves**

Run:
```bash
.venv/bin/python scripts/extract_images.py --only eva-calor-alberta
.venv/bin/python scripts/extract_images.py --only piazzetta-round
cat public/stove-images/index.json
```
Expected: the index has entries for both ids (Eva Calor's is the technical-drawing image(s); Piazzetta's are catalogue photos); the JPEGs exist under `public/stove-images/img/`. Open two of them to check they are pictures, not icons.

- [ ] **Step 5: Full run and size check**

Run: `.venv/bin/python scripts/extract_images.py`
Expected: summary line like `NNN stoves with pictures, NNNN images, NN.N MB`. **If the total is above 150 MB, stop and report to the user before committing** (options: lower `MAX_SIDE`/`QUALITY`, or raise `MIN_SIDE`).

Create `public/stove-images/fronts.json`:
```json
{}
```

- [ ] **Step 6: Commit**

```bash
git add .gitignore scripts/extract_images.py scripts/requirements.txt public/stove-images
git commit -m "feat: stove pictures extracted from the catalogue PDFs"
```

---

### Task 6: Picture data module

**Files:**
- Create: `src/data/images.ts`
- Test: `tests/images.test.ts`

**Interfaces:**
- Produces:
  - `interface Crop { x: number; y: number; w: number; h: number }` (fractions of the image)
  - `interface FrontCrop { image: string; crop: Crop }`
  - `interface StoveImages { index: Map<string, string[]>; fronts: Map<string, FrontCrop> }`
  - `IMAGES_BASE = './stove-images/'`, `imageUrl(path): string`
  - `validCrop(c: unknown): c is Crop`, `parseImageIndex(raw): Map<string, string[]>`, `parseFronts(raw, index): Map<string, FrontCrop>`, `picturesFor(id, imgs): string[]` (paths, front first), `loadImages(base?): Promise<StoveImages>`

- [ ] **Step 1: Write the failing tests**

`tests/images.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageUrl, loadImages, parseFronts, parseImageIndex, picturesFor, validCrop } from '../src/data/images';

afterEach(() => vi.unstubAllGlobals());

const index = parseImageIndex({ a: ['img/1.jpg', 'img/2.jpg', 'img/3.jpg'], b: ['img/9.jpg'] });

describe('parseImageIndex', () => {
  it('keeps string lists and drops garbage', () => {
    const m = parseImageIndex({ a: ['img/1.jpg', 3, 'img/2.jpg'], b: 'nope', c: [], d: ['img/4.jpg'] });
    expect([...m.entries()]).toEqual([
      ['a', ['img/1.jpg', 'img/2.jpg']],
      ['d', ['img/4.jpg']],
    ]);
    expect(parseImageIndex(null).size).toBe(0);
    expect(parseImageIndex([1, 2]).size).toBe(0);
  });
});

describe('validCrop', () => {
  it('accepts crops inside the image only', () => {
    expect(validCrop({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
    expect(validCrop({ x: 0.2, y: 0.1, w: 0.5, h: 0.8 })).toBe(true);
    expect(validCrop({ x: 0.6, y: 0, w: 0.5, h: 1 })).toBe(false);
    expect(validCrop({ x: -0.1, y: 0, w: 0.5, h: 0.5 })).toBe(false);
    expect(validCrop({ x: 0, y: 0, w: 0, h: 0.5 })).toBe(false);
    expect(validCrop({ x: 0, y: 0, w: '1', h: 1 })).toBe(false);
    expect(validCrop(null)).toBe(false);
  });
});

describe('parseFronts', () => {
  it('keeps entries whose image belongs to the stove and whose crop is valid', () => {
    const fronts = parseFronts(
      {
        a: { image: 'img/2.jpg', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
        b: { image: 'img/1.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } },
        c: { image: 'img/1.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } },
        bad: 'x',
      },
      index,
    );
    expect([...fronts.keys()]).toEqual(['a']);
    expect(fronts.get('a')).toEqual({ image: 'img/2.jpg', crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } });
  });
});

describe('picturesFor', () => {
  it('puts the front image first without duplicating it', () => {
    const fronts = parseFronts({ a: { image: 'img/2.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } } }, index);
    expect(picturesFor('a', { index, fronts })).toEqual(['img/2.jpg', 'img/1.jpg', 'img/3.jpg']);
    expect(picturesFor('b', { index, fronts })).toEqual(['img/9.jpg']);
    expect(picturesFor('zzz', { index, fronts })).toEqual([]);
  });

  it('builds relative URLs', () => {
    expect(imageUrl('img/1.jpg')).toBe('./stove-images/img/1.jpg');
  });
});

describe('loadImages', () => {
  it('loads index and fronts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('index.json')
          ? new Response(JSON.stringify({ a: ['img/1.jpg'] }))
          : new Response(JSON.stringify({ a: { image: 'img/1.jpg', crop: { x: 0, y: 0, w: 1, h: 1 } } })),
      ),
    );
    const imgs = await loadImages();
    expect(imgs.index.get('a')).toEqual(['img/1.jpg']);
    expect(imgs.fronts.get('a')?.image).toBe('img/1.jpg');
  });

  it('works without pictures when files are missing or corrupt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200 })));
    const imgs = await loadImages();
    expect(imgs.index.size).toBe(0);
    expect(imgs.fronts.size).toBe(0);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await loadImages()).index.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/images.test.ts`
Expected: FAIL — cannot resolve `../src/data/images`.

- [ ] **Step 3: Implement `src/data/images.ts`**

```ts
/** A rectangle in fractions (0–1) of an image, origin top-left. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrontCrop {
  image: string;
  crop: Crop;
}

export interface StoveImages {
  /** Stove id → image paths relative to IMAGES_BASE, in catalogue order. */
  index: Map<string, string[]>;
  fronts: Map<string, FrontCrop>;
}

export const IMAGES_BASE = './stove-images/';
const EPS = 1e-9;

export const imageUrl = (path: string): string => IMAGES_BASE + path;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validCrop(c: unknown): c is Crop {
  if (!isRecord(c)) return false;
  const vals = [c.x, c.y, c.w, c.h];
  if (!vals.every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  const [x, y, w, h] = vals as number[];
  return x >= -EPS && y >= -EPS && w > 0 && h > 0 && x + w <= 1 + EPS && y + h <= 1 + EPS;
}

export function parseImageIndex(raw: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!isRecord(raw)) return out;
  for (const [id, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const paths = list.filter((p): p is string => typeof p === 'string');
    if (paths.length) out.set(id, paths);
  }
  return out;
}

/** Keeps only entries whose image is listed for that stove (a re-extraction may have renamed it). */
export function parseFronts(raw: unknown, index: Map<string, string[]>): Map<string, FrontCrop> {
  const out = new Map<string, FrontCrop>();
  if (!isRecord(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!isRecord(v)) continue;
    const { image, crop } = v;
    if (typeof image !== 'string' || !index.get(id)?.includes(image) || !validCrop(crop)) continue;
    out.set(id, { image, crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } });
  }
  return out;
}

export function picturesFor(id: string, imgs: StoveImages): string[] {
  const all = imgs.index.get(id) ?? [];
  const front = imgs.fronts.get(id)?.image;
  return front ? [front, ...all.filter((p) => p !== front)] : [...all];
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Never fails: without index/fronts the app simply shows no pictures. */
export async function loadImages(base = IMAGES_BASE): Promise<StoveImages> {
  const [rawIndex, rawFronts] = await Promise.all([fetchJson(`${base}index.json`), fetchJson(`${base}fronts.json`)]);
  const index = parseImageIndex(rawIndex);
  return { index, fronts: parseFronts(rawFronts, index) };
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/images.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/images.ts tests/images.test.ts
git commit -m "feat: stove picture index and front-crop parsing"
```

---

### Task 7: Details window, lightbox and compact card

**Files:**
- Create: `src/ui/lightbox.ts`, `src/ui/detailsWindow.ts`
- Modify: `src/ui/stoveCard.ts` (rewrite), `src/viewer.ts`, `src/style.css`

**Interfaces:**
- Consumes: `loadImages`, `picturesFor`, `imageUrl` (Task 6); format helpers.
- Produces:
  - `openLightbox(urls: string[], start?: number): void`
  - `interface DetailsContext { categories: Record<string, string>; pictures: { path: string; url: string }[]; bufferOn: boolean; onBufferToggle(on: boolean): void; starred: boolean; onToggleStar(): void; front?: { available: boolean; on: boolean; onToggle(on: boolean): void }; onUseAsFront?: (path: string) => void }`
  - `class DetailsWindow { constructor(stage: HTMLElement); readonly isOpen: boolean; open(): void; close(): void; render(s: Stove | null, ctx: DetailsContext): void }`
  - `renderStoveCard(container, s, ctx: { bufferOn: boolean; onBufferToggle(on: boolean): void; onOpenDetails(): void })`

`front` and `onUseAsFront` are rendered when present; Tasks 8 and 9 start passing them. DOM-only code, verified in the browser.

- [ ] **Step 1: Write `src/ui/lightbox.ts`**

```ts
import { el } from './dom';

/** Full-screen image viewer: click or Esc closes, arrows navigate. */
export function openLightbox(urls: string[], start = 0): void {
  if (!urls.length) return;
  let i = Math.min(Math.max(start, 0), urls.length - 1);
  const img = el('img', { class: 'lightbox-img', alt: '' });
  const counter = el('div', { class: 'lightbox-count' });
  const show = () => {
    img.src = urls[i];
    counter.textContent = `${i + 1} / ${urls.length}`;
  };
  const step = (d: number) => {
    i = (i + d + urls.length) % urls.length;
    show();
  };
  const close = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  };
  const nav = (label: string, cls: string, d: number) =>
    el('button', { class: cls, title: label, onclick: (e: Event) => (e.stopPropagation(), step(d)) }, d < 0 ? '‹' : '›');
  const overlay = el(
    'div',
    { class: 'lightbox', onclick: (e: Event) => e.target === overlay && close() },
    img,
    counter,
    urls.length > 1 ? nav('Precedente', 'lightbox-prev', -1) : null,
    urls.length > 1 ? nav('Successiva', 'lightbox-next', 1) : null,
    el('button', { class: 'lightbox-close', title: 'Chiudi', onclick: close }, '✕'),
  );
  window.addEventListener('keydown', onKey);
  document.body.append(overlay);
  show();
}
```

- [ ] **Step 2: Write `src/ui/detailsWindow.ts`**

```ts
import type { FlueOutlet, Stove } from '../data/types';
import { el } from './dom';
import { fmtCm, fmtDims, fmtKw, fmtPct, fmtPrice, fmtStars, sourceHref } from './format';
import { openLightbox } from './lightbox';

const OUTLET_IT: Record<FlueOutlet, string> = { top: 'superiore', rear: 'posteriore', side: 'laterale' };
const POS_KEY = 'stufa3d.detailsPos';
const NARROW = '(max-width: 800px)';

export interface DetailsContext {
  categories: Record<string, string>;
  /** Front photo first. */
  pictures: { path: string; url: string }[];
  bufferOn: boolean;
  onBufferToggle(on: boolean): void;
  starred: boolean;
  onToggleStar(): void;
  front?: { available: boolean; on: boolean; onToggle(on: boolean): void };
  /** Dev only: open the cropper on this picture. */
  onUseAsFront?: (path: string) => void;
}

function readPos(): { left: number; top: number } | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    if (v && typeof v === 'object' && 'left' in v && 'top' in v && typeof v.left === 'number' && typeof v.top === 'number') {
      return { left: v.left, top: v.top };
    }
  } catch {
    /* storage unavailable or corrupt: use the default position */
  }
  return null;
}

function writePos(pos: { left: number; top: number }): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

const num = (v: number | null, unit: string) => (v === null ? '—' : `${String(v).replace('.', ',')} ${unit}`);

/** Floating, draggable panel over the 3D view with pictures and the full specs of the selected stove. */
export class DetailsWindow {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly title: HTMLElement;
  private stoveId: string | null = null;
  private picIndex = 0;
  private last: { s: Stove; ctx: DetailsContext } | null = null;

  constructor(private readonly stage: HTMLElement) {
    this.title = el('h3', {}, '');
    const header = el('div', { class: 'details-head' }, this.title, el('button', { class: 'details-close', title: 'Chiudi', onclick: () => this.close() }, '✕'));
    this.body = el('div', { class: 'details-body' });
    this.root = el('aside', { class: 'details', hidden: true }, header, this.body);
    stage.append(this.root);
    this.enableDrag(header);
    window.addEventListener('resize', () => this.isOpen && this.place(this.root.offsetLeft, this.root.offsetTop));
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (!this.last) return;
    this.root.hidden = false;
    const saved = readPos();
    if (saved) this.place(saved.left, saved.top);
  }

  close(): void {
    this.root.hidden = true;
  }

  render(s: Stove | null, ctx: DetailsContext): void {
    if (!s) {
      this.last = null;
      this.stoveId = null;
      this.close();
      return;
    }
    if (s.id !== this.stoveId) {
      this.stoveId = s.id;
      this.picIndex = 0;
    }
    this.picIndex = Math.min(this.picIndex, Math.max(ctx.pictures.length - 1, 0));
    this.last = { s, ctx };
    this.title.textContent = `${s.brand} ${s.model}`;
    this.body.replaceChildren(...this.content(s, ctx));
  }

  /** Keeps the panel fully inside the stage. */
  private place(left: number, top: number): void {
    if (window.matchMedia(NARROW).matches) return;
    const maxLeft = Math.max(this.stage.clientWidth - this.root.offsetWidth, 0);
    const maxTop = Math.max(this.stage.clientHeight - this.root.offsetHeight, 0);
    const l = Math.min(Math.max(left, 0), maxLeft);
    const t = Math.min(Math.max(top, 0), maxTop);
    Object.assign(this.root.style, { left: `${l}px`, top: `${t}px`, right: 'auto' });
  }

  private enableDrag(handle: HTMLElement): void {
    let start: { x: number; y: number; left: number; top: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button') || window.matchMedia(NARROW).matches) return;
      start = { x: e.clientX, y: e.clientY, left: this.root.offsetLeft, top: this.root.offsetTop };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
      if (start) this.place(start.left + e.clientX - start.x, start.top + e.clientY - start.y);
    });
    handle.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      writePos({ left: this.root.offsetLeft, top: this.root.offsetTop });
    });
  }

  private rerender(): void {
    if (this.last) this.render(this.last.s, this.last.ctx);
  }

  private gallery(ctx: DetailsContext): Node[] {
    const pics = ctx.pictures;
    if (!pics.length) return [el('p', { class: 'muted gallery-empty' }, 'Nessuna immagine disponibile')];
    const current = pics[this.picIndex];
    const main = el('img', {
      class: 'gallery-main',
      src: current.url,
      alt: '',
      title: 'Clicca per ingrandire',
      onclick: () => openLightbox(pics.map((p) => p.url), this.picIndex),
    });
    const thumbs = el(
      'div',
      { class: 'thumbs' },
      ...pics.map((p, i) =>
        el('img', {
          class: i === this.picIndex ? 'active' : '',
          src: p.url,
          alt: '',
          loading: 'lazy',
          onclick: () => {
            this.picIndex = i;
            this.rerender();
          },
        }),
      ),
    );
    const useAsFront = ctx.onUseAsFront;
    return [main, pics.length > 1 ? thumbs : null, useAsFront ? el('button', { onclick: () => useAsFront(current.path) }, 'Usa come frontale…') : null].filter(
      (n): n is HTMLElement => n !== null,
    );
  }

  private content(s: Stove, ctx: DetailsContext): Node[] {
    const row = (k: string, v: string) => [el('dt', {}, k), el('dd', {}, v)];
    const sd = s.safety;
    const e = s.emissions;
    const power = s.kwMin !== null && s.kwMax !== null ? `${fmtKw(s.kw)} (${fmtKw(s.kwMin)}–${fmtKw(s.kwMax)})` : fmtKw(s.kw);
    const flue =
      s.flueDiameter === null && !s.flueOutlets.length
        ? '—'
        : `${s.flueDiameter === null ? '' : `Ø ${Math.round(s.flueDiameter * 1000)} mm `}${s.flueOutlets.map((o) => OUTLET_IT[o]).join(', ')}`.trim();
    const parts: (Node | null)[] = [
      el(
        'div',
        { class: 'row details-meta' },
        el('span', { class: 'muted' }, ctx.categories[s.category] ?? s.category),
        el('button', { class: ctx.starred ? 'star on' : 'star', title: ctx.starred ? 'Togli dai preferiti' : 'Aggiungi ai preferiti', onclick: () => ctx.onToggleStar() }, '★'),
      ),
      ...this.gallery(ctx),
      ctx.front
        ? el(
            'label',
            { class: 'front-toggle', title: ctx.front.available ? '' : 'Nessuna foto frontale salvata per questa stufa' },
            el('input', { type: 'checkbox', checked: ctx.front.on, disabled: !ctx.front.available, onchange: (ev: Event) => ctx.front!.onToggle((ev.target as HTMLInputElement).checked) }),
            ' Foto frontale sulla stufa 3D',
          )
        : null,
      el(
        'dl',
        {},
        ...row('Potenza', power),
        ...row('Prezzo indicativo', fmtPrice(s.price)),
        ...row('L × P × A', fmtDims(s.dims)),
        ...row('Peso', num(s.weightKg, 'kg')),
        ...row('Rendimento', fmtPct(s.efficiency)),
        ...row('Rendimento stagionale', fmtPct(s.seasonalEfficiency)),
        ...row('Volume riscaldabile', num(s.heatingVolume, 'm³')),
        ...row('Stelle', fmtStars(s.stars)),
        ...row('Classe energetica', s.energyClass ?? '—'),
        ...row('Canna fumaria', flue),
        ...row('Forno', s.hasOven ? 'Sì' : 'No'),
        ...row('Emissioni CO', num(e?.co ?? null, 'mg/Nm³')),
        ...row('Polveri (PM)', num(e?.pm ?? null, 'mg/Nm³')),
        ...row('NOx', num(e?.nox ?? null, 'mg/Nm³')),
        ...row('OGC', num(e?.ogc ?? null, 'mg/Nm³')),
        ...row('Finiture', s.finishes.length ? s.finishes.join(', ') : '—'),
        ...row('Certificazioni', s.certifications.length ? s.certifications.join(', ') : '—'),
      ),
      el('h4', {}, 'Distanze di sicurezza'),
      sd
        ? el(
            'dl',
            {},
            ...row('Posteriore', fmtCm(sd.rear)),
            ...row('Laterale', fmtCm(sd.side)),
            ...row('Frontale', fmtCm(sd.front)),
            ...row('Soffitto', fmtCm(sd.ceiling)),
            ...row('Pavimento davanti', fmtCm(sd.floorFront)),
          )
        : el('p', { class: 'warn' }, 'Distanze di sicurezza non dichiarate'),
      sd?.notes ? el('details', {}, el('summary', {}, 'Note del produttore'), el('p', {}, sd.notes)) : null,
      el(
        'label',
        {},
        el('input', { type: 'checkbox', checked: ctx.bufferOn, disabled: !sd, onchange: (ev: Event) => ctx.onBufferToggle((ev.target as HTMLInputElement).checked) }),
        ' Mostra distanze di sicurezza',
      ),
      s.sources.length
        ? el(
            'div',
            { class: 'muted details-sources' },
            'Fonti: ',
            ...s.sources.flatMap((src, i) => [
              i ? ' · ' : '',
              el('a', { href: sourceHref(src.file, src.page), target: '_blank', rel: 'noopener' }, `${src.file.split('/').pop()}${src.page ? ` p. ${src.page}` : ''}`),
            ]),
          )
        : null,
    ];
    return parts.filter((p): p is Node => p !== null);
  }
}
```

- [ ] **Step 3: Rewrite `src/ui/stoveCard.ts` as the compact card**

```ts
import type { Stove } from '../data/types';
import { el } from './dom';
import { fmtDims, fmtKw, fmtPrice } from './format';

export interface CardContext {
  bufferOn: boolean;
  onBufferToggle(on: boolean): void;
  onOpenDetails(): void;
}

/** Compact summary in the sidebar; the full specs and pictures live in the details window. */
export function renderStoveCard(container: HTMLElement, s: Stove | null, ctx: CardContext): void {
  const card = container.querySelector<HTMLElement>('.card') ?? container.appendChild(el('div', { class: 'card' }));
  if (!s) {
    card.replaceChildren(el('p', { class: 'muted' }, 'Scegli una stufa dai risultati.'));
    return;
  }
  card.replaceChildren(
    el('h3', {}, `${s.brand} ${s.model}`),
    el('div', { class: 'muted' }, [fmtPrice(s.price), fmtKw(s.kw), fmtDims(s.dims)].join(' · ')),
    s.safety
      ? el(
          'label',
          {},
          el('input', { type: 'checkbox', checked: ctx.bufferOn, onchange: (e: Event) => ctx.onBufferToggle((e.target as HTMLInputElement).checked) }),
          ' Mostra distanze di sicurezza',
        )
      : el('p', { class: 'warn' }, 'Distanze di sicurezza non dichiarate'),
    el('div', { class: 'row' }, el('button', { onclick: () => ctx.onOpenDetails() }, 'Apri dettagli')),
  );
}
```

- [ ] **Step 4: Wire into `src/viewer.ts`**

Add imports after `import type { Stove } from './data/types';`:
```ts
import { imageUrl, loadImages, picturesFor } from './data/images';
import { DetailsWindow } from './ui/detailsWindow';
```

Replace:
```ts
  const byId = new Map(catalogue.stoves.map((s) => [s.id, s]));
```
with:
```ts
  const byId = new Map(catalogue.stoves.map((s) => [s.id, s]));
  const images = await loadImages();
  const details = new DetailsWindow(document.querySelector<HTMLElement>('.stage')!);
```

Replace the whole `renderCard` function:
```ts
  function renderCard(): void {
    renderStoveCard(section('stove-card'), current, {
      categories: catalogue.categories,
      bufferOn,
      onBufferToggle: (on) => {
        setBuffer(on);
        syncUrl();
      },
      starred: current ? shortlist.has(current.id) : false,
      onToggleStar: () => {
        if (current) shortlist.toggle(current.id);
      },
    });
  }
```
with:
```ts
  function toggleBuffer(on: boolean): void {
    setBuffer(on);
    syncUrl();
    renderCard();
  }

  /** Renders the sidebar card and the details window for the current stove. */
  function renderCard(): void {
    renderStoveCard(section('stove-card'), current, { bufferOn, onBufferToggle: toggleBuffer, onOpenDetails: () => details.open() });
    details.render(current, {
      categories: catalogue.categories,
      pictures: current ? picturesFor(current.id, images).map((path) => ({ path, url: imageUrl(path) })) : [],
      bufferOn,
      onBufferToggle: toggleBuffer,
      starred: current ? shortlist.has(current.id) : false,
      onToggleStar: () => {
        if (current) shortlist.toggle(current.id);
      },
    });
  }
```

Replace:
```ts
  function select(s: Stove | null): void {
    showStove(s);
    results.setSelected(current?.id ?? null);
    renderCard();
    syncUrl();
  }
```
with:
```ts
  function select(s: Stove | null): void {
    showStove(s);
    results.setSelected(current?.id ?? null);
    renderCard();
    if (current) details.open();
    syncUrl();
  }
```

- [ ] **Step 5: Styles**

Append to `src/style.css`:
```css
/* Details window */
.details { position: absolute; top: 12px; right: 12px; width: 380px; max-height: calc(100% - 24px); overflow-y: auto; background: var(--panel); border-radius: 10px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35); z-index: 5; }
.details[hidden] { display: none; }
.details-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; background: var(--panel); border-bottom: 1px solid var(--line); cursor: move; touch-action: none; }
.details-head h3 { margin: 0; font-size: 15px; }
.details-close { border: none; background: none; font-size: 16px; }
.details-body { padding: 10px 12px 14px; }
.details-body dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 8px 0; font-size: 13px; }
.details-body dt { color: var(--muted); }
.details-body dd { margin: 0; }
.details-body h4 { margin: 12px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
.details-body .warn { color: var(--accent); font-size: 13px; }
.details-meta { justify-content: space-between; }
.gallery-main { display: block; width: 100%; height: 240px; object-fit: contain; background: #f3f2ee; border-radius: 6px; cursor: zoom-in; margin: 6px 0; }
.thumbs { display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.thumbs img { width: 48px; height: 48px; object-fit: cover; border: 2px solid transparent; border-radius: 4px; cursor: pointer; flex: none; }
.thumbs img.active { border-color: var(--accent); }
.front-toggle { display: block; margin: 6px 0; font-size: 13px; }
.details-sources { margin-top: 8px; }

/* Lightbox */
.lightbox { position: fixed; inset: 0; z-index: 20; background: rgba(0, 0, 0, 0.88); display: flex; align-items: center; justify-content: center; }
.lightbox-img { max-width: 92vw; max-height: 86vh; object-fit: contain; background: #fff; }
.lightbox-count { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); color: #fff; font-size: 13px; }
.lightbox button { position: absolute; background: rgba(255, 255, 255, 0.15); color: #fff; border: none; font-size: 28px; width: 48px; height: 48px; border-radius: 24px; }
.lightbox-prev { left: 16px; top: 50%; }
.lightbox-next { right: 16px; top: 50%; }
.lightbox-close { right: 16px; top: 16px; font-size: 20px !important; }

@media (max-width: 800px) {
  .details { position: fixed; left: 0 !important; right: 0; top: auto !important; bottom: 0; width: auto; max-height: 60vh; border-radius: 12px 12px 0 0; }
  .details-head { cursor: default; }
}
```

- [ ] **Step 6: Typecheck, test, verify in the browser**

Run: `npx tsc --noEmit && npx vitest run`, then `npm run dev`.
Expected:
- Selecting a stove opens the floating window top-right of the 3D view with title, category, ★, gallery (main image + thumbnails), full specs, safety distances, buffer toggle, PDF links.
- Thumbnails switch the main image; clicking the main image opens the lightbox (arrows / ←→ navigate, Esc / ✕ / backdrop close).
- Dragging the title bar moves the window, never outside the 3D area; reload keeps the position; ✕ closes it; "Apri dettagli" in the compact sidebar card reopens it.
- Buffer toggles in card and window stay in sync. A stove with no pictures shows "Nessuna immagine disponibile".
- At 390 px width the window is a bottom sheet.

- [ ] **Step 7: Commit**

```bash
git add src/ui/lightbox.ts src/ui/detailsWindow.ts src/ui/stoveCard.ts src/viewer.ts src/style.css
git commit -m "feat: floating details window with pictures and lightbox"
```

---

### Task 8: Front photo on the 3D stove

**Files:**
- Modify: `src/scene/stoveModel.ts`, `src/data/urlState.ts`, `src/ui/placementPanel.ts`, `src/viewer.ts`
- Test: `tests/stoveModel.test.ts`, `tests/urlState.test.ts`

**Interfaces:**
- Consumes: `Crop` (Task 6).
- Produces:
  - `interface FrontPhoto { texture: THREE.Texture; crop: Crop }`
  - `frontPhotoRect(s): { x0: number; x1: number; y0: number; y1: number }`, `frontAspect(s): number`, `cropUv(c: Crop): { u0: number; u1: number; v0: number; v1: number }`
  - `buildStove(s, front?: FrontPhoto)` — door panels grouped under a child named `panels`; with `front`, no `panels` group and a mesh named `front-photo`.
  - `ViewerState.front: boolean` (`front=1` in the URL).
  - `renderPlacementPanel(container, h: PlacementHandlers & { toggleFront(on: boolean): void })` returns `{ setDistances(d): void; setFront(state: { available: boolean; on: boolean }): void }`.

- [ ] **Step 1: Write the failing tests**

In `tests/stoveModel.test.ts` change the import to:
```ts
import { baseHeight, buildChimney, buildStove, collarOf, cropUv, frontAspect, frontLayout, frontPhotoRect } from '../src/scene/stoveModel';
```
and append:
```ts
describe('front photo', () => {
  const s = stove({ dims });
  const front = { texture: new THREE.Texture(), crop: { x: 0.2, y: 0.1, w: 0.5, h: 0.8 } };

  it('maps a top-left crop to flipped UVs', () => {
    const uv = cropUv(front.crop);
    expect(uv.u0).toBeCloseTo(0.2);
    expect(uv.u1).toBeCloseTo(0.7);
    expect(uv.v0).toBeCloseTo(0.1);
    expect(uv.v1).toBeCloseTo(0.9);
  });

  it('covers the front between the base and the collar', () => {
    const r = frontPhotoRect(s);
    expect(r.x1 - r.x0).toBeCloseTo(0.504);
    expect(r.y0).toBeCloseTo(baseHeight(s));
    expect(r.y1).toBeCloseTo(1.282 - collarOf(s).height);
    expect(frontAspect(s)).toBeCloseTo(0.504 / (r.y1 - r.y0));
  });

  it('replaces the door panels and keeps the exact bounding box', () => {
    expect(buildStove(s).getObjectByName('panels')).toBeDefined();
    const g = buildStove(s, front);
    expect(g.getObjectByName('panels')).toBeUndefined();
    const photo = g.getObjectByName('front-photo') as THREE.Mesh;
    const uv = photo.geometry.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0)]).toEqual([expect.closeTo(0.2), expect.closeTo(0.9)]);
    expect([uv.getX(3), uv.getY(3)]).toEqual([expect.closeTo(0.7), expect.closeTo(0.1)]);
    expect((photo.material as THREE.Material).userData.disposable).toBe(true);
    expectBox(g, 0.504, 1.282, 0.433);
  });
});
```

In `tests/urlState.test.ts` replace:
```ts
    const s = { stove: 'eva-calor-alberta', x: 1.234, z: 2.5, r: 90, doors: ['entrata', 'cucina'], shortlist: ['a', 'b'], buffer: false };
```
with:
```ts
    const s = { stove: 'eva-calor-alberta', x: 1.234, z: 2.5, r: 90, doors: ['entrata', 'cucina'], shortlist: ['a', 'b'], buffer: false, front: true };
```
and append inside the `describe`:
```ts
  it('encodes the front photo flag only when on', () => {
    expect(encodeState({ ...EMPTY_STATE, front: true })).toBe('?front=1');
    expect(decodeState('?front=yes').front).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/stoveModel.test.ts tests/urlState.test.ts`
Expected: FAIL — `cropUv`/`frontPhotoRect`/`frontAspect` not exported; `front` missing from decoded state.

- [ ] **Step 3: Implement**

In `src/scene/stoveModel.ts`:

Replace `import type { Dims, Stove } from '../data/types';` with:
```ts
import type { Crop } from '../data/images';
import type { Dims, Stove } from '../data/types';
```

After the `frontLayout` function add:
```ts
export interface FrontPhoto {
  texture: THREE.Texture;
  crop: Crop;
}

/** Area of the front face the photo covers: full width, from the base to the top of the body. */
export function frontPhotoRect(s: Stove): { x0: number; x1: number; y0: number; y1: number } {
  const { w } = dimsOf(s);
  return { x0: -w / 2, x1: w / 2, y0: baseHeight(s), y1: bodyTop(s) };
}

/** Width / height of that area — the aspect a front crop should have. */
export function frontAspect(s: Stove): number {
  const r = frontPhotoRect(s);
  return (r.x1 - r.x0) / (r.y1 - r.y0);
}

/** Crop (top-left origin) → texture UVs (three.js v grows upwards). */
export function cropUv(c: Crop): { u0: number; u1: number; v0: number; v1: number } {
  return { u0: c.x, u1: c.x + c.w, v0: 1 - (c.y + c.h), v1: 1 - c.y };
}
```

Change the signature `export function buildStove(s: Stove): THREE.Group {` to:
```ts
export function buildStove(s: Stove, front?: FrontPhoto): THREE.Group {
```

Replace the panels loop:
```ts
  for (const p of frontLayout(s)) {
```
…through its closing `}` (the block ending with the handle `g.add(mesh(...m.handle...))` line and `  }`) with:
```ts
  if (front) {
    const r = frontPhotoRect(s);
    const geo = new THREE.PlaneGeometry(r.x1 - r.x0, r.y1 - r.y0);
    const { u0, u1, v0, v1 } = cropUv(front.crop);
    // PlaneGeometry vertices: top-left, top-right, bottom-left, bottom-right.
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
    const mat = new THREE.MeshStandardMaterial({ map: front.texture, roughness: 0.6 });
    mat.userData.disposable = true;
    const photo = mesh(geo, mat, 0, (r.y0 + r.y1) / 2, d / 2);
    photo.name = 'front-photo';
    g.add(photo);
  } else {
    const panels = new THREE.Group();
    panels.name = 'panels';
    for (const p of frontLayout(s)) {
      const pw = p.x1 - p.x0;
      const ph = p.y1 - p.y0;
      const cx = (p.x0 + p.x1) / 2;
      const cy = (p.y0 + p.y1) / 2;
      // Frame stops short of the front plane; glass and handle reach it.
      panels.add(mesh(new THREE.BoxGeometry(pw, ph, FRONT * 0.7), m.dark, cx, cy, d / 2 - FRONT + (FRONT * 0.7) / 2));
      if (p.kind !== 'ash') {
        const glass = p.kind === 'glass' ? m.fireGlass : m.ovenGlass;
        panels.add(mesh(new THREE.BoxGeometry(pw - 0.04, ph - 0.04, FRONT * 0.5), glass, cx, cy, d / 2 - FRONT * 0.25));
      }
      panels.add(mesh(new THREE.BoxGeometry(0.02, Math.min(0.1, ph * 0.5), FRONT * 0.3), m.handle, p.x1 - 0.03, cy, d / 2 - FRONT * 0.15));
    }
    g.add(panels);
  }
```

In `src/data/urlState.ts`:
- add `  front: boolean;` to `ViewerState` after `buffer: boolean;`;
- in `EMPTY_STATE` replace `buffer: true }` with `buffer: true, front: false }`;
- in `decodeState` replace `    buffer: p.get('buffer') !== '0',` with:
```ts
    buffer: p.get('buffer') !== '0',
    front: p.get('front') === '1',
```
- in `encodeState` after `  if (!s.buffer) p.set('buffer', '0');` add `  if (s.front) p.set('front', '1');`

In `src/ui/placementPanel.ts`:
- replace the interface:
```ts
export interface PlacementHandlers {
  nudge(dir: NudgeDir, step: number): void;
  rotate(delta: number): void;
  snap(): void;
}
```
with:
```ts
export interface PlacementHandlers {
  nudge(dir: NudgeDir, step: number): void;
  rotate(delta: number): void;
  snap(): void;
  toggleFront(on: boolean): void;
}
```
- replace the signature line:
```ts
export function renderPlacementPanel(container: HTMLElement, h: PlacementHandlers): { setDistances(d: WallDistances | null): void } {
```
with:
```ts
export function renderPlacementPanel(
  container: HTMLElement,
  h: PlacementHandlers,
): { setDistances(d: WallDistances | null): void; setFront(state: { available: boolean; on: boolean }): void } {
```
- replace `  const distances = el('div', { class: 'distances' });` with:
```ts
  const distances = el('div', { class: 'distances' });
  const frontBox = el('input', { type: 'checkbox', disabled: true, onchange: (e: Event) => h.toggleFront((e.target as HTMLInputElement).checked) });
  const frontRow = el('label', { class: 'front-toggle' }, frontBox, ' Foto frontale sulla stufa 3D');
```
- in the `body` element, replace the `    rotate,` line with:
```ts
    rotate,
    frontRow,
```
- replace `  return { setDistances };` with:
```ts
  const setFront = (state: { available: boolean; on: boolean }) => {
    frontBox.checked = state.on;
    frontBox.disabled = !state.available;
    frontRow.title = state.available ? '' : 'Nessuna foto frontale salvata per questa stufa';
  };
  return { setDistances, setFront };
```

In `src/viewer.ts`:

replace:
```ts
    snap: () => placement.snap(),
  });
```
with:
```ts
    snap: () => placement.snap(),
    toggleFront: (on) => setFront(on),
  });
```

replace:
```ts
  let bufferGroup: THREE.Object3D | null = null;
```
with:
```ts
  let bufferGroup: THREE.Object3D | null = null;
  let frontOn = false;
  const textures = new Map<string, Promise<THREE.Texture>>();

  function frontTexture(path: string): Promise<THREE.Texture> {
    let p = textures.get(path);
    if (!p) {
      p = new THREE.TextureLoader().loadAsync(imageUrl(path)).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      });
      p.catch(() => textures.delete(path));
      textures.set(path, p);
    }
    return p;
  }

  /** A saved crop exists and no GLB model overrides the parametric stove. */
  const frontAvailable = (s: Stove | null): boolean => !!s && images.fronts.has(s.id) && !overrides.has(s.id);
```

The `images` constant is declared after `byId` (Task 7), above this point — confirm it comes before `showStove` is called.

replace (end of `showStove`):
```ts
    if (overrides.has(current.id)) {
      // Show the parametric stove at once, swap in the GLB when (and if) it arrives.
      void loadStoveObject(current, overrides).then((obj) => {
        if (token === showToken) placement.replaceObject(obj);
      });
    }
  }
```
with:
```ts
    if (overrides.has(current.id)) {
      // Show the parametric stove at once, swap in the GLB when (and if) it arrives.
      void loadStoveObject(current, overrides).then((obj) => {
        if (token === showToken) placement.replaceObject(obj);
      });
    } else if (frontOn && frontAvailable(current)) {
      // Same idea for the front photo: swap the textured stove in once the image has loaded.
      const shown = current;
      const front = images.fronts.get(shown.id)!;
      frontTexture(front.image)
        .then((texture) => {
          if (token === showToken) placement.replaceObject(buildStove(shown, { texture, crop: front.crop }));
        })
        .catch(() => toast('Foto frontale non caricata'));
    }
    placementPanel.setFront({ available: frontAvailable(current), on: frontOn });
  }

  function setFront(on: boolean): void {
    frontOn = on;
    showStove(current);
    renderCard();
    syncUrl();
  }
```

In `showStove`, the early-return branch for no stove also has to update the toggle; replace:
```ts
    if (!current?.dims) {
      placement.setStove(null);
      return;
    }
```
with:
```ts
    if (!current?.dims) {
      placement.setStove(null);
      placementPanel.setFront({ available: false, on: frontOn });
      return;
    }
```

In `renderCard()`, inside the `details.render(current, { … })` object, after `onToggleStar: …,` add:
```ts
      front: { available: frontAvailable(current), on: frontOn, onToggle: (on) => setFront(on) },
```

In `currentQuery`, replace `      buffer: bufferOn,` with:
```ts
      buffer: bufferOn,
      front: frontOn,
```

In the initial-state block, replace `  setBuffer(initial.buffer);` with:
```ts
  setBuffer(initial.buffer);
  frontOn = initial.front;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all PASS.

- [ ] **Step 5: Verify in the browser with a hand-written crop**

Temporarily put a crop in `public/stove-images/fronts.json` for a stove whose first picture shows its front (pick one from the gallery, e.g. a Piazzetta or Jolly-Mec model), using its first path from `index.json`:
```json
{ "<stove-id>": { "image": "img/<hash>.jpg", "crop": { "x": 0.3, "y": 0.1, "w": 0.4, "h": 0.8 } } }
```
`npm run dev`, select that stove: the "Foto frontale" toggles (window + placement panel) are enabled; switching on shows the image on the front of the 3D stove, the URL gains `front=1`, reload keeps it; another stove without a crop has the toggle disabled and shows normal doors; quickly switching stoves never shows one stove's photo on another. Revert `fronts.json` to `{}`.

- [ ] **Step 6: Commit**

```bash
git add src/scene/stoveModel.ts src/data/urlState.ts src/ui/placementPanel.ts src/viewer.ts tests/stoveModel.test.ts tests/urlState.test.ts
git commit -m "feat: optional front photo on the 3D stove"
```

---

### Task 9: Front-photo cropper (dev only)

**Files:**
- Create: `src/ui/cropMath.ts`, `src/ui/cropper.ts`, `scripts/frontsMiddleware.ts`
- Modify: `vite.config.ts`, `tsconfig.json`, `src/viewer.ts`, `src/style.css`
- Test: `tests/cropMath.test.ts`, `tests/frontsMiddleware.test.ts`

**Interfaces:**
- Consumes: `Crop`, `validCrop`, `parseImageIndex` (Task 6); `frontAspect` (Task 8); `DetailsContext.onUseAsFront` (Task 7).
- Produces:
  - `MIN_CROP = 0.02`, `clampCrop(c): Crop`, `rectFromPoints(x0, y0, x1, y1): Crop`, `fitAspect(c, aspect, imgW, imgH): Crop`
  - `openCropper(opts: { imageUrl: string; aspect: number; initial?: Crop; onSave(crop: Crop): Promise<void>; onRemove?: () => Promise<void> }): void`
  - `saveFront(dir: string, body: unknown): FrontsResult`, `deleteFront(dir: string, id: string): FrontsResult`, `frontsMiddleware(dir: string)` (Connect middleware) with `FrontsResult = { status: number; body: unknown }`

- [ ] **Step 1: Write the failing tests**

`tests/cropMath.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clampCrop, fitAspect, MIN_CROP, rectFromPoints } from '../src/ui/cropMath';

describe('cropMath', () => {
  it('builds a rect from any two corners, clamped to the image', () => {
    expect(rectFromPoints(0.8, 0.9, 0.2, 0.1)).toEqual({ x: 0.2, y: 0.1, w: expect.closeTo(0.6), h: expect.closeTo(0.8) });
    const r = rectFromPoints(-0.5, 0.5, 1.5, 0.6);
    expect(r.x).toBe(0);
    expect(r.w).toBe(1);
  });

  it('keeps a minimum size and stays inside the image', () => {
    expect(clampCrop({ x: 0.5, y: 0.5, w: 0, h: -1 })).toEqual({ x: 0.5, y: 0.5, w: MIN_CROP, h: MIN_CROP });
    const c = clampCrop({ x: 0.9, y: -0.2, w: 0.4, h: 0.5 });
    expect(c.x + c.w).toBeCloseTo(1);
    expect(c.y).toBe(0);
  });

  it('fits a target aspect in image pixels without leaving the image', () => {
    const c = fitAspect({ x: 0.1, y: 0.1, w: 0.4, h: 0.9 }, 0.5, 1000, 800);
    expect((c.w * 1000) / (c.h * 800)).toBeCloseTo(0.5);
    expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
    const wide = fitAspect({ x: 0.7, y: 0, w: 0.3, h: 0.1 }, 3, 1000, 1000);
    expect((wide.w * 1000) / (wide.h * 1000)).toBeCloseTo(3);
    expect(wide.x + wide.w).toBeLessThanOrEqual(1 + 1e-9);
  });
});
```

`tests/frontsMiddleware.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteFront, saveFront } from '../scripts/frontsMiddleware';

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fronts-'));
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ b: ['img/2.jpg'], a: ['img/1.jpg', 'img/3.jpg'] }));
  return dir;
}
const crop = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
const read = (dir: string) => JSON.parse(readFileSync(join(dir, 'fronts.json'), 'utf8'));

describe('saveFront', () => {
  it('writes sorted JSON and creates the file if missing', () => {
    const dir = setup();
    expect(saveFront(dir, { id: 'b', image: 'img/2.jpg', crop }).status).toBe(200);
    expect(saveFront(dir, { id: 'a', image: 'img/3.jpg', crop }).status).toBe(200);
    expect(Object.keys(read(dir))).toEqual(['a', 'b']);
    expect(read(dir).a).toEqual({ image: 'img/3.jpg', crop });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('rejects unknown stoves, foreign images, bad crops and bad bodies', () => {
    const dir = setup();
    expect(saveFront(dir, { id: 'zzz', image: 'img/1.jpg', crop }).status).toBe(400);
    expect(saveFront(dir, { id: 'a', image: 'img/2.jpg', crop }).status).toBe(400);
    expect(saveFront(dir, { id: 'a', image: 'img/1.jpg', crop: { x: 0.8, y: 0, w: 0.5, h: 1 } }).status).toBe(400);
    expect(saveFront(dir, 'nope').status).toBe(400);
    expect(existsSync(join(dir, 'fronts.json'))).toBe(false);
  });
});

describe('deleteFront', () => {
  it('removes an entry', () => {
    const dir = setup();
    saveFront(dir, { id: 'a', image: 'img/1.jpg', crop });
    expect(deleteFront(dir, 'a').status).toBe(200);
    expect(read(dir)).toEqual({});
    expect(deleteFront(dir, 'a').status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cropMath.test.ts tests/frontsMiddleware.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/ui/cropMath.ts`**

```ts
import type { Crop } from '../data/images';

export const MIN_CROP = 0.02;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** At least MIN_CROP in each direction, entirely inside the image. */
export function clampCrop(c: Crop): Crop {
  const w = Math.min(Math.max(c.w, MIN_CROP), 1);
  const h = Math.min(Math.max(c.h, MIN_CROP), 1);
  return { x: Math.min(Math.max(c.x, 0), 1 - w), y: Math.min(Math.max(c.y, 0), 1 - h), w, h };
}

export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): Crop {
  const [ax, bx] = [clamp01(x0), clamp01(x1)].sort((a, b) => a - b);
  const [ay, by] = [clamp01(y0), clamp01(y1)].sort((a, b) => a - b);
  return clampCrop({ x: ax, y: ay, w: bx - ax, h: by - ay });
}

/** Adjusts the crop so that (w·imgW)/(h·imgH) = aspect, shrinking it rather than leaving the image. */
export function fitAspect(c: Crop, aspect: number, imgW: number, imgH: number): Crop {
  let w = c.w;
  let h = (w * imgW) / (aspect * imgH);
  if (c.y + h > 1) {
    h = 1 - c.y;
    w = (h * aspect * imgH) / imgW;
  }
  if (c.x + w > 1) {
    w = 1 - c.x;
    h = (w * imgW) / (aspect * imgH);
  }
  return { x: c.x, y: c.y, w, h };
}
```

- [ ] **Step 4: Implement `scripts/frontsMiddleware.ts`**

```ts
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { parseImageIndex, validCrop, type FrontCrop } from '../src/data/images';

export interface FrontsResult {
  status: number;
  body: unknown;
}

type FrontsFile = Record<string, FrontCrop>;

function readJson(path: string): unknown {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

function writeFronts(dir: string, data: FrontsFile): void {
  const sorted = Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
  const tmp = join(dir, `fronts.json.${process.pid}.tmp`);
  writeFileSync(tmp, `${JSON.stringify(sorted, null, 2)}\n`);
  renameSync(tmp, join(dir, 'fronts.json'));
}

const error = (status: number, message: string): FrontsResult => ({ status, body: { error: message } });

/** Saves one stove's front crop into `<dir>/fronts.json` after checking it against `<dir>/index.json`. */
export function saveFront(dir: string, body: unknown): FrontsResult {
  if (typeof body !== 'object' || body === null) return error(400, 'Richiesta non valida');
  const { id, image, crop } = body as Record<string, unknown>;
  if (typeof id !== 'string' || typeof image !== 'string') return error(400, 'id e image sono obbligatori');
  const index = parseImageIndex(readJson(join(dir, 'index.json')));
  const pictures = index.get(id);
  if (!pictures) return error(400, `Stufa senza immagini o sconosciuta: ${id}`);
  if (!pictures.includes(image)) return error(400, `Immagine non associata a ${id}: ${image}`);
  if (!validCrop(crop)) return error(400, 'Ritaglio fuori dai limiti dell’immagine');
  const fronts = readJson(join(dir, 'fronts.json')) as FrontsFile;
  fronts[id] = { image, crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h } };
  writeFronts(dir, fronts);
  return { status: 200, body: fronts[id] };
}

export function deleteFront(dir: string, id: string): FrontsResult {
  const fronts = readJson(join(dir, 'fronts.json')) as FrontsFile;
  if (!(id in fronts)) return error(404, `Nessuna foto frontale per ${id}`);
  delete fronts[id];
  writeFronts(dir, fronts);
  return { status: 200, body: { ok: true } };
}

/** Dev-server only: POST /__fronts {id, image, crop} and DELETE /__fronts/<id>. */
export function frontsMiddleware(dir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = req.url ?? '';
    if (!url.startsWith('/__fronts')) return next();
    const send = (r: FrontsResult) => {
      res.statusCode = r.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(r.body));
    };
    if (req.method === 'DELETE') return send(deleteFront(dir, decodeURIComponent(url.slice('/__fronts/'.length))));
    if (req.method !== 'POST') return send(error(405, 'Metodo non permesso'));
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        send(saveFront(dir, JSON.parse(raw)));
      } catch {
        send(error(400, 'JSON non valido'));
      }
    });
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/cropMath.test.ts tests/frontsMiddleware.test.ts`
Expected: PASS.

- [ ] **Step 6: Register the middleware and include `scripts/` in type-checking**

In `tsconfig.json` replace `"include": ["src", "tests", "vite.config.ts"]` with `"include": ["src", "tests", "scripts", "vite.config.ts"]`.

In `vite.config.ts` add the import after `import { fileURLToPath } from 'node:url';`:
```ts
import { frontsMiddleware } from './scripts/frontsMiddleware';
```
and add a plugin to the `plugins` array, before the `copy-site-data` plugin:
```ts
    {
      name: 'fronts-api',
      apply: 'serve',
      configureServer(server) {
        // Lets the in-app cropper save front-photo crops while developing; absent from builds.
        server.middlewares.use(frontsMiddleware(`${root}public/stove-images`));
      },
    },
```

- [ ] **Step 7: Implement `src/ui/cropper.ts`**

```ts
import type { Crop } from '../data/images';
import { clampCrop, fitAspect, rectFromPoints } from './cropMath';
import { el } from './dom';

export interface CropperOptions {
  imageUrl: string;
  /** Target width / height of the stove front. */
  aspect: number;
  initial?: Crop;
  onSave(crop: Crop): Promise<void>;
  onRemove?: () => Promise<void>;
}

/** Modal to draw the stove's front on a catalogue picture. Dev only. */
export function openCropper(opts: CropperOptions): void {
  const img = el('img', { src: opts.imageUrl, alt: '', draggable: false });
  const handle = el('div', { class: 'crop-handle' });
  const rect = el('div', { class: 'crop-rect' }, handle);
  const stage = el('div', { class: 'crop-stage' }, img, rect);
  const lock = el('input', { type: 'checkbox', checked: true });
  const status = el('span', { class: 'muted' });
  let crop: Crop = opts.initial ?? { x: 0.25, y: 0.1, w: 0.5, h: 0.8 };

  const constrain = (c: Crop) =>
    lock.checked ? clampCrop(fitAspect(c, opts.aspect, img.naturalWidth || 1, img.naturalHeight || 1)) : clampCrop(c);
  const draw = () =>
    Object.assign(rect.style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` });
  const point = (e: PointerEvent) => {
    const r = img.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  let drag: { mode: 'new' | 'move' | 'resize'; x0: number; y0: number; start: Crop } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const p = point(e);
    const mode = e.target === handle ? 'resize' : e.target === rect ? 'move' : 'new';
    drag = { mode, x0: p.x, y0: p.y, start: { ...crop } };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = point(e);
    const s = drag.start;
    if (drag.mode === 'move') crop = clampCrop({ ...s, x: s.x + p.x - drag.x0, y: s.y + p.y - drag.y0 });
    else if (drag.mode === 'resize') crop = constrain({ ...s, w: p.x - s.x, h: p.y - s.y });
    else crop = constrain(rectFromPoints(drag.x0, drag.y0, p.x, p.y));
    draw();
  });
  stage.addEventListener('pointerup', () => (drag = null));
  lock.addEventListener('change', () => {
    crop = constrain(crop);
    draw();
  });
  img.addEventListener('load', () => {
    if (!opts.initial) crop = constrain(crop);
    draw();
  });

  const close = () => overlay.remove();
  const run = async (action: () => Promise<void>) => {
    status.textContent = 'Salvataggio…';
    try {
      await action();
      close();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : String(err);
    }
  };
  const remove = opts.onRemove;
  const overlay = el(
    'div',
    { class: 'cropper' },
    el(
      'div',
      { class: 'cropper-panel' },
      el('h3', {}, 'Ritaglia la foto frontale'),
      el('p', { class: 'muted' }, 'Disegna il riquadro sul fronte della stufa; trascinalo per spostarlo, usa l’angolo per ridimensionarlo.'),
      stage,
      el('div', { class: 'row' }, el('label', {}, lock, ' Proporzioni della stufa'), status),
      el(
        'div',
        { class: 'row' },
        el('button', { class: 'primary', onclick: () => run(() => opts.onSave(crop)) }, 'Salva'),
        remove ? el('button', { onclick: () => run(remove) }, 'Rimuovi') : null,
        el('button', { onclick: close }, 'Annulla'),
      ),
    ),
  );
  document.body.append(overlay);
  draw();
}
```

Append to `src/style.css`:
```css
/* Cropper (dev only) */
.cropper { position: fixed; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center; justify-content: center; }
.cropper-panel { background: var(--panel); padding: 16px; border-radius: 10px; max-width: 92vw; display: flex; flex-direction: column; gap: 8px; }
.cropper-panel h3 { margin: 0; }
.crop-stage { position: relative; align-self: center; overflow: hidden; user-select: none; touch-action: none; cursor: crosshair; }
.crop-stage img { display: block; max-width: 80vw; max-height: 62vh; }
.crop-rect { position: absolute; border: 2px solid #f59e0b; box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45); cursor: move; }
.crop-handle { position: absolute; right: -7px; bottom: -7px; width: 14px; height: 14px; background: #f59e0b; border-radius: 3px; cursor: nwse-resize; }
```

- [ ] **Step 8: Wire the cropper into `src/viewer.ts`**

Add imports after `import { DetailsWindow } from './ui/detailsWindow';`:
```ts
import { openCropper } from './ui/cropper';
```
and change the stoveModel import to include `frontAspect`:
```ts
import { buildChimney, buildStove, frontAspect, loadModelIndex, loadStoveObject } from './scene/stoveModel';
```

In `renderCard()`, inside the `details.render(current, { … })` object, after the `front: …` line add:
```ts
      onUseAsFront: import.meta.env.DEV ? (path) => editFront(path) : undefined,
```

After the `setFront` function add:
```ts
  /** Dev only: crop a catalogue picture to the stove's front and save it via the dev-server API. */
  function editFront(path: string): void {
    const s = current;
    if (!s?.dims) return;
    const existing = images.fronts.get(s.id);
    const refresh = () => {
      if (current === s) {
        showStove(s);
        renderCard();
      }
    };
    openCropper({
      imageUrl: imageUrl(path),
      aspect: frontAspect(s),
      initial: existing?.image === path ? existing.crop : undefined,
      onSave: async (crop) => {
        const res = await fetch('/__fronts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: s.id, image: path, crop }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        images.fronts.set(s.id, { image: path, crop });
        toast('Foto frontale salvata in fronts.json');
        refresh();
      },
      onRemove: existing
        ? async () => {
            const res = await fetch(`/__fronts/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            images.fronts.delete(s.id);
            toast('Foto frontale rimossa');
            refresh();
          }
        : undefined,
    });
  }
```

- [ ] **Step 9: Typecheck, test, verify in the browser**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: all PASS; the build contains no `__fronts` handler (`grep -r __fronts dist/` only finds the client fetch string, which is dead code behind `import.meta.env.DEV`… if it remains, that is fine: there is no server endpoint in production).

`npm run dev`:
- In the details window, "Usa come frontale…" appears under the main picture; it opens the cropper over the image; drawing, moving and resizing work; the ratio lock follows the stove's proportions; unlocking allows any ratio.
- "Salva" writes `public/stove-images/fronts.json` (check the file), shows the toast, and with "Foto frontale" on the 3D stove updates immediately. Reopening the cropper on the same image starts from the saved crop; "Rimuovi" deletes the entry.
- `npm run build && npm run preview`: no "Usa come frontale…" button.

Revert any test crops you do not want to keep (`git checkout public/stove-images/fronts.json`), or keep the good ones.

- [ ] **Step 10: Commit**

```bash
git add src/ui/cropMath.ts src/ui/cropper.ts scripts/frontsMiddleware.ts vite.config.ts tsconfig.json src/viewer.ts src/style.css tests/cropMath.test.ts tests/frontsMiddleware.test.ts
git commit -m "feat: dev-only cropper to save stove front photos"
```

---

### Task 10: Pictures on the compare page

**Files:**
- Modify: `src/compare.ts`, `src/style.css`

**Interfaces:**
- Consumes: `loadImages`, `picturesFor`, `imageUrl` (Task 6); `openLightbox` (Task 7).

DOM-only; `buildCompareRows`/CSV are unchanged and already tested.

- [ ] **Step 1: Implement**

In `src/compare.ts` add imports after `import { decodeState, EMPTY_STATE, encodeState } from './data/urlState';`:
```ts
import { imageUrl, loadImages, picturesFor } from './data/images';
import { openLightbox } from './ui/lightbox';
```

Replace:
```ts
  const shortlist = new Shortlist(safeLocalStorage());
```
with:
```ts
  const images = await loadImages();
  const shortlist = new Shortlist(safeLocalStorage());
```

Replace:
```ts
    const body: HTMLElement[] = [];
    let group = '';
```
with:
```ts
    const body: HTMLElement[] = [];
    body.push(el('tr', { class: 'group' }, el('td', { colspan: stoves.length + 1 }, 'Immagine')));
    body.push(
      el(
        'tr',
        {},
        el('td', {}, 'Foto'),
        ...stoves.map((s) => {
          const urls = picturesFor(s.id, images).map(imageUrl);
          return el(
            'td',
            {},
            urls.length
              ? el('img', { class: 'cmp-thumb', src: urls[0], alt: `${s.brand} ${s.model}`, loading: 'lazy', title: 'Clicca per vedere tutte le foto', onclick: () => openLightbox(urls) })
              : '—',
          );
        }),
      ),
    );
    let group = '';
```

Append to `src/style.css`:
```css
.cmp-thumb { display: block; width: 100%; height: 160px; object-fit: contain; background: #f3f2ee; border-radius: 6px; cursor: zoom-in; }
```

- [ ] **Step 2: Typecheck, test, verify in the browser**

Run: `npx tsc --noEmit && npx vitest run`, then open `/compare.html?shortlist=eva-calor-alberta,piazzetta-round,la-nordica-super-junior-lean`.
Expected: an "Immagine" group at the top with one picture per stove (front crop first when saved), "—" for a stove without pictures; clicking opens the lightbox with all that stove's pictures.

- [ ] **Step 3: Commit**

```bash
git add src/compare.ts src/style.css
git commit -m "feat: stove pictures on the compare page"
```

---

### Task 11: Documentation

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Update `README.md`**

Replace the opening viewer bullet list item `  - Filter the catalogue of 668 wood stoves from 23 brands.` with:
```
  - Filter the catalogue of 539 wood stoves (*stufe a legna*, including stoves with oven, storage and fireplace stoves) from 23 brands. Cookers, boiler stoves and inserts are excluded.
  - See each stove's pictures, extracted from the manufacturer catalogues, in a floating details window, and optionally on the 3D stove itself ("Foto frontale").
```

In the Data table, after the `data/apartment.json` row add:
```
| `public/stove-images/` | Pictures extracted from the catalogues (`img/`), the per-stove list (`index.json`) and the curated front-photo crops (`fronts.json`). Committed and deployed. |
```

Before the `## Real 3D models` heading add:
```markdown
## Stove pictures

Pictures come from the images embedded in each stove's cited catalogue pages:

```bash
python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/extract_images.py              # all stoves (needs assets/catalogues/)
.venv/bin/python scripts/extract_images.py --only <id>  # one stove
```

To put a real photo on the front of a 3D stove, run `npm run dev`, select the stove, open its details window and use **"Usa come frontale…"** under a picture: draw the stove's front, then **Salva**. The crop is written to `public/stove-images/fronts.json`; commit that file. The cropper only exists on the development server.
```

- [ ] **Step 2: Update `CLAUDE.md`**

In the Layout list, after the `src/compare/table.ts` line add:
```
- `src/data/images.ts`: picture index and front crops (`public/stove-images/`). `scripts/extract_images.py` (Python, offline) produces them; `scripts/frontsMiddleware.ts` is the dev-only API the cropper saves through.
```

In "Conventions that are easy to get wrong", after the Safety distances item add:
```
- **Catalogue scope.** Only *stufe a legna*: `EXCLUDED_CATEGORIES` in `stoves.ts` drops cookstove, thermo_stove, thermo_cookstove and insert; unknown categories are kept. The free-wall filter is depth ≤ 0.57 m.
- **Pictures.** `fronts.json` entries are only valid if their image is listed for that stove in `index.json`; re-running the extractor can invalidate crops. The cropper and `/__fronts` exist only in dev (`import.meta.env.DEV`, Vite `apply: 'serve'`).
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: pictures, front-photo cropper and wood-stove scope"
```
