#!/usr/bin/env npx tsx
// Step 3 smoke test: verify PlaudReadOnlyClient against real recordings,
// including the not-found error path. Prints structure/lengths only —
// never dumps full personal transcript/summary text to stdout.
import { PlaudConfig } from '@plaud/core';
import { PlaudReadOnlyClient, RecordingNotFoundError } from './client.js';

const SHORT_ID = 'REDACTED_RECORDING_ID';
const LONG_ID = 'REDACTED_RECORDING_ID';

async function main() {
  const config = new PlaudConfig();
  const creds = config.getCredentials()!;
  const client = new PlaudReadOnlyClient(config, creds.region);

  for (const id of [SHORT_ID, LONG_ID]) {
    console.log(`\n=== ${id} ===`);
    const meta = await client.getRecording(id);
    console.log('metadata:', meta);

    const transcript = await client.getTranscript(id);
    const lines = transcript.split('\n');
    console.log(`transcript: ${lines.length} lines, ${transcript.length} chars, first line speaker tag: ${lines[0].match(/^\[[^\]]+\]/)?.[0]}`);

    const summary = await client.getSummary(id);
    console.log(`summary: ${summary.length} chars, starts with: ${JSON.stringify(summary.slice(0, 40))}`);
  }

  console.log('\n=== not-found path ===');
  try {
    await client.getRecording('this-id-does-not-exist-12345');
    console.log('FAIL: expected RecordingNotFoundError');
  } catch (err) {
    console.log('threw:', err instanceof RecordingNotFoundError ? 'RecordingNotFoundError' : err, '-', (err as Error).message);
  }
}

main().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
