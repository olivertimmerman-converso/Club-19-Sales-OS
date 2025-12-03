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
    // Build filter
    const filter = shopper ? { source: shopper } : {};

    // Get all trades
    const trades: any[] = await xata().db.legacy_trades
      .filter(filter)
      .select(["sell_price", "margin", "trade_date"])
      .getAll();

    // Get unique counts
    const clients: any[] = await xata().db.legacy_clients.getAll();
    const suppliers: any[] = await xata().db.legacy_suppliers.getAll();

    const totalSales = trades.reduce((sum: number, t: any) => sum + (t.sell_price || 0), 0);
    const totalMargin = trades.reduce((sum: number, t: any) => sum + (t.margin || 0), 0);
    const avgMargin = trades.length > 0 ? totalMargin / trades.length : 0;

    // Get date range
    const dates = trades
      .map(t => t.trade_date)
      .filter(Boolean)
      .sort();

    return {
      totalSales,
      totalMargin,
      tradeCount: trades.length,
      clientCount: shopper ? 0 : clients.length, // Don't count clients for shopper view
      supplierCount: shopper ? 0 : suppliers.length,
      avgMargin,
      dateRange: {
        start: dates[0] || null,
        end: dates[dates.length - 1] || null,
      },
    };
  } catch (error) {
    console.error("[getLegacySummary] Error:", error);
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

    const trades: any[] = await xata().db.legacy_trades
      .filter(filter)
      .select(["trade_date", "sell_price", "margin"])
      .getAll();

    // Group by month
    const monthlyData = new Map<string, { sales: number; margin: number; count: number }>();

    trades.forEach(trade => {
      if (!trade.trade_date) return;

      const month = trade.trade_date.substring(0, 7); // YYYY-MM
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
    console.error("[getLegacyMonthlySales] Error:", error);
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

    const trades: any[] = await xata().db.legacy_trades
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
    console.error("[getLegacyByCategory] Error:", error);
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

    const trades: any[] = await xata().db.legacy_trades
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
    console.error("[getLegacyBySupplier] Error:", error);
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

    const trades: any[] = await xata().db.legacy_trades
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
    console.error("[getTopLegacyClients] Error:", error);
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

    const result: any = await xata().db.legacy_trades
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

    return result.records.map((record: any) => ({
      id: record.id,
      trade_date: record.trade_date || null,
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
    console.error("[getRecentLegacyTrades] Error:", error);
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
    const clients: any[] = await xata().db.legacy_clients
      .filter({ requires_review: true })
      .select(["client_clean"])
      .getAll();

    // Get suppliers requiring review
    const suppliers: any[] = await xata().db.legacy_suppliers
      .filter({ requires_review: true })
      .select(["supplier_clean", "reason"])
      .getAll();

    // Count trades without dates
    const tradesWithoutDates: any[] = await xata().db.legacy_trades
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
    console.error("[getReviewFlags] Error:", error);
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
