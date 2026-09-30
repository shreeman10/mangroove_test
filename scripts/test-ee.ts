/* eslint-disable @typescript-eslint/no-explicit-any */
import { config } from "dotenv";
import path from "path";

// Load .env.local explicitly
config({ path: path.resolve(process.cwd(), ".env.local") });

import { getEE } from "../lib/gee";

async function main() {
  try {
    const ee = await getEE();
    console.log("EE initialized");
    const res = await new Promise((resolve, reject) => {
      ee.Number(1).add(1).evaluate((result: any, err: any) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    console.log("1+1 =", res);
    
    // STEP 1: FIX THE GMW GUARD checks
    const MANGROVE_ASSET = "projects/sat-io/open-datasets/GMW/extent/GMW_V3";
    const gmwCollection = ee.ImageCollection(MANGROVE_ASSET);
    
    // Check first image properties
    const firstImage = gmwCollection.first();
    const properties = await new Promise((resolve, reject) => {
      firstImage.propertyNames().evaluate((names: string[], err: any) => {
        if (err) return reject(err);
        firstImage.toDictionary(names).evaluate((dict: any, e: any) => {
          if (e) reject(e);
          else resolve(dict);
        });
      });
    });
    console.log("First image properties:", JSON.stringify(properties, null, 2));
    
    // Check calendarRange(2020, 2020, 'year') size
    const filteredSize = await new Promise((resolve, reject) => {
      gmwCollection.filter(ee.Filter.calendarRange(2020, 2020, "year")).size().evaluate((size: any, err: any) => {
        if (err) reject(err);
        else resolve(size);
      });
    });
    console.log("calendarRange(2020, 2020, 'year') size:", filteredSize);
    
  } catch (e) {
    console.error("EE Error:", e);
  }
}

main();
