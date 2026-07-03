#!/usr/bin/env npx tsx
// Step 2 smoke test: verify listRecordings() shape against a real account.
import { PlaudConfig, PlaudAuth, PlaudClient } from '@plaud/core';

async function main() {
  const config = new PlaudConfig();
  const creds = config.getCredentials();
  if (!creds) {
    console.error('No credentials found. Run login first.');
    process.exit(1);
  }

  const auth = new PlaudAuth(config);
  const client = new PlaudClient(auth, creds.region);

  const recs = await client.listRecordings();
  console.log(`Fetched ${recs.length} recordings (trash already filtered).\n`);

  if (recs.length > 0) {
    console.log('Raw shape of first recording:');
    console.log(JSON.stringify(recs[0], null, 2));
  }

  console.log('\nAll recordings (id / title / start_time / duration / is_trans / is_summary):');
  for (const r of recs) {
    console.log(`  ${r.id} | ${r.filename} | ${new Date(r.start_time).toISOString()} | ${r.duration}ms | trans=${r.is_trans} | summary=${r.is_summary}`);
  }
}

main().catch(err => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
