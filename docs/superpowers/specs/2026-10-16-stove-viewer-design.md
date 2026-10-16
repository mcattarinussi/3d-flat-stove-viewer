# Stove Viewer — Design Spec

Date: 2026-10-16
Supersedes the open points of `design.md` (which remains the source for the `stoves.json` schema, §3.1).

## 1. Goal

A static web app to choose a wood stove for the **ingresso** of the apartment and decide where it goes: browse/filter the catalogue in `data/stoves.json`, place a stove in an accurate 3D model of the ingresso, see its manufacturer safety distances, shortlist candidates and compare them side by side. Runs locally (`npm run dev`) and on GitHub Pages.

### Decisions (vs. `design.md`)

| Topic | Decision |
|---|---|
| Rooms modelled | Only the ingresso. Other rooms are not rendered internally; doorways open onto a dark threshold. |
| Apartment data | `data/apartment.json` is hand-authored (derived from `assets/floor-plan.svg` + photos), user-corrected. Not parsed from SVG at runtime. |
| Clearance check (§2.3) | **No violation logic, no alerts.** Safety distances are only drawn as a toggleable semi-transparent buffer. |
| Missing safety distances | **No fallback.** If `safety_distances_mm` is null nothing is drawn; individual null fields are omitted. Sidebar shows "Distanze di sicurezza non dichiarate". |
| Flue | No existing flue; outlet position is shown, never constrains placement. |
| Stove look | Parametric procedural model for every stove with dimensions; per-id GLB override for a shortlist (sourced later from CAD, hand modelling, AI image-to-3D or showroom scans). |
| Doors | Every door leaf can be opened/closed (click or sidebar). |
| Pages | Viewer (`index.html`) + Shortlist/Compare (`compare.html`). |
| Sharing | Viewer state encoded in the URL. |
| Catalogue PDFs | Deployed with the site so source links work everywhere. |
| UI language | Italian. |

## 2. Stack & structure

- **Vite + TypeScript + Three.js**, multi-page build (two HTML entries, no router, no UI framework).
- **Vitest** for unit tests.
- **GitHub Actions** workflow builds and deploys to Pages (`base` set to the repo name). `data/` and `assets/catalogues/` are copied into the build output so relative paths (`assets/catalogues/<brand>/<file>.pdf`) resolve.

```
index.html, compare.html
data/apartment.json, data/stoves.json
public/models/index.json            # list of stove ids with a GLB override
public/models/<id>.glb
src/
  data/
    types.ts         # Stove, Apartment, Opening, Fixture types
    stoves.ts        # load + normalise stoves.json
    apartment.ts     # load + validate apartment.json
    filters.ts       # pure filter/sort functions
    shortlist.ts     # localStorage store + sync with URL
    urlState.ts      # viewer state <-> query string
  scene/
    setup.ts         # renderer, lights, environment, shadows
    room.ts          # floor, walls with cut-outs, frames, radiator, ceiling
    doors.ts         # door leaves, hinge pivots, open/close animation, swing arcs
    stoveModel.ts    # parametric stove builder + GLB override loader
    buffer.ts        # safety-distance meshes
    placement.ts     # drag, rotate, nudge, wall snap, clamping, wall distances
    camera.ts        # orbit / top-down plan / reset
  ui/
    filtersPanel.ts, resultsList.ts, stoveCard.ts,
    placementPanel.ts, doorsPanel.ts, viewPanel.ts, sharePanel.ts, toast.ts
  viewer.ts          # entry for index.html
  compare.ts         # entry for compare.html
```

Each `scene/` module exposes a small builder/controller API and has no DOM dependencies beyond the canvas; each `ui/` module renders into a container and talks to the scene only through callbacks passed in by the entry file.

## 3. Coordinates & units

- Metres, Y up. Origin at the ingresso's **south-west inner corner**; **x** east (0 → 2.00), **z** north (0 → 3.40).
- `stoves.json` mm values are converted to m in `stoves.ts`; nothing downstream sees mm.
- Stove pose = footprint centre `(x, z)` + rotation `r` in degrees (facing convention in §6.4).

## 4. Data

