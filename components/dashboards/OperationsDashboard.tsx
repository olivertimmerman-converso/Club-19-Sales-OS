/**
 * Club 19 Sales OS - Operations Dashboard
 *
 * Comprehensive, data-rich dashboard for Alys (Operations Manager)
 * Shows detailed analytics, insights, and operational metrics
 */

// ORIGINAL XATA: import { XataClient } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers, buyers } from "@/db/schema";
import { eq, and, gte, lte, desc, asc, isNotNull, isNull, or, sql } from "drizzle-orm";
import Link from "next/link";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange, formatMonthLabel } from "@/lib/dateUtils";
// import { DashboardClientWrapper } from "./DashboardClientWrapper"; // Temporarily disabled

// ORIGINAL XATA: const xata = new XataClient();

interface OperationsDashboardProps {
  monthParam?: string;
}

// Helper to format currency
const formatCurrency = (amount: number) => {
  return `£${amount.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

// Helper to format percentage
const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`;
};

// Helper to format date
const formatDate = (date: Date | null | string | undefined) => {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};


export async function OperationsDashboard({
  monthParam = "current",
}: OperationsDashboardProps) {
  // Use shared date utility — handles "current", "last", "YYYY-MM", and "all"
  // Fall back to current month if null (all time) since this dashboard needs concrete date boundaries
  const now = new Date();
  const dateRange = getMonthDateRange(monthParam) ?? {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
  const monthLabel = formatMonthLabel(monthParam);

  // Pre-compute date ranges before parallel queries
  const lastMonthStart = new Date(dateRange.start);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthEnd = new Date(dateRange.start);
  lastMonthEnd.setDate(0);
  lastMonthEnd.setHours(23, 59, 59);

  const ytdStart = new Date(dateRange.start.getFullYear(), 0, 1);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Floor date: exclude all legacy data before 2026
  const dataFloorDate = new Date(2026, 0, 1);

  // Commission timing helper: prefer completedAt, fall back to saleDate for legacy data
  const commissionDateFilter = (start: Date, end: Date) => or(
    and(gte(sales.completedAt, start), lte(sales.completedAt, end)),
    and(isNull(sales.completedAt), gte(sales.saleDate, start), lte(sales.saleDate, end))
  );

  // Run ALL queries in parallel to avoid sequential timeout
  const [
    allSalesRaw,
    lastMonthSalesRaw,
    ytdSalesRaw,
    invoicesRaw,
    allBuyers,
    unallocatedCountResult,
    incompleteCountResult,
    completedTodayCountResult,
    allSalesForBuyersRaw,
  ] = await Promise.all([
    // 1. Monthly sales
    db.query.sales.findMany({
      where: commissionDateFilter(dateRange.start, dateRange.end),
      with: { shopper: true, buyer: true },
      orderBy: [desc(sales.saleDate)],
      limit: 200,
    }),
    // 2. Last month sales
    db.query.sales.findMany({
      where: commissionDateFilter(lastMonthStart, lastMonthEnd),
      with: { shopper: true },
      limit: 200,
    }),
    // 3. YTD sales
    db.query.sales.findMany({
      where: commissionDateFilter(ytdStart, dateRange.end),
      with: { shopper: true },
      limit: 500,
    }),
    // 4. Recent invoices (2026 onwards only)
    db.query.sales.findMany({
      where: and(isNotNull(sales.xeroInvoiceNumber), gte(sales.saleDate, dataFloorDate)),
      orderBy: [desc(sales.saleDate)],
      limit: 500,
    }),
    // 5. All buyers
    db.query.buyers.findMany({ limit: 200 }),
    // 6. Pipeline: unallocated count (SQL COUNT instead of fetching all rows)
    // Excludes pre-2026 legacy data
    db.select({ count: sql<number>`count(*)` }).from(sales).where(
      and(
        eq(sales.needsAllocation, true),
        isNull(sales.deletedAt),
        or(eq(sales.dismissed, false), isNull(sales.dismissed)),
        gte(sales.saleDate, dataFloorDate)
      )
    ),
    // 7. Pipeline: incomplete count (SQL COUNT instead of fetching all rows)
    // Excludes pre-2026 legacy data
    db.select({ count: sql<number>`count(*)` }).from(sales).where(
      and(
        isNull(sales.deletedAt),
        isNotNull(sales.shopperId),
        gte(sales.saleDate, dataFloorDate),
        or(
          eq(sales.buyPrice, 0),
          isNull(sales.buyPrice),
          isNull(sales.supplierId),
          isNull(sales.brand),
          eq(sales.brand, "Unknown")
        )
      )
    ),
    // 8. Pipeline: completed today count (SQL COUNT instead of fetching all rows)
    db.select({ count: sql<number>`count(*)` }).from(sales).where(
      and(
        isNull(sales.deletedAt),
        gte(sales.completedAt, todayStart),
        lte(sales.completedAt, todayEnd)
      )
    ),
    // 9. All sales for buyer analysis
    db.query.sales.findMany({
      with: { buyer: true },
      orderBy: [asc(sales.saleDate)],
      limit: 1000,
    }),
  ]);

  // Filter out xero_import, deleted, and ongoing sales in JavaScript
  const salesData = allSalesRaw.filter(sale =>
    sale.source !== 'xero_import' && !sale.deletedAt && sale.status !== 'ongoing'
  );

  const lastMonthSales = lastMonthSalesRaw.filter(sale =>
    sale.source !== 'xero_import' && !sale.deletedAt && sale.status !== 'ongoing'
  );

  const ytdSales = ytdSalesRaw.filter(sale =>
    sale.source !== 'xero_import' && !sale.deletedAt && sale.status !== 'ongoing'
  );

  const invoices = invoicesRaw.filter(sale =>
    sale.source !== 'xero_import' && !sale.deletedAt
  );

  const pipelineStats = {
    unallocated: Number(unallocatedCountResult[0]?.count ?? 0),
    incomplete: Number(incompleteCountResult[0]?.count ?? 0),
    completedToday: Number(completedTodayCountResult[0]?.count ?? 0),
  };

  const buyerFirstPurchase = new Map<string, Date>();

  const allSalesForBuyers = allSalesForBuyersRaw.filter(sale =>
    sale.source !== 'xero_import' && !sale.deletedAt
  );

  allSalesForBuyers.forEach((sale) => {
    if (sale.buyer?.id && sale.saleDate) {
      if (!buyerFirstPurchase.has(sale.buyer.id)) {
        buyerFirstPurchase.set(sale.buyer.id, new Date(sale.saleDate));
      }
    }
  });

  // Calculate key metrics
  const revenue = salesData.reduce((sum, s) => sum + (s.saleAmountIncVat || 0), 0);
  const margin = salesData.reduce((sum, s) => sum + (s.grossMargin || 0), 0);
  const totalRevenue = revenue;
  const totalMargin = margin;
  const avgMarginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;
  const totalTrades = salesData.length;

  // Calculate outstanding invoices
  const outstanding = invoices.filter(
    (inv) =>
      inv.invoiceStatus === "AUTHORISED" || inv.invoiceStatus === "SUBMITTED"
  );
  const outstandingInvoices = outstanding;
  const outstandingAmount = outstanding.reduce(
    (sum, inv) => sum + (inv.saleAmountIncVat || 0),
    0
  );

  // Calculate overdue invoices (30+ days)
  const overdueInvoices = outstandingInvoices.filter((inv) => {
    const invoiceDate = inv.saleDate;
    if (!invoiceDate) return false;
    const daysSince =
      (now.getTime() - new Date(invoiceDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSince > 30;
  });

  // Calculate commission pending
  const commissionPending = salesData.reduce((sum, s) => {
    if (!s.commissionLocked && !s.commissionPaid) {
      return sum + (s.commissionableMargin || 0);
    }
    return sum;
  }, 0);

  // Shopper performance
  interface ShopperPerf {
    id: string;
    name: string;
    thisMonthSales: number;
    thisMonthMargin: number;
    thisMonthTrades: number;
    lastMonthSales: number;
    lastMonthMargin: number;
    lastMonthTrades: number;
    ytdSales: number;
    ytdMargin: number;
    commissionEarned: number;
    commissionPending: number;
  }

  // Calculate shopper performance
  const shopperPerformance = new Map<string, ShopperPerf>();

  salesData.forEach((sale) => {
    const shopperId = sale.shopper?.id || "unassigned";
    const shopperName = sale.shopper?.name || "Unassigned";

    if (!shopperPerformance.has(shopperId)) {
      shopperPerformance.set(shopperId, {
        id: shopperId,
        name: shopperName,
        thisMonthSales: 0,
        thisMonthMargin: 0,
        thisMonthTrades: 0,
        lastMonthSales: 0,
        lastMonthMargin: 0,
        lastMonthTrades: 0,
        ytdSales: 0,
        ytdMargin: 0,
        commissionEarned: 0,
        commissionPending: 0,
      });
    }

    const perf = shopperPerformance.get(shopperId)!;
    perf.thisMonthSales += sale.saleAmountIncVat || 0;
    perf.thisMonthMargin += sale.grossMargin || 0;
    perf.thisMonthTrades++;

    if (sale.commissionLocked || sale.commissionPaid) {
      perf.commissionEarned += sale.commissionableMargin || 0;
    } else {
      perf.commissionPending += sale.commissionableMargin || 0;
    }
  });

  // Add last month data
  lastMonthSales.forEach((sale) => {
    const shopperId = sale.shopper?.id || "unassigned";
    if (shopperPerformance.has(shopperId)) {
      const perf = shopperPerformance.get(shopperId)!;
      perf.lastMonthSales += sale.saleAmountIncVat || 0;
      perf.lastMonthMargin += sale.grossMargin || 0;
      perf.lastMonthTrades++;
    }
  });

  // Add YTD data
  ytdSales.forEach((sale) => {
    const shopperId = sale.shopper?.id || "unassigned";
    if (shopperPerformance.has(shopperId)) {
      const perf = shopperPerformance.get(shopperId)!;
      perf.ytdSales += sale.saleAmountIncVat || 0;
      perf.ytdMargin += sale.grossMargin || 0;
    }
  });

  const shopperPerfArray = Array.from(shopperPerformance.values()).sort(
    (a, b) => b.thisMonthSales - a.thisMonthSales
  );

  // Sales by brand
  interface BrandStats {
    brand: string;
    revenue: number;
    margin: number;
    tradeCount: number;
  }

  // Calculate brand stats
  const brandStats = new Map<string, BrandStats>();
  salesData.forEach((sale) => {
    const brand = sale.brand || "Unknown";
    if (!brandStats.has(brand)) {
      brandStats.set(brand, {
        brand,
        revenue: 0,
        margin: 0,
        tradeCount: 0,
      });
    }
    const stats = brandStats.get(brand)!;
    stats.revenue += sale.saleAmountIncVat || 0;
    stats.margin += sale.grossMargin || 0;
    stats.tradeCount++;
  });

  const brandStatsArray = Array.from(brandStats.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  // Client analysis - top 10 clients this month
  interface ClientStats {
    id: string;
    name: string;
    totalSpend: number;
    marginGenerated: number;
    trades: number;
    isNew: boolean;
  }

  // Calculate client stats
  const clientStatsMap = new Map<string, ClientStats>();
  salesData.forEach((sale) => {
    const buyerId = sale.buyer?.id;
    const buyerName = sale.buyer?.name || "Unknown";
    if (!buyerId) return;

    if (!clientStatsMap.has(buyerId)) {
      const firstPurchase = buyerFirstPurchase.get(buyerId);
      const isNew =
        firstPurchase &&
        firstPurchase >= dateRange.start &&
        firstPurchase <= dateRange.end;

      clientStatsMap.set(buyerId, {
        id: buyerId,
        name: buyerName,
        totalSpend: 0,
        marginGenerated: 0,
        trades: 0,
        isNew: !!isNew,
      });
    }

    const stats = clientStatsMap.get(buyerId)!;
    stats.totalSpend += sale.saleAmountIncVat || 0;
    stats.marginGenerated += sale.grossMargin || 0;
    stats.trades++;
  });

  const top10Clients = Array.from(clientStatsMap.values())
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

  const repeatClients = Array.from(clientStatsMap.values()).filter(
    (c) => c.trades > 1
  ).length;
  const repeatClientRate =
    clientStatsMap.size > 0 ? (repeatClients / clientStatsMap.size) * 100 : 0;

  // Invoice status breakdown
  const invoicesByStatus = {
    draft: invoices.filter((inv) => inv.invoiceStatus === "DRAFT"),
    awaiting: invoices.filter(
      (inv) =>
        inv.invoiceStatus === "AUTHORISED" || inv.invoiceStatus === "SUBMITTED"
    ),
    overdue: overdueInvoices,
    paid: invoices.filter((inv) => inv.invoiceStatus === "PAID"),
  };

  // Financial breakdown
  const totalBuyCosts = salesData.reduce((sum, s) => sum + (s.buyPrice || 0), 0);
  const totalShipping = salesData.reduce(
    (sum, s) => sum + (s.shippingCost || 0),
    0
  );
  const totalCardFees = salesData.reduce((sum, s) => sum + (s.cardFees || 0), 0);
  const totalDirectCosts = salesData.reduce(
    (sum, s) => sum + (s.directCosts || 0),
    0
  );
  const vatAmount = totalRevenue - salesData.reduce((sum, s) => sum + (s.saleAmountExVat || 0), 0);
  const netRevenue = salesData.reduce((sum, s) => sum + (s.saleAmountExVat || 0), 0);
  const marginAfterCosts =
    totalMargin - totalShipping - totalCardFees - totalDirectCosts;
  const commissionPool = salesData.reduce(
    (sum, s) => sum + (s.commissionableMargin || 0),
    0
  );

  // Commission tracking
  const commissionLocked = salesData.reduce((sum, s) => {
    if (s.commissionLocked) return sum + (s.commissionableMargin || 0);
    return sum;
  }, 0);
  const commissionPaid = salesData.reduce((sum, s) => {
    if (s.commissionPaid) return sum + (s.commissionableMargin || 0);
    return sum;
  }, 0);
  const totalCommissionLiability = commissionPending + commissionLocked;
  const commissionAsPercentOfMargin =
    totalMargin > 0 ? (commissionPool / totalMargin) * 100 : 0;

  // Data quality alerts
  const salesMissingShopper = salesData.filter((s) => !s.shopper?.id);
  const salesZeroMargin = salesData.filter((s) => (s.grossMargin || 0) === 0);
  const stuckDraftInvoices = invoices.filter((inv) => {
    if (inv.invoiceStatus !== "DRAFT") return false;
    const invoiceDate = inv.saleDate;
    if (!invoiceDate) return false;
    const daysSince =
      (now.getTime() - new Date(invoiceDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSince > 7;
  });

  // Last month comparison for key metrics
  const lastMonthRevenue = lastMonthSales.reduce(
    (sum, s) => sum + (s.saleAmountIncVat || 0),
    0
  );
  const lastMonthMargin = lastMonthSales.reduce(
    (sum, s) => sum + (s.grossMargin || 0),
    0
  );
  // Compute percentage change with SuperadminDashboard-style safeguards:
  // - Returns null when baseline is zero and current is also zero
  // - Returns "new" when baseline is zero but current > 0
  // - Returns null when baseline is below minimum threshold
  // - Returns 0 for changes < 0.5% (shown as "No change")
  const getChange = (current: number, previous: number, isCurrency: boolean = false): { type: 'percent'; value: number } | { type: 'new' } | { type: 'no_change' } | null => {
    if (previous === 0 && current === 0) return null;
    if (previous === 0 && current > 0) return { type: 'new' };
    const minBaseline = isCurrency ? 1000 : 5;
    if (previous < minBaseline) return null;
    const pct = ((current - previous) / previous) * 100;
    if (Math.abs(pct) < 0.5) return { type: 'no_change' };
    return { type: 'percent', value: pct };
  };

  const totalRevenueChange = getChange(totalRevenue, lastMonthRevenue, true);
  const totalMarginChange = getChange(totalMargin, lastMonthMargin, true);

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Operations Dashboard
          </h1>
          <p className="text-sm text-gray-600">{monthLabel} · Detailed Analytics</p>
        </div>
        <MonthPicker />
      </div>

      {/* PIPELINE SUMMARY */}
      <div className="grid grid-cols-3 gap-4">
        <Link
          href="/admin/sync"
          className="bg-amber-50 border border-amber-200 rounded-lg p-4 hover:border-amber-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-medium text-amber-700 mb-1">Unallocated</h3>
              <p className="text-2xl font-bold text-amber-900">{pipelineStats.unallocated}</p>
            </div>
            <span className="text-amber-400 text-sm">→</span>
          </div>
          <p className="text-xs text-amber-600 mt-1">Pending assignment</p>
          <p className="text-[10px] text-amber-400 mt-0.5">Since Jan 2026</p>
        </Link>

        <Link
          href="/sales?status=needs-attention"
          className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:border-slate-300 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-medium text-slate-700 mb-1">Incomplete</h3>
              <p className="text-2xl font-bold text-slate-900">{pipelineStats.incomplete}</p>
            </div>
            <span className="text-slate-400 text-sm">→</span>
          </div>
          <p className="text-xs text-slate-600 mt-1">Missing data</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Since Jan 2026</p>
        </Link>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-medium text-green-700 mb-1">Completed Today</h3>
              <p className="text-2xl font-bold text-green-900">{pipelineStats.completedToday}</p>
            </div>
            <span className="text-green-400">✓</span>
          </div>
          <p className="text-xs text-green-600 mt-1">Data finalized</p>
          <p className="text-[10px] text-green-400 mt-0.5">Today</p>
        </div>
      </div>

      {/* SECTION 1: Key Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">
            Total Revenue
          </h3>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(totalRevenue)}
          </p>
          {totalRevenueChange?.type === 'new' && (
            <p className="text-xs mt-1 text-green-600">New this month</p>
          )}
          {totalRevenueChange?.type === 'no_change' && (
            <p className="text-xs mt-1 text-gray-500">No change vs last month</p>
          )}
          {totalRevenueChange?.type === 'percent' && (
            <p className={`text-xs mt-1 ${totalRevenueChange.value > 0 ? "text-green-600" : "text-red-600"}`}>
              {totalRevenueChange.value > 0 ? "+" : ""}{totalRevenueChange.value.toFixed(1)}% vs last month
            </p>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">
            Total Margin
          </h3>
          <p className="text-xl font-bold text-purple-600">
            {formatCurrency(totalMargin)}
          </p>
          {totalMarginChange?.type === 'new' && (
            <p className="text-xs mt-1 text-green-600">New this month</p>
          )}
          {totalMarginChange?.type === 'no_change' && (
            <p className="text-xs mt-1 text-gray-500">No change vs last month</p>
          )}
          {totalMarginChange?.type === 'percent' && (
            <p className={`text-xs mt-1 ${totalMarginChange.value > 0 ? "text-green-600" : "text-red-600"}`}>
              {totalMarginChange.value > 0 ? "+"  : ""}{totalMarginChange.value.toFixed(1)}% vs last month
            </p>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">Avg Margin %</h3>
          <p className="text-xl font-bold text-gray-900">
            {formatPercent(avgMarginPercent)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">Total Trades</h3>
          <p className="text-xl font-bold text-gray-900">{totalTrades}</p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">
            Outstanding
          </h3>
          <p className="text-xl font-bold text-orange-600">
            {formatCurrency(outstandingAmount)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {outstandingInvoices.length} invoices
          </p>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">
            Commission Pending
          </h3>
          <p className="text-xl font-bold text-blue-600">
            {formatCurrency(commissionPending)}
          </p>
        </div>
      </div>

      {/* SECTION 2: Shopper Performance Comparison */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Shopper Performance Comparison
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shopperPerfArray.map((shopper) => {
            const avgDealSize =
              shopper.thisMonthTrades > 0
                ? shopper.thisMonthSales / shopper.thisMonthTrades
                : 0;
            const lastMonthAvgDeal =
              shopper.lastMonthTrades > 0
                ? shopper.lastMonthSales / shopper.lastMonthTrades
                : 0;

            const salesChange = getChange(shopper.thisMonthSales, shopper.lastMonthSales, true);
            const marginChange = getChange(shopper.thisMonthMargin, shopper.lastMonthMargin, true);
            const tradesChange = getChange(shopper.thisMonthTrades, shopper.lastMonthTrades, false);
            const avgDealChange = getChange(avgDealSize, lastMonthAvgDeal, true);

            const renderChange = (change: ReturnType<typeof getChange>) => {
              if (!change) return null;
              if (change.type === 'new') return <span className="font-semibold text-green-600">New this month</span>;
              if (change.type === 'no_change') return <span className="text-gray-500">No change</span>;
              return (
                <span className={`font-semibold ${change.value > 0 ? "text-green-600" : "text-red-600"}`}>
                  {change.value > 0 ? "+" : ""}{formatPercent(change.value)}
                </span>
              );
            };

            return (
              <div
                key={shopper.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
              >
                <h3 className="font-semibold text-gray-900 mb-3">
                  {shopper.name}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">This Month Sales:</span>
                    <span className="font-semibold">
                      {formatCurrency(shopper.thisMonthSales)}
                    </span>
                  </div>
                  {salesChange && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">vs Last Month:</span>
                      {renderChange(salesChange)}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Margin:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(shopper.thisMonthMargin)}
                    </span>
                  </div>
                  {marginChange && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">vs Last Month:</span>
                      {renderChange(marginChange)}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trades:</span>
                    <span className="font-semibold">
                      {shopper.thisMonthTrades}
                    </span>
                  </div>
                  {tradesChange && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">vs Last Month:</span>
                      {renderChange(tradesChange)}
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Deal:</span>
                    <span className="font-semibold">
                      {formatCurrency(avgDealSize)}
                    </span>
                  </div>
                  {avgDealChange && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">vs Last Month:</span>
                      {renderChange(avgDealChange)}
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-gray-600">YTD Sales:</span>
                    <span className="font-semibold">
                      {formatCurrency(shopper.ytdSales)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Commission Earned:</span>
                    <span className="font-semibold text-blue-600">
                      {formatCurrency(shopper.commissionEarned)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Commission Pending:</span>
                    <span className="font-semibold text-orange-600">
                      {formatCurrency(shopper.commissionPending)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: Sales by Brand */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Sales by Brand (This Month)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Brand
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Revenue
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Margin
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Margin %
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Trades
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {brandStatsArray.map((brand) => {
                const marginPercent =
                  brand.revenue > 0 ? (brand.margin / brand.revenue) * 100 : 0;
                return (
                  <tr key={brand.brand} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">
                      {brand.brand}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">
                      {formatCurrency(brand.revenue)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-green-600 font-semibold">
                      {formatCurrency(brand.margin)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      {formatPercent(marginPercent)}
                    </td>
                    <td className="px-4 py-2 text-sm text-center">
                      {brand.tradeCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: Client Analysis */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Top 10 Clients (This Month)
          </h2>
          <div className="text-sm text-gray-600">
            Repeat Rate: <span className="font-semibold">{formatPercent(repeatClientRate)}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Total Spend
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Margin Generated
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Trades
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Avg Order
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {top10Clients.map((client) => {
                const avgOrder = client.totalSpend / client.trades;
                return (
                  <tr key={client.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm">
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-purple-600 hover:text-purple-900"
                      >
                        {client.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">
                      {formatCurrency(client.totalSpend)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-green-600 font-semibold">
                      {formatCurrency(client.marginGenerated)}
                    </td>
                    <td className="px-4 py-2 text-sm text-center">
                      {client.trades}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">
                      {formatCurrency(avgOrder)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {client.isNew ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          New
                        </span>
                      ) : client.trades > 1 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Repeat
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 5: Invoice & Payment Status */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Invoice & Payment Status
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">Draft</h3>
            <p className="text-2xl font-bold text-gray-700">
              {invoicesByStatus.draft.length}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">
              Awaiting Payment
            </h3>
            <p className="text-2xl font-bold text-orange-600">
              {invoicesByStatus.awaiting.length}
            </p>
            <p className="text-xs text-gray-500">
              {formatCurrency(outstandingAmount)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">
              Overdue (30+ days)
            </h3>
            <p className="text-2xl font-bold text-red-600">
              {invoicesByStatus.overdue.length}
            </p>
            <p className="text-xs text-gray-500">
              {formatCurrency(
                invoicesByStatus.overdue.reduce(
                  (sum, inv) => sum + (inv.saleAmountIncVat || 0),
                  0
                )
              )}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">Paid</h3>
            <p className="text-2xl font-bold text-green-600">
              {invoicesByStatus.paid.length}
            </p>
          </div>
        </div>

        {/* Overdue invoices list */}
        {overdueInvoices.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-red-900 mb-2">
              Overdue Invoices
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-red-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                      Invoice #
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-600">
                      Date
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-600">
                      Days Overdue
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {overdueInvoices.slice(0, 10).map((inv) => {
                    const invoiceDate = inv.saleDate;
                    const daysOverdue = invoiceDate
                      ? Math.floor(
                          (now.getTime() - new Date(invoiceDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 0;
                    return (
                      <tr key={inv.xeroInvoiceNumber} className="hover:bg-red-50">
                        <td className="px-3 py-2 text-sm font-medium">
                          {inv.xeroInvoiceNumber}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {formatDate(invoiceDate)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-semibold">
                          {formatCurrency(inv.saleAmountIncVat || 0)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-red-600 font-semibold">
                          {daysOverdue} days
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 6: Financial Deep Dive */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Financial Deep Dive
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Revenue breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Revenue Breakdown
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Revenue:</span>
                <span className="font-semibold">
                  {formatCurrency(totalRevenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">VAT:</span>
                <span className="font-semibold">
                  {formatCurrency(vatAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-gray-600">Net Revenue:</span>
                <span className="font-semibold">
                  {formatCurrency(netRevenue)}
                </span>
              </div>
            </div>
          </div>

          {/* Cost breakdown */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Cost Breakdown
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Buy Costs:</span>
                <span className="font-semibold">
                  {formatCurrency(totalBuyCosts)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping:</span>
                <span className="font-semibold">
                  {formatCurrency(totalShipping)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Card Fees:</span>
                <span className="font-semibold">
                  {formatCurrency(totalCardFees)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Direct Costs:</span>
                <span className="font-semibold">
                  {formatCurrency(totalDirectCosts)}
                </span>
              </div>
            </div>
          </div>

          {/* Margin analysis */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Margin Analysis
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Gross Margin:</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(totalMargin)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">After Costs:</span>
                <span className="font-semibold text-green-600">
                  {formatCurrency(marginAfterCosts)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-gray-600">Commission Pool:</span>
                <span className="font-semibold text-blue-600">
                  {formatCurrency(commissionPool)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 7: Commission Tracking */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Commission Tracking
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">Pending</h3>
            <p className="text-xl font-bold text-orange-600">
              {formatCurrency(commissionPending)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">Locked</h3>
            <p className="text-xl font-bold text-blue-600">
              {formatCurrency(commissionLocked)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">Paid</h3>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(commissionPaid)}
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3">
            <h3 className="text-xs font-medium text-gray-500 mb-1">
              Total Liability
            </h3>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(totalCommissionLiability)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatPercent(commissionAsPercentOfMargin)} of margin
            </p>
          </div>
        </div>

        {/* By shopper */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Shopper
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Pending
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Earned
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {shopperPerfArray.map((shopper) => {
                const total =
                  shopper.commissionPending + shopper.commissionEarned;
                return (
                  <tr key={shopper.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium">
                      {shopper.name}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-orange-600">
                      {formatCurrency(shopper.commissionPending)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-green-600">
                      {formatCurrency(shopper.commissionEarned)}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-semibold">
                      {formatCurrency(total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 8: Recent Activity Feed */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Activity (Last 20 Sales)
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Invoice #
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Shopper
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Client
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Item
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Sale
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Margin
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {salesData.slice(0, 20).map((sale) => {
                const marginPercent =
                  sale.saleAmountIncVat && sale.saleAmountIncVat > 0
                    ? ((sale.grossMargin || 0) / sale.saleAmountIncVat) *
                      100
                    : 0;
                return (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(sale.saleDate)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {sale.xeroInvoiceNumber || sale.saleReference || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sale.shopper?.name || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {sale.buyer?.name || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-xs truncate">
                        {sale.brand && <span className="font-medium">{sale.brand} </span>}
                        {sale.itemTitle || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">
                      {formatCurrency(sale.saleAmountIncVat || 0)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="text-green-600 font-semibold">
                        {formatCurrency(sale.grossMargin || 0)}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {formatPercent(marginPercent)}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          sale.invoiceStatus === "PAID"
                            ? "bg-green-100 text-green-800"
                            : sale.invoiceStatus === "AUTHORISED"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {sale.invoiceStatus || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <Link
                        href={`/sales/${sale.id}`}
                        className="text-purple-600 hover:text-purple-900 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 9: Data Quality Alerts */}
      {(salesMissingShopper.length > 0 ||
        salesZeroMargin.length > 0 ||
        stuckDraftInvoices.length > 0) && (
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-5">
          <h2 className="text-lg font-semibold text-yellow-900 mb-4">
            Data Quality Alerts
          </h2>
          <div className="space-y-3">
            {salesMissingShopper.length > 0 && (
              <div className="bg-white rounded p-3 border border-yellow-200">
                <p className="text-sm font-semibold text-yellow-900">
                  {salesMissingShopper.length} sales missing shopper assignment
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  These sales need to be assigned to a shopper for accurate
                  reporting.
                </p>
              </div>
            )}
            {salesZeroMargin.length > 0 && (
              <div className="bg-white rounded p-3 border border-yellow-200">
                <p className="text-sm font-semibold text-yellow-900">
                  {salesZeroMargin.length} sales with £0 margin
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Review these sales to ensure pricing is correct.
                </p>
              </div>
            )}
            {stuckDraftInvoices.length > 0 && (
              <div className="bg-white rounded p-3 border border-yellow-200">
                <p className="text-sm font-semibold text-yellow-900">
                  {stuckDraftInvoices.length} invoices stuck in Draft for 7+
                  days
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  These invoices may need to be submitted or cancelled.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
