/**
 * Club 19 Sales OS - Operations Dashboard
 *
 * Comprehensive, data-rich dashboard for Alys (Operations Manager)
 * Shows detailed analytics, insights, and operational metrics
 */

import { XataClient } from "@/src/xata";
import Link from "next/link";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { DashboardClientWrapper } from "./DashboardClientWrapper";

const xata = new XataClient();

interface OperationsDashboardProps {
  monthParam?: string;
}

// Helper to get date range from monthParam
function getDateRange(monthParam: string = "current") {
  const now = new Date();
  let start: Date;
  let end: Date;

  if (monthParam === "current") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else {
    const [year, month] = monthParam.split("-").map(Number);
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 0, 23, 59, 59);
  }

  return { start, end };
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

// Helper to get month label
function getMonthLabel(monthParam: string = "current") {
  if (monthParam === "current") {
    return new Date().toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });
  }
  const [year, month] = monthParam.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export async function OperationsDashboard({
  monthParam = "current",
}: OperationsDashboardProps) {
  const dateRange = getDateRange(monthParam);
  const monthLabel = getMonthLabel(monthParam);

  // Fetch comprehensive sales data for this month
  const salesQuery = xata.db.Sales.filter({
    sale_date: {
      $ge: dateRange.start,
      $le: dateRange.end,
    },
  }).select([
    "id",
    "sale_date",
    "sale_reference",
    "xero_invoice_number",
    "invoice_status",
    "sale_amount_inc_vat",
    "sale_amount_ex_vat",
    "buy_price",
    "shipping_cost",
    "card_fees",
    "direct_costs",
    "gross_margin",
    "commissionable_margin",
    "commission_locked",
    "commission_paid",
    "brand",
    "category",
    "item_title",
    "shopper.id",
    "shopper.name",
    "buyer.id",
    "buyer.name",
  ]);

  // Limit to 200 sales for dashboard performance
  const sales = await salesQuery.sort("sale_date", "desc").getMany({ pagination: { size: 200 } });

  // Fetch last month's data for comparison
  const lastMonthStart = new Date(dateRange.start);
  lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
  const lastMonthEnd = new Date(dateRange.start);
  lastMonthEnd.setDate(0);
  lastMonthEnd.setHours(23, 59, 59);

  // Limit to 200 for comparison
  const lastMonthSales = await xata.db.Sales
    .filter({
      sale_date: {
        $ge: lastMonthStart,
        $le: lastMonthEnd,
      },
    })
    .select([
      "sale_amount_inc_vat",
      "gross_margin",
      "shopper.id",
      "shopper.name",
    ])
    .getMany({ pagination: { size: 200 } });

  // Fetch YTD data - limit to 500
  const ytdStart = new Date(dateRange.start.getFullYear(), 0, 1);
  const ytdSales = await xata.db.Sales
    .filter({
      sale_date: {
        $ge: ytdStart,
        $le: dateRange.end,
      },
    })
    .select([
      "sale_amount_inc_vat",
      "gross_margin",
      "shopper.id",
      "shopper.name",
    ])
    .getMany({ pagination: { size: 500 } });

  // Fetch recent invoices to calculate outstanding amounts - limit to 500
  const invoices = await xata.db.Sales
    .filter({
      xero_invoice_number: { $isNot: null },
    })
    .select([
      "xero_invoice_number",
      "invoice_status",
      "sale_amount_inc_vat",
      "sale_date",
    ])
    .sort("sale_date", "desc")
    .getMany({ pagination: { size: 500 } });

  // Fetch buyers - limit to 200
  const allBuyers = await xata.db.Buyers.select(["id", "name"]).getMany({ pagination: { size: 200 } });
  const buyerFirstPurchase = new Map<string, Date>();

  // Query unallocated sales (for Xero sync system)
  const unallocatedSales = await xata.db.Sales
    .filter({ needs_allocation: true })
    .select(['id', 'xero_invoice_number', 'sale_date', 'sale_amount_inc_vat', 'buyer_name', 'internal_notes', 'buyer.name'])
    .getMany();

  // Query all shoppers (for allocation dropdown)
  const shoppers = await xata.db.Shoppers
    .select(['id', 'name'])
    .sort('name', 'asc')
    .getMany();

  // Fetch recent sales for buyer analysis - limit to 1000
  const allSalesForBuyers = await xata.db.Sales
    .select(["buyer.id", "sale_date"])
    .sort("sale_date", "asc")
    .getMany({ pagination: { size: 1000 } });

  allSalesForBuyers.forEach((sale) => {
    if (sale.buyer?.id && sale.sale_date) {
      if (!buyerFirstPurchase.has(sale.buyer.id)) {
        buyerFirstPurchase.set(sale.buyer.id, new Date(sale.sale_date));
      }
    }
  });

  // Calculate key metrics
  const totalRevenue = sales.reduce(
    (sum, s) => sum + (s.sale_amount_inc_vat || 0),
    0
  );
  const totalMargin = sales.reduce((sum, s) => sum + (s.gross_margin || 0), 0);
  const avgMarginPercent =
    totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;
  const totalTrades = sales.length;

  // Calculate outstanding invoices
  const outstandingInvoices = invoices.filter(
    (inv) =>
      inv.invoice_status === "AUTHORISED" || inv.invoice_status === "SUBMITTED"
  );
  const outstandingAmount = outstandingInvoices.reduce(
    (sum, inv) => sum + (inv.sale_amount_inc_vat || 0),
    0
  );

  // Calculate overdue invoices (30+ days)
  const now = new Date();
  const overdueInvoices = outstandingInvoices.filter((inv) => {
    const invoiceDate = inv.sale_date;
    if (!invoiceDate) return false;
    const daysSince =
      (now.getTime() - new Date(invoiceDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSince > 30;
  });

  // Calculate commission pending
  const commissionPending = sales.reduce((sum, s) => {
    if (!s.commission_locked && !s.commission_paid) {
      return sum + (s.commissionable_margin || 0);
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
    ytdSales: number;
    ytdMargin: number;
    commissionEarned: number;
    commissionPending: number;
  }

  const shopperPerformance = new Map<string, ShopperPerf>();

  sales.forEach((sale) => {
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
        ytdSales: 0,
        ytdMargin: 0,
        commissionEarned: 0,
        commissionPending: 0,
      });
    }

    const perf = shopperPerformance.get(shopperId)!;
    perf.thisMonthSales += sale.sale_amount_inc_vat || 0;
    perf.thisMonthMargin += sale.gross_margin || 0;
    perf.thisMonthTrades++;

    if (sale.commission_locked || sale.commission_paid) {
      perf.commissionEarned += sale.commissionable_margin || 0;
    } else {
      perf.commissionPending += sale.commissionable_margin || 0;
    }
  });

  // Add last month data
  lastMonthSales.forEach((sale) => {
    const shopperId = sale.shopper?.id || "unassigned";
    if (shopperPerformance.has(shopperId)) {
      const perf = shopperPerformance.get(shopperId)!;
      perf.lastMonthSales += sale.sale_amount_inc_vat || 0;
      perf.lastMonthMargin += sale.gross_margin || 0;
    }
  });

  // Add YTD data
  ytdSales.forEach((sale) => {
    const shopperId = sale.shopper?.id || "unassigned";
    if (shopperPerformance.has(shopperId)) {
      const perf = shopperPerformance.get(shopperId)!;
      perf.ytdSales += sale.sale_amount_inc_vat || 0;
      perf.ytdMargin += sale.gross_margin || 0;
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

  const brandStats = new Map<string, BrandStats>();
  sales.forEach((sale) => {
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
    stats.revenue += sale.sale_amount_inc_vat || 0;
    stats.margin += sale.gross_margin || 0;
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

  const clientStats = new Map<string, ClientStats>();
  sales.forEach((sale) => {
    const buyerId = sale.buyer?.id;
    const buyerName = sale.buyer?.name || "Unknown";
    if (!buyerId) return;

    if (!clientStats.has(buyerId)) {
      const firstPurchase = buyerFirstPurchase.get(buyerId);
      const isNew =
        firstPurchase &&
        firstPurchase >= dateRange.start &&
        firstPurchase <= dateRange.end;

      clientStats.set(buyerId, {
        id: buyerId,
        name: buyerName,
        totalSpend: 0,
        marginGenerated: 0,
        trades: 0,
        isNew: !!isNew,
      });
    }

    const stats = clientStats.get(buyerId)!;
    stats.totalSpend += sale.sale_amount_inc_vat || 0;
    stats.marginGenerated += sale.gross_margin || 0;
    stats.trades++;
  });

  const top10Clients = Array.from(clientStats.values())
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 10);

  // Calculate repeat client rate
  const repeatClients = Array.from(clientStats.values()).filter(
    (c) => c.trades > 1
  ).length;
  const repeatClientRate =
    clientStats.size > 0 ? (repeatClients / clientStats.size) * 100 : 0;

  // Invoice status breakdown
  const invoicesByStatus = {
    draft: invoices.filter((inv) => inv.invoice_status === "DRAFT"),
    awaiting: invoices.filter(
      (inv) =>
        inv.invoice_status === "AUTHORISED" || inv.invoice_status === "SUBMITTED"
    ),
    overdue: overdueInvoices,
    paid: invoices.filter((inv) => inv.invoice_status === "PAID"),
  };

  // Financial breakdown
  const totalBuyCosts = sales.reduce((sum, s) => sum + (s.buy_price || 0), 0);
  const totalShipping = sales.reduce(
    (sum, s) => sum + (s.shipping_cost || 0),
    0
  );
  const totalCardFees = sales.reduce((sum, s) => sum + (s.card_fees || 0), 0);
  const totalDirectCosts = sales.reduce(
    (sum, s) => sum + (s.direct_costs || 0),
    0
  );
  const vatAmount = totalRevenue - sales.reduce((sum, s) => sum + (s.sale_amount_ex_vat || 0), 0);
  const netRevenue = sales.reduce((sum, s) => sum + (s.sale_amount_ex_vat || 0), 0);
  const marginAfterCosts =
    totalMargin - totalShipping - totalCardFees - totalDirectCosts;
  const commissionPool = sales.reduce(
    (sum, s) => sum + (s.commissionable_margin || 0),
    0
  );

  // Commission tracking
  const commissionLocked = sales.reduce((sum, s) => {
    if (s.commission_locked) return sum + (s.commissionable_margin || 0);
    return sum;
  }, 0);
  const commissionPaid = sales.reduce((sum, s) => {
    if (s.commission_paid) return sum + (s.commissionable_margin || 0);
    return sum;
  }, 0);
  const totalCommissionLiability = commissionPending + commissionLocked;
  const commissionAsPercentOfMargin =
    totalMargin > 0 ? (commissionPool / totalMargin) * 100 : 0;

  // Data quality alerts
  const salesMissingShopper = sales.filter((s) => !s.shopper?.id);
  const salesZeroMargin = sales.filter((s) => (s.gross_margin || 0) === 0);
  const stuckDraftInvoices = invoices.filter((inv) => {
    if (inv.invoice_status !== "DRAFT") return false;
    const invoiceDate = inv.sale_date;
    if (!invoiceDate) return false;
    const daysSince =
      (now.getTime() - new Date(invoiceDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSince > 7;
  });

  // Last month comparison for key metrics
  const lastMonthRevenue = lastMonthSales.reduce(
    (sum, s) => sum + (s.sale_amount_inc_vat || 0),
    0
  );
  const lastMonthMargin = lastMonthSales.reduce(
    (sum, s) => sum + (s.gross_margin || 0),
    0
  );
  const revenueChange =
    lastMonthRevenue > 0
      ? ((totalRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
      : 0;
  const marginChange =
    lastMonthMargin > 0
      ? ((totalMargin - lastMonthMargin) / lastMonthMargin) * 100
      : 0;

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

      {/* Xero Sync Controls and Unallocated Invoices */}
      <DashboardClientWrapper
        unallocatedSales={unallocatedSales}
        shoppers={shoppers}
      />

      {/* SECTION 1: Key Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-xs font-medium text-gray-500 mb-1">
            Total Revenue
          </h3>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(totalRevenue)}
          </p>
          {revenueChange !== 0 && (
            <p
              className={`text-xs mt-1 ${
                revenueChange > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {revenueChange > 0 ? "+" : ""}
              {revenueChange.toFixed(1)}% vs last month
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
          {marginChange !== 0 && (
            <p
              className={`text-xs mt-1 ${
                marginChange > 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {marginChange > 0 ? "+" : ""}
              {marginChange.toFixed(1)}% vs last month
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
            const salesChange =
              shopper.lastMonthSales > 0
                ? ((shopper.thisMonthSales - shopper.lastMonthSales) /
                    shopper.lastMonthSales) *
                  100
                : 0;

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
                  <div className="flex justify-between">
                    <span className="text-gray-600">Margin:</span>
                    <span className="font-semibold text-green-600">
                      {formatCurrency(shopper.thisMonthMargin)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trades:</span>
                    <span className="font-semibold">
                      {shopper.thisMonthTrades}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Avg Deal:</span>
                    <span className="font-semibold">
                      {formatCurrency(avgDealSize)}
                    </span>
                  </div>
                  {salesChange !== 0 && (
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-gray-600">vs Last Month:</span>
                      <span
                        className={`font-semibold ${
                          salesChange > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {salesChange > 0 ? "+" : ""}
                        {formatPercent(salesChange)}
                      </span>
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
                  (sum, inv) => sum + (inv.sale_amount_inc_vat || 0),
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
                    const invoiceDate = inv.sale_date;
                    const daysOverdue = invoiceDate
                      ? Math.floor(
                          (now.getTime() - new Date(invoiceDate).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 0;
                    return (
                      <tr key={inv.xero_invoice_number} className="hover:bg-red-50">
                        <td className="px-3 py-2 text-sm font-medium">
                          {inv.xero_invoice_number}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">
                          {formatDate(invoiceDate)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right font-semibold">
                          {formatCurrency(inv.sale_amount_inc_vat || 0)}
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
              {sales.slice(0, 20).map((sale) => {
                const marginPercent =
                  sale.sale_amount_inc_vat && sale.sale_amount_inc_vat > 0
                    ? ((sale.gross_margin || 0) / sale.sale_amount_inc_vat) *
                      100
                    : 0;
                return (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(sale.sale_date)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">
                      {sale.xero_invoice_number || sale.sale_reference || "—"}
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
                        {sale.item_title || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-semibold">
                      {formatCurrency(sale.sale_amount_inc_vat || 0)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="text-green-600 font-semibold">
                        {formatCurrency(sale.gross_margin || 0)}
                      </div>
                      <div className="text-gray-500 text-xs">
                        {formatPercent(marginPercent)}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          sale.invoice_status === "PAID"
                            ? "bg-green-100 text-green-800"
                            : sale.invoice_status === "AUTHORISED"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {sale.invoice_status || "—"}
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
            ⚠️ Data Quality Alerts
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
