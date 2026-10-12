# 🌿 MangroveAI — Satellite-Based Mangrove Monitoring Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Google Earth Engine](https://img.shields.io/badge/Google_Earth_Engine-API_1.7-green?style=flat-square&logo=google-cloud)](https://earthengine.google.com/)
[![Sentinel-2](https://img.shields.io/badge/Copernicus-Sentinel--2_L2A-red?style=flat-square)](https://sentinels.copernicus.eu/)
[![Accuracy](https://img.shields.io/badge/Model_Accuracy-94.87%25-brightgreen?style=flat-square)](./PROJECT_REPORT.md)
[![Kappa](https://img.shields.io/badge/Cohen's_Kappa-0.8972-emerald?style=flat-square)](./PROJECT_REPORT.md)

**MangroveAI** is an AI-powered cloud-native geospatial dashboard that monitors, quantifies, and classifies mangrove forest canopy coverage and ecological health across Indian coastal delta regions using Sentinel-2 multispectral satellite imagery and Google Earth Engine (GEE).

> 📄 **Complete Technical Report & SE Documentation:** For the unabridged Software Engineering Capstone report — including complete DFDs (Levels 0–2), Sequence & Activity Diagrams, Use Case Models, WBS, Gantt Chart, Critical Path (CPM) calculation, Cost Analysis, RMMM document, and IEEE 830 SRS — see [PROJECT_REPORT.md](./PROJECT_REPORT.md).

---

## 🚀 Key Highlights & Features

- **High-Resolution Satellite Ingestion (10m):** Ingests Copernicus Sentinel-2 Level-2A surface reflectance (`COPERNICUS/S2_SR_HARMONIZED`) with automated SCL cloud and shadow filtering.
- **Random Forest Machine Learning Classifier:** 100-tree ensemble trained on Global Mangrove Watch v3 (`GMW_V3`) ground truth and background points stratified across 7 ESA WorldCover 2020 classes.
- **Zero-Autocorrelation Spatial Block CV:** Evaluated using non-overlapping 1000m spatial blocks (55 training blocks, 15 validation blocks) to prevent spatial autocorrelation data leakage.
- **Ecosystem Health Stratification:** Uses NDVI thresholding to partition canopy into **Healthy Mangrove** ($\text{NDVI} \ge 0.50$) and **Degraded Mangrove** ($\text{NDVI} < 0.50$).
- **Spatiotemporal Change Detection:** Pixel-wise differential matrix between user-selected epochs (2020–2026) quantifying deforestation loss, regeneration gain, and stable canopy in hectares.
- **Multi-Mode Satellite Workspace:**
  - **Optical RGB:** True-color Sentinel-2 surface reflectance composite (B4/B3/B2).
  - **AI Classification Mask:** 3-class segmentation (Non-Mangrove, Degraded, Healthy).
  - **Alpha Overlay:** Seamless blending of AI mask over RGB imagery with interactive 0–100% opacity slider.
  - **Side-by-Side:** Split-screen comparison view.
- **Multi-Tier Caching Pipeline:** TanStack Query client-side caching (10-minute fresh window) + automatic sequential timeline prefetching + server-side in-memory Map hashing + browser thumbnail preloading.
- **Analytics & Exports:** Reactive SVG canopy health gauge, scene spectral reflectance telemetry table, Recharts historical time-series drawer, CSV telemetry download, and browser print-friendly PDF generation.

---

## 🧠 Machine Learning Model & Analytical Performance

The Random Forest model was thoroughly validated using spatial block holdout testing, 10-seed perturbation experiments, and wall-to-wall census comparisons:

### Primary Validation Metrics (15 Spatial Holdout Blocks, 448 Samples)

| Metric | Scientific Formula | Measured Value | Evaluation |
|---|---|---|---|
| **Overall Accuracy (OA)** | $(TP + TN) / \text{Total}$ | **94.87%** (0.94866) | Outstanding class separation |
| **Cohen’s Kappa ($\kappa$)** | Agreement normalized for chance | **0.8972** | Almost perfect agreement ($\kappa > 0.81$) |
| **Producer's Accuracy (Recall)** | $TP / (TP + FN)$ | **93.15%** (0.93151) | Omission error: 6.85% |
| **User's Accuracy (Precision)** | $TP / (TP + FP)$ | **96.23%** (0.96226) | Commission error: 3.77% |
| **F1-Score** | $2 \cdot (UA \cdot PA) / (UA + PA)$ | **94.66%** | High precision/recall balance |

### Holdout Confusion Matrix
$$
\begin{array}{c|cc|c}
\text{Actual \ Predicted} & \text{Class 0 (Non-Mangrove)} & \text{Class 1 (Mangrove)} & \text{Total Actual} \\
\hline
\text{Class 0 (Non-Mangrove)} & \mathbf{221} \ (TN) & 8 \ (FP) & 229 \\
\text{Class 1 (Mangrove)} & 15 \ (FN) & \mathbf{204} \ (TP) & 219 \\
\hline
\text{Total Predicted} & 236 & 212 & \mathbf{448}
\end{array}
$$

### Robustness & Spatial Validation
- **Multi-Seed Stability (10 random seeds):** $\text{OA} = 95.76\% \pm 1.16\%$, $\kappa = 0.9134 \pm 0.0258$.
- **Wall-to-Wall Sensor Validation (Thane Creek):** $\text{OA} = 95.12\%$, $\kappa = 0.8547$ after 1.5px circular `focalMode` majority filter.
- **Feature Predictors (9 bands):** Blue ($B_2$), Green ($B_3$), Red ($B_4$), NIR ($B_8$), SWIR-1 ($B_{11}$), SWIR-2 ($B_{12}$), NDVI, MNDWI, NDWI.

---

## 🏛️ System Architecture

```
+----------------------------------------------------------------------------------------------------+
|                                    CLIENT BROWSER (React 19)                                       |
|  [MapPanel (RGB/Mask/Overlay)]   [StatsPanel (Hectares/Gauge)]   [ChangeDetection]   [MetricsView] |
|                                              ^                                                     |
|                                              | TanStack React Query v5 (10-min cache & prefetch)   |
+----------------------------------------------v-----------------------------------------------------+
                                               | HTTP / REST API (JSON & GEE Thumbnail URLs)
+----------------------------------------------v-----------------------------------------------------+
|                               NEXT.JS 16 APPSERVER (Node.js App Router)                            |
|  - GET /api/image/[region]?year=YYYY             -> S2 median true-color composite thumbnail       |
|  - GET /api/classify/[region]?year=YYYY          -> RF classification tile & hectare statistics    |
|  - GET /api/change/[region]?from=YYYY&to=YYYY    -> Pixel-wise change detection matrix (Loss/Gain) |
|  - GET /api/metrics                              -> Static ML validation metrics & confusion matrix|
|                                                                                                    |
|  In-Memory Server Cache (Map<string, unknown>) | Singleton GEE Auth (lib/gee.ts)                   |
+----------------------------------------------v-----------------------------------------------------+
                                               | Google Earth Engine Node API (JWT Authentication)
+----------------------------------------------v-----------------------------------------------------+
|                                 GOOGLE EARTH ENGINE (Cloud Compute)                                |
|  - COPERNICUS/S2_SR_HARMONIZED (Sentinel-2 10m L2A) -> SCL Cloud Masking (Q1 Dry Season)          |
|  - Global Mangrove Watch v3 (GMW 2020) Reference -> 30m buffer boundary exclusion                 |
|  - ESA WorldCover 2020 -> Background negative stratified sampling (7 classes)                     |
|  - smileRandomForest(100 Trees) -> FocalMode(1.5px) -> reduceRegion Histogram -> getThumbURL()      |
+----------------------------------------------------------------------------------------------------+
```

---

## 📡 Backend API Reference

| Endpoint | Method | Key Parameters | Description |
|---|---|---|---|
| `/api/image/[region]` | `GET` | `year` (query, optional, default `"2024"`) | Generates Sentinel-2 true-color RGB composite thumbnail URL and image count. |
| `/api/classify/[region]` | `GET` | `year` (query, optional, default `"2024"`) | Executes RF pipeline; returns 3-class thumbnail URL, total/healthy/degraded hectares, mean NDVI, and band means. |
| `/api/change/[region]` | `GET` | `from` (query, default `"2020"`), `to` (query, default `"2026"`) | Returns spatiotemporal change detection map (Red: Loss, Green: Gain, Dark: Stable) and transition hectares. |
| `/api/metrics` | `GET` | None | Returns precomputed validation metrics, confusion matrix, and block CV statistics. |

**Supported Study Regions (`[region]`):**
- `thane-creek`: Thane Creek Mangrove Sanctuary, Mumbai, Maharashtra
- `bhitarkanika`: Bhitarkanika National Park & Sanctuary, Odisha
- `sundarbans-core`: Indian Sundarbans Biosphere Delta Core, West Bengal

---

## 📂 File Structure

```
mangroove_test/
├── app/                                # Next.js 16 App Router
│   ├── api/                            # Backend REST API Handlers
│   │   ├── change/[region]/route.ts    # Change detection endpoint
│   │   ├── classify/[region]/route.ts  # RF classification & stats endpoint
│   │   ├── image/[region]/route.ts     # S2 true-color thumbnail endpoint
│   │   └── metrics/route.ts            # ML model validation metrics endpoint
│   ├── dashboard/page.tsx              # Analytics workspace (queries, state, prefetch)
│   ├── layout.tsx                      # Root layout, theme tokens, QueryProvider
│   └── page.tsx                        # Animated landing page with canvas spotlight
├── components/
│   ├── dashboard/                      # Core Dashboard Modules
│   │   ├── change-detection-view.tsx   # Two-epoch diffing interface
│   │   ├── map-panel.tsx               # Satellite visualization & GeeImage preloader
│   │   ├── metrics-view.tsx            # Confusion matrix & model validation modal
│   │   ├── region-compare-view.tsx     # Multi-region comparative view
│   │   ├── stats-panel.tsx             # Hectare stats, SVG gauge, spectral table
│   │   └── time-series-drawer.tsx      # Recharts historical trend charts
│   └── ui/                             # shadcn/ui design system primitives
├── data/
│   └── mangrove-model-meta.json        # Precomputed validation metrics & confusion matrix
├── lib/
│   ├── area.ts                         # Study area bounding boxes & registry
│   ├── changeDetection.ts              # Transition matrix logic & stats reduction
│   ├── gee.ts                          # Earth Engine singleton authenticator
│   ├── mangroveClassifier.ts           # RF training, cloud masking & classification
│   └── types.ts                        # TypeScript domain schemas
├── providers/
│   └── queryProviders.tsx              # TanStack QueryClient provider (10-min stale window)
├── secrets/
│   └── private-key.json                # Google Cloud Service Account key (gitignored)
├── PROJECT_REPORT.md                   # Full Software Engineering & Technical Report
└── README.md                           # This document
```

---

## 🛠️ Getting Started & Installation

### Prerequisites
- **Node.js:** v18.18 or higher (v20+ recommended)
- **Google Cloud Platform (GCP) Project:** Enabled Google Earth Engine API with a registered service account.

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/mangrove-ai.git
cd mangrove-ai
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the project root:
```env
GEE_SERVICE_ACCOUNT_KEY_PATH=./secrets/private-key.json
PRIVATE_KEY="your-gcp-service-account-private-key-hex"
```
Place your downloaded GCP service account JSON key inside `secrets/private-key.json` (ensure this directory is listed in `.gitignore`).

### 4. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the landing page, or navigate directly to [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to launch the analytics dashboard.

### 5. Production Build
```bash
npm run build
npm run start
```

---

## 📊 Software Engineering Artifacts Overview

For academic, testing, and software engineering audits, the following deliverables are detailed in [PROJECT_REPORT.md](./PROJECT_REPORT.md):
- **Data Flow Diagrams (DFD):** Context Level 0, Decomposition Level 1, and Detailed ML Pipeline Level 2.
- **UML Diagrams:** Complete Use Case Model, Sequence Diagram (End-to-End client/server/GEE lifecycle), and Activity Diagram.
- **Project Management:** Work Breakdown Structure (WBS 1.0 to 6.0), 10-week Gantt Chart, and Critical Path Method (CPM) calculation ($88\text{ working days}$ critical path duration).
- **Cost & Budget Analysis:** Complete personnel engineering breakdown (₹13,00,000 / $15,600) + cloud hosting & compute (₹1,21,000 / $1,452), total Year 1 TCO of ₹15,63,100 ($18,757).
- **RMMM Document:** Risk Mitigation, Monitoring, and Management matrix addressing GEE compute limits, monsoon cloud occlusions, spatial autocorrelation, and credential isolation.
- **SRS Document:** Formal Software Requirements Specification complying with the **IEEE 830 standard**.
- **Software Testing Plan:** Unit, static typing, spatial holdout validation, integration, and cross-browser test suite.

---

## 📄 License
This project is developed for educational, environmental research, and coastal conservation purposes. Sentinel-2 data is provided under the Copernicus Open Access Policy.
