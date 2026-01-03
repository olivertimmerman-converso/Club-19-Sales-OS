import { getXataClient } from '../src/xata.js';

async function analyzeLegacy() {
  const xata = getXataClient();

  try {
    // Count records in each legacy table
    const trades = await xata.db.legacy_trades.getAll();
    const clients = await xata.db.legacy_clients.getAll();
    const suppliers = await xata.db.legacy_suppliers.getAll();

    console.log('=== RECORD COUNTS ===');
    console.log('legacy_trades:', trades.length);
    console.log('legacy_clients:', clients.length);
    console.log('legacy_suppliers:', suppliers.length);
    console.log('');

    // Date range of trades
    if (trades.length > 0) {
      const dates = trades
        .map(t => t.trade_date)
        .filter(d => d !== null && d !== undefined)
        .map(d => new Date(d as Date).getTime())
        .sort((a, b) => a - b);

      if (dates.length > 0) {
        console.log('=== DATE RANGE ===');
        console.log('Earliest:', new Date(dates[0]).toISOString().split('T')[0]);
        console.log('Latest:', new Date(dates[dates.length - 1]).toISOString().split('T')[0]);
        console.log('');
      }
    }

    // Sample records
    console.log('=== SAMPLE TRADES (first 5) ===');
    trades.slice(0, 5).forEach((trade, i) => {
      console.log(`Trade ${i + 1}:`);
      console.log('  ID:', trade.id);
      console.log('  Date:', trade.trade_date);
      console.log('  Brand:', trade.brand || 'null');
      console.log('  Item:', trade.item_title || 'null');
      console.log('  Sale Amount:', trade.sale_amount_inc_vat);
      console.log('  Margin:', trade.gross_margin);
      console.log('  Client ID:', trade.legacy_client_id || 'null');
      console.log('  Supplier ID:', trade.legacy_supplier_id || 'null');
      console.log('');
    });

    // Sales table comparison
    const sales = await xata.db.Sales.getAll();
    console.log('=== SALES TABLE COMPARISON ===');
    console.log('Total Sales records:', sales.length);

    const unknownBrand = sales.filter(s => !s.brand || s.brand === 'Unknown').length;
    const withBrand = sales.filter(s => s.brand && s.brand !== 'Unknown').length;
    const withMargin = sales.filter(s => s.gross_margin !== null && s.gross_margin !== undefined && s.gross_margin > 0).length;

    console.log('Sales with Unknown/null brand:', unknownBrand);
    console.log('Sales with valid brand:', withBrand);
    console.log('Sales with margin data:', withMargin);
    console.log('');

  } catch (error: any) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

analyzeLegacy();
