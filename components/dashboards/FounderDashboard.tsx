/**
 * Club 19 Sales OS - Founder Dashboard (Sophie's View)
 *
 * Sales Manager dashboard focused on:
 * - Month-end review
 * - Shopper performance tracking
 * - Export to bookkeeper
 */

import Link from "next/link";
// ORIGINAL XATA: import { XataClient } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers, buyers } from "@/db/schema";
import { eq, and, or, gte, lte, desc, ne, isNull, isNotNull } from "drizzle-orm";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange, formatMonthLabel } from "@/lib/dateUtils";
import { effectiveInvoiceValue } from "@/lib/economics";
import * as logger from '@/lib/logger';

// ORIGINAL XATA: const xata = new XataClient();

interface FounderDashboardProps {
  monthParam?: string;
}

interface ShopperPerformance {
  name: string;
  thisMonthSales: number;
  margin: number;
  marginPercent: number;
  commission: number;
  ytdSales: number;
}

interface TopClient {
  id: string;
  name: string;
  totalSpend: number;
  purchaseCount: number;
}

export async function FounderDashboard({ monthParam = "current" }: FounderDashboardProps) {
  try {
    logger.info('DASHBOARD', 'Rendering FounderDashboard', { monthParam });

    // Get date range for filtering
    const dateRange = getMonthDateRange(monthParam);
    const monthLabel = formatMonthLabel(monthParam);
    logger.info('DASHBOARD', 'Date range calculated', { dateRange: dateRange as any });

    // ORIGINAL XATA:
    // let salesQuery = xata.db.Sales
    // .select([
    //   'id',
    //   'sale_date',
    //   'sale_reference',
    //   'item_title',
    //   'brand',
    //   'sale_amount_inc_vat',
    //   'buy_price',
    //   'shipping_cost',
    //   'card_fees',
    //   'direct_costs',
    //   'gross_margin',
    //   'commissionable_margin',
    //   'commission_locked',
    //   'commission_paid',
    //   'shopper.id',
    //   'shopper.name',
    //   'buyer.id',
    //   'buyer.name',
    //   'xero_invoice_number',
    //   'invoice_status',
    //   'source',
    //   'deleted_at',
    // ]);
    // if (dateRange) {
    //   salesQuery = salesQuery.filter({
    //     sale_date: {
    //       $ge: dateRange.start,
    //       $le: dateRange.end,
    //     },
    //   });
    // }
    // const allSalesRaw = await salesQuery.sort('sale_date', 'desc').getMany({ pagination: { size: 200 } });

    // Commission timing: prefer completedAt, fall back to saleDate for legacy data
    const whereConditions = dateRange
      ? or(
          and(gte(sales.completedAt, dateRange.start), lte(sales.completedAt, dateRange.end)),
          and(isNull(sales.completedAt), gte(sales.saleDate, dateRange.start), lte(sales.saleDate, dateRange.end))
        )
      : undefined;

  const now = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1);

  // Run both queries in parallel
  const [allSalesRaw, ytdSalesRaw] = await Promise.all([
    db.query.sales.findMany({
      where: whereConditions,
      with: { shopper: true, buyer: true },
      orderBy: [desc(sales.saleDate)],
      limit: 200,
    }),
    db.query.sales.findMany({
      where: or(
        and(gte(sales.completedAt, ytdStart), lte(sales.completedAt, now)),
        and(isNull(sales.completedAt), gte(sales.saleDate, ytdStart), lte(sales.saleDate, now))
      ),
      with: { shopper: true },
      limit: 500,
    }),
  ]);

  // Filter out xero_import, deleted, ongoing, and CREDITED/DRAFT/VOIDED.
  const headlineFilter = (sale: { source: string | null; deletedAt: Date | null; status: string | null; invoiceStatus: string | null }) =>
    sale.source !== 'xero_import' &&
    !sale.deletedAt &&
    sale.status !== 'ongoing' &&
    sale.invoiceStatus !== 'CREDITED' &&
    sale.invoiceStatus !== 'DRAFT' &&
    sale.invoiceStatus !== 'VOIDED';

  const salesData = allSalesRaw.filter(headlineFilter);
  const ytdSales = ytdSalesRaw.filter(headlineFilter);

  // Calculate shopper performance
  const shopperStats = new Map<string, ShopperPerformance>();

  // Process current month sales - use shopper ID as key for deduplication
  salesData.forEach(sale => {
    const shopperId = sale.shopper?.id || 'unassigned';
    const shopperName = sale.shopper?.name || 'Unassigned';

    if (!shopperStats.has(shopperId)) {
      shopperStats.set(shopperId, {
        name: shopperName,
        thisMonthSales: 0,
        margin: 0,
        marginPercent: 0,
        commission: 0,
        ytdSales: 0,
      });
    }
    const stats = shopperStats.get(shopperId)!;
    stats.thisMonthSales += effectiveInvoiceValue(sale);
    stats.margin += sale.grossMargin || 0;
    stats.commission += sale.commissionableMargin || 0;
  });

  // Add YTD data - use shopper ID for matching
  ytdSales.forEach(sale => {
    const shopperId = sale.shopper?.id || 'unassigned';
    if (shopperStats.has(shopperId)) {
      shopperStats.get(shopperId)!.ytdSales += effectiveInvoiceValue(sale);
    }
  });

  // Calculate margin percentages
  shopperStats.forEach(stats => {
    if (stats.thisMonthSales > 0) {
      stats.marginPercent = (stats.margin / stats.thisMonthSales) * 100;
    }
  });

  const shopperPerformance = Array.from(shopperStats.values())
    .sort((a, b) => b.thisMonthSales - a.thisMonthSales);

  // Commission status breakdown
  const pendingCount = salesData.filter(s => !s.commissionLocked).length;
  const lockedCount = salesData.filter(s => s.commissionLocked && !s.commissionPaid).length;
  const paidCount = salesData.filter(s => s.commissionPaid).length;

  // Top clients this month
  const clientStats = new Map<string, TopClient>();
  salesData.forEach(sale => {
    if (!sale.buyer?.id) return;

    if (!clientStats.has(sale.buyer.id)) {
      clientStats.set(sale.buyer.id, {
        id: sale.buyer.id,
        name: sale.buyer.name || 'Unknown Client',
        totalSpend: 0,
        purchaseCount: 0,
      });
    }
    const client = clientStats.get(sale.buyer.id)!;
    client.totalSpend += effectiveInvoiceValue(sale);
    client.purchaseCount += 1;
  });

  const topClients = Array.from(clientStats.values())
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5);

  // Format currency
  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format date
  const formatDate = (date: Date | null | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // Get status badge styling (matches SuperadminDashboard logic)
  const getStatusBadge = (sale: typeof salesData[0]) => {
    // Priority 1: Commission paid
    if (sale.commissionPaid) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Paid
        </span>
      );
    }

    // Priority 2: Commission locked
    if (sale.commissionLocked) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Locked
        </span>
      );
    }

    // Priority 3: Invoice status from Xero
    const normalizedStatus = (sale.invoiceStatus || 'draft').toUpperCase();

    if (normalizedStatus === 'PAID') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Paid
        </span>
      );
    } else if (normalizedStatus === 'AUTHORISED') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          Awaiting Payment
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          Draft
        </span>
      );
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Sales Manager Dashboard
          </h1>
          <p className="text-gray-600">
            {monthLabel} overview · {salesData.length} sales
          </p>
        </div>
        <div className="flex items-center gap-4">
          <MonthPicker />
          <a
            href={`/api/export/monthly-sales?month=${monthParam}`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Export Month
          </a>
        </div>
      </div>

      {/* Shopper Performance Cards */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Shopper Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {shopperPerformance.map((shopper) => (
            <div
              key={shopper.name}
              className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{shopper.name}</h3>
                <Link
                  href={`/sales?shopper=${encodeURIComponent(shopper.name)}&month=${monthParam}`}
                  className="text-sm text-purple-600 hover:text-purple-900"
                >
                  View Sales →
                </Link>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">This Month Sales</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(shopper.thisMonthSales)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Margin</p>
                    <p className="text-sm font-semibold text-green-600">
                      {formatCurrency(shopper.margin)}
                    </p>
                    <p className="text-xs text-gray-500">{shopper.marginPercent.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Commission</p>
                    <p className="text-sm font-semibold text-blue-600">
                      {formatCurrency(shopper.commission)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-xs text-gray-500">YTD Sales</p>
                  <p className="text-sm font-medium text-gray-700">{formatCurrency(shopper.ytdSales)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Month Status Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Month Status</h2>
          <button
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={pendingCount === 0}
          >
            Approve & Lock {monthLabel}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Pending</h3>
            <p className="text-3xl font-bold text-yellow-600">{pendingCount}</p>
            <p className="text-xs text-gray-500 mt-1">Not locked</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Locked</h3>
            <p className="text-3xl font-bold text-blue-600">{lockedCount}</p>
            <p className="text-xs text-gray-500 mt-1">Locked, not paid</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Paid</h3>
            <p className="text-3xl font-bold text-green-600">{paidCount}</p>
            <p className="text-xs text-gray-500 mt-1">Commission paid</p>
          </div>
        </div>
      </div>

      {/* Top Clients This Month */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Clients This Month</h2>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {topClients.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No clients this month</p>
          ) : (
            <div className="divide-y divide-gray-200">
              {topClients.map((client) => (
                <div key={client.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-gray-900">{client.name}</p>
                    <p className="text-sm text-gray-500">{client.purchaseCount} {client.purchaseCount === 1 ? 'purchase' : 'purchases'}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(client.totalSpend)}</p>
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-sm text-purple-600 hover:text-purple-900"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* All Sales This Month Table */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">All Sales This Month</h2>
        {salesData.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <p className="text-gray-500">No sales for this month</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sale Ref
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Client
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Item
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Shopper
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sale Amount
                    </th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Margin
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {salesData.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(sale.saleDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-purple-600">
                        <Link href={`/sales/${sale.id}`} className="hover:text-purple-900">
                          {sale.saleReference || '—'}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {sale.buyer?.name || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {sale.brand && sale.itemTitle
                          ? `${sale.brand} - ${sale.itemTitle}`
                          : sale.brand || sale.itemTitle || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sale.shopper?.name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        {formatCurrency(sale.saleAmountIncVat || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                        {formatCurrency(sale.grossMargin || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {getStatusBadge(sale)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                        <Link
                          href={`/sales/${sale.id}/edit`}
                          className="text-purple-600 hover:text-purple-900 font-medium"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
  } catch (error) {
    logger.error('DASHBOARD', 'FounderDashboard error', {
      error: error as any,
      stack: error instanceof Error ? error.stack : 'No stack',
      message: error instanceof Error ? error.message : String(error)
    });

    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-semibold text-red-900 mb-2">Error loading Founder Dashboard</h1>
          <p className="text-sm text-red-700 mb-4">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <details className="text-xs text-red-600">
            <summary className="cursor-pointer font-medium">Error details</summary>
            <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto">
              {error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
