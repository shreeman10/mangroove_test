const fetch = require('node-fetch');
const fs = require('fs');

async function testImage() {
  try {
    const res = await fetch('http://localhost:3000/api/classify/bhitarkanika?year=2026');
    const data = await res.json();
    console.log("Classify API URL:", data.url);
    
    if (data.url) {
      const imgRes = await fetch(data.url);
      console.log("Thumbnail URL Status:", imgRes.status);
      console.log("Content-Type:", imgRes.headers.get('content-type'));
      const buffer = await imgRes.buffer();
      console.log("Image size (bytes):", buffer.length);
      fs.writeFileSync('test.png', buffer);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
testImage();
