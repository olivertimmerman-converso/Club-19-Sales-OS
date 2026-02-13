import Link from "next/link";
// ORIGINAL XATA: import { XataClient } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers, buyers } from "@/db/schema";
import { eq, and, isNull, inArray, gte, lte } from "drizzle-orm";
import { getUserRole } from "@/lib/getUserRole";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { MonthPicker } from "@/components/ui/MonthPicker";
import { getMonthDateRange } from "@/lib/dateUtils";

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Clients Page
 *
 * Displays all buyers/clients with their transaction statistics
 * Shoppers see only clients they OWN (assigned to them)
 * Admins/superadmins see all clients
 */

// ORIGINAL XATA: const xata = new XataClient();

interface ClientsPageProps {
  searchParams: Promise<{ month?: string; viewAs?: string }>;
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
    case "shopper-mary-clair-bromfield":
    case "shopper-mc":
      return "Mary Clair Bromfield";
    default:
      return null;
  }
}

// Client with calculated stats (hybrid: lifetime + 2026 + pipeline)
interface ClientWithStats {
  id: string;
  name: string;
  email: string | null;
  totalSpend: number;
  totalMargin: number;
  tradesCount: number;
  lastPurchaseDate: Date | null;
  spend2026: number;
  margin2026: number;
  trades2026: number;
  has2026Activity: boolean;
  pipelineValue: number;
  ownerId: string | null;
  ownerName: string | null;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  try {
    // Get role for filtering
    const role = await getUserRole();

    // Get month and viewAs filters
    const params = await searchParams;
    const monthParam = params.month || "current";
    const viewAs = params.viewAs;

    const dateRange = getMonthDateRange(monthParam);

    // Determine if we're in "shopper view" mode
    const viewAsShopperName = role === 'superadmin' ? getViewAsShopperName(viewAs) : null;
    const isShopperView = role === 'shopper' || !!viewAsShopperName;

    // Get shopper ID if in shopper view (for owner filtering)
    let shopperIdForOwnerFilter: string | null = null;

    if (isShopperView) {
      let shopperName: string | null = null;

      if (viewAsShopperName) {
        // Superadmin viewing as shopper
        shopperName = viewAsShopperName;
      } else {
        // Actual shopper
        const currentUser = await getCurrentUser();
        shopperName = currentUser?.fullName || null;
      }

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

        if (shopper) {
          shopperIdForOwnerFilter = shopper.id;
        }
      }
    }

    // Fetch buyers - filtered by owner for shoppers
    // Shoppers only see clients they OWN (not unassigned clients)
    const buyersData = await db.query.buyers.findMany({
      where: shopperIdForOwnerFilter
        ? eq(buyers.ownerId, shopperIdForOwnerFilter)
        : undefined,
      with: {
        owner: true,
      },
      limit: 500,
    });

    // Get all buyer IDs to fetch their sales
    const buyerIds = buyersData.map(b => b.id);

    // Build conditions for sales query
    const salesConditions: any[] = [isNull(sales.deletedAt)];

    // Apply date range filter if specified
    if (dateRange) {
      salesConditions.push(gte(sales.saleDate, dateRange.start));
      salesConditions.push(lte(sales.saleDate, dateRange.end));
    }

    // Only fetch sales for the buyers we're showing
    if (buyerIds.length > 0) {
      salesConditions.push(inArray(sales.buyerId, buyerIds));
    }

    // Fetch sales for the filtered buyers
    const salesData = buyerIds.length > 0
      ? await db.query.sales.findMany({
          where: and(...salesConditions),
          with: {
            buyer: true,
            shopper: true,
          },
          limit: 1000,
        })
      : [];

