const https = require('https');
const fs = require('fs');

const API_KEY = fs.readFileSync(require('os').homedir() + '/.config/xata/credentials', 'utf8').match(/apiKey=([^\n\r]+)/)[1];

async function tableExists(tableName) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'Oliver-Timmerman-s-workspace-d3730u.eu-central-1.xata.sh',
      path: `/db/Club19SalesOS:main/tables/${tableName}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const data = JSON.stringify({ page: { size: 1 } });

    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.write(data);
    req.end();
  });
}

async function main() {
  const tables = {
    'legacy_suppliers': await tableExists('legacy_suppliers'),
    'legacy_clients': await tableExists('legacy_clients'),
    'legacy_trades': await tableExists('legacy_trades')
  };

  console.log(JSON.stringify(tables));

  const allExist = Object.values(tables).every(exists => exists);
  process.exit(allExist ? 0 : 1);
}

main();
