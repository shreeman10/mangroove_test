import { evaluate } from "@/lib/gee"
import fs from "fs"
import path from "path"
const MANGROVE_ASSET = "projects/sat-io/open-datasets/GMW/extent/GMW_V3"
const CLASSIFICATION_BANDS = ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"]
const CLASS_PROPERTY = "mangrove"

export let POSITIVE_SAMPLES = 1000
export let NEGATIVE_SAMPLES_TOTAL = 1000
const MIN_PER_NEGATIVE_CLASS = 100

export const HEALTHY_NDVI_THRESHOLD = 0.5
export type MangroveClass = 0 | 1 | 2

export type MangroveStats = {
  totalHectares: number
  healthyHectares: number
  degradedHectares: number
  pixelCounts: { nonMangrove: number; degraded: number; healthy: number }
  mangroveMeanNdvi: number
  bandMeans: Record<string, number>
}

export type ValidationMetrics = {
  overallAccuracy: number
  kappa: number
  producerAccuracy: number
  userAccuracy: number
  confusionMatrix: number[][]
  trainSetSize: number
  valSetSize: number
  trainSetClassCounts: Record<string, number>
  valSetClassCounts: Record<string, number>
  negativeSampleDistribution: Record<string, number>
  negativeSampleRequested: Record<string, number>
  blockInfo: {
    totalBlocks: number
    trainBlocks: number
    valBlocks: number
    blockSize: number
  }
}

