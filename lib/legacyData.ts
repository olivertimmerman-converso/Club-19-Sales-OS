/**
 * Club 19 Sales OS - Legacy Data Utilities
 *
 * Server-side utilities for querying legacy trade data from Xata
 *
 * IMPORTANT: Legacy tables (legacy_trades, legacy_clients, legacy_suppliers)
 * must be created in Xata before this module will work.
 * See: data/legacy-import/XATA_IMPORT_GUIDE.md
 */

import { xata } from "@/lib/xata-sales";
import type { legacy_tradesRecord, legacy_clientsRecord, legacy_suppliersRecord } from "@/src/xata";
import * as logger from "./logger";

// Legacy tables are now active in Xata
const LEGACY_TABLES_EXIST = true;

export interface LegacySummary {
  totalSales: number;
  totalMargin: number;
  tradeCount: number;
  clientCount: number;
  supplierCount: number;
  avgMargin: number;
  dateRange: { start: string | null; end: string | null };
}

export interface MonthlySales {
  month: string;
  sales: number;
  margin: number;
  count: number;
}

export interface CategoryData {
  category: string;
  sales: number;
  margin: number;
  count: number;
}

export interface SupplierData {
  supplier: string;
  sales: number;
  margin: number;
  count: number;
}

export interface ClientData {
  client: string;
  sales: number;
  margin: number;
  count: number;
}

export interface LegacyTrade {
  id: string;
  trade_date: string | null;
  invoice_number: string;
  raw_client: string;
  raw_supplier: string;
  item: string;
  brand: string;
  category: string;
  buy_price: number;
  sell_price: number;
  margin: number;
  source: string;
}

export interface ReviewFlags {
  clientsRequiringReview: number;
  suppliersRequiringReview: number;
  tradesWithoutDates: number;
  clientDetails: Array<{ client: string; reason: string }>;
  supplierDetails: Array<{ supplier: string; reason: string }>;
}

/**
 * Get overall legacy data summary
 */
export async function getLegacySummary(shopper?: "Hope" | "MC"): Promise<LegacySummary> {
  // Return empty data if tables don't exist yet
  if (!LEGACY_TABLES_EXIST) {
    return {
      totalSales: 0,
      totalMargin: 0,
      tradeCount: 0,
      clientCount: 0,
      supplierCount: 0,
      avgMargin: 0,
      dateRange: { start: null, end: null },
    };
  }

  try {
    logger.info("LEGACY_DATA", "getLegacySummary called");
    logger.info("LEGACY_DATA", "Shopper filter", { shopper: shopper || "(all)" } as any);
    logger.debug("LEGACY_DATA", "Database URL", { url: (xata() as any).options?.databaseURL } as any);

    // Build filter
    const filter = shopper ? { source: shopper } : {};
    logger.debug("LEGACY_DATA", "Query filter", { filter });

    // Get all trades
    logger.info("LEGACY_DATA", "Fetching trades from legacy_trades table");
    const trades = await xata().db.legacy_trades
      .filter(filter)
      .select(["sell_price", "margin", "trade_date"])
      .getAll();

    logger.info("LEGACY_DATA", "Trades query returned", { count: trades.length });
    if (trades.length > 0) {
      logger.debug("LEGACY_DATA", "Sample trade", { trade: trades[0] as any });
    }

    // Get unique counts
    logger.info("LEGACY_DATA", "Fetching clients from legacy_clients table");
    const clients = await xata().db.legacy_clients.getAll();
    logger.info("LEGACY_DATA", "Clients query returned", { count: clients.length });

    logger.info("LEGACY_DATA", "Fetching suppliers from legacy_suppliers table");
    const suppliers = await xata().db.legacy_suppliers.getAll();
    logger.info("LEGACY_DATA", "Suppliers query returned", { count: suppliers.length });

    const totalSales = trades.reduce((sum: number, t) => sum + (t.sell_price || 0), 0);
    const totalMargin = trades.reduce((sum: number, t) => sum + (t.margin || 0), 0);
    const avgMargin = trades.length > 0 ? totalMargin / trades.length : 0;

    // Get date range
    const dates = trades
      .map(t => t.trade_date)
      .filter(Boolean)
      .sort();

    const summary: LegacySummary = {
      totalSales,
      totalMargin,
      tradeCount: trades.length,
      clientCount: shopper ? 0 : clients.length, // Don't count clients for shopper view
      supplierCount: shopper ? 0 : suppliers.length,
      avgMargin,
      dateRange: {
        start: dates[0] ? String(dates[0]) : null,
        end: dates[dates.length - 1] ? String(dates[dates.length - 1]) : null,
      },
    };

    logger.info("LEGACY_DATA", "Summary calculated", { summary: summary as any });
    logger.info("LEGACY_DATA", "getLegacySummary complete");
    return summary;
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getLegacySummary", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    } as any);
    logger.info("LEGACY_DATA", "Returning empty summary due to error");
    return {
      totalSales: 0,
      totalMargin: 0,
      tradeCount: 0,
      clientCount: 0,
      supplierCount: 0,
      avgMargin: 0,
      dateRange: { start: null, end: null },
    };
  }
}

