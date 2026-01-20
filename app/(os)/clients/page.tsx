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
 * Supports filtering by owner (client manager)
 */

const xata = new XataClient();

// Client with calculated stats (hybrid: lifetime + 2026 + pipeline)
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
  // Pipeline (unpaid invoices)
  pipelineValue: number;
  // Owner (client manager)
  ownerId: string | null;
  ownerName: string | null;
}

interface Shopper {
  id: string;
  name: string;
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  try {
    console.log('[ClientsPage] Starting...');

    // Get role for filtering
    const role = await getUserRole();
    console.log('[ClientsPage] Got role:', role);

    const { owner: ownerFilter } = await searchParams;
    console.log('[ClientsPage] Owner filter:', ownerFilter || 'none');

    // Fetch all shoppers for the owner filter dropdown
    console.log('[ClientsPage] Fetching shoppers...');
    const allShoppers = await xata.db.Shoppers
      .select(['id', 'name'])
      .filter({ active: true })
      .sort('name', 'asc')
      .getAll();
    console.log('[ClientsPage] Found', allShoppers.length, 'shoppers');

    const shoppers: Shopper[] = allShoppers.map(s => ({
      id: s.id,
      name: s.name || 'Unknown',
    }));

    // Fetch all sales to calculate stats (include source for 2026 filtering)
    console.log('[ClientsPage] Building sales query...');
    let salesQuery = xata.db.Sales
      .select([
        'buyer.id',
        'sale_amount_inc_vat',
        'gross_margin',
        'sale_date',
        'shopper.name',
        'source',
        'invoice_status',
      ])
      .filter({
        deleted_at: { $is: null }
      });

    // Filter sales for shoppers - only their own sales
    if (role === 'shopper') {
      console.log('[ClientsPage] Applying shopper filter...');
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
    console.log('[ClientsPage] Executing sales query...');
    const sales = await salesQuery.getMany({ pagination: { size: 1000 } });
    console.log('[ClientsPage] Found', sales.length, 'sales');

    // Get unique buyer IDs from sales
    const uniqueBuyerIds = [...new Set(sales.map(sale => sale.buyer?.id).filter((id): id is string => !!id))];
    console.log('[ClientsPage] Unique buyer IDs:', uniqueBuyerIds.length);

    // Fetch only buyers that have sales (filtered by shopper if applicable)
    // Include owner relationship for filtering and display
    // Limit to 100 top clients for performance
    console.log('[ClientsPage] Fetching buyers...');
    const buyers = uniqueBuyerIds.length > 0
      ? await xata.db.Buyers
          .select(['*', 'owner.id', 'owner.name'])
          .filter({ id: { $any: uniqueBuyerIds } })
          .getMany({ pagination: { size: 100 } })
      : [];
    console.log('[ClientsPage] Found', buyers.length, 'buyers');

    // Calculate stats for each buyer (hybrid: lifetime + 2026)
  const clientsWithStats: ClientWithStats[] = buyers.map(buyer => {
    // Find all sales for this buyer
    const buyerSales = sales.filter(sale => sale.buyer?.id === buyer.id);

    // Filter to PAID invoices only for metrics (exclude deleted handled by query)
    const paidSales = buyerSales.filter(sale =>
      sale.invoice_status?.toUpperCase() === 'PAID'
    );

    // Filter 2026 Atelier PAID sales (source: 'atelier' AND date >= 2026-01-01 AND PAID)
    const sales2026 = paidSales.filter(sale => {
      if (sale.source !== 'atelier') return false;
      const saleDate = sale.sale_date ? new Date(sale.sale_date) : null;
      if (!saleDate) return false;
      return saleDate >= new Date('2026-01-01');
    });

    // Calculate lifetime totals (PAID sales only)
    const totalSpend = paidSales.reduce((sum, sale) =>
      sum + (sale.sale_amount_inc_vat || 0), 0
    );
    const totalMargin = paidSales.reduce((sum, sale) =>
      sum + (sale.gross_margin || 0), 0
    );
    const tradesCount = paidSales.length;

    // Calculate 2026 totals (Atelier PAID only)
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

    // Calculate pipeline (unpaid invoices: AUTHORISED status)
    const unpaidSales = buyerSales.filter(sale =>
      sale.invoice_status?.toUpperCase() === 'AUTHORISED'
    );
    const pipelineValue = unpaidSales.reduce((sum, sale) =>
      sum + (sale.sale_amount_inc_vat || 0), 0
    );

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
      pipelineValue,
      ownerId: buyer.owner?.id || null,
      ownerName: buyer.owner?.name || null,
    };
  });

  // Apply owner filter if specified
  let filteredClients = clientsWithStats;
  if (ownerFilter === 'unassigned') {
    filteredClients = clientsWithStats.filter(c => !c.ownerId);
  } else if (ownerFilter && ownerFilter !== 'all') {
    filteredClients = clientsWithStats.filter(c => c.ownerId === ownerFilter);
  }

  // Sort by 2026 activity first, then by total spend
  filteredClients.sort((a, b) => {
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

  // Calculate summary stats (from filtered clients)
  const totalClients = filteredClients.length;
  const totalClientSpend = filteredClients.reduce((sum, client) =>
    sum + client.totalSpend, 0
  );

  // Calculate 2026 summary stats
  const totalSpend2026 = filteredClients.reduce((sum, client) =>
    sum + client.spend2026, 0
  );
  const totalMargin2026 = filteredClients.reduce((sum, client) =>
    sum + client.margin2026, 0
  );

  // Calculate pipeline (unpaid) summary stats
  const totalPipeline = filteredClients.reduce((sum, client) =>
    sum + client.pipelineValue, 0
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
        <div className="flex items-center gap-4">
          {/* Owner Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="owner-filter" className="text-sm font-medium text-gray-700">
              Owner:
            </label>
            <form>
              <select
                id="owner-filter"
                name="owner"
                defaultValue={ownerFilter || ''}
                onChange={(e) => {
                  const form = e.target.form;
                  if (form) form.submit();
                }}
                className="rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
              >
                <option value="">All</option>
                <option value="unassigned">Unassigned</option>
                {shoppers.map((shopper) => (
                  <option key={shopper.id} value={shopper.id}>
                    {shopper.name}
                  </option>
                ))}
              </select>
            </form>
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
      </div>

      {/* Summary Stats - Hybrid: Lifetime + 2026 + Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
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
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Awaiting Payment</h3>
          <p className="text-2xl font-bold text-yellow-600">{formatCurrency(totalPipeline)}</p>
          <p className="text-xs text-gray-500 mt-1">Unpaid invoices</p>
        </div>
      </div>

      {/* Clients Table */}
      {filteredClients.length === 0 ? (
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
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Owner
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
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Pipeline
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
                {filteredClients.map((client) => (
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {client.ownerName ? (
                        <span className="text-gray-900">{client.ownerName}</span>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-yellow-600 text-right font-medium">
                      {client.pipelineValue > 0 ? formatCurrency(client.pipelineValue) : '—'}
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
  } catch (error) {
    console.error('[ClientsPage] Error:', error);
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-semibold text-red-900 mb-2">Clients Page Error</h1>
          <p className="text-sm text-red-700 mb-4">
            An error occurred while loading the clients page.
          </p>
          <p className="text-sm font-medium text-red-800 mb-2">
            {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <details className="text-xs text-red-600">
            <summary className="cursor-pointer font-medium hover:text-red-800">Stack trace</summary>
            <pre className="mt-2 p-2 bg-red-100 rounded overflow-auto text-xs">
              {error instanceof Error ? error.stack : JSON.stringify(error, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
