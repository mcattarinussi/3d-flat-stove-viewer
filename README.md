# Stufa nell'ingresso

A static web app for choosing a wood-burning stove for the apartment's entrance hall (*ingresso*) and working out where it goes.

- **Viewer** (`index.html`)
  - Filter the catalogue of 668 wood stoves from 23 brands.
  - Place a stove in a to-scale 3D model of the ingresso: drag it, rotate it, nudge it, or snap it to a wall.
  - See the manufacturer's safety distances as a translucent buffer.
  - Open and close the doors.
  - Switch between a 3D view and a top-down plan.
  - Share the current setup as a link.
- **Compare** (`compare.html`): stoves starred in the viewer appear side by side.
  - A spec table with the best value in each row highlighted.
  - To-scale footprints against the free wall.
  - CSV export.

The UI is in Italian.

## Running it

Requires Node 24 (pinned in `.tool-versions` for asdf).

```bash
npm install
npm run dev       # development server
npm test          # unit tests (Vitest)
npm run build     # type-check + static build into dist/
npm run preview   # serve the production build
```

## Deploying

`.github/workflows/deploy.yml` tests, builds and publishes `dist/` to GitHub Pages on every push to `main`. Before the first deploy, set **Settings → Pages → Source** to **GitHub Actions**.

The build copies `data/` next to the pages. The manufacturer catalogues (`assets/catalogues/`, about 580 MB) and the apartment photos (`assets/photos/`) are kept out of git, so the PDF source links on each stove only work locally. A local `npm run build` still copies the catalogues into `dist/` when the folder is present.

## Data

| File | What it is |
|---|---|
| `data/stoves.json` | Stove catalogue extracted from the manufacturer PDFs, with indicative prices. The schema is documented in `design.md` §3.1. |
| `data/apartment.json` | The ingresso: size, ceiling height, wall thickness, doors (hinge side, swing direction, glazing, transom) and the radiator. Derived from `assets/floor-plan.svg` and the photos. |
| `assets/catalogues/` | Source PDFs and price sheets, linked from each stove. Local only, not in git. |
| `assets/photos/` | Photos of the apartment used to model the ingresso. Local only, not in git. |
| `public/models/` | Optional real 3D models (see below). |

Door heights (2.10 m), the transom above the night-area door (0.50 m) and the radiator's size and position are estimates. To correct them, edit `data/apartment.json`; the app checks the file on load and reports any inconsistencies.

Stoves without dimensions (66) can't be placed. Stoves without declared safety distances show no buffer: the app never makes up a default distance.

## Real 3D models

By default each stove is drawn parametrically from its catalogue dimensions. To show a real model for a stove:

1. Get a GLB file, for example from manufacturer CAD files, modelled from the technical drawings, made with an image-to-3D tool, or from a showroom scan.
2. Save it as `public/models/<stove-id>.glb`. The id is the stove's `id` in `stoves.json`, also shown in the URL as `?stove=…`.
3. Add the id to `public/models/index.json`, e.g. `["eva-calor-alberta"]`.

The model is stretched to the catalogue's width × height × depth. Its front should face +Z (the glTF convention). If the file fails to load, the parametric stove is shown instead.

## Docs

- `design.md`: original requirements.
- `docs/superpowers/specs/2026-10-16-stove-viewer-design.md`: the agreed design.
- `docs/superpowers/plans/2026-10-16-stove-viewer.md`: the implementation plan.
