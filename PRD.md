# MangroveAI — Product Requirements Document (PRD)

## 1. Project Overview

**MangroveAI** is an AI-powered satellite mangrove monitoring dashboard built with Next.js. It analyzes Sentinel-2 satellite imagery to quantify mangrove forest coverage and automatically classifies forest health (healthy vs degraded) using a Random Forest machine learning model trained on Google Earth Engine (GEE).

**Purpose:** Enable environmental researchers and conservation teams to monitor mangrove deforestation and degradation over time across predefined study regions in India, using freely available satellite data and ML classification — without needing manual GIS expertise.

**Tech Stack:**
- **Framework:** Next.js 16 (App Router) with React 19, TypeScript
- **Styling:** Tailwind CSS 4, shadcn/ui (base-nova style, via `@base-ui/react`)
- **State/Data:** TanStack React Query v5 (client-side caching & prefetching)
- **ML/Geospatial:** Google Earth Engine (server-side Node.js SDK `@google/earthengine`)
- **Satellite Data:** Copernicus Sentinel-2 L2A Harmonized (`COPERNICUS/S2_SR_HARMONIZED`)
- **Reference Dataset:** Global Mangrove Watch v3 2020 (`projects/sat-io/open-datasets/GMW/extent/GMW_V3`)

---

## 2. Core Features

### 2.1 Landing Page (`/`)
- Animated hero section with a canvas-based spotlight/reveal effect that tracks mouse movement, revealing a second background image through a wobbling radial gradient mask.
- Staggered word-reveal animations ("Monitor the mangroves. Measure the change.") using CSS `translateY` + blur keyframes.
- Navigation bar with brand logo (MangroveAI) and "Get Started" CTA linking to `/dashboard`.
- Hero image preview of the dashboard analytics.
- Dark theme by default (`bg-[#0d1117]`).

### 2.2 Dashboard (`/dashboard`)
The main workspace, a full-screen two-panel layout:

#### Header Bar
- **Region selector** — dropdown to switch between predefined study areas.
- **Year selector** — dropdown to pick analysis year (2020–2026).
- **Export PDF button** — triggers `window.print()` for browser-native PDF export.

#### Left Panel — MapPanel (65% width)
Displays satellite imagery and AI classification results with multiple view modes:
- **Optical RGB** — raw Sentinel-2 true-color composite (B4/B3/B2).
- **AI Mask** — Random Forest classification result (3-class: non-mangrove, degraded, healthy).
- **Overlay** — RGB with semi-transparent mask layered on top, with adjustable opacity slider (0–100%).
- **Side by Side** — RGB and classification shown in a split-pane grid.

