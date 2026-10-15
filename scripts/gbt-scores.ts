/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from "dotenv";
import path from "path";
import fs from "fs";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { getEE, evaluate } from "../lib/gee";
import { getStudyArea } from "../lib/area";
import {
  getTrainValSplit,
  CLASSIFICATION_BANDS,
  CLASS_PROPERTY,
} from "../lib/mangroveClassifier";

interface MetricSet {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  iou: number;
  kappa: number;
}

function computeMetricsFromMatrix(matrix: number[][], order: number[]): {
  metrics: MetricSet;
  details: { tp: number; fp: number; fn: number; tn: number; total: number };
} {
  const i0 = order.indexOf(0);
  const i1 = order.indexOf(1);

  if (i0 === -1 || i1 === -1) {
    throw new Error(`Order does not contain both classes 0 and 1: ${JSON.stringify(order)}`);
  }

  // matrix[actual][predicted]
  const tn = matrix[i0][i0];
  const fp = matrix[i0][i1];
  const fn = matrix[i1][i0];
  const tp = matrix[i1][i1];
  const total = tn + fp + fn + tp;

  const accuracy = total > 0 ? (tp + tn) / total : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const iou = tp + fp + fn > 0 ? tp / (tp + fp + fn) : 0;

  const p0 = accuracy;
  const pe = total > 0 ? ((tp + fn) * (tp + fp) + (tn + fn) * (tn + fp)) / (total * total) : 0;
  const kappa = 1 - pe !== 0 ? (p0 - pe) / (1 - pe) : 0;

  return {
    metrics: { accuracy, precision, recall, f1, iou, kappa },
    details: { tp, fp, fn, tn, total },
  };
}

