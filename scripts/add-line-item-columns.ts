import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.XATA_POSTGRES_URL!);

  console.log("Adding supplier_invoice_ref column...");
  await sql`ALTER TABLE line_items ADD COLUMN IF NOT EXISTS supplier_invoice_ref text`;

  console.log("Adding date_purchased column...");
  await sql`ALTER TABLE line_items ADD COLUMN IF NOT EXISTS date_purchased timestamptz`;

  console.log("Done — columns added successfully");
  await sql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
