/**
 * Club 19 Sales OS - Loading Block Component
 *
 * Gold spinner on black background for loading states
 */

import { Loader2 } from "lucide-react";

interface LoadingBlockProps {
  message?: string;
}

export function LoadingBlock({ message = "Loading..." }: LoadingBlockProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 size={48} className="animate-spin text-club19-taupe" />
      <p className="mt-4 text-club19-taupe font-sans font-medium">{message}</p>
    </div>
  );
}
