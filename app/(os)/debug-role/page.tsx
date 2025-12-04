/**
 * Debug Role Page - Shows current user's Clerk metadata
 */

import { auth, clerkClient } from "@clerk/nextjs/server";

export default async function DebugRolePage() {
  const { userId } = await auth();

  if (!userId) {
    return <div className="p-6">Not signed in</div>;
  }

  const user = await (await clerkClient()).users.getUser(userId);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">🔍 Debug Role Information</h1>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="font-semibold mb-2">User ID</h2>
        <code className="text-sm">{userId}</code>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="font-semibold mb-2">Email</h2>
        <code className="text-sm">{user.emailAddresses[0]?.emailAddress}</code>
      </div>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="font-semibold mb-2">Public Metadata (Raw)</h2>
        <pre className="text-sm overflow-x-auto">
          {JSON.stringify(user.publicMetadata, null, 2)}
        </pre>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <p className="text-sm font-semibold mb-2">How to fix:</p>
        <ol className="text-sm list-decimal list-inside space-y-1">
          <li>Copy the User ID above</li>
          <li>Go to <a href="https://dashboard.clerk.com" className="text-blue-600 underline" target="_blank">Clerk Dashboard</a></li>
          <li>Find your user by email: {user.emailAddresses[0]?.emailAddress}</li>
          <li>Check if the User ID matches - if not, you have multiple accounts!</li>
          <li>Edit publicMetadata and add: <code className="bg-white px-1">{`{ "staffRole": "superadmin" }`}</code></li>
          <li>Save and refresh this page</li>
        </ol>
      </div>
    </div>
  );
}
