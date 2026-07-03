#!/usr/bin/env npx tsx
// Marks recording IDs as posted in ~/.plaud/posted-to-slack.json. Call this
// only after a Slack post actually succeeds, so a failed post gets retried
// on the next list-pending.ts run instead of being silently dropped.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATE_FILE = path.join(os.homedir(), '.plaud', 'posted-to-slack.json');

function loadPostedIds(): string[] {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Usage: tsx mark-posted.ts <recording_id> [recording_id...]');
  process.exit(1);
}

const posted = new Set(loadPostedIds());
for (const id of ids) posted.add(id);

fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true, mode: 0o700 });
fs.writeFileSync(STATE_FILE, JSON.stringify([...posted], null, 2), { mode: 0o600 });
console.log(`Marked ${ids.length} recording(s) as posted. Total tracked: ${posted.size}.`);
