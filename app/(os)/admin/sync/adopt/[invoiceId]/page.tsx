/**
 * Club 19 Sales OS - Adopt Invoice Page
 *
 * Allows users to convert an unallocated Xero invoice into a full Sale record
 */

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getUserRole } from "@/lib/getUserRole";
import { getXataClient } from "@/src/xata";
import { AdoptInvoiceClient } from "./AdoptInvoiceClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ invoiceId: string }>;
}

export default async function AdoptInvoicePage({ params }: PageProps) {
  const { invoiceId } = await params;

  // Verify authentication
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Check role permissions
  const role = await getUserRole();
  if (!["superadmin", "operations", "founder", "admin"].includes(role || "")) {
    redirect("/dashboard");
  }

  const xata = getXataClient();

  // Fetch shoppers for the dropdown
  const shoppersRaw = await xata.db.Shoppers
    .filter({ active: true })
    .select(["id", "name"])
    .sort("name", "asc")
    .getAll();

  // Fetch suppliers for the dropdown
  const suppliersRaw = await xata.db.Suppliers
    .select(["id", "name"])
    .sort("name", "asc")
    .getAll();

  // Serialize for client component
  const shoppers = shoppersRaw.map((s) => ({
    id: s.id,
    name: s.name || "Unknown",
  }));

  const suppliers = suppliersRaw.map((s) => ({
    id: s.id,
    name: s.name || "Unknown",
  }));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <AdoptInvoiceClient
        invoiceId={invoiceId}
        shoppers={shoppers}
        suppliers={suppliers}
      />
    </div>
  );
}
