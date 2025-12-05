/**
 * Club 19 Sales OS - Shopper Legacy Dashboard
 *
 * Allowed: All roles
 * - Shoppers see only their own data
 * - Other roles can select which shopper to view
 */

export const dynamic = "force-dynamic";

import { getUserRole } from "@/lib/getUserRole";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  getLegacySummary,
  getLegacyMonthlySales,
  getLegacyByCategory,
  getLegacyBySupplier,
  getTopLegacyClients,
  getTopLegacySuppliers,
  getRecentLegacyTrades,
} from "@/lib/legacyData";
import { SummaryCards } from "@/components/legacy/SummaryCards";
import { SalesOverTimeChart } from "@/components/legacy/SalesOverTimeChart";
import { MarginOverTimeChart } from "@/components/legacy/MarginOverTimeChart";
import { CategoryBreakdownChart } from "@/components/legacy/CategoryBreakdownChart";
import { SupplierContributionChart } from "@/components/legacy/SupplierContributionChart";
import { TopClientsTable } from "@/components/legacy/TopClientsTable";
import { TopSuppliersTable } from "@/components/legacy/TopSuppliersTable";
import { RecentTradesTable } from "@/components/legacy/RecentTradesTable";
import { ShopperSelector } from "@/components/legacy/ShopperSelector";

export default async function MyLegacySalesPage({
  searchParams,
}: {
  searchParams: { shopper?: string };
}) {
  console.log("[My Legacy Sales] 🚀 Starting page render");

  let role;
  try {
    role = await getUserRole();
    console.log(`[My Legacy Sales] ✅ Role resolved: "${role}"`);
  } catch (error) {
    console.error("[My Legacy Sales] ❌ Failed to get user role:", error);
    throw error;
  }

  // Determine which shopper's data to show
  let shopperToView: "Hope" | "MC";

  if (role === "shopper") {
    // Shoppers see only their own data
    // Detect shopper from Clerk user name
    const { userId } = await auth();
    const client = await clerkClient();
    const user = await client.users.getUser(userId!);
    const userName = user.firstName || user.emailAddresses[0]?.emailAddress || "";
    shopperToView = userName.toLowerCase().includes("hope") ? "Hope" : "MC";
    console.log(`[My Legacy Sales] 👤 Shopper user viewing own data: "${shopperToView}"`);
  } else {
    // Non-shoppers can select
    shopperToView = (searchParams.shopper as "Hope" | "MC") || "Hope";
    console.log(`[My Legacy Sales] 👔 Admin/Finance viewing: "${shopperToView}"`);
  }

  // Fetch data for selected shopper with error handling
  console.log(`[My Legacy Sales] 📊 Fetching legacy data for shopper: "${shopperToView}"`);
  let summary: any = { totalSales: 0, totalMargin: 0, tradeCount: 0, avgMargin: 0, dateRange: { start: null, end: null } };
  let monthlySales: any[] = [];
  let categoryData: any[] = [];
  let supplierData: any[] = [];
  let topClients: any[] = [];
  let topSuppliers: any[] = [];
  let recentTrades: any[] = [];

  try {
    const results = await Promise.allSettled([
      getLegacySummary(shopperToView),
      getLegacyMonthlySales(shopperToView),
      getLegacyByCategory(shopperToView),
      getLegacyBySupplier(shopperToView),
      getTopLegacyClients(shopperToView),
      getTopLegacySuppliers(shopperToView),
      getRecentLegacyTrades(20, shopperToView),
    ]);

    if (results[0].status === "fulfilled") summary = results[0].value;
    else console.error("[My Legacy Sales] ❌ getSummary failed:", results[0].reason);

    if (results[1].status === "fulfilled") monthlySales = results[1].value;
    else console.error("[My Legacy Sales] ❌ getMonthlySales failed:", results[1].reason);

    if (results[2].status === "fulfilled") categoryData = results[2].value;
    else console.error("[My Legacy Sales] ❌ getByCategory failed:", results[2].reason);

    if (results[3].status === "fulfilled") supplierData = results[3].value;
    else console.error("[My Legacy Sales] ❌ getBySupplier failed:", results[3].reason);

    if (results[4].status === "fulfilled") topClients = results[4].value;
    else console.error("[My Legacy Sales] ❌ getTopClients failed:", results[4].reason);

    if (results[5].status === "fulfilled") topSuppliers = results[5].value;
    else console.error("[My Legacy Sales] ❌ getTopSuppliers failed:", results[5].reason);

    if (results[6].status === "fulfilled") recentTrades = results[6].value;
    else console.error("[My Legacy Sales] ❌ getRecentTrades failed:", results[6].reason);

    console.log(`[My Legacy Sales] ✅ Data fetch complete - rendering UI`);
  } catch (error) {
    console.error("[My Legacy Sales] ❌ Fatal error during data fetch:", error);
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">
          {role === "shopper" ? "My Legacy Sales" : `${shopperToView}'s Legacy Sales`}
        </h1>
        <p className="text-gray-600">
          Historical trade data (Dec 2024 - Oct 2025)
        </p>
      </div>

      {/* Shopper Selector (non-shoppers only) */}
      {role !== "shopper" && (
        <div className="mb-6">
          <ShopperSelector currentShopper={shopperToView} />
        </div>
      )}

      {/* Summary Cards (no counts for shopper view) */}
      <SummaryCards summary={summary} showCounts={false} />

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