### 4.1 `data/apartment.json`

```jsonc
{
  "units": "m",
  "ceiling_height": 2.70,
  "wall_thickness": 0.20,
  "room": {
    "id": "ingresso", "name": "Ingresso",
    "width": 2.00, "depth": 3.40,
    "floor": { "material": "marble" },
    "openings": [
      { "id": "entrata",    "name": "Porta d'ingresso", "wall": "south", "from": 0.55, "to": 1.45, "height": 2.10, "door": { "hinge": "to",   "swing": "in",  "glazed": true } },
      { "id": "disimpegno", "name": "Disimpegno",       "wall": "north", "from": 0.63, "to": 1.43, "height": 2.10, "transom": 0.50, "door": { "hinge": "from", "swing": "out", "glazed": true } },
      { "id": "scale",      "name": "Scale",            "wall": "west",  "from": 2.25, "to": 3.05, "height": 2.10, "door": { "hinge": "to",   "swing": "in",  "glazed": true } },
      { "id": "cucina",     "name": "Cucina",           "wall": "west",  "from": 0.72, "to": 1.52, "height": 2.10, "door": { "hinge": "from", "swing": "out" } },
      { "id": "soggiorno",  "name": "Soggiorno",        "wall": "east",  "from": 0.72, "to": 1.52, "height": 2.10, "door": { "hinge": "from", "swing": "out" } }
    ],
    "fixtures": [
      { "id": "radiatore", "type": "radiator", "wall": "east", "from": 0.10, "to": 0.60, "height": 0.85, "depth": 0.12, "elevation": 0.12 }
    ]
  }
}
```

- `wall`: which inner wall. `from`/`to`: positions along that wall in room coordinates (x for north/south walls, z for east/west walls).
- `door.hinge`: which end (`from`|`to`) carries the hinge. `door.swing`: `in` (into the ingresso) or `out` (into the neighbouring room). `glazed`: leaf has a glass panel. `transom`: glazed panel above the door, height in m.
- Values derived from the SVG (70 px = 1 m) and photos. **Estimates to be confirmed by the user:** door heights (2.10), transom (0.50), glazed flags, radiator size/position.
- `apartment.ts` validates: openings/fixtures lie within their wall length, don't overlap each other; throws a descriptive error otherwise.

### 4.2 `data/stoves.json` normalisation (`stoves.ts`)

Produces `Stove` objects with:
- `dims: {w, d, h} | null` in m (null if any of width/depth/height is null).
- `safety: {rear, side, front, ceiling, floorFront: number|null, notes} | null` in m. No defaults.
- `price: number | null` = min `indicative_price_eur` across `pricing` rows.
- `kw: number | null` = `heat_output_kw.nominal`.
- `round: boolean` = `width === depth` and model/description/bespoke mention a cylindrical shape ("cilindr", "round", "rotond"); otherwise false.
- All other fields passed through typed.
- Stoves with `dims === null` are excluded from the viewer's results (counted in a "N senza dimensioni" note) but remain available on the compare page if shortlisted.

## 5. Room rendering (`room.ts`, `doors.ts`)

- Floor: light grey marble (procedural/noise texture or small tiling texture), receives shadows.
- Walls: 0.20 m thick, white, built as boxes with rectangular cut-outs for openings; dark-wood frames (casings) around each opening; glazed transom above `disimpegno`.
- Ceiling at 2.70 m: semi-transparent in orbit view (and back-face culled so the camera can see in), hidden in plan view.
- Radiator: white ribbed block at its fixture position.
- Beyond each doorway: a short dark floor threshold, nothing else.
- Lighting: hemisphere/environment light + one shadow-casting directional/ceiling light; physically-based materials; soft shadows.

### Doors
- Each door leaf is a `Group` pivoted at its hinge. Glazed leaves have a translucent glass panel.
- Open = rotated 90° in its swing direction (`in` → into the ingresso, `out` → into the neighbour). Animated ~300 ms.
- Toggle by clicking the leaf in 3D or via the **Porte** panel (one toggle per door + "Apri tutte" / "Chiudi tutte").
- Doors swinging `in` draw a faint dashed swing arc on the floor (always visible) so blocked swings are visible. Purely visual, no checks.
- All doors closed by default.

