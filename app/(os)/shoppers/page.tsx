/**
 * Club 19 Sales OS - Shoppers List Page
 *
 * View and manage all shoppers in the system
 * Accessible to: superadmin, founder, operations
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Users, Plus } from "lucide-react";
// ORIGINAL XATA: import { getXataClient } from "@/src/xata";
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { getUserRole } from "@/lib/getUserRole";
import { canAccess } from "@/lib/rbac";

// ORIGINAL XATA: const xata = getXataClient();

// Helper to format currency
const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "£0.00";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
};

export default async function ShoppersPage() {
  const role = await getUserRole();

  if (!role || !canAccess("/shoppers", role)) {
    redirect("/unauthorised");
  }

  // ORIGINAL XATA:
  // const shoppers = await xata.db.Shoppers.select([
  //   "id",
  //   "name",
  //   "email",
  //   "commission_scheme",
  //   "active",
  // ]).getAll();

  // Fetch shoppers + sales in parallel
  const [shoppersData, allSales] = await Promise.all([
    db.query.shoppers.findMany(),
    db.query.sales.findMany({
      with: {
        shopper: true,
      },
      limit: 2000,
    }),
  ]);

  // Calculate metrics for each shopper
  const shopperMetrics = shoppersData.map((shopper) => {
    const shopperSales = allSales.filter(
      (sale) => sale.shopperId === shopper.id
    );

    const totalSales = shopperSales.length;
    const totalRevenue = shopperSales.reduce(
      (sum, sale) => sum + (sale.saleAmountIncVat || 0),
      0
    );
    const totalMargin = shopperSales.reduce(
      (sum, sale) => sum + (sale.grossMargin || 0),
      0
    );

    return {
      ...shopper,
      totalSales,
      totalRevenue,
      totalMargin,
    };
  });

  // Sort by total revenue (highest first)
  const sortedShoppers = shopperMetrics.sort(
    (a, b) => b.totalRevenue - a.totalRevenue
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Users className="w-8 h-8 text-purple-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Shoppers</h1>
                <p className="text-gray-600">
                  Manage sales team members and view their performance
                </p>
              </div>
            </div>

            {role === "superadmin" && (
              <Link
                href="/shoppers/new"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Plus size={20} />
                Add Shopper
              </Link>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">
              Total Shoppers
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {shoppersData.length}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {shoppersData.filter((s) => s.active).length} active
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">
              Total Sales
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {allSales.filter((s) => s.shopperId).length}
            </div>
            <div className="text-sm text-gray-500 mt-1">
              Across all shoppers
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-600 mb-1">
              Total Revenue
            </div>
            <div className="text-3xl font-bold text-gray-900">
              {formatCurrency(
                allSales
                  .filter((s) => s.shopperId)
                  .reduce((sum, s) => sum + (s.saleAmountIncVat || 0), 0)
              )}
            </div>
            <div className="text-sm text-gray-500 mt-1">From all shoppers</div>
          </div>
        </div>

        {/* Shoppers Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Commission Scheme
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Sales
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Revenue
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Margin
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedShoppers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-500"
                  >
                    <Users className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                    <p className="text-lg font-medium">No shoppers found</p>
                    <p className="text-sm mt-1">
                      Add your first shopper to get started
                    </p>
                  </td>
                </tr>
              ) : (
                sortedShoppers.map((shopper) => (
                  <tr
                    key={shopper.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/shoppers/${shopper.id}`}
                        className="text-purple-600 hover:text-purple-900 font-medium"
                      >
                        {shopper.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shopper.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {shopper.commissionScheme || "standard"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {shopper.totalSales}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {formatCurrency(shopper.totalRevenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      {formatCurrency(shopper.totalMargin)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {shopper.active ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Inactive
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
