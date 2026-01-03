/**
 * Trigger Full Xero Sync
 *
 * This script triggers a full historical sync of all Xero invoices.
 * It will:
 * - Fetch ALL invoices from Xero (no date limit)
 * - Create new sales records for invoices not yet imported
 * - Update dates on existing sales records to match Xero invoice dates
 *
 * Usage:
 *   node scripts/trigger-full-xero-sync.js
 *
 * Or for regular 60-day sync:
 *   node scripts/trigger-full-xero-sync.js --incremental
 */

const https = require('https');

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://c19invoice.converso.uk';
const FULL_SYNC = !process.argv.includes('--incremental');

console.log('='.repeat(80));
console.log('Xero Invoice Sync Trigger');
console.log('='.repeat(80));
console.log(`Mode: ${FULL_SYNC ? 'FULL HISTORICAL SYNC' : 'INCREMENTAL (60-day)'}`);
console.log(`URL: ${BASE_URL}/api/sync/xero-invoices${FULL_SYNC ? '?full=true' : ''}`);
console.log('='.repeat(80));
console.log('');

const url = new URL(`${BASE_URL}/api/sync/xero-invoices${FULL_SYNC ? '?full=true' : ''}`);

const options = {
  hostname: url.hostname,
  port: url.port || 443,
  path: url.pathname + url.search,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
};

console.log('Starting sync request...\n');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers, null, 2)}\n`);

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      console.log('Response:');
      console.log(JSON.stringify(result, null, 2));
      console.log('');

      if (result.success) {
        console.log('✅ Sync completed successfully!');
        console.log('');
        console.log('Summary:');
        console.log(`  Total invoices: ${result.summary.total}`);
        console.log(`  New records: ${result.summary.new}`);
        console.log(`  Updated records: ${result.summary.updated}`);
        console.log(`  Skipped: ${result.summary.skipped}`);
        console.log(`  Errors: ${result.summary.errors}`);
        console.log(`  Duration: ${result.duration}`);

        if (result.errors && result.errors.length > 0) {
          console.log('');
          console.log('Errors encountered:');
          result.errors.forEach((err, i) => {
            console.log(`  ${i + 1}. ${err.invoiceNumber}: ${err.error}`);
          });
        }
      } else {
        console.error('❌ Sync failed:', result.error);
        if (result.details) {
          console.error('Details:', result.details);
        }
      }
    } catch (err) {
      console.error('Failed to parse response:', data);
      console.error('Parse error:', err.message);
    }
    console.log('');
    console.log('='.repeat(80));
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.log('');
  console.log('='.repeat(80));
  process.exit(1);
});

// Set a timeout for long-running syncs
req.setTimeout(300000, () => { // 5 minutes
  console.error('❌ Request timeout (5 minutes)');
  console.log('The sync may still be running on the server.');
  console.log('Check Vercel logs for completion status.');
  console.log('');
  console.log('='.repeat(80));
  req.destroy();
  process.exit(1);
});

req.end();
