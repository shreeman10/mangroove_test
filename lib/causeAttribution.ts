import { evaluate } from "@/lib/gee"

export async function computeCauseAttribution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  diffImage: any, // 3-class change image (0=stable, 1=loss, 2=gain)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toAugmentedImage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any
) {
  // 1. Urban/Infrastructure Layer
  // Using ESA WorldCover v200 (2021, 10m resolution, global). Class 50 is built-up.
  const worldCover = ee.ImageCollection("ESA/WorldCover/v200").mosaic()
  const builtUp = worldCover.eq(50)
  
  // fastDistanceTransform computes distance to 0 pixels.
  // We want distance to built-up, so built-up should be 0, and non-built-up 1.
  const notBuiltUp = builtUp.not()
  const distToUrbanPx = notBuiltUp.fastDistanceTransform(256)
  // Multiply by 10m to approximate distance in meters.
  // Unmask to 2560 (the max distance) to ensure patches far from urban areas are not dropped.
  const urbanDist = distToUrbanPx.multiply(10).unmask(2560).rename("urban_dist")

  // 2. Erosion/Water Layer
  // Using the "to" year's MNDWI to detect if the loss area transitioned to open water.
  const mndwi = toAugmentedImage.select("MNDWI")

  // Extract contiguous loss patches as vectors
  // reduceToVectors automatically adds a 'count' property with the number of pixels.
  const lossMask = diffImage.eq(1)
  const lossVectors = lossMask.updateMask(lossMask).reduceToVectors({
    geometry,
    crs: diffImage.projection(),
    scale: 10,
    geometryType: "polygon",
    eightConnected: false,
    maxPixels: 1e13,
  })

  const combinedImage = ee.Image.cat([
    mndwi.unmask(-999).rename("MNDWI"), 
    urbanDist
  ])
  // 4. Compute mean spectral/distance values over each patch
  const reduced = combinedImage.reduceRegions({
    collection: lossVectors,
    reducer: ee.Reducer.mean(),
    scale: 10,
  })

  // 5. Feature map: assign cause
  const vectorsWithCause = reduced.map((feat: any) => {
    const props = ee.Dictionary(feat.toDictionary())
    
    const meanMndwi = ee.Number(props.get("MNDWI", -999))
    const meanUrbanDist = ee.Number(props.get("urban_dist", 9999))
    
    // Use the native pixel count instead of expensive vector area math
    const pixelCount = ee.Number(props.get("count", 0))
    const patchArea = pixelCount.multiply(100)
    
    const isUrban = meanUrbanDist.lt(200)
    // Removed rectangularity check because .bounds().area() exceeds GEE complexity limits
    const isAqua = ee.Number(0) 
    const isWater = meanMndwi.gt(-0.1)

    // Priority 1: If it turned into water, it's Erosion/Water regardless of how close to the city it is.
    // Priority 2: Aquaculture (currently disabled)
    // Priority 3: If it's dry land and near the city, it's Urban conversion.
    const causeCode = ee.Algorithms.If(
      isWater,
      3,
      ee.Algorithms.If(isAqua, 2, ee.Algorithms.If(isUrban, 1, 4))
    )

    return feat.set({
      cause: ee.Number(causeCode),
      patchArea: patchArea
    })
  })

  // 5. Aggregate areas by cause
  const aggregated = vectorsWithCause.reduceColumns({
    reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: "cause",
    }),
    selectors: ["patchArea", "cause"],
  })

  // 6. Evaluate and format
  const result = await evaluate<any>(aggregated)
  const lossCount = await evaluate<number>(lossVectors.size())
  const reducedCount = await evaluate<number>(reduced.size())
  const finalCount = await evaluate<number>(vectorsWithCause.size())
  
  // Strip geometry to prevent GEE JSON payload limits from silencing the evaluate
  const noGeom = vectorsWithCause.map((f: any) => ee.Feature(null, f.toDictionary()))
  const sampleList = await evaluate<any[]>(noGeom.toList(5))
  const sampleFeatures = sampleList ? sampleList.map((f: any) => f.properties) : []

  const groups = result?.groups || []
  let urbanArea = 0, aquaArea = 0, waterArea = 0, unclassifiedArea = 0

  groups.forEach((g: any) => {
    const areaHa = g.sum / 10000 // Convert sq meters to hectares
    if (g.cause === 1) urbanArea += areaHa
    else if (g.cause === 2) aquaArea += areaHa
    else if (g.cause === 3) waterArea += areaHa
    else if (g.cause === 4) unclassifiedArea += areaHa
  })

  const totalLoss = urbanArea + aquaArea + waterArea + unclassifiedArea

  return {
    lossCount,
    reducedCount,
    finalCount,
    sampleFeatures,
    totalLossHectares: totalLoss,
    breakdown: {
      "Urban/Infrastructure": {
        hectares: urbanArea,
        percentage: totalLoss > 0 ? (urbanArea / totalLoss) * 100 : 0,
      },
      "Aquaculture/Conversion": {
        hectares: aquaArea,
        percentage: totalLoss > 0 ? (aquaArea / totalLoss) * 100 : 0,
      },
      "Erosion/Water": {
        hectares: waterArea,
        percentage: totalLoss > 0 ? (waterArea / totalLoss) * 100 : 0,
      },
      "Unclassified": {
        hectares: unclassifiedArea,
        percentage: totalLoss > 0 ? (unclassifiedArea / totalLoss) * 100 : 0,
      },
    },
  }
}