export type ClassifyResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  classifiedImage: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  augmentedImage: any
  debug: {
    totalTrainingPoints: number
    s2ImageCount: number
    validation: ValidationMetrics
    trainingYear: number
    labelSource: string
    isTrainingYear: boolean
    note: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildComposite(ee: any, geometry: any, year: string) {
  const s2Collection = ee
    .ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(geometry)
    .filterDate(`${year}-01-01`, `${year}-03-31`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((img: any) => {
      const scl = img.select('SCL')
      const mask = scl.neq(1).and(scl.neq(3)).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10))
      return img.updateMask(mask)
    })

  const s2Image = s2Collection.median()

  const ndvi = s2Image.normalizedDifference(["B8", "B4"]).rename("NDVI")
  const mndwi = s2Image.normalizedDifference(["B3", "B11"]).rename("MNDWI")
  const ndwi = s2Image.normalizedDifference(["B3", "B8"]).rename("NDWI")

  const augmentedImage = s2Image
    .addBands(ndvi)
    .addBands(mndwi)
    .addBands(ndwi)
    .select(CLASSIFICATION_BANDS)

  return { s2Collection, augmentedImage }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedModelPromise: Promise<any> | null = null;
let cachedRegionString = "";

export async function getTrainedModel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any,
  region: string
) {
  if (cachedModelPromise && cachedRegionString === region) {
    return cachedModelPromise;
  }

  cachedRegionString = region;
  cachedModelPromise = (async () => {
    try {
      const metaPath = path.join(process.cwd(), "data", "mangrove-model-meta.json");
      if (process.env.RECOMPUTE_MODEL !== 'true' && fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        console.log("Using precomputed model metadata from data/mangrove-model-meta.json");
        
        // We still need to construct the training features to train the final classifier.
        // But we skip all the expensive `.evaluate()` calls.
        
        const gmwCollection = ee.ImageCollection(MANGROVE_ASSET).filter(ee.Filter.calendarRange(2020, 2020, "year"));
        const mangroveRef = gmwCollection.first().select(["b1"], [CLASS_PROPERTY]).clip(geometry);
        const mangroveBuffered = mangroveRef.unmask(0).focalMax(30, 'circle', 'meters');
        
        const esa = ee.Image("ESA/WorldCover/v100/2020").clip(geometry);
        const esaMasked = esa.updateMask(mangroveBuffered.eq(0).and(esa.neq(95)));

        const validClasses = Object.keys(meta.negativeSampleRequested);
        const classValues = validClasses.map(Number);
        const classPoints = validClasses.map(c => meta.negativeSampleRequested[c]);

        const negativePoints = esaMasked.stratifiedSample({
          numPoints: 0, classBand: "Map", region: geometry, scale: 10,
          classValues, classPoints, geometries: true, seed: 42
        }).map((f: any) => f.set(CLASS_PROPERTY, 0));

        const positivePoints = mangroveRef.updateMask(mangroveRef.eq(1)).stratifiedSample({
          numPoints: meta.constants.positiveSamples, classBand: CLASS_PROPERTY, region: geometry, scale: 10,
          geometries: true, seed: 42
        });

        const trainingPoints = positivePoints.merge(negativePoints);
        const { augmentedImage: s2Image2020 } = buildComposite(ee, geometry, "2020");
        const randomGrid = ee.Image.random(1).reproject(ee.Projection('EPSG:32643').atScale(1000)).rename('grid_random');
        
        const trainingDataSplit = s2Image2020.addBands(randomGrid).sampleRegions({
          collection: trainingPoints, properties: [CLASS_PROPERTY], scale: 10, tileScale: 4
        });

        const finalClassifier = ee.Classifier.smileRandomForest({ numberOfTrees: meta.constants.trees, seed: meta.constants.seed }).train({
          features: trainingDataSplit, classProperty: CLASS_PROPERTY, inputProperties: CLASSIFICATION_BANDS
        });

        return { 
          classifier: finalClassifier, 
          validation: { ...meta.balancedMetrics, ...meta }, 
          pointCount: meta.trainingPointCounts.total, 
          debugData: meta 
        };
      }

      const gmwCollection = ee.ImageCollection(MANGROVE_ASSET).filter(ee.Filter.calendarRange(2020, 2020, "year"));
      const size = await evaluate<number>(gmwCollection.size());
      if (size === 0) {
        throw new Error("GMW 2020 epoch not found in the collection.");
      }
      
      const mangroveRef = gmwCollection.first().select(["b1"], [CLASS_PROPERTY]).clip(geometry);

      const mangroveBuffered = mangroveRef.unmask(0).focalMax(30, 'circle', 'meters');
      const negativeArea = mangroveBuffered.eq(0);
      
      const esa = ee.Image("ESA/WorldCover/v100/2020").clip(geometry);
      const esaMasked = esa.updateMask(negativeArea.and(esa.neq(95)));

      // Stratify negative samples
      const esaHistRaw = await evaluate<Record<string, number>>(
        esaMasked.reduceRegion({
          reducer: ee.Reducer.frequencyHistogram(),
          geometry,
          scale: 100, // rough scale to be fast
          maxPixels: 1e9
        }).get('Map')
      );
      
      const validClasses = Object.keys(esaHistRaw || {}).filter(k => k !== 'null');
      let negativePoints;
      let negativeSampleDistribution: Record<string, number> = {};
      let negativeSampleRequested: Record<string, number> = {};
      
      if (validClasses.length > 0) {
        let pointsPerClass = Math.floor(NEGATIVE_SAMPLES_TOTAL / validClasses.length);
        if (pointsPerClass < MIN_PER_NEGATIVE_CLASS) {
          pointsPerClass = MIN_PER_NEGATIVE_CLASS;
          NEGATIVE_SAMPLES_TOTAL = validClasses.length * pointsPerClass;
          POSITIVE_SAMPLES = NEGATIVE_SAMPLES_TOTAL;
          console.log(`Raised total samples to ${NEGATIVE_SAMPLES_TOTAL} to meet MIN_PER_NEGATIVE_CLASS = ${MIN_PER_NEGATIVE_CLASS}`);
        }
        const classValues = validClasses.map(Number);
        const classPoints = validClasses.map(() => pointsPerClass);

        const requestedPoints: Record<string, number> = {};
        validClasses.forEach(c => requestedPoints[c] = pointsPerClass);
        negativeSampleRequested = requestedPoints;

        negativePoints = esaMasked.stratifiedSample({
          numPoints: 0,
          classBand: "Map",
          region: geometry,
          scale: 10,
          classValues,
          classPoints,
          geometries: true,
          seed: 42
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => f.set(CLASS_PROPERTY, 0));
        
        // Log actual sample distribution
        negativeSampleDistribution = await evaluate<Record<string, number>>(
          negativePoints.reduceColumns({
            reducer: ee.Reducer.frequencyHistogram(),
            selectors: ["Map"]
          }).get("histogram")
        );
      } else {
        throw new Error("No non-mangrove classes found in AOI for sampling.");
      }

      const positivePoints = mangroveRef.updateMask(mangroveRef.eq(1)).stratifiedSample({
        numPoints: POSITIVE_SAMPLES,
        classBand: CLASS_PROPERTY,
        region: geometry,
        scale: 10,
        geometries: true,
        seed: 42
      });

      const trainingPoints = positivePoints.merge(negativePoints);
      
      const countsRaw = await evaluate<Record<string, number>>(
        trainingPoints.reduceColumns({
          reducer: ee.Reducer.frequencyHistogram(),
          selectors: [CLASS_PROPERTY]
        }).get("histogram")
      );
      
      const posCount = Number(countsRaw["1"] || 0);
      const negCount = Number(countsRaw["0"] || 0);
      
      if (posCount === 0 || negCount === 0) {
        throw new Error(`Missing positive (${posCount}) or negative (${negCount}) samples.`);
      }
      
      const ratio = Math.max(posCount / negCount, negCount / posCount);
      if (ratio > 1.5) {
        throw new Error(`Sample ratio is worse than 1.5:1. Positives: ${posCount}, Negatives: ${negCount}`);
      }

      const { augmentedImage: s2Image2020 } = buildComposite(ee, geometry, "2020");
      let finalValidation: ValidationMetrics | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let trainingDataSplit: any = null;

      const blockSizes = [1000, 500, 250];
      for (const blockSize of blockSizes) {
        const randomGrid = ee.Image.random(42).reproject(ee.Projection('EPSG:32643').atScale(blockSize)).rename('grid_random');
        
        trainingDataSplit = s2Image2020.addBands(randomGrid).sampleRegions({
          collection: trainingPoints,
          properties: [CLASS_PROPERTY],
          scale: 10,
          tileScale: 4
        });

        const trainSet = trainingDataSplit.filter(ee.Filter.lt('grid_random', 0.7));
        const valSet = trainingDataSplit.filter(ee.Filter.gte('grid_random', 0.7));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const getCounts = async (collection: any) => {
          const hist = await evaluate<Record<string, number>>(collection.reduceColumns({
            reducer: ee.Reducer.frequencyHistogram(),
            selectors: [CLASS_PROPERTY]
          }).get('histogram'));
          return hist || {};
        };

        const trainSetClassCounts = await getCounts(trainSet);
        const valSetClassCounts = await getCounts(valSet);
        const trainSetSize = Object.values(trainSetClassCounts).reduce((a: number, b: number) => Number(a) + Number(b), 0);
        const valSetSize = Object.values(valSetClassCounts).reduce((a: number, b: number) => Number(a) + Number(b), 0);

        const reqClasses = ["0", "1"];
        let valid = true;
        for (const cls of reqClasses) {
          if ((Number(trainSetClassCounts[cls]) || 0) < 100) valid = false;
          if ((Number(valSetClassCounts[cls]) || 0) < 100) valid = false;
        }

        if (!valid && blockSize !== 250) {
          console.log(`Block size ${blockSize}m failed class count validation (Train: ${JSON.stringify(trainSetClassCounts)}, Val: ${JSON.stringify(valSetClassCounts)}). Retrying...`);
          continue;
        }

        if (!valid && blockSize === 250) {
          throw new Error(`Val set has fewer than 100 samples for some class even at 250m block size. Counts: train: ${JSON.stringify(trainSetClassCounts)}, val: ${JSON.stringify(valSetClassCounts)}`);
        }

        const totalBlocks = await evaluate<number>(trainingDataSplit.aggregate_count_distinct('grid_random'));
        const trainBlocks = await evaluate<number>(trainSet.aggregate_count_distinct('grid_random'));
        const valBlocks = await evaluate<number>(valSet.aggregate_count_distinct('grid_random'));

        const classifierSplit = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
          features: trainSet,
          classProperty: CLASS_PROPERTY,
          inputProperties: CLASSIFICATION_BANDS
        });

        const validated = valSet.classify(classifierSplit);
        const errorMatrix = validated.errorMatrix(CLASS_PROPERTY, 'classification');
        
        // producersAccuracy() and consumersAccuracy() are returned as arrays, index corresponds to order()
        const order = await evaluate<number[]>(errorMatrix.order());
        const class1Index = order.indexOf(1);
        if (class1Index === -1) {
          throw new Error("Class 1 not found in error matrix order.");
        }

        const rawPA = await evaluate<number[][]>(errorMatrix.producersAccuracy());
        const rawUA = await evaluate<number[][]>(errorMatrix.consumersAccuracy());
        
        finalValidation = {
          overallAccuracy: await evaluate<number>(errorMatrix.accuracy()),
          kappa: await evaluate<number>(errorMatrix.kappa()),
          producerAccuracy: rawPA[class1Index][0], // Nx1 array
          userAccuracy: rawUA[0][class1Index], // 1xN array
          confusionMatrix: await evaluate<number[][]>(errorMatrix.array()),
          trainSetSize,
          valSetSize,
          trainSetClassCounts,
          valSetClassCounts,
          negativeSampleDistribution,
          negativeSampleRequested,
          blockInfo: { totalBlocks, trainBlocks, valBlocks, blockSize },
        };
        break;
      }

      if (!finalValidation || !trainingDataSplit) {
        throw new Error("Failed to compute validation metrics.");
      }

      const finalClassifier = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
        features: trainingDataSplit,
        classProperty: CLASS_PROPERTY,
        inputProperties: CLASSIFICATION_BANDS
      });

      const pointCount = finalValidation.trainSetSize + finalValidation.valSetSize;

      return { classifier: finalClassifier, validation: finalValidation, pointCount, debugData: finalValidation };
    } catch (err) {
      cachedModelPromise = null;
      throw err;
    }
  })();

  return cachedModelPromise;
}

