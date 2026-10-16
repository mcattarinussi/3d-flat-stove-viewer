# Design Specification: 3D Apartment & Stove Placement Viewer

## 1. Executive Summary
The goal of this project is to build a lightweight, interactive web application using **Three.js** that allows homeowners to visualize their apartment in 3D and test the placement of various heating stoves. Stoves are dynamically loaded from a catalog extracted from manufacturer PDFs, and the system provides visual indicators for fire safety clearance distances. The app can be run locally and on github pages.

## 2. Core Functional Requirements

### 2.1 Apartment 3D Reconstruction
- Render rooms based on accurate dimensions defined in `data/apartment.json` and photos in assets/photos/apartment 
- Support walls, floor surfaces, doors, and windows
- Render basic furniture

### 2.2 Stove Selection & Placement
- Load stove models and technical specifications dynamically from `data/stoves.json`. Only load stoves where type is wood.
- Allow the user to select a stove model from a sidebar dropdown.
- Render the stove in 3D using accurate bounding dimensions (Width × Height × Depth) and representative materials/colors.
- Support interactive movement (Drag & Drop or gizmo/arrow controls) and 360° rotation within the 3D room.

### 2.3 Fire Safety & Clearance Check
- Render a semi-transparent safety buffer (bounding box or perimeter radius) around the active stove model based on technical specs (rear, lateral, and front clearances).
- Visually alert the user (e.g., highlight buffer in red) if the stove is positioned too close to a wall, window, or combustible furniture piece.

### 2.4 User Interface (UI)
- Overlay control panel (sidebar) containing:
  - **Stove Selection:** allow to filter based on brand, power rating (kW), stars, pricing, dimensions, etc.
  - **Stove Placement:**: after placing the stove, allow the user to move it forward/backward and left/right
  - **Camera Controls:** Reset view, toggle top-down (2D plan) vs 3D free orbit mode.

## 3. Data Schemas

### 3.1 Stove Catalog Schema (`data/stoves.json`)

The catalog is a single JSON document with top-level metadata and a flat `stoves` array (668 wood-burning models, 23 brands). Conventions:

- **Units:** lengths in **mm**, weights in kg, power in kW, efficiency in %, emissions in mg/Nm³ at 13% O₂, volumes in m³, prices in EUR VAT included. The viewer must convert mm → m when building 3D geometry.
- **Nullability:** every standard field is always present; `null` means the value is not reported in the sources. `safety_distances_mm` and `emissions_13pct_o2` may be `null` as a whole object.
- **Dimensions:** `width` = front width, `depth`, `height` = total height. For cylindrical stoves `width = depth = diameter`.
- **Safety distances:** manufacturer-declared minimum distances from combustible materials. Conditions (heat shields, alternative values, distances from non-combustible materials) are free text in `notes`.

