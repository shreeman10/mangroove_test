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
  // Multiply by 10m to approximate distance in meters
  const urbanDist = distToUrbanPx.multiply(10).rename("urban_dist")

  // 2. Erosion/Water Layer
  // Using the "to" year's MNDWI to detect if the loss area transitioned to open water.
  const mndwi = toAugmentedImage.select("MNDWI")

  // 3. Extract contiguous loss patches as vectors
  const lossMask = diffImage.eq(1)
  const lossVectors = lossMask.updateMask(lossMask).reduceToVectors({
    geometry,
    scale: 10,
    geometryType: "polygon",
    eightConnected: true,
    maxPixels: 1e10,
  })

  // 4. Feature map: calculate patch metrics and assign cause
  const vectorsWithCause = lossVectors.map((feat: any) => {
    const patchGeom = feat.geometry()
    const patchArea = patchGeom.area()
    const boundsArea = patchGeom.bounds().area()
    const rectRatio = ee.Number(
      ee.Algorithms.If(
        boundsArea.gt(0),
        patchArea.divide(boundsArea),
        0
      )
    )

    const patchMeans = ee.Image.cat([mndwi, urbanDist]).reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: patchGeom,
      scale: 10,
      maxPixels: 1e8,
    })

    const hasMndwi = patchMeans.contains("MNDWI")
    const meanMndwi = ee.Number(
      ee.Algorithms.If(hasMndwi, patchMeans.get("MNDWI"), -999)
    )
    
    const hasUrban = patchMeans.contains("urban_dist")
    const meanUrbanDist = ee.Number(
      ee.Algorithms.If(hasUrban, patchMeans.get("urban_dist"), 9999)
    )

    // --- RULE THRESHOLDS ---
    // Urban: Mean distance to built-up < 200m
    const isUrban = meanUrbanDist.lt(200)
    // Aqua: Patch area / bounding box area > 0.65 (indicates a regular, boxy shape like a pond)
    const isAqua = rectRatio.gt(0.65)
    // Water: Mean MNDWI > -0.1 (Slightly lenient; open water is typically > 0, but intertidal can be mixed)
    const isWater = meanMndwi.gt(-0.1)

    // Precedence: Urban > Aquaculture > Erosion
    const causeCode = ee.Algorithms.If(
      isUrban,
      1,
      ee.Algorithms.If(isAqua, 2, ee.Algorithms.If(isWater, 3, 4))
    )

    return feat.set({
      patchArea: ee.Number(patchArea),
      cause: ee.Number(4),
    })
  })

  // 5. Evaluate arrays
  const causesArr = (await evaluate<number[]>(vectorsWithCause.aggregate_array("cause"))) || []
  const areasArr = (await evaluate<number[]>(vectorsWithCause.aggregate_array("patchArea"))) || []
  
  let urbanArea = 0, aquaArea = 0, waterArea = 0, unclassifiedArea = 0

  for (let i = 0; i < causesArr.length; i++) {
    const cause = causesArr[i]
    const areaHa = areasArr[i] / 10000 // Convert sq meters to hectares
    
    if (cause === 1) urbanArea += areaHa
    else if (cause === 2) aquaArea += areaHa
    else if (cause === 3) waterArea += areaHa
    else if (cause === 4) unclassifiedArea += areaHa
  }

  const totalLoss = urbanArea + aquaArea + waterArea + unclassifiedArea

  return {
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
