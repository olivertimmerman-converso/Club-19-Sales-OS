import Link from "next/link";
import { XataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import { getCurrentUser } from "@/lib/getCurrentUser";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Clients Page
 *
 * Displays all buyers/clients with their transaction statistics
 * Shoppers see only clients they've sold to
 */

const xata = new XataClient();

// Client with calculated stats (hybrid: lifetime + 2026)
interface ClientWithStats {
  id: string;
  name: string;
  email: string | null;
  totalSpend: number;
  totalMargin: number;
  tradesCount: number;
  lastPurchaseDate: Date | null;
  // 2026 Atelier-only stats
  spend2026: number;
  margin2026: number;
  trades2026: number;
  has2026Activity: boolean;
}

export default async function ClientsPage() {
  // Get role for filtering
  const role = await getUserRole();

  // Fetch all sales to calculate stats (include source for 2026 filtering)
  let salesQuery = xata.db.Sales
    .select([
      'buyer.id',
      'sale_amount_inc_vat',
      'gross_margin',
      'sale_date',
      'shopper.name',
      'source',
    ])
    .filter({
      deleted_at: { $is: null }
    });

  // Filter sales for shoppers - only their own sales
  if (role === 'shopper') {
    const currentUser = await getCurrentUser();
    if (currentUser?.fullName) {
      // Look up the Shopper record by name to get the ID
      const shopper = await xata.db.Shoppers.filter({ name: currentUser.fullName }).getFirst();
      if (shopper) {
        // Filter Sales by the shopper link ID
        salesQuery = salesQuery.filter({ shopper: shopper.id });
      }
    }
  }

  // Limit sales query to last 1000 for performance (still covers all recent clients)
  const sales = await salesQuery.getMany({ pagination: { size: 1000 } });

  // Get unique buyer IDs from sales
  const uniqueBuyerIds = [...new Set(sales.map(sale => sale.buyer?.id).filter((id): id is string => !!id))];

  // Fetch only buyers that have sales (filtered by shopper if applicable)
  // Limit to 100 top clients for performance
  const buyers = uniqueBuyerIds.length > 0
    ? await xata.db.Buyers
        .select(['*'])
        .filter({ id: { $any: uniqueBuyerIds } })
        .getMany({ pagination: { size: 100 } })
    : [];

  // Calculate stats for each buyer (hybrid: lifetime + 2026)
  const clientsWithStats: ClientWithStats[] = buyers.map(buyer => {
    // Find all sales for this buyer
    const buyerSales = sales.filter(sale => sale.buyer?.id === buyer.id);

    // Filter 2026 Atelier sales (source: 'atelier' AND date >= 2026-01-01)
    const sales2026 = buyerSales.filter(sale => {
      if (sale.source !== 'atelier') return false;
      const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;
      if (!saleDate) return false;
      return saleDate >= new Date('2026-01-01');
    });

    // Calculate lifetime totals (all sales)
    const totalSpend = buyerSales.reduce((sum, sale) =>
      sum + (sale.sale_amount_inc_vat || 0), 0
    );
    const totalMargin = buyerSales.reduce((sum, sale) =>
      sum + (sale.gross_margin || 0), 0
    );
    const tradesCount = buyerSales.length;

    // Calculate 2026 totals (Atelier only)
    const spend2026 = sales2026.reduce((sum, sale) =>
      sum + (sale.sale_amount_inc_vat || 0), 0
    );
    const margin2026 = sales2026.reduce((sum, sale) =>
      sum + (sale.gross_margin || 0), 0
    );
    const trades2026 = sales2026.length;

    // Find last purchase date (any source)
    const lastPurchaseDate = buyerSales.length > 0
      ? buyerSales.reduce((latest, sale) => {
          const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;
          if (!saleDate) return latest;
          if (!latest) return saleDate;
          return saleDate > latest ? saleDate : latest;
        }, null as Date | null)
      : null;

    return {
      id: buyer.id,
      name: buyer.name || 'Unnamed Client',
      email: buyer.email ?? null,
      totalSpend,
      totalMargin,
      tradesCount,
      lastPurchaseDate,
      spend2026,
      margin2026,
      trades2026,
      has2026Activity: trades2026 > 0,
    };
  });

  // Sort by 2026 activity first, then by total spend
  clientsWithStats.sort((a, b) => {
    // Clients with 2026 activity sort first
    if (a.has2026Activity && !b.has2026Activity) return -1;
    if (!a.has2026Activity && b.has2026Activity) return 1;

    // Within same category, sort by 2026 spend (if both have 2026 activity)
    if (a.has2026Activity && b.has2026Activity) {
      return b.spend2026 - a.spend2026;
    }

    // Otherwise sort by total spend
    return b.totalSpend - a.totalSpend;
  });

  // Calculate summary stats (lifetime)
  const totalClients = clientsWithStats.length;
  const totalClientSpend = clientsWithStats.reduce((sum, client) =>
    sum + client.totalSpend, 0
  );

  // Calculate 2026 summary stats
  const totalSpend2026 = clientsWithStats.reduce((sum, client) =>
    sum + client.spend2026, 0
  );
  const totalMargin2026 = clientsWithStats.reduce((sum, client) =>
    sum + client.margin2026, 0
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
          <h1 className="text-3xl font-semibold text-gray-900 mb-2">Clients</h1>
          <p className="text-gray-600">
            Client directory and transaction history
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
          Add Client
        </Link>
      </div>

      {/* Summary Stats - Hybrid: Lifetime + 2026 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Clients</h3>
          <p className="text-2xl font-bold text-gray-900">{totalClients}</p>
          <p className="text-xs text-gray-500 mt-1">Active buyers</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Client Spend</h3>
          <p className="text-2xl font-bold text-purple-600">{formatCurrency(totalClientSpend)}</p>
          <p className="text-xs text-gray-500 mt-1">Lifetime value</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">2026 Spend</h3>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalSpend2026)}</p>
          <p className="text-xs text-gray-500 mt-1">Atelier sales only</p>
        </div>
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">2026 Margin</h3>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(totalMargin2026)}</p>
          <p className="text-xs text-gray-500 mt-1">Atelier sales only</p>
        </div>
      </div>

      {/* Clients Table */}
      {clientsWithStats.length === 0 ? (
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No clients yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Clients will appear here as you create sales.
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
                    Client Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Total Spend
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    2026 Margin
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Sales
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Last Purchase
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
                {clientsWithStats.map((client) => (
                  <tr
                    key={client.id}
                    className={`hover:bg-gray-50 transition-colors ${client.has2026Activity ? 'bg-blue-50/30' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {client.has2026Activity && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" title="Active in 2026"></div>
                        )}
                        <div>
                          <Link
                            href={`/clients/${client.id}`}
                            className="text-sm font-medium text-purple-600 hover:text-purple-900"
                          >
                            {client.name}
                          </Link>
                          {client.email && (
                            <div className="text-xs text-gray-500">{client.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-medium">
                      {formatCurrency(client.totalSpend)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 text-right font-medium">
                      {client.margin2026 > 0 ? formatCurrency(client.margin2026) : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                      {client.trades2026 > 0 ? (
                        <span>
                          <span className="font-semibold text-blue-600">{client.trades2026}</span>
                          <span className="text-gray-400 mx-1">/</span>
                          <span className="text-gray-500">{client.tradesCount}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">{client.tradesCount}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(client.lastPurchaseDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.has2026Activity ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Active 2026
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          Legacy
                        </span>
                      )}
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
