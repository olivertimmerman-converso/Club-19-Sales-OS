import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sales } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const [sale] = await db.select().from(sales).where(eq(sales.xeroInvoiceNumber, "INV-3260")).limit(1);
  if (!sale) { console.log("NOT FOUND"); process.exit(0); }

  console.log("INV-3260:");
  console.log("  source:", sale.source);
  console.log("  shippingCost:", sale.shippingCost);
  console.log("  shippingCostConfirmed:", sale.shippingCostConfirmed);
  console.log("  completedAt:", sale.completedAt);
  console.log("  invoiceStatus:", sale.invoiceStatus);
  console.log("  deletedAt:", sale.deletedAt);
  console.log("  needsAllocation:", sale.needsAllocation);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
