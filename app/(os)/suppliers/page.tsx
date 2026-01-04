import Link from "next/link";
import { XataClient } from "@/src/xata";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Suppliers Page
 *
 * Displays all suppliers with their transaction statistics
 */

const xata = new XataClient();

// Supplier with calculated stats
interface SupplierWithStats {
  id: string;
  name: string;
  email: string | null;
  totalSourced: number;
  totalMargin: number;
  tradesCount: number;
  lastTradeDate: Date | null;
}

export default async function SuppliersPage() {
  // Fetch suppliers - limit to 200 for performance
  const suppliers = await xata.db.Suppliers
    .select(['*'])
    .getMany({ pagination: { size: 200 } });

  // Fetch sales - limit to last 1000 for performance (still covers recent supplier activity)
  const sales = await xata.db.Sales
    .select([
      'supplier.id',
      'buy_price',
      'gross_margin',
      'sale_date',
      'invoice_status',
    ])
    .filter({
      deleted_at: { $is: null }
    })
    .getMany({ pagination: { size: 1000 } });

  // Calculate stats for each supplier
  const suppliersWithStats: SupplierWithStats[] = suppliers.map(supplier => {
    // Find all sales for this supplier
    const supplierSales = sales.filter(sale => sale.supplier?.id === supplier.id);

    // Filter to PAID invoices only for metrics
    const paidSales = supplierSales.filter(sale =>
      sale.invoice_status?.toUpperCase() === 'PAID'
    );

    // Calculate totals from PAID sales only
    const totalSourced = paidSales.reduce((sum, sale) =>
      sum + (sale.buy_price || 0), 0
    );
    const totalMargin = paidSales.reduce((sum, sale) =>
      sum + (sale.gross_margin || 0), 0
    );
    const tradesCount = paidSales.length;

    // Find last trade date
    const lastTradeDate = supplierSales.length > 0
      ? supplierSales.reduce((latest, sale) => {
          const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;
          if (!saleDate) return latest;
          if (!latest) return saleDate;
          return saleDate > latest ? saleDate : latest;
        }, null as Date | null)
      : null;

    return {
      id: supplier.id,
      name: supplier.name || 'Unnamed Supplier',
      email: supplier.email ?? null,
      totalSourced,
      totalMargin,
      tradesCount,
      lastTradeDate,
    };
  });

  // Sort by total sourced descending (most valuable suppliers first)
  suppliersWithStats.sort((a, b) => b.totalSourced - a.totalSourced);

  // Calculate summary stats
  const totalSuppliers = suppliersWithStats.length;
  const totalSourcedValue = suppliersWithStats.reduce((sum, supplier) =>
    sum + supplier.totalSourced, 0
  );

  // Format currency
  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Format date
  const formatDate = (date: Date | null) => {
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Suppliers</h1>
          <p className="text-gray-600">
            Supplier directory and sourcing history
          </p>
        </div>
        <Link
          href="#"
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
          Add Supplier
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Suppliers</h3>
          <p className="text-2xl font-bold text-gray-900">{totalSuppliers}</p>
          <p className="text-xs text-gray-500 mt-1">Active suppliers</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Sourced Value</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalSourcedValue)}</p>
          <p className="text-xs text-gray-500 mt-1">Paid trades only</p>
        </div>
      </div>

      {/* Suppliers Table */}
      {suppliersWithStats.length === 0 ? (
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No suppliers yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Suppliers will appear here as you create sales.
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
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Supplier Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Total Sourced
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Margin Generated
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Trades
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Last Trade
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {suppliersWithStats.map((supplier) => (
                  <tr
                    key={supplier.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <Link
                            href={`/suppliers/${supplier.id}`}
                            className="text-sm font-medium text-purple-600 hover:text-purple-900"
                          >
                            {supplier.name}
                          </Link>
                          {supplier.email && (
                            <div className="text-xs text-gray-500">{supplier.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(supplier.totalSourced)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                      {formatCurrency(supplier.totalMargin)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {supplier.tradesCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(supplier.lastTradeDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
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
  );
}
