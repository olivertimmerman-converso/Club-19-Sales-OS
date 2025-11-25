"use client";

import { useClerk } from "@clerk/nextjs";

type AccessDeniedProps = {
  userEmail: string;
  userName: string;
};

export default function AccessDenied({
  userEmail,
  userName,
}: AccessDeniedProps) {
  const { signOut } = useClerk();

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="font-serif tracking-widest text-3xl mb-2">
            CLUB<span className="text-4xl">19</span>
          </div>
          <div className="font-serif tracking-widest text-sm">LONDON</div>
        </div>
        <div className="mb-6">
          <svg
            className="w-16 h-16 text-red-500 mx-auto mb-4"
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
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Access Denied
          </h2>
          <p className="text-gray-600 mb-4">
            You do not have access to this application.
          </p>
          <p className="text-sm text-gray-500">
            Logged in as: <span className="font-mono">{userEmail}</span>
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full bg-black text-white py-3 px-4 rounded font-medium hover:bg-gray-800 transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
