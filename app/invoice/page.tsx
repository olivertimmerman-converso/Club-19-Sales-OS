import { redirect } from "next/navigation";

/**
 * Legacy /invoice route - redirects to new Deal Studio
 * The old InvoiceFlow has been replaced by the Sales Atelier wizard at /trade/new
 */
export default function InvoicePage() {
  redirect("/trade/new");
}
