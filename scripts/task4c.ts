import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });
import { getEE, evaluate } from "../lib/gee";
import { getStudyArea } from "../lib/area";
import { buildComposite } from "../lib/mangroveClassifier";

async function main() {
  const ee = await getEE();
  const region = "thane-creek";
  const studyArea = getStudyArea(region)!;
  const geometry = ee.Geometry.Rectangle(studyArea.bbox);

  console.log("\n=== TASK 4c: CLOUD-FREE OBSERVATIONS ===");
  const comp2020 = buildComposite(ee, geometry, "2020");
  const comp2023 = buildComposite(ee, geometry, "2023");
  
  const count2020 = comp2020.s2Collection.select('B2').count();
  const count2023 = comp2023.s2Collection.select('B2').count();

  const obs2020 = await evaluate<any>(count2020.reduceRegion({
    reducer: ee.Reducer.median().combine(ee.Reducer.min(), '', true),
    geometry,
    scale: 10,
    maxPixels: 1e9
  }));
  const obs2023 = await evaluate<any>(count2023.reduceRegion({
    reducer: ee.Reducer.median().combine(ee.Reducer.min(), '', true),
    geometry,
    scale: 10,
    maxPixels: 1e9
  }));
  console.log(`2020 clear_count (median, min): ${JSON.stringify(obs2020)}`);
  console.log(`2023 clear_count (median, min): ${JSON.stringify(obs2023)}`);
}

main().catch(console.error);