/**
 * Get monthly sales over time
 */
export async function getLegacyMonthlySales(shopper?: "Hope" | "MC"): Promise<MonthlySales[]> {
  if (!LEGACY_TABLES_EXIST) return [];

  try {
    const filter = shopper ? { source: shopper } : {};

    const trades = await xata().db.legacy_trades
      .filter(filter)
      .select(["trade_date", "sell_price", "margin"])
      .getAll();

    // Group by month
    const monthlyData = new Map<string, { sales: number; margin: number; count: number }>();

    trades.forEach(trade => {
      if (!trade.trade_date) return;

      // Safely convert date to string and extract YYYY-MM
      let month: string;
      try {
        const dateValue = trade.trade_date as string | Date;
        if (typeof dateValue === 'string') {
          month = dateValue.substring(0, 7); // YYYY-MM
        } else if (trade.trade_date instanceof Date) {
          month = trade.trade_date.toISOString().substring(0, 7); // YYYY-MM
        } else {
          // Fallback: try to convert to Date
          const date = new Date(trade.trade_date);
          if (isNaN(date.getTime())) {
            logger.warn("LEGACY_DATA", "Invalid trade_date in getLegacyMonthlySales", { trade_date: trade.trade_date });
            return;
          }
          month = date.toISOString().substring(0, 7);
        }
      } catch (err) {
        logger.error("LEGACY_DATA", "Error processing trade_date in getLegacyMonthlySales", { error: err as any } as any);
        return;
      }

      const existing = monthlyData.get(month) || { sales: 0, margin: 0, count: 0 };

      monthlyData.set(month, {
        sales: existing.sales + (trade.sell_price || 0),
        margin: existing.margin + (trade.margin || 0),
        count: existing.count + 1,
      });
    });

    // Convert to array and sort
    return Array.from(monthlyData.entries())
      .map(([month, data]) => ({
        month,
        ...data,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getLegacyMonthlySales", { error: error as any } as any);
    return [];
  }
}

/**
 * Get sales by category
 */
export async function getLegacyByCategory(shopper?: "Hope" | "MC"): Promise<CategoryData[]> {
  if (!LEGACY_TABLES_EXIST) return [];

  try {
    const filter = shopper ? { source: shopper } : {};

    const trades = await xata().db.legacy_trades
      .filter(filter)
      .select(["category", "sell_price", "margin"])
      .getAll();

    // Group by category
    const categoryData = new Map<string, { sales: number; margin: number; count: number }>();

    trades.forEach(trade => {
      const category = trade.category || "Unknown";
      const existing = categoryData.get(category) || { sales: 0, margin: 0, count: 0 };

      categoryData.set(category, {
        sales: existing.sales + (trade.sell_price || 0),
        margin: existing.margin + (trade.margin || 0),
        count: existing.count + 1,
      });
    });

    // Convert to array and sort by sales
    return Array.from(categoryData.entries())
      .map(([category, data]) => ({
        category,
        ...data,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10); // Top 10
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getLegacyByCategory", { error: error as any } as any);
    return [];
  }
}

/**
 * Get sales by supplier
 */
export async function getLegacyBySupplier(shopper?: "Hope" | "MC"): Promise<SupplierData[]> {
  if (!LEGACY_TABLES_EXIST) return [];

  try {
    const filter = shopper ? { source: shopper } : {};

    const trades = await xata().db.legacy_trades
      .filter(filter)
      .select(["raw_supplier", "sell_price", "margin"])
      .getAll();

    // Group by supplier
    const supplierData = new Map<string, { sales: number; margin: number; count: number }>();

    trades.forEach(trade => {
      const supplier = trade.raw_supplier || "Unknown";
      const existing = supplierData.get(supplier) || { sales: 0, margin: 0, count: 0 };

      supplierData.set(supplier, {
        sales: existing.sales + (trade.sell_price || 0),
        margin: existing.margin + (trade.margin || 0),
        count: existing.count + 1,
      });
    });

    // Convert to array and sort by sales
    return Array.from(supplierData.entries())
      .map(([supplier, data]) => ({
        supplier,
        ...data,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10); // Top 10
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getLegacyBySupplier", { error: error as any } as any);
    return [];
  }
}

/**
 * Get top clients
 */
export async function getTopLegacyClients(shopper?: "Hope" | "MC"): Promise<ClientData[]> {
  if (!LEGACY_TABLES_EXIST) return [];

  try {
    const filter = shopper ? { source: shopper } : {};

    const trades = await xata().db.legacy_trades
      .filter(filter)
      .select(["raw_client", "sell_price", "margin"])
      .getAll();

    // Group by client
    const clientData = new Map<string, { sales: number; margin: number; count: number }>();

    trades.forEach(trade => {
      const client = trade.raw_client || "Unknown";
      const existing = clientData.get(client) || { sales: 0, margin: 0, count: 0 };

      clientData.set(client, {
        sales: existing.sales + (trade.sell_price || 0),
        margin: existing.margin + (trade.margin || 0),
        count: existing.count + 1,
      });
    });

    // Convert to array and sort by sales
    return Array.from(clientData.entries())
      .map(([client, data]) => ({
        client,
        ...data,
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10); // Top 10
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getTopLegacyClients", { error: error as any } as any);
    return [];
  }
}

/**
 * Get top suppliers
 */
export async function getTopLegacySuppliers(shopper?: "Hope" | "MC"): Promise<SupplierData[]> {
  // Same as getLegacyBySupplier
  return getLegacyBySupplier(shopper);
}

/**
 * Get recent trades
 */
export async function getRecentLegacyTrades(
  limit: number = 20,
  shopper?: "Hope" | "MC"
): Promise<LegacyTrade[]> {
  if (!LEGACY_TABLES_EXIST) return [];

  try{
    const filter = shopper ? { source: shopper } : {};

    const result = await xata().db.legacy_trades
      .filter(filter)
      .select([
        "id",
        "trade_date",
        "invoice_number",
        "raw_client",
        "raw_supplier",
        "item",
        "brand",
        "category",
        "buy_price",
        "sell_price",
        "margin",
        "source",
      ])
      .sort("trade_date", "desc")
      .getPaginated({ pagination: { size: limit } });

    return result.records.map((record): LegacyTrade => ({
      id: record.id,
      trade_date: record.trade_date as string | null,
      invoice_number: record.invoice_number || "",
      raw_client: record.raw_client || "",
      raw_supplier: record.raw_supplier || "",
      item: record.item || "",
      brand: record.brand || "",
      category: record.category || "",
      buy_price: record.buy_price || 0,
      sell_price: record.sell_price || 0,
      margin: record.margin || 0,
      source: record.source || "",
    }));
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getRecentLegacyTrades", { error: error as any } as any);
    return [];
  }
}

/**
 * Get review flags
 */
export async function getReviewFlags(): Promise<ReviewFlags> {
  if (!LEGACY_TABLES_EXIST) {
    return {
      clientsRequiringReview: 0,
      suppliersRequiringReview: 0,
      tradesWithoutDates: 0,
      clientDetails: [],
      supplierDetails: [],
    };
  }

  try {
    // Get clients requiring review
    const clients = await xata().db.legacy_clients
      .filter({ requires_review: true })
      .select(["client_clean"])
      .getAll();

    // Get suppliers requiring review
    const suppliers = await xata().db.legacy_suppliers
      .filter({ requires_review: true })
      .select(["supplier_clean", "reason"])
      .getAll();

    // Count trades without dates
    const tradesWithoutDates = await xata().db.legacy_trades
      .filter({ trade_date: null })
      .select(["id"])
      .getAll();

    return {
      clientsRequiringReview: clients.length,
      suppliersRequiringReview: suppliers.length,
      tradesWithoutDates: tradesWithoutDates.length,
      clientDetails: clients.map(c => ({
        client: c.client_clean || "Unknown",
        reason: "Status conflict",
      })),
      supplierDetails: suppliers.map(s => ({
        supplier: s.supplier_clean || "Unknown",
        reason: s.reason || "Requires review",
      })),
    };
  } catch (error) {
    logger.error("LEGACY_DATA", "Error in getReviewFlags", { error: error as any } as any);
    return {
      clientsRequiringReview: 0,
      suppliersRequiringReview: 0,
      tradesWithoutDates: 0,
      clientDetails: [],
      supplierDetails: [],
    };
  }
}

/**
 * Get trades for specific shopper
 */
export async function getTradesForShopper(shopper: "Hope" | "MC"): Promise<LegacyTrade[]> {
  if (!LEGACY_TABLES_EXIST) return [];
  return getRecentLegacyTrades(1000, shopper); // Get all trades for shopper
}