```json
{
  "schema_version": "1.0",
  "generated_on": "2026-10-14",
  "description": "string",
  "conventions": { "units": "string", "dimensions_mm": "string", "safety_distances_mm": "string", "...": "string" },
  "categories": {
    "stove": "Stufa a legna",
    "stove_with_oven": "Stufa a legna con forno",
    "cookstove": "Cucina a legna / stufa-cucina",
    "thermo_stove": "Termostufa a legna",
    "thermo_cookstove": "Termocucina a legna",
    "storage_stove": "Stufa ad accumulo",
    "fireplace_stove": "Stufa-camino a legna",
    "insert": "Inserto/caminetto a legna"
  },
  "summary": { "total_models": 668, "with_dimensions": 602, "with_safety_distances": 219, "with_price": 267, "price_sheet_only": 41 },
  "brands": [
    {
      "name": "Caminetti Montegrappa",
      "models": 22,
      "with_dimensions": 22,
      "with_safety_distances": 0,
      "with_price": 13,
      "catalogue_files": ["assets/catalogues/Caminetti Montegrappa/....pdf"],
      "price_file": "assets/catalogues/Caminetti Montegrappa/Prezzi_....xlsx"
    }
  ],
  "stoves": [
    {
      "id": "eva-calor-alberta",
      "brand": "Eva Calor",
      "model": "Alberta",
      "category": "stove",
      "description": null,
      "dimensions_mm": { "width": 504, "depth": 433, "height": 1282 },
      "weight_kg": 147,
      "heat_output_kw": { "nominal": 8, "min": null, "max": null, "water": null },
      "efficiency_pct": 86,
      "seasonal_efficiency_pct": 76,
      "heating_volume_m3": 200,
      "energy_class": "A+",
      "environmental_stars": 5,
      "flue": { "diameter_mm": 150, "outlet": ["top", "rear"] },
      "external_air_intake_mm": 80,
      "safety_distances_mm": {
        "rear": 200,
        "side": 400,
        "front": 1500,
        "ceiling": 750,
        "floor_front": 1000,
        "notes": "Distanze minime da materiali combustibili (EN 16510). ..."
      },
      "max_log_length_mm": 250,
      "fuel_consumption_kg_h": 2.4,
      "emissions_13pct_o2": { "co_mg_nm3": 644, "pm_mg_nm3": 24, "nox_mg_nm3": 87, "ogc_mg_nm3": 25 },
      "certifications": ["EN 16510-2-1:2022"],
      "has_oven": false,
      "finishes": ["Reddish brown", "Brass"],
      "pricing": [
        {
          "price_sheet_model": "Alberta",
          "price_sheet_category": "Stufa a legna",
          "list_price_eur": null,
          "online_price_eur": 2106,
          "online_discount_pct": null,
          "indicative_price_eur": 2106,
          "price_source": "ebay.it (rivenditori italiani, prodotti nuovi)",
          "notes": "mediana di 5 offerte, da 2.005 a 2.342 €",
          "collected_on": "2026-10-12",
          "currency": "EUR",
          "vat_included": true,
          "price_file": "assets/catalogues/Eva Calor/Prezzi_Eva_Calor_stufe_a_legna.xlsx"
        }
      ],
      "data_quality": {
        "spec_source": "catalogue",
        "has_dimensions": true,
        "has_safety_distances": true,
        "has_price": true
      },
      "sources": [
        { "file": "assets/catalogues/Eva Calor/Eva_Calor_Alberta_scheda_tecnica.pdf", "pages": "1-3" }
      ],
      "bespoke": {
        "flue_gas_temp_c": 233,
        "min_draught_pa": 10,
        "dimensions_source": "Disegno tecnico (L x P x H)"
      }
    }
  ]
}
```

**Stove fields**

| Field | Type | Notes |
|---|---|---|
| `id` | string | Unique slug, `<brand>-<model>` (e.g. `eva-calor-alberta`). |
| `brand` | string | Matches `brands[].name`. |
| `model` | string \| number | Model name as printed in the catalogue (a few are numeric). |
| `category` | string | Key of `categories`. |
| `description` | string \| null | |
| `dimensions_mm` | `{width, depth, height}` | Each number \| null. 66 models have no dimensions. |
| `weight_kg` | number \| null | |
| `heat_output_kw` | `{nominal, min, max, water}` | Each number \| null. `water` = output to water (thermo stoves/cookstoves). |
| `efficiency_pct`, `seasonal_efficiency_pct` | number \| null | |
| `heating_volume_m3` | number \| null | |
| `energy_class` | `"A+"` \| `"A"` \| null | |
| `environmental_stars` | 1–5 \| null | Italian D.M. 186/2017 rating. |
| `flue` | `{diameter_mm, outlet}` | `outlet`: array of `"top"` \| `"rear"` \| `"side"`, or null. |
| `external_air_intake_mm` | number \| null | Diameter of the combustion-air intake. |
| `safety_distances_mm` | object \| null | `{rear, side, front, ceiling, floor_front, notes}`; numeric fields may be null. Only 219 models have it. |
| `max_log_length_mm` | number \| null | |
| `fuel_consumption_kg_h` | number \| null | |
| `emissions_13pct_o2` | object \| null | `{co_mg_nm3, pm_mg_nm3, nox_mg_nm3, ogc_mg_nm3}`. |
| `certifications` | string[] | |
| `has_oven` | boolean | |
| `finishes` | (string \| number)[] | Colour/material names as in the catalogue (not hex colours). |
| `pricing` | object[] | Zero or more price-list rows. `indicative_price_eur` = online price if present, else list price. Optional `shared_price_row: true` when one row covers several variants. |
| `data_quality` | object | `spec_source`: `"catalogue"` \| `"price_sheet_only"`; plus `has_dimensions`, `has_safety_distances`, `has_price` flags. |
| `sources` | `{file, pages}[]` | `pages` is a number or a range string. |
| `bespoke` | object | Brand/source-specific extras with no fixed schema (power tables, flue offsets, oven size, data-reading notes). Do not rely on its keys. |

**Viewer implications:** the 3D proxy is a box of `dimensions_mm` (skip or flag stoves with null dimensions); the clearance check (§2.3) uses `safety_distances_mm` and must fall back to a default/regulatory distance when it is `null`; there is no colour field, so the proxy uses a neutral material.
