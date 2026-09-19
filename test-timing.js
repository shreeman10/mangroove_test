const regionKeys = ['thane-creek', 'pichavaram', 'sundarbans-core'];
const year = '2024';

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function fetchClassify(rk, yr) {
  log(`Start fetch: ${rk}`);
  // We add a random cache-buster so Next.js doesn't just instantly return the cached 2024 data
  // which might hide the parallel vs sequential timing difference since it returns in 2ms.
  const nonce = Math.random();
  const res = await fetch(`http://localhost:3000/api/classify/${rk}?year=${yr}&nonce=${nonce}`);
  log(`End fetch: ${rk}`);
}

async function runSequentialSim() {
  log('--- BEFORE (Simulated Sequential Behavior) ---');
  for (const rk of regionKeys) {
    await fetchClassify(rk, year);
  }
}

async function runParallelSim() {
  log('--- AFTER (Parallel Behavior via useQueries) ---');
  await Promise.all(regionKeys.map(rk => fetchClassify(rk, year)));
}

async function main() {
  await runSequentialSim();
  console.log('\n');
  await runParallelSim();
}
main();
