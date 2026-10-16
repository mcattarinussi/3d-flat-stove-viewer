# Stove Viewer v2 — Design Addendum

Date: 2026-10-16
Builds on `2026-10-16-stove-viewer-design.md` (v1, implemented). Where this addendum and v1 disagree, this addendum wins. Everything not mentioned here stays as in v1.

## 1. Goals

1. Restrict the app to wood stoves (*stufe a legna*) and make the free-wall filter about depth.
2. Show pictures of each stove, extracted from the catalogue PDFs, in a floating details window and on the compare page.
3. Optionally show a curated front photo on the 3D stove.
4. Draw a real chimney pipe instead of the dashed flue hint.
5. Add the details visible in the ingresso photos: switches, socket, thermostat, skirting, door sills.
6. Fix the stairs door swing.

## 2. Decisions

| Topic | Decision |
|---|---|
| Categories | Drop `cookstove`, `thermo_stove`, `thermo_cookstove`, `insert`. Keep everything else, including unknown categories (539 models). Remove the Categoria filter. |
| Free-wall filter | "Ci sta nella parete libera" = stove depth ≤ 0.57 m. Width is ignored. |
| Picture source | Embedded images from each stove's cited PDF pages, extracted offline with a Python script. |
| Picture storage | Committed and deployed: `public/stove-images/`. |
| Front photo | Chosen and cropped by hand in an in-app cropper (dev server only); saved to `public/stove-images/fronts.json`, committed. |
| Crop persistence | Vite dev-server middleware writes `fronts.json`; the cropper is hidden in production builds. |
| Details | Floating, draggable window over the 3D view; the sidebar card becomes compact. |
| Compare | Each column shows a picture (front crop if saved, else first image) with click-to-enlarge. |
| Chimney | Black steel pipe of the flue diameter from collar to ceiling, with a ceiling collar. |
| Room details | Switches, socket, thermostat as fixtures; skirting and sills as room finishes. |
| Stairs door | `scale` opening swings **out** (towards the stairs). |

## 3. Catalogue scope (`src/data/stoves.ts`, `src/data/filters.ts`, `src/data/apartment.ts`)

- `EXCLUDED_CATEGORIES = ['cookstove', 'thermo_stove', 'thermo_cookstove', 'insert']`. `normaliseCatalogue` drops stoves in these categories; `categories` and `brands` are computed from what remains (a brand with no remaining models disappears).
- `FilterState.categories` and the Categoria UI are removed; `defaultFilters()` no longer takes the categories map.
- `FREE_WALL` gains `maxDepth: 0.57`. `fitsFreeWall(s)` = `s.dims !== null && s.dims.d <= FREE_WALL.maxDepth`. Toggle label: "Profondità max 57 cm (parete libera)".
- The compare page and URL state ignore ids of excluded stoves exactly like unknown ids.

## 4. Picture extraction (`scripts/extract_images.py`)

Run by hand (`python3 scripts/extract_images.py [--only <id>]`), needs `assets/catalogues/` locally and `pip install -r scripts/requirements.txt` (`pymupdf`, `pillow`).

- For each stove kept by §3, for each `sources[]` entry: open the PDF (doubled-prefix fix as in v1), take the cited pages (page number, `a-b` ranges and comma lists all expanded), list embedded images in page order.
- Skip an image when: the short side < 200 px; the aspect ratio > 3; it is a mask/alpha-only image; its decoded pixel content is a duplicate of an image already kept for this stove.
- Convert to RGB (CMYK and alpha handled), downscale so the long side ≤ 900 px, save as JPEG quality 80 at `public/stove-images/img/<sha1-of-pixels-first-16-hex>.jpg`. The same image used by several stoves is stored once.
- Write `public/stove-images/index.json`: `{ "<stove-id>": ["img/<hash>.jpg", …] }`, keys sorted, stoves with no images omitted.
- `--only <id>` re-extracts one stove and merges into the existing index. Files no longer referenced by the index are deleted at the end of a full run.
- Never reads or writes `fronts.json`.
- Prints a summary: stoves with ≥1 image, total images, total bytes.

## 5. Picture data in the app (`src/data/images.ts`)

