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

async function checkAllTables() {
  const suppliers = await tableExists('legacy_suppliers');
  const clients = await tableExists('legacy_clients');
  const trades = await tableExists('legacy_trades');

  return {
    legacy_suppliers: suppliers,
    legacy_clients: clients,
    legacy_trades: trades,
    all_exist: suppliers && clients && trades
  };
}

async function pollForTables() {
  const maxAttempts = 120; // 10 minutes (5 sec intervals)
  let attempts = 0;

  console.log('🔍 Polling for table creation...');
  console.log('   (Checking every 5 seconds for up to 10 minutes)\n');

  while (attempts < maxAttempts) {
    const status = await checkAllTables();

    const checkMark = (exists) => exists ? '✅' : '⏳';
    process.stdout.write(`\r   ${checkMark(status.legacy_suppliers)} suppliers  ${checkMark(status.legacy_clients)} clients  ${checkMark(status.legacy_trades)} trades  [${attempts * 5}s elapsed]`);

    if (status.all_exist) {
      console.log('\n\n✅ All tables detected!\n');
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  console.log('\n\n❌ Timeout: Tables not created after 10 minutes\n');
  return false;
}

pollForTables().then(success => {
  process.exit(success ? 0 : 1);
});