async function main() {
  const ee = await getEE();
  const region = "thane-creek";
  const studyArea = getStudyArea(region);
  if (!studyArea) throw new Error("Invalid region");
  const geometry = ee.Geometry.Rectangle(studyArea.bbox);

  console.log(`Setting up 2020 dataset for ${region}...`);
  const { trainSet, valSet } = getTrainValSplit(ee, geometry, 1);

  console.log("Fetching train/val sample counts...");
  const tCountsRaw = await evaluate<Record<string, number>>(
    trainSet.reduceColumns({
      reducer: ee.Reducer.frequencyHistogram(),
      selectors: [CLASS_PROPERTY],
    }).get("histogram")
  );
  const vCountsRaw = await evaluate<Record<string, number>>(
    valSet.reduceColumns({
      reducer: ee.Reducer.frequencyHistogram(),
      selectors: [CLASS_PROPERTY],
    }).get("histogram")
  );

  const trainClassCounts: Record<string, number> = {
    "0": Number(tCountsRaw["0"] || 0),
    "1": Number(tCountsRaw["1"] || 0),
  };
  const valClassCounts: Record<string, number> = {
    "0": Number(vCountsRaw["0"] || 0),
    "1": Number(vCountsRaw["1"] || 0),
  };
  const trainSize = trainClassCounts["0"] + trainClassCounts["1"];
  const valSize = valClassCounts["0"] + valClassCounts["1"];

  console.log(`Train Set Size: ${trainSize} (Class 0: ${trainClassCounts["0"]}, Class 1: ${trainClassCounts["1"]})`);
  console.log(`Val Set Size:   ${valSize} (Class 0: ${valClassCounts["0"]}, Class 1: ${valClassCounts["1"]})`);

  // --- MODEL 1: Random Forest ---
  console.log("\n--- Training Random Forest ---");
  const rfHyperparameters = { numberOfTrees: 100, seed: 42 };
  const rfClassifier = ee.Classifier.smileRandomForest(rfHyperparameters).train({
    features: trainSet,
    classProperty: CLASS_PROPERTY,
    inputProperties: CLASSIFICATION_BANDS,
  });

  const rfValidated = valSet.classify(rfClassifier);
  const rfErrorMatrix = rfValidated.errorMatrix(CLASS_PROPERTY, "classification");
  const rfOrder = await evaluate<number[]>(rfErrorMatrix.order());
  const rfMatrix = await evaluate<number[][]>(rfErrorMatrix.array());
  const rfEval = computeMetricsFromMatrix(rfMatrix, rfOrder);

  // --- MODEL 2: Gradient Boosted Trees ---
  console.log("\n--- Training Gradient Boosted Trees ---");
  const gbtHyperparameters = {
    numberOfTrees: 100,
    shrinkage: 0.1,
    samplingRate: 0.7,
    seed: 42,
  };
  const gbtClassifier = ee.Classifier.smileGradientTreeBoost(gbtHyperparameters).train({
    features: trainSet,
    classProperty: CLASS_PROPERTY,
    inputProperties: CLASSIFICATION_BANDS,
  });

  const gbtValidated = valSet.classify(gbtClassifier);
  const gbtErrorMatrix = gbtValidated.errorMatrix(CLASS_PROPERTY, "classification");
  const gbtOrder = await evaluate<number[]>(gbtErrorMatrix.order());
  const gbtMatrix = await evaluate<number[][]>(gbtErrorMatrix.array());
  const gbtEval = computeMetricsFromMatrix(gbtMatrix, gbtOrder);

  // Print results
  console.log("\n=======================================================");
  console.log("EVALUATION RESULTS (Agreement with GMW 2020 on held-out spatial blocks)");
  console.log("=======================================================\n");

  console.log("Model: Random Forest");
  console.log(`Confusion Matrix (Actual rows x Predicted cols, Order: ${JSON.stringify(rfOrder)}):`);
  rfMatrix.forEach((row, idx) => {
    console.log(`  Actual ${rfOrder[idx]}: [ ${row.join(", ")} ]`);
  });
  console.log(`  TN=${rfEval.details.tn}, FP=${rfEval.details.fp}, FN=${rfEval.details.fn}, TP=${rfEval.details.tp}`);
  console.log(`  Accuracy:  ${rfEval.metrics.accuracy.toFixed(4)} (${(rfEval.metrics.accuracy * 100).toFixed(2)}%)`);
  console.log(`  Precision: ${rfEval.metrics.precision.toFixed(4)} (${(rfEval.metrics.precision * 100).toFixed(2)}%)`);
  console.log(`  Recall:    ${rfEval.metrics.recall.toFixed(4)} (${(rfEval.metrics.recall * 100).toFixed(2)}%)`);
  console.log(`  F1 Score:  ${rfEval.metrics.f1.toFixed(4)}`);
  console.log(`  IoU:       ${rfEval.metrics.iou.toFixed(4)}`);
  console.log(`  Kappa:     ${rfEval.metrics.kappa.toFixed(4)}`);

  console.log("\nModel: Gradient Boosted Trees");
  console.log(`Confusion Matrix (Actual rows x Predicted cols, Order: ${JSON.stringify(gbtOrder)}):`);
  gbtMatrix.forEach((row, idx) => {
    console.log(`  Actual ${gbtOrder[idx]}: [ ${row.join(", ")} ]`);
  });
  console.log(`  TN=${gbtEval.details.tn}, FP=${gbtEval.details.fp}, FN=${gbtEval.details.fn}, TP=${gbtEval.details.tp}`);
  console.log(`  Accuracy:  ${gbtEval.metrics.accuracy.toFixed(4)} (${(gbtEval.metrics.accuracy * 100).toFixed(2)}%)`);
  console.log(`  Precision: ${gbtEval.metrics.precision.toFixed(4)} (${(gbtEval.metrics.precision * 100).toFixed(2)}%)`);
  console.log(`  Recall:    ${gbtEval.metrics.recall.toFixed(4)} (${(gbtEval.metrics.recall * 100).toFixed(2)}%)`);
  console.log(`  F1 Score:  ${gbtEval.metrics.f1.toFixed(4)}`);
  console.log(`  IoU:       ${gbtEval.metrics.iou.toFixed(4)}`);
  console.log(`  Kappa:     ${gbtEval.metrics.kappa.toFixed(4)}`);

  const outputData = {
    timestamp: new Date().toISOString(),
    note: "Agreement with GMW 2020 on held-out spatial blocks, single split, untuned",
    dataset: {
      trainSize,
      valSize,
      trainClassCounts,
      valClassCounts,
      bands: CLASSIFICATION_BANDS,
      classProperty: CLASS_PROPERTY,
      splitSeed: 1,
    },
    models: {
      randomForest: {
        name: "Random Forest",
        hyperparameters: rfHyperparameters,
        metrics: rfEval.metrics,
        confusionMatrix: rfMatrix,
        order: rfOrder,
        details: rfEval.details,
      },
      gradientBoostedTrees: {
        name: "Gradient Boosted Trees",
        hyperparameters: gbtHyperparameters,
        metrics: gbtEval.metrics,
        confusionMatrix: gbtMatrix,
        order: gbtOrder,
        details: gbtEval.details,
      },
    },
  };

  const outPath = path.resolve(process.cwd(), "data", "gbt-meta.json");
  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2));
  console.log(`\nSuccessfully wrote metadata to: ${outPath}`);
}

main().catch((err) => {
  console.error("Error in gbt-scores:", err);
  process.exit(1);
});