- `interface FrontCrop { image: string; crop: { x: number; y: number; w: number; h: number } }` — `crop` in fractions (0–1) of the image.
- `parseImageIndex(raw): Map<string, string[]>` — ignores non-string entries.
- `parseFronts(raw, index): Map<string, FrontCrop>` — keeps an entry only if its `image` is listed for that stove in the index and `0 ≤ x, y`, `w, h > 0`, `x + w ≤ 1`, `y + h ≤ 1`.
- `loadImages(): Promise<{ index; fronts }>` — fetches `./stove-images/index.json` and `./stove-images/fronts.json`; any failure yields empty maps (the app works without pictures).
- `picturesFor(id, index, fronts): string[]` — front image first (if any), then the rest, without duplicates. URLs are relative to `./stove-images/`.

## 6. Details window (`src/ui/detailsWindow.ts`)

- A floating panel (`position: absolute` over the stage), default top-right of the 3D view, ~380 px wide, max-height of the stage with internal scroll. Draggable by its title bar (pointer events, kept inside the stage), close button. Position persisted in `localStorage` (`stufa3d.detailsPos`), guarded with try/catch.
- Opens when a stove is selected; "Apri dettagli" in the sidebar card reopens it after closing. Phone width: full-width sheet under the 3D view, not draggable.
- Content, top to bottom:
  - Title (brand + model), category, ★ toggle.
  - Gallery: main image + thumbnail strip; click the main image → full-screen lightbox (Esc / click to close, arrows to navigate). "Nessuna immagine disponibile" when the stove has none.
  - "Foto frontale" toggle (see §7) and, in dev only, "Usa come frontale" under the main image.
  - Full specs: everything in the v1 card plus emissions, finishes, certifications, heating volume, flue, weight.
  - Safety distances + manufacturer notes (or "Distanze di sicurezza non dichiarate"), buffer toggle.
  - Source PDF links.
- The sidebar card shrinks to: title, price · kW · W×D×H, buffer toggle, "Apri dettagli".

## 7. Front photo

### 7.1 On the 3D stove (`src/scene/stoveModel.ts`)
- `buildStove(s, front?: { texture: THREE.Texture; crop: Crop })`: when `front` is given, the door/oven/ash panels are not built; instead a plane of `w × (h − base − collar height)` sits on the front face at `z = d/2` (just proud of the body), textured with the crop mapped via UVs. Body, legs/plinth, collar unchanged. The bounding box stays exactly `w × h × d`.
- `cropUv(crop)` (pure): returns the UV rectangle; image v axis flipped for three.js.
- Round stoves: same flat plane (accepted simplification, as for v1 doors).
- Toggle "Foto frontale" (details window + placement panel): disabled when the stove has no saved crop; off by default; part of the URL as `front=1`. Texture loaded with `TextureLoader`, sRGB; disposed with the stove (`userData.disposable` on its material).

### 7.2 Cropper (`src/ui/cropper.ts`, dev only)
- Shown only when `import.meta.env.DEV`.
- Opens over the details window on the chosen image: drag to draw/move/resize a rectangle; aspect ratio locked to the stove's `w : (h − base − collar)` by default, unlockable. "Salva" / "Annulla".
- Saves via `POST /__fronts` with `{ id, image, crop }`; on success the in-memory fronts map updates and the 3D stove refreshes if "Foto frontale" is on.

### 7.3 Dev middleware (`scripts/frontsMiddleware.ts`, registered in `vite.config.ts` with `apply: 'serve'`)
- Accepts only `POST /__fronts` with JSON `{ id, image, crop }`.
- Validates: `id` is a key in `index.json`, `image` is listed for that id, crop within bounds (same rule as `parseFronts`). Invalid → 400 with a message.
- Reads `public/stove-images/fronts.json` (missing → `{}`), sets `[id]`, writes keys sorted, 2-space JSON, via temp file + rename. Returns the saved entry.
- `DELETE /__fronts/<id>` removes an entry (cropper "Rimuovi").

## 8. Compare page

- New first row group **"Immagine"**: one cell per stove with the stove's first picture (`picturesFor`), fixed height ~160 px, `object-fit: contain`; click → the same lightbox component as §6 with all that stove's pictures. "—" when none.
- CSV export unchanged (no image column).

## 9. Chimney (`src/scene/stoveModel.ts`)

