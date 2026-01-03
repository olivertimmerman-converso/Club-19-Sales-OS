import { NextResponse } from 'next/server';
import { getXataClient } from '@/src/xata';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const xata = getXataClient();

    // Count records in each legacy table
    const trades = await xata.db.legacy_trades.getAll();
    const clients = await xata.db.legacy_clients.getAll();
    const suppliers = await xata.db.legacy_suppliers.getAll();

    // Date range of trades
    let dateRange = { earliest: null as string | null, latest: null as string | null };
    if (trades.length > 0) {
      const dates = trades
        .map(t => t.trade_date)
        .filter(d => d !== null && d !== undefined)
        .map(d => new Date(d as Date).getTime())
        .sort((a, b) => a - b);

      if (dates.length > 0) {
        dateRange = {
          earliest: new Date(dates[0]).toISOString().split('T')[0],
          latest: new Date(dates[dates.length - 1]).toISOString().split('T')[0],
        };
      }
    }

    // Sample records
    const sampleTrades = trades.slice(0, 5).map(trade => ({
      id: trade.id,
      trade_date: trade.trade_date,
      brand: trade.brand || 'null',
      item_title: trade.item_title || 'null',
      sale_amount_inc_vat: trade.sale_amount_inc_vat,
      gross_margin: trade.gross_margin,
      legacy_client_id: trade.legacy_client_id || 'null',
      legacy_supplier_id: trade.legacy_supplier_id || 'null',
    }));

    // Sales table comparison
    const sales = await xata.db.Sales.getAll();

    const unknownBrand = sales.filter(s => !s.brand || s.brand === 'Unknown').length;
    const withBrand = sales.filter(s => s.brand && s.brand !== 'Unknown').length;
    const withMargin = sales.filter(s => s.gross_margin !== null && s.gross_margin !== undefined && s.gross_margin > 0).length;

    return NextResponse.json({
      recordCounts: {
        legacy_trades: trades.length,
        legacy_clients: clients.length,
        legacy_suppliers: suppliers.length,
      },
      dateRange,
      sampleTrades,
      salesComparison: {
        totalSales: sales.length,
        unknownBrand,
        withBrand,
        withMargin,
      },
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message, stack: error.stack },
      { status: 500 }
    );
  }
}
