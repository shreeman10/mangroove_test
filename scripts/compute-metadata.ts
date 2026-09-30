import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
import { getEE, evaluate } from "../lib/gee";
import { getStudyArea } from "../lib/area";
import { buildComposite, POSITIVE_SAMPLES, NEGATIVE_SAMPLES_TOTAL } from "../lib/mangroveClassifier";
import fs from "fs";

async function main() {
  const ee = await getEE();
  const region = "thane-creek";
  const studyArea = getStudyArea(region)!;
  const geometry = ee.Geometry.Rectangle(studyArea.bbox);

  console.log("Fetching GMW and ESA data...");
  const gmwCol = ee.ImageCollection("projects/sat-io/open-datasets/GMW/extent/GMW_V3").filter(ee.Filter.calendarRange(2020, 2020, "year"));
  const mangroveRef = gmwCol.first().select(["b1"], ["mangrove"]).clip(geometry);
  const mangroveBuffered = mangroveRef.unmask(0).focalMax(30, 'circle', 'meters');
  
  const esa = ee.Image("ESA/WorldCover/v100/2020").clip(geometry);
  const esaMasked = esa.updateMask(mangroveBuffered.eq(0).and(esa.neq(95)));

  const esaHistRaw = await evaluate<any>(esaMasked.reduceRegion({ reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 100, maxPixels: 1e9 }).get('Map'));
  const validClasses = Object.keys(esaHistRaw || {}).filter(k => k !== 'null');
  let pointsPerClass = Math.max(100, Math.floor(NEGATIVE_SAMPLES_TOTAL / validClasses.length));
  
  const negativePoints = esaMasked.stratifiedSample({
    numPoints: 0, classBand: "Map", region: geometry, scale: 10,
    classValues: validClasses.map(Number), classPoints: validClasses.map(() => pointsPerClass),
    geometries: true, seed: 42
  }).map((f: any) => f.set("mangrove", 0));

  const positivePoints = mangroveRef.updateMask(mangroveRef.eq(1)).stratifiedSample({
    numPoints: pointsPerClass * validClasses.length, classBand: "mangrove", region: geometry, scale: 10,
    geometries: true, seed: 42
  });
  
  const trainingPoints = positivePoints.merge(negativePoints);
  const { augmentedImage: comp2020 } = buildComposite(ee, geometry, "2020");

  console.log("Running Multi-seed...");
  const seeds = [1, 2, 3, 4, 5];
  const results = [];
  let balancedMetrics: any = null;
  let trainSetSize = 0, valSetSize = 0, totalBlocks = 0, trainBlocks = 0, valBlocks = 0;

  for (const seed of seeds) {
    const randomGrid = ee.Image.random(seed).reproject(ee.Projection('EPSG:32643').atScale(1000)).rename('grid_random');
    const trainingDataSplit = comp2020.addBands(randomGrid).sampleRegions({ collection: trainingPoints, properties: ["mangrove"], scale: 10, tileScale: 4 });
    const trainSet = trainingDataSplit.filter(ee.Filter.lt('grid_random', 0.7));
    const valSet = trainingDataSplit.filter(ee.Filter.gte('grid_random', 0.7));

    const classifierSplit = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
      features: trainSet, classProperty: "mangrove", inputProperties: ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"]
    });

    const validated = valSet.classify(classifierSplit);
    const errorMatrix = validated.errorMatrix("mangrove", 'classification');
    const order = await evaluate<number[]>(errorMatrix.order());
    const c1 = order.indexOf(1);
    
    const oa = await evaluate<number>(errorMatrix.accuracy());
    const kappa = await evaluate<number>(errorMatrix.kappa());
    const rawPA = await evaluate<number[][]>(errorMatrix.producersAccuracy());
    const rawUA = await evaluate<number[][]>(errorMatrix.consumersAccuracy());
    const pa = rawPA[c1][0];
    const ua = rawUA[0][c1];
    results.push({ oa, kappa, pa, ua });
    
    if (seed === 1) { // Same logic as actual model in prod
      balancedMetrics = {
        overallAccuracy: oa, kappa, producerAccuracy: pa, userAccuracy: ua,
        confusionMatrix: await evaluate<number[][]>(errorMatrix.array())
      };
      const tCounts = await evaluate<any>(trainSet.reduceColumns({ reducer: ee.Reducer.frequencyHistogram(), selectors: ["mangrove"] }).get('histogram'));
      const vCounts = await evaluate<any>(valSet.reduceColumns({ reducer: ee.Reducer.frequencyHistogram(), selectors: ["mangrove"] }).get('histogram'));
      trainSetSize = Object.values(tCounts).reduce((a:any, b:any) => Number(a)+Number(b), 0) as number;
      valSetSize = Object.values(vCounts).reduce((a:any, b:any) => Number(a)+Number(b), 0) as number;
      totalBlocks = await evaluate<number>(trainingDataSplit.aggregate_count_distinct('grid_random'));
      trainBlocks = await evaluate<number>(trainSet.aggregate_count_distinct('grid_random'));
      valBlocks = await evaluate<number>(valSet.aggregate_count_distinct('grid_random'));
    }
  }

  const calcMean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const calcStd = (arr: number[], mean: number) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length);
  const multiSeedMeanStd = {
    oa: { mean: calcMean(results.map(r => r.oa)), std: calcStd(results.map(r => r.oa), calcMean(results.map(r => r.oa))) },
    kappa: { mean: calcMean(results.map(r => r.kappa)), std: calcStd(results.map(r => r.kappa), calcMean(results.map(r => r.kappa))) },
    pa: { mean: calcMean(results.map(r => r.pa)), std: calcStd(results.map(r => r.pa), calcMean(results.map(r => r.pa))) },
    ua: { mean: calcMean(results.map(r => r.ua)), std: calcStd(results.map(r => r.ua), calcMean(results.map(r => r.ua))) },
  };

  console.log("Running wall-to-wall...");
  const randomGrid1 = ee.Image.random(1).reproject(ee.Projection('EPSG:32643').atScale(1000)).rename('grid_random');
  const tdSplit1 = comp2020.addBands(randomGrid1).sampleRegions({ collection: trainingPoints, properties: ["mangrove"], scale: 10, tileScale: 4 });
  const trainSet1 = tdSplit1.filter(ee.Filter.lt('grid_random', 0.7));
  const classifierSplit1 = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
    features: trainSet1, classProperty: "mangrove", inputProperties: ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"]
  });

  const classifiedSmoothed = comp2020.classify(classifierSplit1).focalMode(3, 'square', 'pixels').gte(1);
  const actualMangrove = mangroveRef.unmask(0);
  const bufferRing = mangroveBuffered.eq(1).and(actualMangrove.eq(0));
  const valMask = randomGrid1.gte(0.7).and(bufferRing.not());

  const confMatImg = actualMangrove.multiply(10).add(classifiedSmoothed);
  const hist = await evaluate<any>(confMatImg.updateMask(valMask).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 10, maxPixels: 1e10, tileScale: 4
  }).get("actual"));
  
  const tn = Number((hist || {})["0"] || 0), fp = Number((hist || {})["1"] || 0), fn = Number((hist || {})["10"] || 0), tp = Number((hist || {})["11"] || 0);
  const total = tn + fp + fn + tp;
  const wallToWallMetrics = {
    oa: (tp + tn) / total,
    kappa: (((tp+tn)/total) - (((tp+fn)*(tp+fp)+(tn+fn)*(tn+fp))/(total*total))) / (1 - (((tp+fn)*(tp+fp)+(tn+fn)*(tn+fp))/(total*total))),
    pa: tp / (tp + fn),
    ua: tp / (tp + fp),
    prevalence: (tp + fn) / total,
    matrix: [[tn, fp], [fn, tp]]
  };

  console.log("Computing Areas...");
  const gmwArea = await evaluate<any>(mangroveRef.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({ reducer: ee.Reducer.sum(), geometry, scale: 25, maxPixels: 1e10 }).get("mangrove"));
  
  const classifierFinal = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
    features: tdSplit1, classProperty: "mangrove", inputProperties: ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"]
  });
  const finalArea = await evaluate<any>(comp2020.classify(classifierFinal).gte(1).multiply(ee.Image.pixelArea()).reduceRegion({ reducer: ee.Reducer.sum(), geometry, scale: 10, maxPixels: 1e10 }).get("classification"));

  const meta = {
    generatedAt: new Date().toISOString(),
    constants: { trees: 100, seed: 42, blockSize: 1000, positiveSamples: pointsPerClass * validClasses.length, negativeSamplesTotal: pointsPerClass * validClasses.length },
    balancedMetrics,
    multiSeedMeanStd,
    wallToWallMetrics,
    negativeSampleRequested: validClasses.reduce((acc:any, c) => ({...acc, [c]: pointsPerClass}), {}),
    negativeSampleDistribution: validClasses.reduce((acc:any, c) => ({...acc, [c]: pointsPerClass}), {}),
    blockInfo: { totalBlocks, trainBlocks, valBlocks, blockSize: 1000 },
    trainingPointCounts: { train: trainSetSize, val: valSetSize, total: trainSetSize + valSetSize },
    areasHa: {
      gmw2020: Number(gmwArea) / 10000,
      model2020: Number(finalArea) / 10000
    }
  };

  if (!fs.existsSync("data")) fs.mkdirSync("data");
  fs.writeFileSync("data/mangrove-model-meta.json", JSON.stringify(meta, null, 2));
  console.log("Wrote data/mangrove-model-meta.json");
}

main().catch(console.error);
