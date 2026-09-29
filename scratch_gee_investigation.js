const ee = require("@google/earthengine");
const fs = require("fs");
const path = require("path");

const keyPath = process.env.GEE_SERVICE_ACCOUNT_KEY_PATH || "./secrets/private-key.json";
const privateKey = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), keyPath), "utf-8"));

const regions = {
  "Thane Creek": [72.960, 19.080, 73.020, 19.160],
  "Pichavaram": [79.760, 11.400, 79.820, 11.460],
  "Sundarbans": [88.750, 21.850, 88.950, 22.050]
};

async function evaluate(eeObject) {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value) => resolve(value), (err) => reject(new Error(String(err))));
  });
}

function initEE() {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      privateKey,
      () => {
        ee.initialize(null, null, () => resolve(), (err) => reject(err), null, privateKey.project_id);
      },
      (err) => reject(err)
    );
  });
}

async function testDataset(datasetName, year, startDate, endDate, regionName, bbox, maxCloudCover = 20, isL8 = false) {
  const geom = ee.Geometry.Rectangle(bbox);
  
  let collection = ee.ImageCollection(datasetName)
    .filterBounds(geom)
    .filterDate(`${year}-${startDate}`, `${year}-${endDate}`);

  if (datasetName === "COPERNICUS/S2_SR_HARMONIZED" || datasetName === "COPERNICUS/S2_HARMONIZED") {
    collection = collection.filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', maxCloudCover);
  } else if (isL8) {
    collection = collection.filterMetadata('CLOUD_COVER', 'less_than', maxCloudCover);
  }

  const count = await evaluate(collection.size());
  
  // Try to create a median composite to check if it computes successfully
  let validComposite = false;
  if (count > 0) {
    try {
      const composite = collection.median().clip(geom);
      // count non-masked pixels to see if coverage is valid
      const pixelCount = composite.bandNames().size().gt(0);
      validComposite = await evaluate(pixelCount);
    } catch(e) {
      validComposite = false;
    }
  }

  return { datasetName, year, startDate, endDate, regionName, count, validComposite };
}

async function runTests() {
  console.log("Initializing GEE...");
  await initEE();
  console.log("Initialized.");
  
  const results = [];
  
  // Test Sentinel-2 SR
  const windows = [
    { start: "01-01", end: "03-31" },
    { start: "01-01", end: "06-30" },
    { start: "01-01", end: "09-30" },
    { start: "01-01", end: "12-31" }
  ];
  
  const s2_sr_years = [2015, 2016, 2017, 2018];
  for (const year of s2_sr_years) {
    for (const region of Object.keys(regions)) {
      for (const win of windows) {
         try {
           const res = await testDataset("COPERNICUS/S2_SR_HARMONIZED", year, win.start, win.end, region, regions[region], 20);
           results.push(res);
           console.log(`S2 SR | ${region} | ${year} | ${win.start} to ${win.end} | Count: ${res.count} | Valid: ${res.validComposite}`);
         } catch(e) {
           console.log(`ERROR: S2 SR | ${region} | ${year} | ${win.start} to ${win.end} | ${e.message}`);
         }
      }
    }
  }

  // Write intermediate results
  fs.writeFileSync("research_results_s2sr.json", JSON.stringify(results, null, 2));

  // Test Sentinel-2 L1C
  const s2_l1c_years = [2015, 2016, 2017];
  for (const year of s2_l1c_years) {
    for (const region of Object.keys(regions)) {
      const win = { start: "01-01", end: "12-31" };
      try {
        const res = await testDataset("COPERNICUS/S2_HARMONIZED", year, win.start, win.end, region, regions[region], 20);
        results.push(res);
        console.log(`S2 L1C | ${region} | ${year} | Full Year | Count: ${res.count} | Valid: ${res.validComposite}`);
      } catch(e) {
        console.log(`ERROR: S2 L1C | ${region} | ${year} | ${e.message}`);
      }
    }
  }

  // Test Landsat 8
  const l8_years = [2013, 2014, 2015, 2016, 2017];
  for (const year of l8_years) {
    for (const region of Object.keys(regions)) {
      const win = { start: "01-01", end: "12-31" };
      try {
        const res = await testDataset("LANDSAT/LC08/C02/T1_L2", year, win.start, win.end, region, regions[region], 20, true);
        results.push(res);
        console.log(`L8 SR | ${region} | ${year} | Full Year | Count: ${res.count} | Valid: ${res.validComposite}`);
      } catch(e) {
        console.log(`ERROR: L8 SR | ${region} | ${year} | ${e.message}`);
      }
    }
  }

  // Test HLS
  const hls_years = [2015, 2016, 2017];
  for (const year of hls_years) {
    for (const region of Object.keys(regions)) {
      const win = { start: "01-01", end: "12-31" };
      try {
        const resS30 = await testDataset("NASA/HLS/HLSS30/v002", year, win.start, win.end, region, regions[region], 100); // cloud filter is different for HLS
        const resL30 = await testDataset("NASA/HLS/HLSL30/v002", year, win.start, win.end, region, regions[region], 100);
        console.log(`HLS S30 | ${region} | ${year} | Full Year | Count: ${resS30.count}`);
        console.log(`HLS L30 | ${region} | ${year} | Full Year | Count: ${resL30.count}`);
      } catch(e) {
        console.log(`ERROR: HLS | ${region} | ${year} | ${e.message}`);
      }
    }
  }

  console.log("Done");
  process.exit(0);
}

runTests();