export async function classifyMangroves(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any,
  year: string,
  region: string
): Promise<ClassifyResult> {
  const { s2Collection, augmentedImage } = buildComposite(ee, geometry, year);

  const imageCount: number = await new Promise((resolve, reject) => {
    s2Collection.size().evaluate(
      (val: number) => resolve(val),
      (err: string) => reject(new Error("Failed to count Sentinel-2 images: " + err))
    )
  });

  if (imageCount === 0) {
    throw new Error(`No Sentinel-2 images found for date range ${year}-01-01 to ${year}-03-31 in this region.`);
  }

  const { classifier, validation, pointCount } = await getTrainedModel(ee, geometry, region);

  const classified = augmentedImage.classify(classifier);

  const smoothed = classified.focalMode({
    radius: 1.5,
    kernelType: "circle",
    units: "pixels",
  });

  const ndviBand = augmentedImage.select("NDVI");
  const threeClass = smoothed.where(
    smoothed.eq(1).and(ndviBand.gte(HEALTHY_NDVI_THRESHOLD)),
    2
  ).rename("classification");

  const isTrainingYear = year === "2020";

  return {
    classifiedImage: threeClass,
    augmentedImage,
    debug: {
      totalTrainingPoints: pointCount,
      s2ImageCount: imageCount,
      validation,
      trainingYear: 2020,
      labelSource: "GMW 2020",
      isTrainingYear,
      note: isTrainingYear ? "" : "Transfer prediction from 2020-trained model. Not validated against independent labels for this year.",
    },
  }
}

