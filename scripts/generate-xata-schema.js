const https = require('https');
const fs = require('fs');

const API_KEY = fs.readFileSync(require('os').homedir() + '/.config/xata/credentials', 'utf8').match(/apiKey=([^\n\r]+)/)[1];

async function getSchema() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'Oliver-Timmerman-s-workspace-d3730u.eu-central-1.xata.sh',
      path: '/db/Club19SalesOS:main/schema',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Fetching schema from Xata API...');
  const schema = await getSchema();

  console.log('\nTables found:');
  schema.tables.forEach(table => {
    console.log(`  - ${table.name} (${table.columns.length} columns)`);
  });

  // Check for legacy tables
  const legacyTables = schema.tables.filter(t => t.name.startsWith('legacy_'));
  console.log(`\n✅ Legacy tables: ${legacyTables.length}/3`);
  legacyTables.forEach(t => console.log(`   - ${t.name}`));

  // Write schema to file for inspection
  fs.writeFileSync('/tmp/xata-schema.json', JSON.stringify(schema, null, 2));
  console.log('\n✓ Schema written to /tmp/xata-schema.json');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
