const fs = require('fs');
const https = require('https');

// Configuration
const WORKSPACE = 'Oliver-Timmerman-s-workspace-d3730u';
const REGION = 'eu-central-1';
const DATABASE = 'Club19SalesOS';
const BRANCH = 'main';

// Get API key from Xata credentials file
let API_KEY = process.env.XATA_API_KEY;

if (!API_KEY) {
  try {
    const credPath = require('os').homedir() + '/.config/xata/credentials';
    const credContent = fs.readFileSync(credPath, 'utf8');
    const match = credContent.match(/apiKey=([^\n\r]+)/);
    if (match) {
      API_KEY = match[1];
    }
  } catch (err) {
    console.error('Error: Could not find Xata API key');
    console.error('Run: npx xata auth login');
    process.exit(1);
  }
}

if (!API_KEY) {
  console.error('Error: No API key found');
  process.exit(1);
}

console.log('✓ API key loaded');

// CSV to JSON converter
function csvToJson(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));

  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const obj = {};
    headers.forEach((header, i) => {
      let value = values[i];

      // Skip empty values and raw_row (not needed for application)
      if (value === '' || value === null || header === 'raw_row') {
        return;
      }

      // Parse JSON arrays and objects (except raw_row which stays as string for Xata JSON type)
      if ((value.startsWith('[') || value.startsWith('{')) && header !== 'raw_row') {
        try {
          value = JSON.parse(value.replace(/""/g, '"'));
        } catch (e) {
          // Keep as string if parse fails
        }
      }
      // For raw_row, just fix the double quotes but keep as string
      else if (header === 'raw_row' && (value.startsWith('{') || value.startsWith('['))) {
        value = value.replace(/""/g, '"');
      }
      // Parse booleans
      else if (value === 'true') value = true;
      else if (value === 'false') value = false;
      // Convert YYYY-MM-DD dates to RFC 3339 format
      else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        value = new Date(value + 'T00:00:00.000Z').toISOString();
      }
      // Parse numbers (except for ID fields and invoice_number)
      else if (!header.includes('id') && header !== 'invoice_number' && !isNaN(value) && value !== '') {
        value = parseFloat(value);
      }

      obj[header] = value;
    });

    return obj;
  });
}

// Bulk insert to Xata
async function bulkInsert(table, records) {
  const url = `https://${WORKSPACE}.${REGION}.xata.sh/db/${DATABASE}:${BRANCH}/tables/${table}/bulk`;

  const data = JSON.stringify({
    records: records
  });

  const dataBuffer = Buffer.from(data, 'utf8');

  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': dataBuffer.length
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(dataBuffer);
    req.end();
  });
}

// Main import function
async function importCSV(filename, tableName) {
  console.log(`\nImporting ${filename} to ${tableName}...`);

  const csvPath = `data/legacy-import/${filename}`;
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const records = csvToJson(csvText);

  console.log(`  Parsed ${records.length} records`);

  // Batch insert (trades have larger records, use smaller batches)
  const batchSize = tableName === 'legacy_trades' ? 20 : 50;
  let imported = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      await bulkInsert(tableName, batch);
      imported += batch.length;
      process.stdout.write(`  Imported ${imported}/${records.length} records\r`);
    } catch (err) {
      console.error(`\n  Error importing batch: ${err.message}`);
      throw err;
    }
  }

  console.log(`\n✓ ${tableName} import complete (${imported} records)`);
  return imported;
}

// Execute imports
async function main() {
  console.log('\n🚀 Starting Xata imports...');
  console.log(`Database: ${DATABASE}`);
  console.log(`Workspace: ${WORKSPACE}\n`);

  try {
    const suppliersCount = await importCSV('legacy_suppliers.csv', 'legacy_suppliers');
    const clientsCount = await importCSV('legacy_clients.csv', 'legacy_clients');
    const tradesCount = await importCSV('legacy_trades.csv', 'legacy_trades');

    console.log('\n✅ All imports completed successfully!');
    console.log(`\nImport Summary:`);
    console.log(`  Suppliers: ${suppliersCount}`);
    console.log(`  Clients: ${clientsCount}`);
    console.log(`  Trades: ${tradesCount}`);
    console.log(`  Total: ${suppliersCount + clientsCount + tradesCount} records`);
  } catch (err) {
    console.error('\n❌ Import failed:', err.message);
    process.exit(1);
  }
}

main();
