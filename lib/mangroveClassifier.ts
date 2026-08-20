// lib/mangroveClassifier.ts


/**
 * EXPERIMENTAL: Extracts raw numerical band data for 150 sample points.
 */
export async function classifyMangroves(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any,
  year: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {

  const s2Collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate(`${year}-01-01`, `${year}-03-31`)
    .sort("CLOUDY_PIXEL_PERCENTAGE")

  const imageCount: number = await new Promise((resolve, reject) => {
    s2Collection.size().evaluate(
      (val: number) => resolve(val),
      (err: string) => reject(new Error("Failed to count Sentinel-2 images: " + err))
    )
  })

  if (imageCount === 0) {
    throw new Error(`No Sentinel-2 images found for date range ${year} in this region.`)
  }

  const s2Image = s2Collection.median()

  const ndvi = s2Image.normalizedDifference(["B8", "B4"]).rename("NDVI")
  const mndwi = s2Image.normalizedDifference(["B3", "B11"]).rename("MNDWI")

  const imageBands = s2Image
    .addBands([ndvi, mndwi])
    .select(["B2", "B3", "B4", "B8", "B11", "NDVI", "MNDWI"])
  const randomPoints = ee.FeatureCollection.randomPoints(geometry, 150)

  const sampledData = imageBands.sampleRegions({
    collection: randomPoints,
    scale: 10,
    geometries: true // Keep lat/lon coordinates
  })

  const dataDump = await new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sampledData.evaluate((featureCollection: any, err: string) => {
      if (err) {
        reject(new Error("Failed to extract sample points: " + err))
      } else {
        const records = featureCollection.features.map((f: any, index: number) => ({
          sample_id: index + 1,
          coordinates: f.geometry.coordinates,
          B2_Blue: f.properties.B2,
          B3_Green: f.properties.B3,
          B4_Red: f.properties.B4,
          B8_NIR: f.properties.B8,
          B11_SWIR: f.properties.B11,
          NDVI: f.properties.NDVI,
          MNDWI: f.properties.MNDWI
        }))
        resolve(records)
      }
    })
  })


  throw new Error(
    "EXPERIMENTAL SPECTRAL DATA EXTRACTION DUMP:\n\n" +
    JSON.stringify(dataDump, null, 2)
  )
}