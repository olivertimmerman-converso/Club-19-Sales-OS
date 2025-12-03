const fs = require('fs');
const https = require('https');

// Configuration
const WORKSPACE = 'Oliver-Timmerman-s-workspace-d3730u';
const REGION = 'eu-central-1';
const DATABASE = 'Club19SalesOS';
const BRANCH = 'main';

// Get API key
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
    process.exit(1);
  }
}

console.log('✓ API key loaded\n');

// Create a table in Xata
async function createTable(tableName, columns) {
  const url = `https://${WORKSPACE}.${REGION}.xata.sh/db/${DATABASE}:${BRANCH}/tables`;

  const data = JSON.stringify({
    name: tableName,
    columns: columns
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

// Main function
async function main() {
  console.log('🚀 Creating legacy tables in Xata...');
  console.log(`Database: ${DATABASE}`);
  console.log(`Workspace: ${WORKSPACE}\n`);

  // Read schema file
  const schemaPath = 'data/legacy-import/xata-schema-all-legacy.json';
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  try {
    for (const table of schema.tables) {
      console.log(`Creating table: ${table.name}...`);
      await createTable(table.name, table.columns);
      console.log(`✓ ${table.name} created (${table.columns.length} columns)\n`);
    }

    console.log('✅ All legacy tables created successfully!');
    console.log('\nNext step: Run import script');
    console.log('  node scripts/import-to-xata.js');
  } catch (err) {
    console.error('\n❌ Table creation failed:', err.message);
    process.exit(1);
  }
}

main();