- `buildChimney(s, ceiling): THREE.Group` replaces `buildFlueHint`.
  - Top outlet: cylinder of the collar diameter from the stove top to the ceiling, matte black steel (`#1b1b1c`, metalness 0.6, roughness 0.5), plus a ceiling collar ring (diameter + 6 cm, 2 cm tall) at the ceiling.
  - Rear-only outlet: horizontal pipe 0.25 m backwards from the rear collar, a 90° elbow (short cylinder), then vertical to the ceiling, ceiling collar.
  - Same orientation frame as the stove; added to the stove holder like the old hint; casts shadows; geometries disposed with the stove.
- Stays visible in the cutaway and in plan view (seen as a circle).

## 10. Room details (`data/apartment.json`, `src/data/apartment.ts`, `src/scene/room.ts`)

### 10.1 Data
- `Fixture.type` becomes `'radiator' | 'switch' | 'socket' | 'thermostat'`; optional `gangs: 1 | 2` (switch only, default 1).
- New fixtures (estimates, editable):
  - `interruttore-notte`: switch, 2 gangs, north, from 0.26 to 0.34, elevation 1.04, height 0.12, depth 0.01
  - `termostato`: thermostat, north, from 1.69 to 1.81, elevation 1.46, height 0.08, depth 0.03
  - `interruttore-soggiorno`: switch, 1 gang, east, from 1.61 to 1.69, elevation 1.06, height 0.08, depth 0.01
  - `presa`: socket, east, from 1.61 to 1.69, elevation 0.20, height 0.08, depth 0.01
- Room-level `"finishes": { "skirting": { "height": 0.08, "thickness": 0.01 }, "sills": true }` (optional; absent → no skirting, no sills).
- The `scale` opening's door becomes `"swing": "out"`.

### 10.2 Validation
- Two items on the same wall overlap only if their along-wall ranges **and** their vertical ranges overlap. Vertical range: fixtures `[elevation, elevation + height]`; openings `[0, height + transom]`.
- Skirting height/thickness must be positive numbers.

### 10.3 Rendering
- `skirtingSegments(room, wall, casing = 0.07): [a0, a1][]` (pure): along-wall runs from corner to corner minus each opening widened by the casing on both sides; north/south runs extend by the skirting thickness at both ends so corners close.
- Skirting: beige marble (`#d8ccb4`, roughness 0.35) boxes `height × thickness` on the wall's inner face, part of the wall group.
- Sills: light marble slab per opening, `width × wall thickness × 0.005`, flush with the floor (top at y = 0.003), part of the wall group.
- Wall plates (part of the wall group, on the inner face):
  - switch: white plate `w × h × depth` + `gangs` rockers stacked vertically;
  - socket: white plate + two small dark holes;
  - thermostat: white box + light grey dial disc on its face.

## 11. Testing

- `stoves.test.ts`: excluded categories are dropped (counts against the real file: 539 kept), unknown categories kept, brands recomputed.
- `filters.test.ts`: no category filter; depth rule incl. exactly 0.57 and null dims.
- `images.test.ts`: `parseImageIndex`, `parseFronts` (bounds, image not in index, garbage), `picturesFor` ordering/dedup.
- `stoveModel.test.ts`: `cropUv`; bbox stays exact with a front photo; `buildChimney` top and rear — pipe spans collar → ceiling, ceiling collar at the ceiling.
- `frontsMiddleware.test.ts`: valid save writes sorted JSON; 400 on unknown id / image not listed / out-of-bounds crop; delete removes; temp-file write (uses a temp directory).
- `apartment.test.ts`: new fixture types parse; switch above socket on the same span accepted; switch inside a doorway rejected; `scale` swings out.
- `room.test.ts`: `skirtingSegments` for each wall of the real file.
- `doors.test.ts`: existing "opens towards its swing side" test covers the `scale` change.
- Python script: smoke-tested by running it with `--only` on two stoves and checking the manifest; not unit-tested.
- Browser checks: details window (drag, close, reopen, gallery, lightbox), cropper save in dev, front photo on 3D, compare images, chimney, room details vs. photos, phone width.

## 12. Out of scope

- Background removal or automatic front-photo selection.
- Pictures from manufacturer websites.
- Ceiling light, door styling/textured glass, soggiorno leaf glazing, radiator repositioning (offered, not chosen).
