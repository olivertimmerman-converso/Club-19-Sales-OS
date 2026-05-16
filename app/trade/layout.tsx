/**
 * Club 19 Sales OS - Trade Routes Layout
 *
 * Wraps trade wizard with standard OS layout (sidebar + nav).
 * `force-dynamic` here covers the client-component children (new/page,
 * success/page) which can't carry the directive themselves — middleware
 * uses headers() so static generation isn't appropriate anyway.
 */

export const dynamic = "force-dynamic";

import { OSLayout } from "@/components/OSLayout";

export default function TradeRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OSLayout>{children}</OSLayout>;
}