Additional features:
- **Legend** — color key: dark (#111827) = non-mangrove, amber (#FBBF24) = degraded, emerald (#10B981) = healthy.
- **Timeline scrubber** — bottom overlay bar with year buttons (2020–2026) and a Play/Pause button that auto-advances every 4 seconds.
- **GeeImage component** — preloads new thumbnail URLs in the browser before swapping displayed image, with a "Rendering..." spinner overlay to avoid frozen/blank states during GEE server-side thumbnail generation.

#### Right Panel — StatsPanel (35% width)
Displays computed statistics for the selected region/year:
- **Total Mangrove Coverage** — area in hectares, with healthy/degraded breakdown.
- **% Change vs 2020 baseline** — trend badge (green ↑ or red ↓).
- **Ecosystem Health Gauge** — SVG circular gauge based on mean NDVI of detected mangrove pixels, with status labels: Dense Canopy (NDVI ≥ 0.65), Moderate Canopy (0.45–0.65), Degraded (< 0.45).
- **Spectral Statistics table** — scene-mean values for B2 (Blue), B3 (Green), B4 (Red), B8 (NIR), B11 (SWIR), NDVI, and MNDWI.
- **Debug info** — Random Forest tree count (50), total training points, number of Sentinel-2 scenes used.

### 2.3 Client-Side Data Fetching & Caching
- Two parallel React Query hooks per view: `imagery` (RGB composite) and `analysis` (classification + stats).
- A third `baseline` query fetches 2020 stats only when viewing a non-2020 year (for the trend badge).
- **Background prefetching:** On region change, sequentially prefetches RGB imagery for all 7 years, then classification for all 7 years — so timeline scrubbing is instant after initial load.
- `keepPreviousData` strategy prevents UI flash on year switch.
- `staleTime: 10 minutes` — cached results are treated as fresh; no unnecessary re-fetches.
- `refetchOnWindowFocus: false` — prevents accidental GEE re-runs on tab focus.

### 2.4 Server-Side In-Memory Caching
- Both API routes (`/api/image/[region]` and `/api/classify/[region]`) use a per-process `Map<string, unknown>` cache keyed by `${region}?year=${year}`.
- Once computed, a (region, year) result is served from memory for the lifetime of the server process.
- EE authentication (`getEE()`) is also cached as a singleton — initialized once, reused for all subsequent requests.

---

## 3. API Routes

### 3.1 `GET /api/image/[region]?year=YYYY`
Returns a Sentinel-2 true-color RGB thumbnail URL for a study region and year.

**Query params:**
- `year` (optional, default `"2024"`) — year to filter imagery.

**Response (200):**
```json
{
  "url": "https://earthengine.googleapis.com/...",
  "region": "thane-creek",
  "name": "Thane Creek",
  "imageCount": 12
}
```

**Pipeline:**
1. Look up study area bounding box from `lib/area.ts`.
2. Build `ee.Geometry.Rectangle(bbox)`.
3. Query `COPERNICUS/S2_SR_HARMONIZED`, filter by bounds + date range (Jan–Mar of given year), sort by cloud cover.
4. Compute `median()` composite.
5. Generate 1024px thumbnail URL via `getThumbURL()` with bands B4/B3/B2, min=50, max=2000.
6. Cache and return.

**Errors:** 404 if no images found or unknown region; 500 on GEE errors.

### 3.2 `GET /api/classify/[region]?year=YYYY`
Runs the full Random Forest classification pipeline and returns a classified mask thumbnail URL plus statistics.

**Query params:**
- `year` (optional, default `"2024"`) — year to classify.

**Response (200):**
```json
{
  "url": "https://earthengine.googleapis.com/...",
  "region": "thane-creek",
  "name": "Thane Creek",
  "year": "2024",
  "stats": {
    "totalHectares": 1234.5,
    "healthyHectares": 980.2,
    "degradedHectares": 254.3,
    "pixelCounts": { "nonMangrove": 5000000, "degraded": 254300, "healthy": 980200 },
    "mangroveMeanNdvi": 0.62,
    "bandMeans": { "B2": 850, "B3": 920, "B4": 780, "B8": 2100, "B11": 600, "NDVI": 0.45, "MNDWI": -0.2 }
  },
  "debug": {
    "totalTrainingPoints": 400,
    "s2ImageCount": 8
  }
}
```

**Pipeline (see `lib/mangroveClassifier.ts`):**
1. Load GMW v3 2020 mangrove reference layer → binary raster (0/1).
2. Generate ~400 balanced training points via `stratifiedSample` (200 per class, scale 25m).
3. Query Sentinel-2 imagery (same as image route).
4. Compute NDVI and MNDWI spectral indices.
5. Augment image with 7 feature bands: B2, B3, B4, B8, B11, NDVI, MNDWI.
6. Extract spectral values at training points.
7. Train Random Forest classifier (50 trees) on the 7 bands.
8. Classify full image → binary (0=non-mangrove, 1=mangrove).
9. Apply `focalMode` (radius 1.5px circle) to smooth speckle noise.
10. Split class 1 into 2 (healthy) vs 1 (degraded) using NDVI threshold ≥ 0.5.
11. Generate 1024px classified thumbnail with palette: `["#111827", "#FBBF24", "#10B981"]`.
12. Compute stats: pixel histogram per class → hectares, mean NDVI over mangrove pixels, band means over study area.

---

## 4. Study Areas (Predefined Regions)

Defined in `lib/area.ts`:

| Key | Name | Bounding Box [minLng, minLat, maxLng, maxLat] |
|---|---|---|
| `thane-creek` | Thane Creek | [72.960, 19.080, 73.020, 19.160] |
| `bhitarkanika` | Bhitarkanika Mangrove Forest | [86.75, 20.60, 87.05, 20.80] |
| `sundarbans-core` | Sundarbans (Indian Delta Core) | [88.750, 21.850, 88.950, 22.050] |

**Timeline years:** `["2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024", "2025", "2026"]`
**Baseline year:** `"2020"` (used for % change calculations)

---

## 5. Machine Learning Pipeline Details

### Classification Algorithm
- **Model:** Random Forest (`ee.Classifier.smileRandomForest(50)`) — 50 decision trees.
- **Training data:** Stratified sample from GMW v3 2020 reference labels (~400 points total, 200 per class).
- **Feature bands (7):**
  - B2 (Blue), B3 (Green), B4 (Red) — visible spectrum
  - B8 (NIR) — near-infrared, sensitive to vegetation health
  - B11 (SWIR) — shortwave infrared, water/vegetation separation
  - NDVI = (B8 − B4) / (B8 + B4) — vegetation index
  - MNDWI = (B3 − B11) / (B3 + B11) — modified water index
- **Post-processing:** `focalMode` majority filter (1.5px radius circle) reduces classification noise.
- **Health splitting:** Within RF-detected mangrove pixels, NDVI ≥ 0.5 → healthy (class 2), else degraded (class 1).

### Satellite Imagery
- **Collection:** `COPERNICUS/S2_SR_HARMONIZED` (Sentinel-2 Level-2A Surface Reflectance, harmonized).
- **Date range:** January 1 – March 31 of the selected year (dry season / low cloud cover).
- **Compositing:** `median()` composite of all cloud-sorted images.
- **Resolution:** 10m native (for stats computation), 25m (for training point sampling), 1024px (for thumbnail output).

### Reference Dataset
- **GMW v3** (Global Mangrove Watch, version 3): `projects/sat-io/open-datasets/GMW/extent/GMW_V3`
- Binary mangrove extent mask (band `b1`), year 2020 epoch.
- Community catalog asset — requires GCP project access.

---

## 6. File Structure

```
mangroove_test/
├── .env.local                          # Environment variables (GEE key path)
├── .gitignore
├── components.json                     # shadcn/ui config (base-nova style)
├── CACHING.md                          # Detailed caching architecture docs
├── next.config.ts                      # Next.js config (allows earthengine.googleapis.com images)
├── package.json                        # Dependencies & scripts
├── postcss.config.mjs                  # PostCSS config (Tailwind)
├── tsconfig.json                       # TypeScript config
├── PRD.md                              # This document
│
├── app/                                # Next.js App Router
│   ├── globals.css                     # Global styles, dark theme tokens, hero animations
│   ├── layout.tsx                      # Root layout: fonts, dark mode, QueryProvider wrapper
│   ├── page.tsx                        # Landing page: SpotlightBackground, hero animations
│   ├── favicon.ico
│   ├── dashboard/
│   │   └── page.tsx                    # Dashboard page: region/year selectors, MapPanel + StatsPanel
│   └── api/
│       ├── image/[region]/
│       │   └── route.ts               # GET: Sentinel-2 RGB thumbnail URL
│       └── classify/[region]/
│           └── route.ts               # GET: RF classification mask URL + stats
│
├── components/
│   ├── dashboard/
│   │   ├── map-panel.tsx              # MapPanel: view modes, GeeImage loader, timeline scrubber, legend
│   │   └── stats-panel.tsx            # StatsPanel: coverage stats, health gauge, spectral table
│   └── ui/
│       ├── badge.tsx                   # shadcn Badge (cva variants: default, outline, secondary, destructive)
│       ├── button.tsx                  # shadcn Button (@base-ui/react, cva variants: default, outline, ghost, etc.)
│       ├── card.tsx                    # shadcn Card (Card, CardHeader, CardTitle, CardDescription, CardContent)
│       ├── select.tsx                  # shadcn Select (@base-ui/react)
│       ├── slider.tsx                  # shadcn Slider (@base-ui/react)
│       └── tabs.tsx                    # shadcn Tabs (@base-ui/react)
│
├── lib/
│   ├── area.ts                         # Study area definitions: names, bounding boxes; getStudyArea() lookup
│   ├── gee.ts                          # GEE singleton: getEE() auth, evaluate() Promise wrapper
│   ├── mangroveClassifier.ts           # classifyMangroves() + computeStats() — full RF pipeline
│   ├── types.ts                        # TypeScript types: ImageryResponse, MangroveStats, ClassifyDebug, etc.
│   └── utils.ts                        # cn() utility (clsx + tailwind-merge)
│
├── providers/
│   └── queryProviders.tsx              # TanStack QueryClientProvider: staleTime 10min, no refetch on focus
│
├── public/
│   └── hero/                           # Hero images (bg-1.png, bg-2.png, hero-1.png)
│
└── secrets/
    └── private-key.json                # GEE service account credentials (gitignored)
```

---

## 7. Key Functions & Their Roles

### `lib/gee.ts`
| Function | Purpose |
|---|---|
| `getEE()` | Returns initialized Earth Engine instance. Authenticates via service account private key on first call; caches singleton. |
| `evaluate<T>(eeObject)` | Wraps GEE's callback-style `.evaluate()` into an async Promise. |

### `lib/mangroveClassifier.ts`
| Function | Purpose |
|---|---|
| `classifyMangroves(ee, geometry, year)` | Full RF pipeline: loads GMW v3 reference, generates training points, queries Sentinel-2, computes NDVI/MNDWI, trains RF(50), classifies, applies focalMode smoothing, splits into 3 health classes. Returns `{ classifiedImage, augmentedImage, debug }`. |
| `computeStats(ee, classifiedImage, augmentedImage, geometry)` | Computes histogram of class pixels → hectares, mean NDVI over mangroves, and band means over study area. Returns `MangroveStats`. |

### `lib/area.ts`
| Export | Purpose |
|---|---|
| `studyAreas` | Record of predefined regions with name + bounding box. |
| `getStudyArea(region)` | Lookup a region by key, returns `StudyArea \| undefined`. |

### `lib/types.ts`
| Type/Const | Purpose |
|---|---|
| `ImageryResponse` | Shape of `/api/image` response: `{ url, region, name, imageCount? }`. |
| `MangroveStats` | Shape of computed stats: `{ totalHectares, healthyHectares, degradedHectares, pixelCounts, mangroveMeanNdvi, bandMeans }`. |
| `ClassifyDebug` | Debug info: `{ totalTrainingPoints, s2ImageCount }`. |
| `ClassifyResponse` | Shape of `/api/classify` response: `{ url, region, name, year?, stats?, debug? }`. |
| `TIMELINE_YEARS` | `["2020"..."2026"]` — available years for the timeline. |
| `BASELINE_YEAR` | `"2020"` — reference year for trend calculations. |

### `app/dashboard/page.tsx`
| Function/Component | Purpose |
|---|---|
| `preloadThumbnail(url)` | Warms browser image cache by creating an `Image()` element with the GEE thumbnail URL. |
| `fetchImagery(region, year)` | Client-side fetcher for `/api/image/[region]?year=YYYY`. |
| `fetchClassify(region, year)` | Client-side fetcher for `/api/classify/[region]?year=YYYY`. |
| `DashboardPage` | Main dashboard component: manages `region`/`year` state, runs 3 useQuery hooks (imagery, analysis, baseline), background prefetching useEffect, renders header + MapPanel + StatsPanel. |

### `components/dashboard/map-panel.tsx`
| Component | Purpose |
|---|---|
| `GeeImage` | Preloads GEE thumbnail URLs, shows spinner while loading, swaps only after full download. |
| `ImagePane` | Wrapper for a single image with optional label overlay. |
| `MapPanel` | Full map visualization: view mode tabs (RGB/Mask/Overlay/Side-by-Side), opacity slider, legend, timeline scrubber with play/pause, error/loading states. |

### `components/dashboard/stats-panel.tsx`
| Function/Component | Purpose |
|---|---|
| `formatBand(value)` | Formats spectral band values: decimals for indices (< 2), comma-separated integers for reflectance. |
| `healthStatus(ndvi)` | Returns label + CSS class based on NDVI: Dense Canopy (≥ 0.65), Moderate (0.45–0.65), Degraded (< 0.45). |
| `StatsPanel` | Renders coverage card (hectares + trend badge), health gauge (SVG ring), and spectral statistics table. |

---

## 8. Environment & Configuration

### Required Environment Variables (`.env.local`)
| Variable | Value | Purpose |
|---|---|---|
| `GEE_SERVICE_ACCOUNT_KEY_PATH` | `./secrets/private-key.json` | Path to GCP service account JSON for Earth Engine auth. |
| `PRIVATE_KEY` | *(hex string)* | Auxiliary key (used by the GEE service account). |

### Key Configuration
- **Next.js** (`next.config.ts`): Allows remote images from `earthengine.googleapis.com`.
- **shadcn/ui** (`components.json`): base-nova style, Lucide icons, Tailwind CSS variables.
- **TypeScript** (`tsconfig.json`): ES2017 target, bundler module resolution, path alias `@/*` → `./*`.
- **ESLint** (`eslint.config.mjs`): Next.js core-web-vitals + TypeScript rules.

---

## 9. Caching Architecture (Summary)

| Layer | Mechanism | Scope | Lifetime |
|---|---|---|---|
| Browser (TanStack Query) | `staleTime: 10 min` per query key | Per `[type, region, year]` | Fresh for 10 min; GC'd 5 min after last use |
| Browser (prefetch) | Sequential background prefetch on region change | All 7 years × 2 query types | Same as above |
| Server (route handlers) | In-memory `Map<string, unknown>` per route | Per `[region, year]` | Server process lifetime |
| Server (GEE auth) | `getEE()` singleton | Global | Server process lifetime |

**Net effect:** ~40s first load per unique (region, year), then instant from cache. Timeline playback is slow on first full cycle, instant on all subsequent cycles.

---

## 10. Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js development server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

---

## 11. Known Limitations & Future Scope

1. **Single-user demo** — no HTTP-level or database caching; two concurrent users hitting the same (region, year) trigger separate GEE runs.
2. **No user authentication** — the dashboard is publicly accessible.
3. **Fixed date range** — imagery always queries Jan–Mar (Q1); no season selection.
4. **3 predefined regions** — adding regions requires editing `lib/area.ts` and redeploying.
5. **PDF export** — currently uses `window.print()` (browser print dialog); no server-side PDF generation.
6. **No time-series charting** — individual year stats are shown but no line chart of trends across years.
7. **GMW v3 dependency** — community catalog asset; requires GCP project with Earth Engine access.

---

## 12. How to Run

1. Clone the repository.
2. Place your GEE service account private key JSON at `secrets/private-key.json`.
3. Configure `.env.local` with `GEE_SERVICE_ACCOUNT_KEY_PATH=./secrets/private-key.json` and `PRIVATE_KEY=<your-key>`.
4. Run `npm install`.
5. Run `npm run dev`.
6. Open `http://localhost:3000` for the landing page, navigate to `/dashboard`.
