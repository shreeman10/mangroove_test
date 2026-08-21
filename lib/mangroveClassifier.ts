
// lib/mangroveClassifier.ts
// Mangrove classification using Random Forest trained on
// GMW v3 (2020) reference labels + Sentinel-2 spectral data.
//
// Does NOT call getThumbURL — returns the classified ee.Image for the
// route handler to visualize, consistent with the existing imagery route pattern.

// ─── Asset IDs ───────────────────────────────────────────────────────
// Primary: GMW v3 2020 extent (community catalog, higher resolution, 2020 data).
// This is an ImageCollection with yearly epochs; band name is 'b1'.
// Only mangrove pixels (value 1) are stored as data; non-mangrove is masked/nodata.
// We use .unmask(0) to create the binary 0/1 raster needed for stratifiedSample.
const MANGROVE_ASSET = "projects/sat-io/open-datasets/GMW/extent/GMW_V3"
// Fallback (official GEE catalog, year 2000 baseline, band '1', masked outside mangroves):
// const MANGROVE_ASSET_FALLBACK = "LANDSAT/MANGROVE_FORESTS"
// To use the fallback, replace the step-1 block below with:
//   ee.ImageCollection(MANGROVE_ASSET_FALLBACK).first()
//     .select(['1'], [CLASS_PROPERTY]).unmask(0).clip(geometry)

// Bands used for classification
const CLASSIFICATION_BANDS = ["B2", "B3", "B4", "B8", "B11", "NDVI", "MNDWI"]

// Class property name used throughout the pipeline
const CLASS_PROPERTY = "mangrove"

export type ClassifyResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  classifiedImage: any
  debug: {
    totalTrainingPoints: number
    s2ImageCount: number
  }
}

/**
 * Classifies mangroves in a Sentinel-2 composite using a Random Forest
 * trained on reference labels from the GMW v3 (2020) dataset.
 *
 * @param ee        - Initialized Earth Engine instance (from getEE())
 * @param geometry  - ee.Geometry for the study area (typically ee.Geometry.Rectangle)
 * @param year      - Year string for Sentinel-2 date filtering (Q1: Jan–Mar)
 * @returns         - ClassifyResult with the classified ee.Image and debug info
 */
export async function classifyMangroves(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any,
  year: string
): Promise<ClassifyResult> {
  // ── 1. Load mangrove reference layer ──────────────────────────────
  // GMW v3 is an ImageCollection with yearly epochs. We filter to the
  // 2020 extent (most recent), select band 'b1' → rename to 'mangrove'.
  // Non-mangrove areas are masked/nodata in the source, so .unmask(0)
  // fills them with 0 to create a proper binary raster for sampling.
  const mangroveRef = ee
    .ImageCollection(MANGROVE_ASSET)
    .filter(ee.Filter.calendarRange(2020, 2020, "year"))
    .first()
    .select(["b1"], [CLASS_PROPERTY]) // rename band 'b1' → 'mangrove'
    .unmask(0)                        // fill masked areas with 0 (non-mangrove)
    .clip(geometry)

  // Verify the asset loaded successfully (catches access-denied / not-found)
  try {
    await new Promise<void>((resolve, reject) => {
      mangroveRef.bandNames().evaluate(
        (names: string[]) => {
          if (!names || names.length === 0) {
            reject(new Error(
              "GMW v3 asset loaded but returned no bands — the 2020 epoch " +
              "may not exist in the collection."
            ))
          } else {
            resolve()
          }
        },
        (err: string) => reject(new Error(
          "Failed to load GMW v3 asset (" + MANGROVE_ASSET + "). " +
          "This is a community catalog asset — your GCP project may not " +
          "have access. Error: " + err
        ))
      )
    })
  } catch (e) {
    throw e
  }

  // ── 2. Generate balanced training points ──────────────────────────
  // stratifiedSample produces roughly equal points per class value.
  const trainingPoints = mangroveRef.stratifiedSample({
    numPoints: 200,           // per class → ~400 total
    classBand: CLASS_PROPERTY,
    region: geometry,
    scale: 25,                // ~25m to match GMW v3 native resolution
    geometries: true,         // needed for sampleRegions below
  })

  // Verify we got training points (empty = no mangrove coverage in bbox)
  const pointCount: number = await new Promise((resolve, reject) => {
    trainingPoints.size().evaluate(
      (val: number) => resolve(val),
      (err: string) => reject(new Error("Failed to count training points: " + err))
    )
  })

  if (pointCount === 0) {
    throw new Error(
      "No training points generated — the study area may have no mangrove " +
      "coverage in the GMW v3 reference layer."
    )
  }

  // ── 3. Query Sentinel-2 imagery ───────────────────────────────────
  // Mirrors the existing imagery route: COPERNICUS/S2_SR_HARMONIZED,
  // filterBounds/filterDate/sort by cloud cover, then median composite.
  const s2Collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate(`${year}-01-01`, `${year}-03-31`)
    .sort("CLOUDY_PIXEL_PERCENTAGE")

  // Check collection is non-empty
  const imageCount: number = await new Promise((resolve, reject) => {
    s2Collection.size().evaluate(
      (val: number) => resolve(val),
      (err: string) => reject(new Error("Failed to count Sentinel-2 images: " + err))
    )
  })

  if (imageCount === 0) {
    throw new Error(
      `No Sentinel-2 images found for date range ${year}-01-01 to ${year}-03-31 ` +
      "in this region."
    )
  }

  const s2Image = s2Collection.median()

  // ── 4. Add derived spectral indices ───────────────────────────────
  const ndvi = s2Image.normalizedDifference(["B8", "B4"]).rename("NDVI")
  // MNDWI uses SWIR (B11) instead of NIR (B8) — much better at
  // separating open water from vegetation than standard NDWI.
  const mndwi = s2Image.normalizedDifference(["B3", "B11"]).rename("MNDWI")

  const augmentedImage = s2Image
    .addBands(ndvi)
    .addBands(mndwi)
    .select(CLASSIFICATION_BANDS)

  // ── 5. Extract spectral values at training points ─────────────────
  const trainingData = augmentedImage.sampleRegions({
    collection: trainingPoints,
    properties: [CLASS_PROPERTY],
    scale: 10, // 10m Sentinel-2 native resolution
  })

  // ── 6. Train Random Forest classifier ─────────────────────────────
  const classifier = ee.Classifier.smileRandomForest(50).train({
    features: trainingData,
    classProperty: CLASS_PROPERTY,
    inputProperties: CLASSIFICATION_BANDS,
  })

  // ── 7. Classify the full image ────────────────────────────────────
  const classified = augmentedImage.classify(classifier)

  // ── 8. Post-processing: majority filter to reduce speckle noise ──
  // focalMode replaces each pixel with the mode of its circular
  // neighbourhood, cleaning up isolated misclassified pixels.
  // Output is still a single-band ee.Image (band name becomes
  // 'classification_mode' but getThumbURL with min/max/palette
  // applies to the first band regardless of name).
  const smoothed = classified.focalMode({
    radius: 1.5,
    kernelType: "circle",
    units: "pixels",
  })

  return {
    classifiedImage: smoothed,
    debug: {
      totalTrainingPoints: pointCount,
      s2ImageCount: imageCount,
    },
  }
}
