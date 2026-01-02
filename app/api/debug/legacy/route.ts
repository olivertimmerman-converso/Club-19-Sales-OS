/**
 * Debug API route to test legacy_trades query
 * DELETE THIS FILE after debugging
 */

import { NextResponse } from "next/server";
import { xata } from "@/lib/xata-sales";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  logger.info("DEBUG", "Starting legacy_trades query");

  try {
    // Direct query to legacy_trades
    logger.info("DEBUG", "Querying legacy_trades table");
    const trades = await xata().db.legacy_trades.getAll();

    logger.info("DEBUG", "Query returned records", { count: trades.length });

    // Get first 3 records
    const sample = trades.slice(0, 3).map(t => ({
      id: t.id,
      trade_date: t.trade_date,
      sell_price: t.sell_price,
      margin: t.margin,
      brand: t.brand,
      source: t.source,
      raw_client: t.raw_client,
      raw_supplier: t.raw_supplier,
    }));

    // Calculate totals
    const totalSales = trades.reduce((sum, t) => sum + (t.sell_price || 0), 0);
    const totalMargin = trades.reduce((sum, t) => sum + (t.margin || 0), 0);

    logger.info("DEBUG", "Legacy trades totals calculated", {
      totalSales,
      totalMargin
    });

    return NextResponse.json({
      success: true,
      count: trades.length,
      totalSales,
      totalMargin,
      sample,
    });
  } catch (error) {
    logger.error("DEBUG", "Error querying legacy_trades", { error: error as any });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
