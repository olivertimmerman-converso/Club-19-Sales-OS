/**
 * Check Sales data in Xata
 */

const { getXataClient } = require("../src/xata");

async function checkSalesData() {
  console.log("🔍 Checking Sales table data...\n");

  const xata = getXataClient();

  try {
    // Count total records
    console.log("📊 Counting total Sales records...");
    const allSales = await xata.db.Sales.getAll();
    console.log(`✅ Total Sales records: ${allSales.length}\n`);

    if (allSales.length === 0) {
      console.log("❌ No sales data found in the database!");
      return;
    }

    // Show first 5 records
    console.log("📋 First 5 Sales records:");
    console.log("=" .repeat(80));

    const sample = allSales.slice(0, 5);
    sample.forEach((sale, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`  ID: ${sale.id}`);
      console.log(`  Reference: ${sale.sale_reference || "N/A"}`);
      console.log(`  Date: ${sale.sale_date || "N/A"}`);
      console.log(`  Shopper: ${sale.shopper?.name || "N/A"}`);
      console.log(`  Buyer: ${sale.buyer?.name || "N/A"}`);
      console.log(`  Supplier: ${sale.supplier?.name || "N/A"}`);
      console.log(`  Brand: ${sale.brand || "N/A"}`);
      console.log(`  Category: ${sale.category || "N/A"}`);
      console.log(`  Sale Amount (inc VAT): £${sale.sale_amount_inc_vat || 0}`);
      console.log(`  Gross Margin: £${sale.gross_margin || 0}`);
      console.log(`  Status: ${sale.invoice_status || "N/A"}`);
    });

    // Check date range
    console.log("\n" + "=".repeat(80));
    console.log("\n📅 Date Range Analysis:");

    const datesWithValues = allSales
      .filter(s => s.sale_date)
      .map(s => new Date(s.sale_date));

    if (datesWithValues.length > 0) {
      const minDate = new Date(Math.min(...datesWithValues));
      const maxDate = new Date(Math.max(...datesWithValues));

      console.log(`  Earliest sale: ${minDate.toISOString().split('T')[0]}`);
      console.log(`  Latest sale: ${maxDate.toISOString().split('T')[0]}`);
      console.log(`  Records with dates: ${datesWithValues.length}/${allSales.length}`);
    } else {
      console.log("  ⚠️  No records have sale_date values!");
    }

    // Check shoppers
    console.log("\n👥 Shopper Analysis:");
    const shopperCounts = {};
    allSales.forEach(sale => {
      const shopperName = sale.shopper?.name || "UNKNOWN";
      shopperCounts[shopperName] = (shopperCounts[shopperName] || 0) + 1;
    });
    Object.entries(shopperCounts).forEach(([name, count]) => {
      console.log(`  ${name}: ${count} sales`);
    });

    // Check amounts
    console.log("\n💰 Amount Analysis:");
    const totalSales = allSales.reduce((sum, s) => sum + (s.sale_amount_inc_vat || 0), 0);
    const totalMargin = allSales.reduce((sum, s) => sum + (s.gross_margin || 0), 0);
    console.log(`  Total Sales: £${totalSales.toFixed(2)}`);
    console.log(`  Total Margin: £${totalMargin.toFixed(2)}`);
    console.log(`  Records with sale_amount_inc_vat > 0: ${allSales.filter(s => s.sale_amount_inc_vat > 0).length}`);
    console.log(`  Records with gross_margin > 0: ${allSales.filter(s => s.gross_margin > 0).length}`);

  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
  }
}

checkSalesData();
