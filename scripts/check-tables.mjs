import { XataClient } from '../src/xata.ts';

const xata = new XataClient();

async function checkTables() {
  console.log("🔍 Checking Xata tables...\n");

  try {
    // Check legacy_trades
    console.log("📊 Checking legacy_trades table...");
    const legacyTrades = await xata.db.legacy_trades.getAll();
    console.log(`  ✅ legacy_trades: ${legacyTrades.length} records\n`);

    // Check Sales
    console.log("📊 Checking Sales table...");
    const sales = await xata.db.Sales.getAll();
    console.log(`  ✅ Sales: ${sales.length} records\n`);

    if (sales.length > 0) {
      console.log("📋 Sample Sales records (first 3):");
      const samples = sales.slice(0, 3);
      samples.forEach((sample, i) => {
        console.log(`\nRecord ${i + 1}:`);
        console.log(`  ID: ${sample.id}`);
        console.log(`  Reference: ${sample.sale_reference}`);
        console.log(`  Date: ${sample.sale_date}`);
        console.log(`  Shopper: ${sample.shopper_name || 'N/A'}`);
        console.log(`  Sale Amount: £${sample.sale_amount_inc_vat || 0}`);
        console.log(`  Margin: £${sample.gross_margin || 0}`);
        console.log(`  Brand: ${sample.brand || 'N/A'}`);
        console.log(`  Category: ${sample.category || 'N/A'}`);
      });
    }

    if (legacyTrades.length > 0) {
      console.log("\n📋 Sample legacy_trades records (first 3):");
      const samples = legacyTrades.slice(0, 3);
      samples.forEach((sample, i) => {
        console.log(`\nRecord ${i + 1}:`);
        console.log(`  ID: ${sample.id}`);
        console.log(`  Date: ${sample.trade_date}`);
        console.log(`  Source: ${sample.source}`);
        console.log(`  Sell Price: £${sample.sell_price || 0}`);
        console.log(`  Margin: £${sample.margin || 0}`);
        console.log(`  Brand: ${sample.brand || 'N/A'}`);
        console.log(`  Category: ${sample.category || 'N/A'}`);
      });
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  }
}

checkTables();
