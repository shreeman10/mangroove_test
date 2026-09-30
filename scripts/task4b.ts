import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
import { getEE, evaluate } from "../lib/gee";
import { getStudyArea } from "../lib/area";
import { classifyMangroves, computeStats, getBaselineStats } from "../lib/mangroveClassifier";

async function timeRequest(year: string, isWarm: boolean) {
  const label = isWarm ? "WARM" : "COLD";
  console.log(`\n=== TASK 4b: ${label} PROCESS REQUEST (${year}) ===`);
  const ee = await getEE();
  const region = "thane-creek";
  const studyArea = getStudyArea(region)!;
  const geometry = ee.Geometry.Rectangle(studyArea.bbox);

  const start = Date.now();
  
  // 1. Classify
  const { classifiedImage, augmentedImage } = await classifyMangroves(ee, geometry, year, region);
  const classifyTime = Date.now();
  console.log(`- Graph construction (classifyMangroves): ${(classifyTime - start) / 1000}s`);

  // 2. Compute stats
  const stats = await computeStats(ee, classifiedImage, augmentedImage, geometry);
  const statsTime = Date.now();
  console.log(`- Compute stats evaluation: ${(statsTime - classifyTime) / 1000}s`);

  // 3. Thumb URL
  const url: string = await new Promise((resolve, reject) => {
    classifiedImage.getThumbURL(
      { region: geometry, dimensions: 1024, min: 0, max: 2, palette: ["#111827", "#FBBF24", "#10B981"], format: "png" },
      (thumbUrl: string, err: string) => { if (err) reject(err); else resolve(thumbUrl); }
    );
  });
  const thumbTime = Date.now();
  console.log(`- Thumb URL generation: ${(thumbTime - statsTime) / 1000}s`);

  const end = Date.now();
  console.log(`TOTAL TIME: ${(end - start) / 1000}s`);
}

async function main() {
  await timeRequest("2023", false); // Cold process
  await timeRequest("2022", true);  // Warm process
}

main().catch(console.error);
