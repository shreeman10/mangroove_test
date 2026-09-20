const regions = ['thane-creek', 'bhitarkanika', 'sundarbans-core'];
const years = [2015, 2016, 2017, 2018, 2019, 2020];

async function test() {
  for (const region of regions) {
    for (const year of years) {
      const url = `http://localhost:3000/api/classify/${region}?year=${year}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (res.ok && !data.error) {
          console.log(`SUCCESS: ${region} ${year} - S2 Count: ${data.debug?.s2ImageCount}`);
        } else {
          console.log(`FAIL: ${region} ${year} - Status: ${res.status} Error: ${data.error}`);
        }
      } catch (err) {
        console.log(`ERROR fetching ${region} ${year}: ${err.message}`);
      }
    }
  }
}
test();
