#!/usr/bin/env npx tsx
// Lists recordings that have a ready summary and haven't been marked as
// posted yet (state tracked in ~/.plaud/posted-to-slack.json, separate from
// ~/.plaud/config.json). Does NOT mark anything as posted — call
// mark-posted.ts after a successful post, so a failed post is retried on
// the next run instead of being silently skipped.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PlaudConfig } from '@plaud/core';
import { PlaudReadOnlyClient } from './client.js';

const STATE_FILE = path.join(os.homedir(), '.plaud', 'posted-to-slack.json');

function loadPostedIds(): Set<string> {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function main() {
  const config = new PlaudConfig();
  const creds = config.getCredentials();
  if (!creds) {
    console.error('No Plaud credentials found.');
    process.exit(1);
  }

  const client = new PlaudReadOnlyClient(config, creds.region);
  const posted = loadPostedIds();

  const recs = await client.listRecordings();
  const pending = recs.filter(r => r.is_summary && !posted.has(r.id));

  const results = [];
  for (const r of pending) {
    const summary = await client.getSummary(r.id);
    results.push({
      id: r.id,
      title: r.filename,
      date: new Date(r.start_time).toISOString(),
      duration_ms: r.duration,
      summary,
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