## 6. Stoves

### 6.1 Parametric model (`stoveModel.ts`)

`buildStove(stove): THREE.Group` — bounding box exactly `w × h × d`, origin at footprint centre on the floor, front facing local +z.

- Body: rounded box, or cylinder when `round`. Material: matte anthracite metal; `storage_stove` uses a light ceramic finish.
- Base: 4 short legs for `stove`; a 6–10 cm plinth otherwise.
- Firebox door: dark glass panel (~45 % of body height, ~70 % of width) with subtle orange emissive glow, metal frame and handle.
- `cookstove` / `thermo_cookstove`: hob plate on top; firebox door on one side of the front, oven or ash door on the other.
- `has_oven`: oven door below or beside the firebox.
- Flue collar: cylinder of `flue.diameter_mm` (default visual 150 mm if null) on top; at the rear if `outlet` contains only `rear`. A thin dashed vertical line from the collar to the ceiling (or a short horizontal dashed run to the wall for rear outlets) indicates the flue route.

### 6.2 GLB override

- `public/models/index.json` lists ids with a GLB. If the selected stove's id is listed, load `models/<id>.glb` with `GLTFLoader`, scale it non-uniformly to exactly `w × h × d`, re-centre to the same origin/facing convention, and use it instead of the parametric model.
- On load failure: `console.warn` and fall back to the parametric model.
- How GLBs are produced (manufacturer CAD, hand modelling from technical drawings, image-to-3D, showroom scan) is out of scope for the app; all produce the same file.

### 6.3 Safety buffer (`buffer.ts`)

Only when `safety` is non-null. In the stove's local frame:
- Translucent amber box extending the footprint by `rear` behind, `side` left and right, `front` in front; each null value contributes 0 on that side. Height = stove height.
- `floorFront`: flat translucent patch on the floor in front of the stove of that depth, stove width.
- `ceiling`: dashed horizontal outline at `stove top + ceiling`.
- Toggle "Mostra distanze di sicurezza" (default on). Buffers may pass through walls (that is how the user judges fit).
- No colouring by violation, no alerts.

### 6.4 Placement (`placement.ts`)

- Facing convention: `r = 0` → stove front faces −x (into the room from the east wall). Rotation in degrees, clockwise seen from above.
- **Initial pose** on selection: centred on the free east-wall segment (z ∈ [1.52, 3.40]), rear against the wall, offset by `safety.rear` when known, 0 otherwise. Selecting another stove keeps the current pose (re-clamped).
- **Drag** on the floor plane (raycast); orbit controls disabled during drag.
- **Rotate**: ring handle around the base; Shift snaps to 15°.
- **Panel**: forward/back and left/right nudges relative to the stove's facing, step selector 1/5/10 cm; rotate ±15° and +90°; "Attacca al muro" (snap the rear to the nearest wall, respecting `safety.rear` if known); readout of the distance from the body to each of the four walls (numbers only).
- **Clamp**: the body's rotated footprint must stay inside the room rectangle. Buffer is not clamped. Collisions with radiator/doors are not checked.

## 7. Camera (`camera.ts`)

- **Vista 3D**: perspective camera with OrbitControls, target at room centre, limited so the camera stays within a sensible radius; ceiling semi-transparent.
- **Pianta**: orthographic top-down, ceiling hidden, rotation locked, pan/zoom allowed.
- **Reset**: restore the default view for the current mode.

## 8. Viewer UI (`index.html`)

Sidebar (collapsible on narrow screens), top to bottom:

1. **Filtri** (AND-combined)
   - Categoria: multi-select with Italian labels from `categories`; `insert` off by default.
   - Marca: multi-select with counts.
   - Range sliders: potenza nominale (kW), prezzo (€), larghezza, profondità, altezza (cm).
   - Stelle minime (3/4/5), classe energetica (A+/A).
   - Toggles: "Solo con distanze di sicurezza", "Solo con prezzo", "Con forno".
   - "Ci sta nella parete libera": hides stoves whose body footprint (w and d, any rotation of 0/90°) cannot fit within the 1.88 m × 2.00 m free zone in front of the east-wall segment. Body only, no clearances.
   - Free-text search on brand + model.
   - **Null semantics**: a stove with a null value passes a range filter while that range is at its full extent; once narrowed, it is excluded. A counter shows "N nascosti per dati mancanti".