    // Calculate stats for each buyer
    const clientsWithStats: ClientWithStats[] = buyersData.map(buyer => {
      const buyerSales = salesData.filter(sale => sale.buyerId === buyer.id);

      const paidSales = buyerSales.filter(sale =>
        sale.invoiceStatus?.toUpperCase() === 'PAID'
      );

      const sales2026 = paidSales.filter(sale => {
        if (sale.source !== 'atelier') return false;
        const saleDate = sale.saleDate ? new Date(sale.saleDate) : null;
        if (!saleDate) return false;
        return saleDate >= new Date('2026-01-01');
      });

      const totalSpend = paidSales.reduce((sum, sale) => sum + (sale.saleAmountIncVat || 0), 0);
      const totalMargin = paidSales.reduce((sum, sale) => sum + (sale.grossMargin || 0), 0);
      const tradesCount = paidSales.length;

      const spend2026 = sales2026.reduce((sum, sale) => sum + (sale.saleAmountIncVat || 0), 0);
      const margin2026 = sales2026.reduce((sum, sale) => sum + (sale.grossMargin || 0), 0);
      const trades2026 = sales2026.length;

      const lastPurchaseDate = buyerSales.length > 0
        ? buyerSales.reduce((latest, sale) => {
            const saleDate = sale.saleDate ? new Date(sale.saleDate) : null;
            if (!saleDate) return latest;
            if (!latest) return saleDate;
            return saleDate > latest ? saleDate : latest;
          }, null as Date | null)
        : null;

      const unpaidSales = buyerSales.filter(sale =>
        sale.invoiceStatus?.toUpperCase() === 'AUTHORISED'
      );
      const pipelineValue = unpaidSales.reduce((sum, sale) => sum + (sale.saleAmountIncVat || 0), 0);

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
        ownerId: buyer.owner?.id ?? null,
        ownerName: buyer.owner?.name ?? null,
      };
    });

    // Sort by 2026 activity first, then by total spend
    clientsWithStats.sort((a, b) => {
      if (a.has2026Activity && !b.has2026Activity) return -1;
      if (!a.has2026Activity && b.has2026Activity) return 1;
      if (a.has2026Activity && b.has2026Activity) {
        return b.spend2026 - a.spend2026;
      }
      return b.totalSpend - a.totalSpend;
    });

    // Calculate summary stats
    const totalClients = clientsWithStats.length;
    const totalClientSpend = clientsWithStats.reduce((sum, client) => sum + client.totalSpend, 0);
    const totalSpend2026 = clientsWithStats.reduce((sum, client) => sum + client.spend2026, 0);
    const totalMargin2026 = clientsWithStats.reduce((sum, client) => sum + client.margin2026, 0);
    const totalPipeline = clientsWithStats.reduce((sum, client) => sum + client.pipelineValue, 0);

    const formatCurrency = (amount: number) => {
      return `£${amount.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    };

    const formatDate = (date: Date | null) => {
      if (!date) return '—';
      return new Date(date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    // Subtitle based on view mode
    const getSubtitle = () => {
      if (isShopperView) {
        return `Showing your assigned clients only`;
      }
      return `Client directory and transaction history`;
    };

    return (
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">Clients</h1>
            <p className="text-gray-600">
              {getSubtitle()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <MonthPicker />
            <Link
              href="#"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Client
            </Link>
          </div>
        </div>

        {/* Summary Stats */}
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
        {clientsWithStats.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No clients yet</h3>
            <p className="mt-1 text-sm text-gray-500">Clients will appear here as you create sales.</p>
            <div className="mt-6">
              <Link href="/trade/new" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spend</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">2026 Margin</th>
                    <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Sales</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pipeline</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Purchase</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {clientsWithStats.map((client) => (
                    <tr key={client.id} className={`hover:bg-gray-50 transition-colors ${client.has2026Activity ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {client.has2026Activity && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" title="Active in 2026"></div>
                          )}
                          <div>
                            <Link href={`/clients/${client.id}`} className="text-sm font-medium text-purple-600 hover:text-purple-900">
                              {client.name}
                            </Link>
                            {client.email && <div className="text-xs text-gray-500">{client.email}</div>}
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
          <p className="text-sm text-red-700 mb-4">An error occurred while loading the clients page.</p>
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
