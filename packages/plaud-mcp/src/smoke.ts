#!/usr/bin/env npx tsx
// Step 1 smoke test: confirms credentials, token lifecycle, and a real API call.
// Requires ~/.plaud/config.json to already have credentials — run this first if not:
//   npx tsx packages/cli/bin/plaud.ts login
import { PlaudConfig, PlaudAuth, PlaudClient } from '@plaud/core';

async function main() {
  const config = new PlaudConfig();
  const creds = config.getCredentials();

  if (!creds) {
    console.error('No credentials found in ~/.plaud/config.json.');
    console.error('Run: npx tsx packages/cli/bin/plaud.ts login');
    process.exit(1);
  }

  console.log(`Credentials found for ${creds.email} (region: ${creds.region})`);

  const auth = new PlaudAuth(config);

  let token: string;
  try {
    token = await auth.getToken();
  } catch (err) {
    console.error('Auth failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const cachedToken = config.getToken();
  if (cachedToken) {
    const daysLeft = Math.round((cachedToken.expiresAt - Date.now()) / 86_400_000);
    console.log(`Token acquired. Expires in ~${daysLeft} days (${new Date(cachedToken.expiresAt).toISOString()}).`);
  }

  const client = new PlaudClient(auth, creds.region);

  try {
    const user = await client.getUserInfo();
    console.log('API call succeeded. Account info:');
    console.log(`  nickname:        ${user.nickname}`);
    console.log(`  email:           ${user.email}`);
    console.log(`  country:         ${user.country}`);
    console.log(`  membership_type: ${user.membership_type}`);
  } catch (err) {
    console.error('API call failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('\nSmoke test passed: auth + config + token lifecycle + API call all working.');
}

main();
