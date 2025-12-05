/**
 * Check actual database contents - Sales vs legacy_trades
 */

import { XataClient } from '../src/xata.ts';

const xata = new XataClient();

async function checkActualData() {
  console.log("🔍 Checking actual database contents...\n");
  console.log("=" .repeat(80));

  try {
    // 1. Count Sales table records
    console.log("\n📊 1. SALES TABLE:");
    const sales = await xata.db.Sales.getAll();
    console.log(`   Total records: ${sales.length}`);

    if (sales.length > 0) {
      console.log("\n   Sample records (first 3):");
      console.log("   " + "-".repeat(76));

      sales.slice(0, 3).forEach((record, i) => {
        console.log(`\n   Record ${i + 1}:`);
        console.log(`     ID: ${record.id}`);
        console.log(`     Sale Date: ${record.sale_date || 'N/A'}`);
        console.log(`     Item Title: ${record.item_title || 'N/A'}`);
        console.log(`     Sale Amount (inc VAT): £${record.sale_amount_inc_vat || 0}`);
        console.log(`     Gross Margin: £${record.gross_margin || 0}`);
        console.log(`     Brand: ${record.brand || 'N/A'}`);
        console.log(`     Shopper: ${record.shopper_name || 'N/A'}`);
      });
    }

    // 2. Count legacy_trades table records
    console.log("\n\n📊 2. LEGACY_TRADES TABLE:");
    const legacyTrades = await xata.db.legacy_trades.getAll();
    console.log(`   Total records: ${legacyTrades.length}`);

    if (legacyTrades.length > 0) {
      console.log("\n   Sample records (first 3):");
      console.log("   " + "-".repeat(76));

      legacyTrades.slice(0, 3).forEach((record, i) => {
        console.log(`\n   Record ${i + 1}:`);
        console.log(`     ID: ${record.id}`);
        console.log(`     Trade Date: ${record.trade_date || 'N/A'}`);
        console.log(`     Item: ${record.item || 'N/A'}`);
        console.log(`     Sell Price: £${record.sell_price || 0}`);
        console.log(`     Margin: £${record.margin || 0}`);
        console.log(`     Brand: ${record.brand || 'N/A'}`);
        console.log(`     Source: ${record.source || 'N/A'}`);
      });
    }

    console.log("\n" + "=".repeat(80));
    console.log("\n✅ Database check complete\n");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
  }
}

checkActualData();
