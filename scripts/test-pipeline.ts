import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import { getEE } from "../lib/gee";
import { getStudyArea } from "../lib/area";
import { classifyMangroves } from "../lib/mangroveClassifier";

async function main() {
  const ee = await getEE();
  const region = "thane-creek";
  const studyArea = getStudyArea(region);
  if (!studyArea) throw new Error("Invalid region");
  const geometry = ee.Geometry.Rectangle(studyArea.bbox);

  console.log(`\n--- Running Pipeline for region: ${region} ---`);
  
  const start1 = Date.now();
  const res2020 = await classifyMangroves(ee, geometry, "2020", region);
  const end1 = Date.now();
  console.log(`\nCold request (2020) time: ${(end1 - start1) / 1000}s`);
  console.log(`DEBUG JSON (2020):\n${JSON.stringify(res2020.debug, null, 2)}`);

  const start2 = Date.now();
  const res2023 = await classifyMangroves(ee, geometry, "2023", region);
  const end2 = Date.now();
  console.log(`\nHot request (2023) time: ${(end2 - start2) / 1000}s`);
  console.log(`DEBUG JSON (2023):\n${JSON.stringify(res2023.debug, null, 2)}`);
}

main().catch(console.error);