export async function computeStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  classifiedImage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  augmentedImage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any
): Promise<MangroveStats> {
  const counts = await evaluate<Record<string, Record<string, number>>>(
    classifiedImage.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram().unweighted(),
      geometry,
      scale: 10,
      maxPixels: 1e13,
    })
  )

  const means = await evaluate<Record<string, number>>(
    augmentedImage.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry,
      scale: 10,
      maxPixels: 1e13,
    })
  )

  const mangroveNdvi = await evaluate<Record<string, number>>(
    augmentedImage
      .select("NDVI")
      .updateMask(classifiedImage.gt(0))
      .reduceRegion({
        reducer: ee.Reducer.mean(),
        geometry,
        scale: 10,
        maxPixels: 1e13,
      })
  )

  const hist = Object.values(counts)[0] ?? {}
  const countOf = (cls: number) => Number(hist[String(cls)] ?? 0)

  const healthyPx = countOf(2)
  const degradedPx = countOf(1)
  const nonMangrovePx = countOf(0)

  const hectares = (pixels: number) => (pixels * 100) / 10000

  const bandMeans: Record<string, number> = {}
  for (const band of [...CLASSIFICATION_BANDS]) {
    bandMeans[band] = Number(means[band] ?? 0)
  }

  return {
    totalHectares: hectares(healthyPx + degradedPx),
    healthyHectares: hectares(healthyPx),
    degradedHectares: hectares(degradedPx),
    pixelCounts: {
      nonMangrove: nonMangrovePx,
      degraded: degradedPx,
      healthy: healthyPx,
    },
    mangroveMeanNdvi: Number(mangroveNdvi.NDVI ?? 0),
    bandMeans,
  }
}


let cachedBaselineStatsPromise: Promise<MangroveStats> | null = null;
let cachedBaselineRegionString = "";

export async function getBaselineStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ee: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry: any,
  region: string
): Promise<MangroveStats> {
  if (cachedBaselineStatsPromise && cachedBaselineRegionString === region) {
    return cachedBaselineStatsPromise;
  }

  cachedBaselineRegionString = region;
  cachedBaselineStatsPromise = (async () => {
    try {
      const metaPath = path.join(process.cwd(), "data", "mangrove-model-meta.json");
      if (process.env.RECOMPUTE_MODEL !== 'true' && fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        return {
          totalHectares: meta.areasHa.gmw2020,
          healthyHectares: meta.areasHa.gmw2020,
          degradedHectares: 0,
          pixelCounts: { nonMangrove: 0, degraded: 0, healthy: 0 },
          mangroveMeanNdvi: 0,
          bandMeans: {}
        };
      }

      const { classifiedImage, augmentedImage } = await classifyMangroves(ee, geometry, "2020", region);
      return await computeStats(ee, classifiedImage, augmentedImage, geometry);
    } catch (err) {
      cachedBaselineStatsPromise = null;
      throw err;
    }
  })();

  return cachedBaselineStatsPromise;
}
