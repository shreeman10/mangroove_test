const fetch = require('node-fetch');

async function testImage() {
  try {
    const res = await fetch('http://localhost:3000/api/classify/bhitarkanika?year=2026');
    const data = await res.json();
    console.log("Classify API URL:", data.url);
    
    if (data.url) {
      const imgRes = await fetch(data.url);
      console.log("Thumbnail URL Status:", imgRes.status);
      console.log("Content-Type:", imgRes.headers.get('content-type'));
      if (!imgRes.ok) {
        const text = await imgRes.text();
        console.log("Error body:", text);
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

async function getStats(region) {
  try {
    const res = await fetch(`http://localhost:3000/api/classify/${region}?year=2016`);
    const data = await res.json();
    console.log(`\nStats for ${region} 2016:`);
    console.log("NDVI:", data.stats?.bandMeans?.NDVI);
    console.log("Band Means:", data.stats?.bandMeans);
  } catch (err) {
    console.error("Error:", err);
  }
}

async function run() {
  await testImage();
  await getStats('bhitarkanika');
  await getStats('thane-creek');
}

run();
