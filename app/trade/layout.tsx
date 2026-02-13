/**
 * Club 19 Sales OS - Trade Routes Layout
 *
 * Wraps trade wizard with standard OS layout (sidebar + nav)
 */

import { OSLayout } from "@/components/OSLayout";

export default function TradeRoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OSLayout>{children}</OSLayout>;
}
