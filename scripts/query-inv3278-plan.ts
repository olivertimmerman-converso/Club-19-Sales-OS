import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sales, paymentSchedule } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  // Find INV-3278
  const [sale] = await db
    .select()
    .from(sales)
    .where(eq(sales.xeroInvoiceNumber, "INV-3278"))
    .limit(1);

  if (!sale) { console.log("INV-3278 not found"); process.exit(1); }

  console.log("=== INV-3278 ===");
  console.log("  ID:", sale.id);
  console.log("  Amount inc VAT:", sale.saleAmountIncVat);
  console.log("  Is payment plan:", sale.isPaymentPlan);
  console.log("  Payment plan instalments count:", sale.paymentPlanInstalments);

  // Get payment schedule
  const instalments = await db
    .select()
    .from(paymentSchedule)
    .where(eq(paymentSchedule.saleId, sale.id));

  console.log("\n  Instalments:");
  for (const inst of instalments) {
    console.log(`    #${inst.instalmentNumber}: £${inst.amount} | due: ${inst.dueDate} | status: ${inst.status}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
