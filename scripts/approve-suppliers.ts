/**
 * List and approve pending suppliers
 * Usage: npx tsx scripts/approve-suppliers.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { suppliers } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const pending = await db
    .select({ id: suppliers.id, name: suppliers.name, email: suppliers.email, createdBy: suppliers.createdBy })
    .from(suppliers)
    .where(eq(suppliers.pendingApproval, true));

  console.log(`Found ${pending.length} pending suppliers:\n`);
  for (const s of pending) {
    console.log(`  - ${s.name} (${s.email || 'no email'}) [${s.id}]`);
  }

  if (pending.length === 0) {
    console.log("Nothing to approve.");
    process.exit(0);
  }

  // Approve all
  console.log("\nApproving all...");
  for (const s of pending) {
    await db
      .update(suppliers)
      .set({
        pendingApproval: false,
        approvedBy: "system",
        approvedAt: new Date(),
      })
      .where(eq(suppliers.id, s.id));
    console.log(`  Approved: ${s.name}`);
  }

  console.log("\nDone.");
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
