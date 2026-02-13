/**
 * Club 19 Sales OS - Universal Dashboard
 *
 * Role-based dashboard entrypoint
 * Server-side rendering with dynamic content per role
 */

import { getUserRole } from "@/lib/getUserRole";
import { ShopperDashboard } from "@/components/dashboards/ShopperDashboard";
import { AdminDashboard } from "@/components/dashboards/AdminDashboard";
import { FinanceDashboard } from "@/components/dashboards/FinanceDashboard";
import { SuperadminDashboard } from "@/components/dashboards/SuperadminDashboard";
import { FounderDashboard } from "@/components/dashboards/FounderDashboard";
import { OperationsDashboard } from "@/components/dashboards/OperationsDashboard";

export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<{ month?: string; viewAs?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  try {
    const role = await getUserRole();
    const params = await searchParams;
    const monthParam = params.month || "current";
    const viewAs = params.viewAs;

    // Superadmin view switching: Allow superadmin to preview other role experiences
    if (role === "superadmin" && viewAs) {
      switch (viewAs) {
        case "founder":
          return <FounderDashboard monthParam={monthParam} />;
        case "operations":
          return <OperationsDashboard monthParam={monthParam} />;
        case "shopper-hope-peverell":
          return <ShopperDashboard monthParam={monthParam} shopperNameOverride="Hope Peverell" />;
        case "shopper-mary-clair-bromfield":
          return <ShopperDashboard monthParam={monthParam} shopperNameOverride="Mary Clair Bromfield" />;
        // Legacy values for backwards compatibility
        case "shopper-hope":
        case "shopper-hope-sherwin":
          return <ShopperDashboard monthParam={monthParam} shopperNameOverride="Hope Peverell" />;
        case "shopper-mc":
          return <ShopperDashboard monthParam={monthParam} shopperNameOverride="Mary Clair Bromfield" />;
        case "superadmin":
          // Fall through to default superadmin view
          break;
      }
    }

    // Render role-specific dashboard based on actual user role
    switch (role) {
      case "shopper":
        return <ShopperDashboard monthParam={monthParam} />;
      case "admin":
        return <AdminDashboard monthParam={monthParam} />;
      case "finance":
        return <FinanceDashboard monthParam={monthParam} />;
      case "founder":
        return <FounderDashboard monthParam={monthParam} />;
      case "operations":
        return <OperationsDashboard monthParam={monthParam} />;
      case "superadmin":
        return <SuperadminDashboard monthParam={monthParam} />;
      default:
        return <ShopperDashboard monthParam={monthParam} />;
    }
  } catch (error) {
    console.error('[DashboardPage] Error:', error instanceof Error ? error.message : String(error));

    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h1 className="text-xl font-semibold text-red-900 mb-2">Dashboard Error</h1>
          <p className="text-sm text-red-700 mb-4">
            An error occurred while loading the dashboard.
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
