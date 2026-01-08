import Link from "next/link";
import { getXataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange } from "@/lib/dateUtils";
import { SalesTableClient } from "./SalesTableClient";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Sales Overview
 *
 * Displays all sales from the Xata database with inline shopper editing
 * Shoppers see only their own sales, others see all sales
 * Superadmin sees deleted sales in a separate section
 */

interface SalesPageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function SalesPage({ searchParams }: SalesPageProps) {
  try {
    const xata = getXataClient();

    // Get role for filtering
    const role = await getUserRole();
    console.log('[SalesPage] Role:', role);

    // Get month filter
    const params = await searchParams;
    const monthParam = params.month || "current";
    console.log('[SalesPage] Month param:', monthParam);

    const dateRange = getMonthDateRange(monthParam);
    console.log('[SalesPage] Date range:', dateRange);

    // Query ALL Sales from Xata (exclude xero_import records)
    // Then filter active vs deleted in JavaScript for reliability
    // Note: We fetch ALL records and filter in JS because Xata's $isNot excludes null values
    let allSalesQuery = xata.db.Sales
      .select([
        'id',
        'sale_reference',
        'sale_date',
        'brand',
        'item_title',
        'sale_amount_inc_vat',
        'gross_margin',
        'xero_invoice_number',
        'invoice_status',
        'currency',
        'source',
        'buyer.name',
        'shopper.id',
        'shopper.name',
        'deleted_at',
        'is_payment_plan',
        'payment_plan_instalments',
        'shipping_cost_confirmed',
        'has_introducer',
        'introducer.id',
        'introducer.name',
      ]);

    // Filter for shoppers - only show their own sales
    if (role === 'shopper') {
      console.log('[SalesPage] Fetching current user for shopper...');
      const currentUser = await getCurrentUser();
      console.log('[SalesPage] Current user:', currentUser?.fullName);
      if (currentUser?.fullName) {
        // Look up the Shopper record by name to get the ID
        const shopper = await xata.db.Shoppers.filter({ name: currentUser.fullName }).getFirst();
        console.log('[SalesPage] Found shopper:', shopper?.id);
        if (shopper) {
          // Filter Sales by the shopper link ID
          allSalesQuery = allSalesQuery.filter({ shopper: shopper.id });
        }
      }
    }

    // Apply date range filter if specified
    if (dateRange) {
      console.log('[SalesPage] Applying date range filter');
      allSalesQuery = allSalesQuery.filter({
        sale_date: {
          $ge: dateRange.start,
          $le: dateRange.end,
        },
      });
    }

    console.log('[SalesPage] Executing query...');
    // Fetch all sales, then split by deleted_at in JavaScript
    const allSalesRaw = await allSalesQuery.sort('sale_date', 'desc').getAll();
    console.log('[SalesPage] Total sales fetched:', allSalesRaw.length);

    // Filter out xero_import records in JavaScript (Xata's $isNot excludes null values, so we do it here)
    const nonImportedSales = allSalesRaw.filter(sale => sale.source !== 'xero_import');
    console.log('[SalesPage] After excluding xero_import:', nonImportedSales.length);

    // Split into active and deleted using JavaScript (reliable!)
    const salesRaw = nonImportedSales.filter(sale => !sale.deleted_at);
    const deletedSalesRaw = role === 'superadmin' ? nonImportedSales.filter(sale => sale.deleted_at) : [];

    console.log('[SalesPage] Active sales count:', salesRaw.length);
    console.log('[SalesPage] Deleted sales count:', deletedSalesRaw.length);

    // Debug: Log sample records to verify filtering
    if (salesRaw.length > 0) {
      console.log('[SalesPage] Sample active sale:', {
        id: salesRaw[0].id,
        ref: salesRaw[0].sale_reference,
        deleted_at: salesRaw[0].deleted_at,
        invoice_status: salesRaw[0].invoice_status
      });
    }
    if (deletedSalesRaw.length > 0) {
      console.log('[SalesPage] Sample deleted sale:', {
        id: deletedSalesRaw[0].id,
        ref: deletedSalesRaw[0].sale_reference,
        deleted_at: deletedSalesRaw[0].deleted_at,
        invoice_status: deletedSalesRaw[0].invoice_status
      });
    }

    // Fetch all shoppers for the dropdown
    const shoppersRaw = await xata.db.Shoppers
      .select(['id', 'name'])
      .sort('name', 'asc')
      .getAll();

    // Serialize data for client component
    const sales = salesRaw.map(sale => ({
      id: sale.id,
      sale_reference: sale.sale_reference || null,
      sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
      brand: sale.brand || null,
      item_title: sale.item_title || null,
      sale_amount_inc_vat: sale.sale_amount_inc_vat || null,
      gross_margin: sale.gross_margin || null,
      xero_invoice_number: sale.xero_invoice_number || null,
      invoice_status: sale.invoice_status || null,
      currency: sale.currency || null,
      buyer: sale.buyer ? { name: sale.buyer.name || 'Unknown' } : null,
      shopper: sale.shopper ? { id: sale.shopper.id, name: sale.shopper.name || 'Unknown' } : null,
      is_payment_plan: (sale as any).is_payment_plan || false,
      payment_plan_instalments: (sale as any).payment_plan_instalments || null,
      shipping_cost_confirmed: (sale as any).shipping_cost_confirmed || false,
      has_introducer: (sale as any).has_introducer || false,
      introducer: sale.introducer ? { id: sale.introducer.id, name: sale.introducer.name || 'Unknown' } : null,
    }));

    const deletedSales = deletedSalesRaw.map(sale => ({
      id: sale.id,
      sale_reference: sale.sale_reference || null,
      sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
      brand: sale.brand || null,
      item_title: sale.item_title || null,
      sale_amount_inc_vat: sale.sale_amount_inc_vat || null,
      gross_margin: sale.gross_margin || null,
      xero_invoice_number: sale.xero_invoice_number || null,
      invoice_status: sale.invoice_status || null,
      currency: sale.currency || null,
      buyer: sale.buyer ? { name: sale.buyer.name || 'Unknown' } : null,
      shopper: sale.shopper ? { id: sale.shopper.id, name: sale.shopper.name || 'Unknown' } : null,
      is_payment_plan: (sale as any).is_payment_plan || false,
      payment_plan_instalments: (sale as any).payment_plan_instalments || null,
      shipping_cost_confirmed: (sale as any).shipping_cost_confirmed || false,
      has_introducer: (sale as any).has_introducer || false,
      introducer: sale.introducer ? { id: sale.introducer.id, name: sale.introducer.name || 'Unknown' } : null,
    }));

    const shoppers = shoppersRaw.map(s => ({
      id: s.id,
      name: s.name || 'Unknown',
    }));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Sales</h1>
          <p className="text-gray-600">
            {sales.length} active sale{sales.length !== 1 ? 's' : ''}
            {role === 'superadmin' && deletedSales.length > 0 && ` • ${deletedSales.length} deleted`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <MonthPicker />
          <Link
            href="/trade/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
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
            Create Invoice
          </Link>
        </div>
      </div>

      {/* Active Sales Section */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Sales</h2>
        {sales.length === 0 ? (
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
          <SalesTableClient sales={sales} shoppers={shoppers} userRole={role} />
        )}
      </div>

      {/* Deleted Sales Section (superadmin only) */}
      {role === 'superadmin' && deletedSales.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <span>🗑️ Deleted Sales</span>
            <span className="text-xs font-normal text-gray-500">(hidden from reports)</span>
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            These sales have been soft-deleted and are excluded from all analytics and reports.
          </p>
          <div className="opacity-60">
            <SalesTableClient sales={deletedSales} shoppers={shoppers} userRole={role} isDeletedSection />
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
