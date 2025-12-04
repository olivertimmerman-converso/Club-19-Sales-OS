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
  console.log("[Legacy Page] 🚀 Starting Legacy Dashboard render");

  // Get user role and check access
  let role;
  try {
    console.log("[Legacy Page] 🔐 Getting user role");
    role = await getUserRole();
    console.log(`[Legacy Page] ✅ Role retrieved: "${role}"`);

    // Check if user has access to legacy dashboard
    console.log("[Legacy Page] 🔒 Checking legacy access permissions");
    assertLegacyAccess(role);
    console.log("[Legacy Page] ✅ Access granted");
  } catch (error) {
    console.error("[Legacy Page] ❌ Role/access check failed:", error);
    throw error; // Re-throw to let Next.js handle the redirect or error
  }

  // Initialize data variables with safe defaults
  console.log("[Legacy Page] 📊 Initializing data variables");
  let summary: any = { totalSales: 0, totalMargin: 0, tradeCount: 0, clientCount: 0, supplierCount: 0, avgMargin: 0, dateRange: { start: null, end: null } };
  let monthlySales: any[] = [];
  let categoryData: any[] = [];
  let supplierData: any[] = [];
  let topClients: any[] = [];
  let topSuppliers: any[] = [];
  let recentTrades: any[] = [];
  let reviewFlags: any = { clientsRequiringReview: 0, suppliersRequiringReview: 0, tradesWithoutDates: 0, clientDetails: [], supplierDetails: [] };

  // Fetch all data in parallel with comprehensive error handling
  console.log("[Legacy Page] 🌐 Fetching all legacy data in parallel");
  try {
    const results = await Promise.allSettled([
      getLegacySummary(),
      getLegacyMonthlySales(),
      getLegacyByCategory(),
      getLegacyBySupplier(),
      getTopLegacyClients(),
      getTopLegacySuppliers(),
      getRecentLegacyTrades(20),
      getReviewFlags(),
    ]);

    // Process results with detailed logging
    console.log("[Legacy Page] 📋 Processing data fetch results");

    if (results[0].status === "fulfilled") {
      summary = results[0].value;
      console.log("[Legacy Page] ✅ Summary data:", summary);
    } else {
      console.error("[Legacy Page] ❌ getSummary failed:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      monthlySales = results[1].value;
      console.log(`[Legacy Page] ✅ Monthly sales: ${monthlySales.length} months`);
    } else {
      console.error("[Legacy Page] ❌ getMonthlySales failed:", results[1].reason);
    }

    if (results[2].status === "fulfilled") {
      categoryData = results[2].value;
      console.log(`[Legacy Page] ✅ Category data: ${categoryData.length} categories`);
    } else {
      console.error("[Legacy Page] ❌ getByCategory failed:", results[2].reason);
    }

    if (results[3].status === "fulfilled") {
      supplierData = results[3].value;
      console.log(`[Legacy Page] ✅ Supplier data: ${supplierData.length} suppliers`);
    } else {
      console.error("[Legacy Page] ❌ getBySupplier failed:", results[3].reason);
    }

    if (results[4].status === "fulfilled") {
      topClients = results[4].value;
      console.log(`[Legacy Page] ✅ Top clients: ${topClients.length} clients`);
    } else {
      console.error("[Legacy Page] ❌ getTopClients failed:", results[4].reason);
    }

    if (results[5].status === "fulfilled") {
      topSuppliers = results[5].value;
      console.log(`[Legacy Page] ✅ Top suppliers: ${topSuppliers.length} suppliers`);
    } else {
      console.error("[Legacy Page] ❌ getTopSuppliers failed:", results[5].reason);
    }

    if (results[6].status === "fulfilled") {
      recentTrades = results[6].value;
      console.log(`[Legacy Page] ✅ Recent trades: ${recentTrades.length} trades`);
    } else {
      console.error("[Legacy Page] ❌ getRecentTrades failed:", results[6].reason);
    }

    if (results[7].status === "fulfilled") {
      reviewFlags = results[7].value;
      console.log("[Legacy Page] ✅ Review flags:", reviewFlags);
    } else {
      console.error("[Legacy Page] ❌ getReviewFlags failed:", results[7].reason);
    }

    console.log("[Legacy Page] ✅ All data fetching complete");
  } catch (error) {
    console.error("[Legacy Page] ❌ Fatal error during data fetch:", error);
    console.error("[Legacy Page] 📊 Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    // Data variables remain with safe defaults
  }

  console.log("[Legacy Page] 🎨 Rendering dashboard UI");

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
