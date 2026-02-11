/**
 * Club 19 Sales OS - Shopper Dashboard
 *
 * Server component that shows shopper's own sales, commissions, and performance
 */

import Link from "next/link";
// ORIGINAL XATA: import { XataClient } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers, buyers } from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange } from "@/lib/dateUtils";

// ORIGINAL XATA: const xata = new XataClient();

interface ShopperDashboardProps {
  monthParam?: string;
  shopperNameOverride?: string; // For superadmin view-as functionality
}

export async function ShopperDashboard({
  monthParam = "current",
  shopperNameOverride
}: ShopperDashboardProps) {
  // Get current user to filter their sales
  // If shopperNameOverride is provided (superadmin viewing as shopper), use that instead
  let shopperName: string;
  let clerkUserId: string | null = null;

  if (shopperNameOverride) {
    shopperName = shopperNameOverride;
  } else {
    const currentUser = await getCurrentUser();
    if (!currentUser || !currentUser.fullName) {
      return (
        <div className="p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-sm font-medium text-yellow-900">Unable to load your data</h3>
            <p className="mt-1 text-sm text-yellow-700">
              We couldn&apos;t identify your account. Please contact support if this issue persists.
            </p>
          </div>
        </div>
      );
    }
    shopperName = currentUser.fullName;
    clerkUserId = currentUser.userId;
  }

  // Get date range for filtering
  const dateRange = getMonthDateRange(monthParam);

  // Look up Shopper - prefer clerk_user_id (more reliable), fall back to name
  let shopperResult = null;

  // Try clerk_user_id first (if available)
  if (clerkUserId) {
    shopperResult = await db.query.shoppers.findFirst({
      where: eq(shoppers.clerkUserId, clerkUserId),
    });
  }

  // Fall back to name matching
  if (!shopperResult) {
    shopperResult = await db.query.shoppers.findFirst({
      where: eq(shoppers.name, shopperName),
    });
  }

  if (!shopperResult) {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-900 mb-2">Shopper Not Found</h2>
          <p className="text-sm text-yellow-700">
            No shopper record found for &quot;{shopperName}&quot;. Please contact admin.
          </p>
        </div>
      </div>
    );
  }

  // ORIGINAL XATA:
  // let salesQuery = xata.db.Sales
  //   .select([
  //     'id',
  //     'sale_date',
  //     'item_title',
  //     'brand',
  //     'sale_amount_inc_vat',
  //     'gross_margin',
  //     'commissionable_margin',
  //     'commission_locked',
  //     'commission_paid',
  //     'buyer.name',
  //     'source',
  //     'deleted_at',
  //   ])
  //   .filter({
  //     shopper: shopper.id
  //   });
  // if (dateRange) {
  //   salesQuery = salesQuery.filter({
  //     sale_date: {
  //       $ge: dateRange.start,
  //       $le: dateRange.end,
  //     },
  //   });
  // }
  // const allSalesRaw = await salesQuery.sort('sale_date', 'desc').getMany({ pagination: { size: 100 } });

  // Query sales for this shopper using Drizzle
  const whereConditions = dateRange
    ? and(
        eq(sales.shopperId, shopperResult.id),
        gte(sales.saleDate, dateRange.start),
        lte(sales.saleDate, dateRange.end)
      )
    : eq(sales.shopperId, shopperResult.id);

  const allSalesRaw = await db.query.sales.findMany({
    where: whereConditions,
    with: {
      buyer: true,
    },
    orderBy: [desc(sales.saleDate)],
    limit: 100,
  });

  // Filter out xero_import and deleted sales in JavaScript
  const salesData = allSalesRaw.filter(sale =>
    sale.source !== 'xero_import' && !sale.deletedAt
  );

  // Calculate totals
  const totalSales = salesData.length;
  const totalRevenue = salesData.reduce((sum, sale) => sum + (sale.saleAmountIncVat || 0), 0);
  const totalMargin = salesData.reduce((sum, sale) => sum + (sale.grossMargin || 0), 0);

  // Commission breakdown
  const pending = salesData.filter(s => !s.commissionLocked);
  const locked = salesData.filter(s => s.commissionLocked && !s.commissionPaid);
  const paid = salesData.filter(s => s.commissionPaid);

  const pendingCommission = pending;
  const lockedCommission = locked;
  const paidCommission = paid;
  const pendingCommissionAmount = pending.reduce((sum, s) => sum + (s.commissionableMargin || 0), 0);
  const lockedCommissionAmount = locked.reduce((sum, s) => sum + (s.commissionableMargin || 0), 0);
  const paidCommissionAmount = paid.reduce((sum, s) => sum + (s.commissionableMargin || 0), 0);

  // Recent sales (last 10)
  const recentSales = salesData.slice(0, 10);

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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">
            Welcome, {shopperName}
          </h1>
          <p className="text-gray-600">
            Your sales overview and commission tracking
          </p>
        </div>
        <MonthPicker />
      </div>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sales</h3>
          <p className="text-2xl font-bold text-gray-900">{totalSales}</p>
          <p className="text-xs text-gray-500 mt-1">All-time trades</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Revenue</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalRevenue)}</p>
          <p className="text-xs text-gray-500 mt-1">Sales value</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Margin</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
          <p className="text-xs text-gray-500 mt-1">Margin generated</p>
        </div>
      </div>

      {/* Commission Overview */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Commission Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Pending Approval</h3>
            <p className="text-2xl font-bold text-yellow-600">{pendingCommission.length}</p>
            <p className="text-sm text-gray-600 mt-1">{formatCurrency(pendingCommissionAmount)}</p>
            <p className="text-xs text-gray-500 mt-1">Awaiting commission lock</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Locked</h3>
            <p className="text-2xl font-bold text-blue-600">{lockedCommission.length}</p>
            <p className="text-sm text-gray-600 mt-1">{formatCurrency(lockedCommissionAmount)}</p>
            <p className="text-xs text-gray-500 mt-1">Awaiting payment</p>
          </div>
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Paid</h3>
            <p className="text-2xl font-bold text-green-600">{paidCommission.length}</p>
            <p className="text-sm text-gray-600 mt-1">{formatCurrency(paidCommissionAmount)}</p>
            <p className="text-xs text-gray-500 mt-1">Commission received</p>
          </div>
        </div>
      </div>

      {/* Recent Sales */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Recent Sales</h2>
          <Link
            href="/sales"
            className="text-sm font-medium text-purple-600 hover:text-purple-900"
          >
            View all →
          </Link>
        </div>

        {recentSales.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No sales yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Your sales will appear here once you make your first trade.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Item
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Client
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Sale Amount
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Margin
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Commission
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(sale.saleDate)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        <Link
                          href={`/sales/${sale.id}`}
                          className="text-purple-600 hover:text-purple-900"
                        >
                          {sale.brand && sale.itemTitle
                            ? `${sale.brand} - ${sale.itemTitle}`
                            : sale.brand || sale.itemTitle || '—'}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sale.buyer?.name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                        {formatCurrency(sale.saleAmountIncVat || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                        {formatCurrency(sale.grossMargin || 0)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          sale.commissionPaid
                            ? 'bg-green-100 text-green-800'
                            : sale.commissionLocked
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {sale.commissionPaid ? 'Paid' : sale.commissionLocked ? 'Locked' : 'Pending'}
                        </span>
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
}
