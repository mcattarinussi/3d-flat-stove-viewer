# CLAUDE.md

A static Vite + TypeScript + three.js app for placing a wood stove in the apartment's ingresso. See README.md for the feature overview. The binding design is `docs/superpowers/specs/2026-10-16-stove-viewer-design.md`.

## Commands

- Node comes from asdf (`.tool-versions`: nodejs 24.8.0). If `node` says "No version is set", prefix commands with `ASDF_NODEJS_VERSION=24.8.0`.
- `npm test`: Vitest (node environment). `npx vitest run tests/<file>.test.ts` runs a single file.
- `npx tsc --noEmit`: type-check. `npm run build` runs it before `vite build`.
- `npm run dev` / `npm run preview`.

## Layout

- `src/data/`: pure, unit-tested logic: types, catalogue normalisation, apartment parsing and validation, filters, shortlist, URL state.
- `src/scene/`: three.js builders and controllers: room, doors, parametric stove plus GLB override, safety buffer, placement, camera, picking.
- `src/ui/`: plain-DOM panels built with the `el()` helper in `ui/dom.ts`. No UI framework.
- `src/viewer.ts`, `src/compare.ts`: page entry points. They only wire modules together; keep logic out of them.
- `src/compare/table.ts`: pure compare rows, CSV and footprint SVG.
- `src/data/images.ts`: picture index and front crops (`public/stove-images/`). `scripts/extract_images.py` (Python, offline) produces them; `scripts/frontsMiddleware.ts` is the dev-only API the cropper saves through.
- `tests/`: one test file per module. `tests/fixtures.ts` provides `rawStove()` and `stove()`.

## Conventions that are easy to get wrong

- **Units.** Everything is in metres. `stoves.json` is in mm and is converted only in `src/data/stoves.ts`.
- **Room coordinates.** Origin at the ingresso's south-west inner corner. x points east (0 → 2.00), z points north (0 → 3.40), y points up.
  - All scene content lives under `viewer.root`, which has `scale.z = -1`, so the plan view reads north-up with east on the right. Code inside the root uses room coordinates directly.
  - World coordinates are `(x, y, -z)`. Room ↔ world conversion only happens in `camera.ts` (`toWorld`) and in picking (`root.worldToLocal`).
- **Stove frame and pose.**
  - In its local frame, the stove's footprint centre is on the floor at the origin and its front faces +z.
  - The pose is `{x, z, r}` with `yaw(r) = -π/2 + r°`: `r = 0` faces west, and increasing `r` turns clockwise on the plan.
  - "Left" and "right" are as seen standing in front of the stove (see `rightOf`).
  - GLB wrappers use `scale.x = -1` to undo the root mirror.
- **Safety distances.**
  - Never invent a fallback. A null `safety` draws nothing; null fields add 0.
  - There is deliberately no violation or alert logic (spec decision).
- **Catalogue scope.** Only *stufe a legna*: `EXCLUDED_CATEGORIES` in `stoves.ts` drops cookstove, thermo_stove, thermo_cookstove and insert; unknown categories are kept. The free-wall filter is depth ≤ 0.57 m.
- **Pictures.** `fronts.json` entries are only valid if their image is listed for that stove in `index.json`; re-running the extractor can invalidate crops. The cropper and `/__fronts` exist only in dev (`import.meta.env.DEV`, Vite `apply: 'serve'`).
- **Bounding box.** `buildStove()` must produce a bounding box of exactly W×H×D; tests enforce this. Shared stove materials come from `mats()` and must not be disposed. Per-instance materials are flagged `userData.disposable`.
- **URLs.** Use relative URLs only (`./data/…`, `./models/…`, `./assets/catalogues/…`). Vite runs with `base: './'`, so the site works under any GitHub Pages sub-path.
- **Local-only assets.** `assets/catalogues/` and `assets/photos/` are git-ignored; never commit them. Code and tests must work when they're absent (CI): the build copies the catalogues only if present, and the source-file test skips.
- **UI copy** is Italian.
- **three 0.186** removed `PCFSoftShadowMap`; use `PCFShadowMap`.

## Working style

- TDD: write the failing test first for anything in `src/data`, `src/compare/table.ts`, or the pure parts of `src/scene`.
- DOM and WebGL wiring is checked in a browser. Headless Chromium through `playwright-core` works with `--use-angle=swiftshader`.
- Keep `data/apartment.json` valid: `parseApartment` rejects openings outside a wall, overlapping items, and openings taller than the ceiling.