2. **Risultati**: virtualised list (brand, model, kW, price, W×D×H, stars, ★ shortlist toggle); sort by prezzo / potenza / larghezza / nome. Click a row to place the stove. Footer: "N senza dimensioni non mostrati".
3. **Stufa selezionata**: key specs, buffer toggle, safety `notes` (or "Distanze di sicurezza non dichiarate"), source links `assets/catalogues/...pdf#page=N` (first page of the range).
4. **Posizionamento** (§6.4), **Porte** (§5), **Vista** (§7).
5. **Condividi**: copy URL.

### URL state (`urlState.ts`)

`?stove=<id>&x=<m>&z=<m>&r=<deg>&doors=<id,id>&shortlist=<id,id>&buffer=0|1`

- Updated with `history.replaceState` on change (debounced).
- On load: unknown stove ids are ignored with a toast; invalid numbers are ignored; pose is re-clamped.
- `shortlist` from the URL is merged into the stored shortlist.

## 9. Compare page (`compare.html`)

- Reads the shortlist (localStorage, merged with `?shortlist=`).
- Table, one column per stove; grouped rows: Prezzo · Potenza (nominale, min–max, acqua) · Dimensioni e peso · Distanze di sicurezza · Rendimento (nominale, stagionale) · Stelle e classe energetica · Emissioni · Canna fumaria (diametro, uscite) · Volume riscaldabile · Forno · Finiture · Fonti (PDF links).
- Best value highlighted in rows with a clear direction: lowest for price, emissions and safety distances; highest for efficiency and stars. Other rows (power, dimensions, volume) are not highlighted. Null → "—".
- Per column: remove, move left/right, "Apri nel visualizzatore" (link to `index.html?stove=<id>&shortlist=...`).
- **Footprint strip**: top-down SVG of each shortlisted stove (body + buffer if known) drawn to scale against the 1.88 m free east-wall segment.
- Export CSV of the table.
- Empty shortlist → message with link back to the viewer.

## 10. Error handling

- `stoves.json` / `apartment.json` fetch or validation failure → full-page error with message and "Riprova".
- GLB failure → warn + parametric fallback.
- Bad URL params → ignored, toast for unknown stove ids.
- localStorage unavailable → shortlist works in-memory for the session.

## 11. Testing

Vitest unit tests:
- `stoves.ts`: mm→m conversion, `dims` null handling, `price` = min of rows, no safety defaults.
- `filters.ts`: each filter, null semantics, "ci sta nella parete libera".
- `apartment.ts`: validation errors for out-of-range/overlapping openings.
- `urlState.ts`: round-trip encode/decode, invalid input.
- `shortlist.ts`: add/remove/reorder, URL merge, storage-unavailable fallback.
- `stoveModel.ts`: bounding box equals `w × h × d` for box, round, cookstove, with-oven variants; flue collar position by outlet.
- `placement.ts`: clamping at 0/45/90°, wall snap with/without `safety.rear`, wall distance readout.
- `buffer.ts`: extents per side, null fields omitted, null `safety` → no mesh.

Manual browser check of rendering, door animation, drag/rotate, plan view, Pages deployment.

## 12. Deployment

- `.github/workflows/deploy.yml`: on push to `main`, `npm ci && npm test && npm run build`, upload `dist/` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.
- Build copies `data/`, `assets/catalogues/` and `public/models/` into `dist/`.
- Repo size: ~580 MB of PDFs (largest 91 MB, under GitHub's 100 MB file limit). `.gitignore` excludes `node_modules/`, `dist/`, `.DS_Store`.

## 13. Out of scope

- Rendering any room other than the ingresso.
- Clearance/collision validation or alerts.
- Flue routing constraints.
- Producing GLB models (the app only consumes them).
- Heat-sizing hints.
