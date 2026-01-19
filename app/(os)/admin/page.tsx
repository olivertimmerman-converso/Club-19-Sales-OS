import Link from "next/link";
import { XataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import { clerkClient } from "@clerk/nextjs/server";
import { getTokens } from "@/lib/xero-auth";
import { QuickActions } from './QuickActions';
import { PendingSuppliersSection } from './PendingSuppliersSection';

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Admin Page
 *
 * System administration and configuration
 * Restricted: Superadmin only
 */

const xata = new XataClient();

export default async function AdminPage() {
  // Verify superadmin role
  const role = await getUserRole();

  if (role !== "superadmin") {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-red-900">Access Denied</h3>
          <p className="mt-1 text-sm text-red-700">
            This page is restricted to superadmin users only.
          </p>
        </div>
      </div>
    );
  }

  // Fetch staff users from Clerk
  const client = await clerkClient();
  const clerkUsers = await client.users.getUserList({ limit: 100 });

  // Map to staff with roles
  const staffUsers = clerkUsers.data.map(user => {
    const metadata = user.publicMetadata as { staffRole?: string } | undefined;
    return {
      id: user.id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unnamed User',
      email: user.emailAddresses[0]?.emailAddress || 'No email',
      role: metadata?.staffRole || 'shopper',
      status: user.banned ? 'inactive' : 'active',
    };
  });

  // Fetch commission bands from Xata
  const commissionBands = await xata.db.CommissionBands
    .select(['*'])
    .getAll();

  // Fetch pending suppliers
  const pendingSuppliersRaw = await xata.db.Suppliers
    .filter({ pending_approval: true } as any)
    .select(['id', 'name', 'email', 'created_by', 'xata.createdAt'] as any)
    .getAll();

  const pendingSuppliers = pendingSuppliersRaw.map(s => ({
    id: s.id,
    name: s.name || 'Unknown',
    email: s.email || null,
    created_by: (s as any).created_by || null,
    created_at: s.xata?.createdAt?.toISOString() || null,
  }));

  // System environment info
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
  const isProduction = appUrl.includes('vercel.app') || appUrl.includes('club19');
  const environment = isProduction ? 'Production' : 'Development';

  // Check Xero integration status (proper check with env vars + OAuth tokens)
  let xeroConnected = false;
  let xeroStatus = 'Disconnected';

  // First check: Environment variables
  const hasXeroEnvVars = !!(
    process.env.NEXT_PUBLIC_XERO_CLIENT_ID &&
    process.env.XERO_CLIENT_SECRET &&
    process.env.XERO_INTEGRATION_CLERK_USER_ID
  );

  if (hasXeroEnvVars) {
    // Second check: OAuth tokens in Clerk metadata
    try {
      const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID!;
      const tokens = await getTokens(integrationUserId);

      if (tokens && tokens.accessToken) {
        // Check if token is expired
        const now = Date.now();
        const expiresAt = tokens.expiresAt;

        if (expiresAt && expiresAt > now) {
          xeroConnected = true;
          xeroStatus = 'Connected';
        } else if (tokens.refreshToken) {
          xeroStatus = 'Token Expired (will auto-refresh)';
          xeroConnected = true; // Still functional due to refresh token
        } else {
          xeroStatus = 'Token Expired';
        }
      } else {
        xeroStatus = 'Not Authorized (no tokens)';
      }
    } catch (error) {
      console.error('[Admin] Error checking Xero tokens:', error);
      xeroStatus = 'Not Authorized (no tokens)';
    }
  } else {
    xeroStatus = 'Not Configured (missing env vars)';
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 mb-2">System Administration</h1>
        <p className="text-gray-600">
          Manage users, system settings, and integrations
        </p>
      </div>

      {/* User Management Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
          <a
            href="https://dashboard.clerk.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            Manage in Clerk
            <svg
              className="ml-2 w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Email
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Role
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
                {staffUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === 'superadmin' ? 'bg-purple-100 text-purple-800' :
                        user.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                        user.role === 'finance' ? 'bg-green-100 text-green-800' :
                        user.role === 'operations' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pending Suppliers Section */}
      <PendingSuppliersSection suppliers={pendingSuppliers} />

      {/* Commission Configuration Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Commission Configuration</h2>
          <button
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors opacity-50 cursor-not-allowed"
            disabled
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
            Add Band
          </button>
        </div>

        {commissionBands.length === 0 ? (
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
                d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No commission bands configured</h3>
            <p className="mt-1 text-sm text-gray-500">
              Commission bands define tiered commission rates based on margin thresholds.
            </p>
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
                      Band Type
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Min Threshold
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Max Threshold
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Commission %
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {commissionBands.map((band) => (
                    <tr key={band.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {band.band_type || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        £{(band.min_threshold || 0).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                        {band.max_threshold
                          ? `£${band.max_threshold.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : '∞'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                        {(band.commission_percent || 0).toFixed(1)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          className="text-purple-600 hover:text-purple-900 opacity-50 cursor-not-allowed"
                          disabled
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* System Settings Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Integration Status */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Integration Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Xero</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  xeroConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {xeroStatus}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Database (Xata)</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Clerk Auth</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
            </div>
          </div>

          {/* Environment Info */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-4">Environment Info</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Environment</span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  isProduction ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {environment}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-gray-700 mb-1">App URL</span>
                <span className="text-xs text-gray-500 font-mono break-all">{appUrl}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Section */}
      <QuickActions />

      {/* Danger Zone Section */}
      <div className="border-2 border-red-200 rounded-lg p-6 bg-red-50">
        <h2 className="text-xl font-semibold text-red-900 mb-2">Danger Zone</h2>
        <p className="text-sm text-red-700 mb-4">
          Destructive actions that require caution. These operations cannot be undone.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors opacity-50 cursor-not-allowed"
            disabled
          >
            Clear Error Log
          </button>
          <button
            className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors opacity-50 cursor-not-allowed"
            disabled
          >
            Reset Commission Locks
          </button>
        </div>
      </div>
    </div>
  );
}
