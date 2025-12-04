/**
 * Club 19 Sales OS - Leadership Legacy Dashboard
 *
 * Restricted: Superadmin, Admin, Finance
 * Comprehensive view of all historical trade data
 */

export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getUserRole, assertLegacyAccess } from "@/lib/getUserRole";
import {
  getLegacySummary,
  getLegacyMonthlySales,
  getLegacyByCategory,
  getLegacyBySupplier,
  getTopLegacyClients,
  getTopLegacySuppliers,
  getRecentLegacyTrades,
  getReviewFlags,
} from "@/lib/legacyData";
import { SummaryCards } from "@/components/legacy/SummaryCards";
import { SalesOverTimeChart } from "@/components/legacy/SalesOverTimeChart";
import { MarginOverTimeChart } from "@/components/legacy/MarginOverTimeChart";
import { CategoryBreakdownChart } from "@/components/legacy/CategoryBreakdownChart";
import { SupplierContributionChart } from "@/components/legacy/SupplierContributionChart";
import { TopClientsTable } from "@/components/legacy/TopClientsTable";
import { TopSuppliersTable } from "@/components/legacy/TopSuppliersTable";
import { RecentTradesTable } from "@/components/legacy/RecentTradesTable";
import { ReviewFlagsPanel } from "@/components/legacy/ReviewFlagsPanel";

export default async function LegacyDashboardPage() {
  // RBAC: Only superadmin, admin, finance
  const role = await getUserRole();

  // ---------------------------------------------
  // TEMPORARY OVERRIDE: PAGE-LEVEL RBAC DISABLED
  // Allows all authenticated users to view legacy dashboard
  // during test mode (matches middleware RBAC disable)
  // ---------------------------------------------
  console.warn("[LEGACY PAGE] ⚠️  RBAC TEMP DISABLED - Allowing role:", role);

  // ORIGINAL RBAC CODE (COMMENTED OUT FOR TESTING):
  // // Redirect shoppers to their personal sales view
  // if (role === "shopper") {
  //   redirect("/legacy/my-sales");
  // }
  //
  // // Assert legacy access (will redirect to /unauthorised if denied)
  // assertLegacyAccess(role);

  // Fetch all data in parallel
  const [
    summary,
    monthlySales,
    categoryData,
    supplierData,
    topClients,
    topSuppliers,
    recentTrades,
    reviewFlags,
  ] = await Promise.all([
    getLegacySummary(),
    getLegacyMonthlySales(),
    getLegacyByCategory(),
    getLegacyBySupplier(),
    getTopLegacyClients(),
    getTopLegacySuppliers(),
    getRecentLegacyTrades(20),
    getReviewFlags(),
  ]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          Legacy Data Dashboard
        </h1>
        <p className="text-gray-600">
          Historical trade data from Hope and MC (Dec 2024 - Oct 2025)
        </p>
      </div>

      {/* Summary Cards */}
      <SummaryCards summary={summary} showCounts={true} />

      {/* Review Flags */}
      <div className="mb-8">
        <ReviewFlagsPanel flags={reviewFlags} />
      </div>

      {/* Charts - 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <SalesOverTimeChart data={monthlySales} />
        <MarginOverTimeChart data={monthlySales} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <CategoryBreakdownChart data={categoryData} />
        <SupplierContributionChart data={supplierData} />
      </div>

      {/* Tables - Full Width */}
      <div className="space-y-6 mb-8">
        <RecentTradesTable data={recentTrades} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopClientsTable data={topClients} />
        <TopSuppliersTable data={topSuppliers} />
      </div>
    </div>
  );
}
