import Link from "next/link";
// ORIGINAL XATA: import { getXataClient } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { eq, and, isNull, gte, lte, ne, desc, asc, isNotNull } from "drizzle-orm";
import { getUserRole } from "@/lib/getUserRole";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange } from "@/lib/dateUtils";
import { SalesTableClient } from "./SalesTableClient";
import { SalesFilters } from "@/components/ui/SalesFilters";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Sales Overview
 *
 * Displays all sales from the database with inline shopper editing
 * Shoppers see only their own sales, others see all sales
 * Superadmin sees deleted sales in a separate section
 */

interface SalesPageProps {
  searchParams: Promise<{ month?: string; viewAs?: string; shopper?: string; status?: string }>;
}

/**
 * Map viewAs URL param to shopper name
 * Returns null if not viewing as a shopper
 */
function getViewAsShopperName(viewAs: string | undefined): string | null {
  if (!viewAs) return null;

  switch (viewAs) {
    case "shopper-hope-peverell":
    case "shopper-hope":
    case "shopper-hope-sherwin":
      return "Hope Peverell";
    case "shopper-mary-clair":
    case "shopper-mary-clair-bromfield": // legacy alias
    case "shopper-mc":
      return "Mary Clair";
    default:
      return null;
  }
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  try {
    // ORIGINAL XATA: const xata = getXataClient();

    // Get role for filtering
    const role = await getUserRole();
    // console.log('[SalesPage] Role:', role);

    // Get month and viewAs filters
    const params = await searchParams;
    const monthParam = params.month || "current";
    const viewAs = params.viewAs;
    const shopperParam = params.shopper;
    // console.log('[SalesPage] Month param:', monthParam, 'viewAs:', viewAs, 'shopper:', shopperParam);

    const dateRange = getMonthDateRange(monthParam);
    // console.log('[SalesPage] Date range:', dateRange);

    // Determine if we're in "shopper view" mode
    // Either: actual shopper role OR superadmin viewing as shopper
    const viewAsShopperName = role === 'superadmin' ? getViewAsShopperName(viewAs) : null;
    const isShopperView = role === 'shopper' || !!viewAsShopperName;
    const isCurrentMonth = monthParam === 'current';

    // Build conditions for sales query
    const conditions: any[] = [];

    // Filter for shoppers:
    // - Current month: show ALL sales (full team view for leaderboard context)
    // - Previous months: show ONLY their own sales
    if (isShopperView && !isCurrentMonth) {
      // console.log('[SalesPage] Shopper viewing previous month - filtering to own sales');

      let shopperName: string | null = null;

      if (viewAsShopperName) {
        // Superadmin viewing as shopper
        shopperName = viewAsShopperName;
      } else {
        // Actual shopper
        const currentUser = await getCurrentUser();
        shopperName = currentUser?.fullName || null;
      }

      // console.log('[SalesPage] Shopper name:', shopperName);

      if (shopperName) {
        // Try clerk_user_id first, then name
        let shopper = null;

        if (!viewAsShopperName) {
          // For actual shoppers, try clerk_user_id first
          const currentUser = await getCurrentUser();
          if (currentUser?.userId) {
            shopper = await db.query.shoppers.findFirst({
              where: eq(shoppers.clerkUserId, currentUser.userId),
            });
          }
        }

        if (!shopper) {
          shopper = await db.query.shoppers.findFirst({
            where: eq(shoppers.name, shopperName),
          });
        }

        // console.log('[SalesPage] Found shopper:', shopper?.id);
        if (shopper) {
          conditions.push(eq(sales.shopperId, shopper.id));
        }
      }
    } else if (isShopperView) {
      // console.log('[SalesPage] Shopper viewing current month - showing all sales');
    }

    // If a specific shopper filter is applied (by non-shopper roles), filter server-side
    if (shopperParam && !isShopperView) {
      conditions.push(eq(sales.shopperId, shopperParam));
    }

    // Apply date range filter if specified
    if (dateRange) {
      // console.log('[SalesPage] Applying date range filter');
      conditions.push(gte(sales.saleDate, dateRange.start));
      conditions.push(lte(sales.saleDate, dateRange.end));
    }

    // Run sales + shoppers queries in parallel
    const [allSalesRaw, shoppersRaw] = await Promise.all([
      db.query.sales.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: { buyer: true, shopper: true, supplier: true, introducer: true },
        orderBy: [desc(sales.saleDate)],
        limit: 500,
      }),
      db.query.shoppers.findMany({
        where: eq(shoppers.active, true),
        orderBy: [asc(shoppers.name)],
      }),
    ]);

    // Filter out xero_import records in JavaScript (keeping consistent with original)
    const nonImportedSales = allSalesRaw.filter(sale => sale.source !== 'xero_import');

    // Split into active and deleted, exclude VOIDED invoices
    const salesRaw = nonImportedSales.filter(sale => !sale.deletedAt && sale.invoiceStatus !== 'VOIDED');
    const deletedSalesRaw = role === 'superadmin' ? nonImportedSales.filter(sale => sale.deletedAt) : [];

    // Serialize data for client component
    const salesData = salesRaw.map(sale => ({
      id: sale.id,
      sale_reference: sale.saleReference || null,
      sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
      brand: sale.brand || null,
      category: sale.category || null,
      item_title: sale.itemTitle || null,
      buy_price: sale.buyPrice || null,
      sale_amount_inc_vat: sale.saleAmountIncVat || null,
      gross_margin: sale.grossMargin || null,
      xero_invoice_number: sale.xeroInvoiceNumber || null,
      invoice_status: sale.invoiceStatus || null,
      currency: sale.currency || null,
      status: sale.status || null,
      buyer: sale.buyer ? { name: sale.buyer.name || 'Unknown' } : null,
      shopper: sale.shopper ? { id: sale.shopper.id, name: sale.shopper.name || 'Unknown' } : null,
      supplier: sale.supplier ? { id: sale.supplier.id } : null,
      is_payment_plan: sale.isPaymentPlan || false,
      payment_plan_instalments: sale.paymentPlanInstalments || null,
      shipping_cost_confirmed: sale.shippingCostConfirmed || false,
      has_introducer: sale.hasIntroducer || false,
      introducer: sale.introducer ? { id: sale.introducer.id, name: sale.introducer.name || 'Unknown' } : null,
      introducer_commission: sale.introducerCommission || null,
    }));

    const deletedSales = deletedSalesRaw.map(sale => ({
      id: sale.id,
      sale_reference: sale.saleReference || null,
      sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
      brand: sale.brand || null,
      category: sale.category || null,
      item_title: sale.itemTitle || null,
      buy_price: sale.buyPrice || null,
      sale_amount_inc_vat: sale.saleAmountIncVat || null,
      gross_margin: sale.grossMargin || null,
      xero_invoice_number: sale.xeroInvoiceNumber || null,
      invoice_status: sale.invoiceStatus || null,
      currency: sale.currency || null,
      status: sale.status || null,
      buyer: sale.buyer ? { name: sale.buyer.name || 'Unknown' } : null,
      shopper: sale.shopper ? { id: sale.shopper.id, name: sale.shopper.name || 'Unknown' } : null,
      supplier: sale.supplier ? { id: sale.supplier.id } : null,
      is_payment_plan: sale.isPaymentPlan || false,
      payment_plan_instalments: sale.paymentPlanInstalments || null,
      shipping_cost_confirmed: sale.shippingCostConfirmed || false,
      has_introducer: sale.hasIntroducer || false,
      introducer: sale.introducer ? { id: sale.introducer.id, name: sale.introducer.name || 'Unknown' } : null,
      introducer_commission: sale.introducerCommission || null,
    }));

    const shoppersData = shoppersRaw.map(s => ({
      id: s.id,
      name: s.name || 'Unknown',
    }));

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-3xl font-semibold text-gray-900 mb-1 sm:mb-2">Sales</h1>
            <p className="text-sm sm:text-base text-gray-600">
              {salesData.length} active sale{salesData.length !== 1 ? 's' : ''}
              {role === 'superadmin' && deletedSales.length > 0 && ` • ${deletedSales.length} deleted`}
            </p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <MonthPicker />
            <Link
              href="/trade/new"
              className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span className="hidden sm:inline">Create Invoice</span>
              <span className="sm:hidden">New Sale</span>
            </Link>
          </div>
        </div>

        {/* Shopper + Status filters (non-shopper roles only) */}
        {!isShopperView && (
          <SalesFilters shoppers={shoppersData} />
        )}
      </div>

      {/* Active Sales Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Sales</h2>
        {salesData.length === 0 ? (
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
              Get started by creating your first sale.
            </p>
            <div className="mt-6">
              <Link
                href="/trade/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Create New Sale
              </Link>
            </div>
          </div>
        ) : (
          <SalesTableClient sales={salesData} shoppers={shoppersData} userRole={role} />
        )}
      </div>

      {/* Deleted Sales Section (superadmin only) */}
      {role === 'superadmin' && deletedSales.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <span>Deleted Sales</span>
            <span className="text-xs font-normal text-gray-500">(hidden from reports)</span>
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            These sales have been soft-deleted and are excluded from all analytics and reports.
          </p>
          <div className="opacity-60">
            <SalesTableClient sales={deletedSales} shoppers={shoppersData} userRole={role} isDeletedSection />
          </div>
        </div>
      )}
    </div>
  );
  } catch (error) {
    console.error('[SalesPage] Error:', error);
    console.error('[SalesPage] Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('[SalesPage] Error message:', error instanceof Error ? error.message : String(error));

    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-semibold text-red-900 mb-2">Error loading sales</h1>
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
