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
  
  let out = "";
  const log = (str: string) => { console.log(str); out += str + "\n"; };

  log("=== TASK 4a: GMW GUARD CHECK ===");
  const gmwCol = ee.ImageCollection("projects/sat-io/open-datasets/GMW/extent/GMW_V3")
    .filter(ee.Filter.calendarRange(2020, 2020, "year"));
  const gmwFirst = gmwCol.first();
  const gmwProps = await evaluate<any>(gmwFirst.toDictionary(["system:index", "system:time_start"]));
  const calYear = await evaluate<number>(gmwFirst.date().get("year"));
  log(`system:index = ${gmwProps["system:index"]}`);
  log(`system:time_start = ${gmwProps["system:time_start"]}`);
  log(`calendar year = ${calYear}`);

  log("\n=== TASK 4c: CLOUD-FREE OBSERVATIONS ===");
  const comp2020 = buildComposite(ee, geometry, "2020");
  const comp2023 = buildComposite(ee, geometry, "2023");
  const obs2020 = await evaluate<any>(comp2020.augmentedImage.select('clear_count').reduceRegion({
    reducer: ee.Reducer.median().combine(ee.Reducer.min(), '', true),
    geometry,
    scale: 10,
    maxPixels: 1e9
  }));
  const obs2023 = await evaluate<any>(comp2023.augmentedImage.select('clear_count').reduceRegion({
    reducer: ee.Reducer.median().combine(ee.Reducer.min(), '', true),
    geometry,
    scale: 10,
    maxPixels: 1e9
  }));
  log(`2020 clear_count: ${JSON.stringify(obs2020)}`);
  log(`2023 clear_count: ${JSON.stringify(obs2023)}`);

  log("\n=== PREPARING CLASSIFICATION ===");
  const mangroveRef = gmwFirst.select(["b1"], ["mangrove"]).clip(geometry);
  const mangroveBuffered = mangroveRef.unmask(0).focalMax(30, 'circle', 'meters');
  const bufferRing = mangroveBuffered.eq(1).and(mangroveRef.unmask(0).eq(0));
  const validPixelsMask = bufferRing.not(); // exclude buffer ring
  
  const esa = ee.Image("ESA/WorldCover/v100/2020").clip(geometry);
  const esaMasked = esa.updateMask(mangroveBuffered.eq(0).and(esa.neq(95)));

  // Sample collection
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
  const randomGrid = ee.Image.random(1).reproject(ee.Projection('EPSG:32643').atScale(1000)).rename('grid_random');
  const trainingDataSplit = comp2020.augmentedImage.addBands(randomGrid).sampleRegions({
    collection: trainingPoints, properties: ["mangrove"], scale: 10, tileScale: 4
  });

  const trainSet = trainingDataSplit.filter(ee.Filter.lt('grid_random', 0.7));
  
  const classifierSplit = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
    features: trainSet, classProperty: "mangrove", inputProperties: ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"]
  });
  
  const classifierFinal = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
    features: trainingDataSplit, classProperty: "mangrove", inputProperties: ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"]
  });

  log("\n=== TASK 1: WALL-TO-WALL VALIDATION ===");
  const isValBlock = randomGrid.gte(0.7);
  // Unsmoothed
  const classifiedUnsmoothed = comp2020.augmentedImage.classify(classifierSplit).rename("predicted");
  const smoothedRaw = classifiedUnsmoothed.focalMode(3, 'square', 'pixels');
  const classifiedSmoothed = smoothedRaw.gte(1).rename("predicted"); // combine 1+2
  const actualMangrove = mangroveRef.unmask(0).rename("actual");

  const valMask = isValBlock.and(validPixelsMask);
  
  async function computeWallToWall(predImg: any, name: string) {
    log(`\n-- ${name} --`);
    const confMatImg = actualMangrove.multiply(10).add(predImg);
    const hist = await evaluate<any>(confMatImg.updateMask(valMask).reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 10, maxPixels: 1e10, tileScale: 4
    }).get("actual"));
    
    // Matrix format:
    // 00 = actual 0, pred 0 (TN)
    // 01 = actual 0, pred 1 (FP)
    // 10 = actual 1, pred 0 (FN)
    // 11 = actual 1, pred 1 (TP)
    const tn = Number(hist["0"] || 0);
    const fp = Number(hist["1"] || 0);
    const fn = Number(hist["10"] || 0);
    const tp = Number(hist["11"] || 0);
    
    const total = tn + fp + fn + tp;
    const oa = (tp + tn) / total;
    const pa = tp / (tp + fn);
    const ua = tp / (tp + fp);
    
    // Kappa = (p0 - pe) / (1 - pe)
    const p0 = oa;
    const pe = ((tp + fn) * (tp + fp) + (tn + fn) * (tn + fp)) / (total * total);
    const kappa = (p0 - pe) / (1 - pe);
    const prevalence = (tp + fn) / total;

    log(`Matrix: TN=${tn}, FP=${fp}, FN=${fn}, TP=${tp}`);
    log(`OA: ${oa.toFixed(4)}, Kappa: ${kappa.toFixed(4)}`);
    log(`PA (mangrove): ${pa.toFixed(4)}, UA (mangrove): ${ua.toFixed(4)}`);
    log(`Mangrove prevalence: ${(prevalence * 100).toFixed(2)}%`);
    log(`Hand-calc check:`);
    log(`  PA = ${tp} / ${tp + fn} = ${(tp / (tp + fn)).toFixed(4)}`);
    log(`  UA = ${tp} / ${tp + fp} = ${(tp / (tp + fp)).toFixed(4)}`);
  }

  await computeWallToWall(classifiedUnsmoothed.gte(1), "Unsmoothed Model (Class 1+2 as Mangrove)");
  await computeWallToWall(classifiedSmoothed, "Smoothed Model (Mode filter, Class 1+2 as Mangrove)");

  log("\n=== TASK 2: AREA COMPARISON ===");
  // GMW Area (native scale 25m)
  const gmwArea = await evaluate<any>(mangroveRef.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry, scale: 25, maxPixels: 1e10
  }).get("mangrove"));
  
  // Model Area (10m scale)
  const areaTrain = await evaluate<any>(classifiedUnsmoothed.gte(1).multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry, scale: 10, maxPixels: 1e10
  }).get("predicted"));
  const areaFinal = await evaluate<any>(comp2020.augmentedImage.classify(classifierFinal).gte(1).multiply(ee.Image.pixelArea()).reduceRegion({
    reducer: ee.Reducer.sum(), geometry, scale: 10, maxPixels: 1e10
  }).get("classification"));
  
  const gmwHa = Number(gmwArea) / 10000;
  const trainHa = Number(areaTrain) / 10000;
  const finalHa = Number(areaFinal) / 10000;
  log(`GMW 2020 Area (25m): ${gmwHa.toFixed(2)} ha`);
  log(`Train-only Model Area (10m): ${trainHa.toFixed(2)} ha (Diff: ${(((trainHa - gmwHa) / gmwHa) * 100).toFixed(2)}%)`);
  log(`Final Model Area (10m): ${finalHa.toFixed(2)} ha (Diff: ${(((finalHa - gmwHa) / gmwHa) * 100).toFixed(2)}%) *NOTE: Final model is in-sample for 2020`);

  log("\n=== TASK 3: ERROR BREAKDOWN BY WORLDCOVER CLASS ===");
  const predMang = classifiedUnsmoothed.gte(1);
  const falsePositives = predMang.eq(1).and(actualMangrove.eq(0)).updateMask(valMask);
  const falseNegatives = predMang.eq(0).and(actualMangrove.eq(1)).updateMask(valMask);
  
  const fpHist = await evaluate<any>(esa.updateMask(falsePositives).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 10, maxPixels: 1e10, tileScale: 4
  }).get("Map"));
  const fnHist = await evaluate<any>(esa.updateMask(falseNegatives).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 10, maxPixels: 1e10, tileScale: 4
  }).get("Map"));
  const totalValEsa = await evaluate<any>(esa.updateMask(valMask).reduceRegion({
    reducer: ee.Reducer.frequencyHistogram(), geometry, scale: 10, maxPixels: 1e10, tileScale: 4
  }).get("Map"));
  
  const totalFp = Object.values(fpHist || {}).reduce((a: any, b: any) => Number(a) + Number(b), 0) as number;
  const totalFn = Object.values(fnHist || {}).reduce((a: any, b: any) => Number(a) + Number(b), 0) as number;
  const actualMangroveValCnt = await evaluate<any>(actualMangrove.eq(1).updateMask(valMask).reduceRegion({
    reducer: ee.Reducer.sum(), geometry, scale: 10, maxPixels: 1e10, tileScale: 4
  }).get("actual"));
  
  log(`Total FP: ${totalFp}, Total FN: ${totalFn}`);
  log(`FN share of GMW mangrove pixels: ${((totalFn / Number(actualMangroveValCnt)) * 100).toFixed(2)}%`);
  
  log(`\nFalse Positive Breakdown by WorldCover Class:`);
  for (const cls of Object.keys(fpHist || {})) {
    const fpCnt = Number(fpHist[cls] || 0);
    const totalCls = Number(totalValEsa[cls] || 0);
    const shareOfFp = (fpCnt / totalFp) * 100;
    const fpRate = (fpCnt / totalCls) * 100;
    log(`Class ${cls}: FP=${fpCnt} (${shareOfFp.toFixed(2)}% of total FPs) | Rate=${fpRate.toFixed(2)}% of class`);
  }

  log(`\nFalse Negative Breakdown by WorldCover Class:`);
  for (const cls of Object.keys(fnHist || {})) {
    const fnCnt = Number(fnHist[cls] || 0);
    log(`Class ${cls}: FN=${fnCnt} (${((fnCnt / totalFn) * 100).toFixed(2)}% of total FNs)`);
  }

  if (!fs.existsSync("scripts/output")) fs.mkdirSync("scripts/output");
  fs.writeFileSync("scripts/output/task1-3-4-results.txt", out);
  console.log("Results written to scripts/output/task1-3-4-results.txt");
}

main().catch(console.error);
