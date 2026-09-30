/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { getEE, evaluate } from "../lib/gee";
import { getStudyArea } from "../lib/area";
import { buildComposite, POSITIVE_SAMPLES, NEGATIVE_SAMPLES_TOTAL } from "../lib/mangroveClassifier";

const MIN_PER_NEGATIVE_CLASS = 100;
const CLASS_PROPERTY = "mangrove";
const CLASSIFICATION_BANDS = ["B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "MNDWI", "NDWI"];

async function main() {
  const ee = await getEE();
  const region = "thane-creek"; // using thane-creek as requested
  const studyArea = getStudyArea(region);
  if (!studyArea) throw new Error("Invalid region");
  const geometry = ee.Geometry.Rectangle(studyArea.bbox);

  console.log(`Running multi-seed validation for region: ${region}`);
  
  // 1. Fetch data
  const gmwCollection = ee.ImageCollection("projects/sat-io/open-datasets/GMW/extent/GMW_V3").filter(ee.Filter.calendarRange(2020, 2020, "year"));
  const mangroveRef = gmwCollection.first().select(["b1"], [CLASS_PROPERTY]).clip(geometry);
  const mangroveBuffered = mangroveRef.unmask(0).focalMax(30, 'circle', 'meters');
  const negativeArea = mangroveBuffered.eq(0);
  
  const esa = ee.Image("ESA/WorldCover/v100/2020").clip(geometry);
  const esaMasked = esa.updateMask(negativeArea.and(esa.neq(95)));

  const esaHistRaw = await evaluate<Record<string, number>>(
    esaMasked.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry,
      scale: 100,
      maxPixels: 1e9
    }).get('Map')
  );
  const validClasses = Object.keys(esaHistRaw || {}).filter(k => k !== 'null');
  
  let pointsPerClass = Math.floor(NEGATIVE_SAMPLES_TOTAL / validClasses.length);
  let totalNeg = NEGATIVE_SAMPLES_TOTAL;
  let totalPos = POSITIVE_SAMPLES;
  if (pointsPerClass < MIN_PER_NEGATIVE_CLASS) {
    pointsPerClass = MIN_PER_NEGATIVE_CLASS;
    totalNeg = validClasses.length * pointsPerClass;
    totalPos = totalNeg;
  }
  const classValues = validClasses.map(Number);
  const classPoints = validClasses.map(() => pointsPerClass);

  const negativePoints = esaMasked.stratifiedSample({
    numPoints: 0,
    classBand: "Map",
    region: geometry,
    scale: 10,
    classValues,
    classPoints,
    geometries: true,
    seed: 42
  }).map((f: any) => f.set(CLASS_PROPERTY, 0));

  const positivePoints = mangroveRef.updateMask(mangroveRef.eq(1)).stratifiedSample({
    numPoints: totalPos,
    classBand: CLASS_PROPERTY,
    region: geometry,
    scale: 10,
    geometries: true,
    seed: 42
  });

  const trainingPoints = positivePoints.merge(negativePoints);
  const { augmentedImage: s2Image2020 } = buildComposite(ee, geometry, "2020");

  const seeds = [1, 2, 3, 4, 5];
  const results = [];
  let oneConfusionMatrix = null;
  let oneReportedPA = null;
  let oneReportedUA = null;
  let oneOrder = null;

  for (const seed of seeds) {
    console.log(`Evaluating block split seed ${seed}...`);
    
    // We already established 1000m is the default block size
    const randomGrid = ee.Image.random(seed).reproject(ee.Projection('EPSG:32643').atScale(1000)).rename('grid_random');
    const trainingDataSplit = s2Image2020.addBands(randomGrid).sampleRegions({
      collection: trainingPoints,
      properties: [CLASS_PROPERTY],
      scale: 10,
      tileScale: 4
    });

    const trainSet = trainingDataSplit.filter(ee.Filter.lt('grid_random', 0.7));
    const valSet = trainingDataSplit.filter(ee.Filter.gte('grid_random', 0.7));

    const classifierSplit = ee.Classifier.smileRandomForest({ numberOfTrees: 100, seed: 42 }).train({
      features: trainSet,
      classProperty: CLASS_PROPERTY,
      inputProperties: CLASSIFICATION_BANDS
    });

    const validated = valSet.classify(classifierSplit);
    const errorMatrix = validated.errorMatrix(CLASS_PROPERTY, 'classification');
    
    const order = await evaluate<number[]>(errorMatrix.order());
    const class1Index = order.indexOf(1);
    
    const oa = await evaluate<number>(errorMatrix.accuracy());
    const kappa = await evaluate<number>(errorMatrix.kappa());
    const rawPA = await evaluate<number[][]>(errorMatrix.producersAccuracy());
    const rawUA = await evaluate<number[][]>(errorMatrix.consumersAccuracy());
    const pa = rawPA[class1Index][0];
    const ua = rawUA[0][class1Index];
    
    results.push({ oa, kappa, pa, ua });
    
    if (seed === 1) {
      oneConfusionMatrix = await evaluate<number[][]>(errorMatrix.array());
      oneReportedPA = pa;
      oneReportedUA = ua;
      oneOrder = order;
    }
  }

  // Calculate mean and std
  const calcMean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const calcStd = (arr: number[], mean: number) => Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length);
  
  const oas = results.map(r => r.oa);
  const kappas = results.map(r => r.kappa);
  const pas = results.map(r => r.pa);
  const uas = results.map(r => r.ua);

  console.log(`\n--- Multi-Seed Validation Results (1000m blocks) ---`);
  console.log(`OA:    Mean = ${calcMean(oas).toFixed(4)}, Std = ${calcStd(oas, calcMean(oas)).toFixed(4)}`);
  console.log(`Kappa: Mean = ${calcMean(kappas).toFixed(4)}, Std = ${calcStd(kappas, calcMean(kappas)).toFixed(4)}`);
  console.log(`PA:    Mean = ${calcMean(pas).toFixed(4)}, Std = ${calcStd(pas, calcMean(pas)).toFixed(4)}`);
  console.log(`UA:    Mean = ${calcMean(uas).toFixed(4)}, Std = ${calcStd(uas, calcMean(uas)).toFixed(4)}`);

  console.log(`\n--- Confusion Matrix Hand-Calculation (Seed 1) ---`);
  console.log(`Class Order: ${JSON.stringify(oneOrder)}`);
  console.log(`Confusion Matrix:`);
  oneConfusionMatrix!.forEach((row, i) => {
    console.log(`Row ${i} (Actual ${oneOrder![i]}): ${JSON.stringify(row)}`);
  });
  
  const idx = oneOrder!.indexOf(1);
  const actualClass1Total = oneConfusionMatrix![idx].reduce((a, b) => a + b, 0);
  const predictedClass1Total = oneConfusionMatrix!.reduce((a, row) => a + row[idx], 0);
  const truePositives = oneConfusionMatrix![idx][idx];
  
  const handPA = truePositives / actualClass1Total;
  const handUA = truePositives / predictedClass1Total;
  
  console.log(`\nHand-calculated PA for class 1: ${truePositives} / ${actualClass1Total} = ${handPA.toFixed(4)}`);
  console.log(`Reported PA for class 1: ${oneReportedPA!.toFixed(4)}`);
  
  console.log(`\nHand-calculated UA for class 1: ${truePositives} / ${predictedClass1Total} = ${handUA.toFixed(4)}`);
  console.log(`Reported UA for class 1: ${oneReportedUA!.toFixed(4)}`);
}

main().catch(console.error);
