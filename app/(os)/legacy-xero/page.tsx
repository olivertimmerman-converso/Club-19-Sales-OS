/**
 * Club 19 Sales OS - Legacy Xero Data Page
 *
 * Shows historical xero_import Sales records (before source tracking)
 * Restricted: Superadmin, Operations, Admin, Finance
 */

export const dynamic = "force-dynamic";

import { getUserRole } from "@/lib/getUserRole";
import { assertLegacyAccess } from "@/lib/assertAccess";
import { getXataClient } from "@/src/xata";

export default async function LegacyXeroPage() {
  // Check permissions
  const role = await getUserRole();
  assertLegacyAccess(role); // Same permissions as legacy data page

  const xata = getXataClient();

  // Get all Sales records with source='xero_import'
  const xeroImports = await xata.db.Sales
    .filter({ source: 'xero_import' })
    .sort('sale_date', 'desc')
    .getAll();

  // Calculate summary stats
  const totalRecords = xeroImports.length;
  const totalSales = xeroImports.reduce((sum, sale) => sum + (sale.sale_amount_inc_vat || 0), 0);
  const recordsNeedingAllocation = xeroImports.filter(s => s.needs_allocation).length;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Legacy Xero Data</h1>
        <p className="text-gray-600">
          Historical Xero-imported sales records (source='xero_import')
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Records</div>
          <div className="text-3xl font-bold text-gray-900">{totalRecords}</div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Total Sales</div>
          <div className="text-3xl font-bold text-gray-900">
            £{totalSales.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="text-sm font-medium text-gray-600 mb-1">Needs Allocation</div>
          <div className="text-3xl font-bold text-orange-600">{recordsNeedingAllocation}</div>
        </div>
      </div>

      {/* Records Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">All Records</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Buyer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {xeroImports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    No legacy Xero data found
                  </td>
                </tr>
              ) : (
                xeroImports.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('en-GB') : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.xero_invoice_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sale.buyer_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {sale.item_title || sale.brand || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      £{(sale.sale_amount_inc_vat || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {sale.needs_allocation ? (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                          Needs Allocation
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Complete
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
