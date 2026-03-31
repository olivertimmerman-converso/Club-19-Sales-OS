import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");

  const tables = ['shoppers','buyers','suppliers','introducers','commission_bands','sales','errors','payment_schedule','line_items','legacy_suppliers','legacy_clients','legacy_trades'];

  console.log("=== TABLE ROW COUNTS ===");
  for (const t of tables) {
    const r = await db.execute(sql.raw(`SELECT count(*) as c FROM "${t}"`));
    const total = (r as any)[0]?.c;
    if (t === 'sales') {
      const del = await db.execute(sql.raw('SELECT count(*) as c FROM sales WHERE deleted_at IS NOT NULL'));
      const dismissed = await db.execute(sql.raw('SELECT count(*) as c FROM sales WHERE dismissed = true'));
      console.log(`${t}: ${total} (deleted: ${(del as any)[0]?.c}, dismissed: ${(dismissed as any)[0]?.c})`);
    } else {
      console.log(`${t}: ${total}`);
    }
  }

  console.log("\n=== SALES BY SOURCE ===");
  const sources = await db.execute(sql.raw('SELECT source, count(*) as c FROM sales GROUP BY source ORDER BY c DESC'));
  (sources as any[]).forEach((r: any) => console.log(`  ${r.source || 'NULL'}: ${r.c}`));

  console.log("\n=== INVOICE STATUSES ===");
  const statuses = await db.execute(sql.raw('SELECT invoice_status, count(*) as c FROM sales GROUP BY invoice_status ORDER BY c DESC'));
  (statuses as any[]).forEach((r: any) => console.log(`  ${r.invoice_status || 'NULL'}: ${r.c}`));

  console.log("\n=== BRANDING THEMES ===");
  const themes = await db.execute(sql.raw('SELECT branding_theme, count(*) as c FROM sales GROUP BY branding_theme ORDER BY c DESC'));
  (themes as any[]).forEach((r: any) => console.log(`  ${r.branding_theme || 'NULL'}: ${r.c}`));

  console.log("\n=== BUYER TYPES ===");
  const btypes = await db.execute(sql.raw('SELECT buyer_type, count(*) as c FROM sales WHERE buyer_type IS NOT NULL GROUP BY buyer_type ORDER BY c DESC'));
  (btypes as any[]).forEach((r: any) => console.log(`  ${r.buyer_type}: ${r.c}`));

  console.log("\n=== STATUS FIELD VALUES ===");
  const svals = await db.execute(sql.raw('SELECT status, count(*) as c FROM sales GROUP BY status ORDER BY c DESC'));
  (svals as any[]).forEach((r: any) => console.log(`  ${r.status || 'NULL'}: ${r.c}`));

  console.log("\n=== NON-NULL COLUMN USAGE (sales table) ===");
  const nullCheck = await db.execute(sql.raw(`
    SELECT
      count(*) FILTER (WHERE card_fees IS NOT NULL) as card_fees,
      count(*) FILTER (WHERE direct_costs IS NOT NULL) as direct_costs,
      count(*) FILTER (WHERE implied_shipping IS NOT NULL) as implied_shipping,
      count(*) FILTER (WHERE commissionable_margin IS NOT NULL) as commissionable_margin,
      count(*) FILTER (WHERE commission_amount IS NOT NULL) as commission_amount,
      count(*) FILTER (WHERE commission_split_introducer IS NOT NULL) as commission_split_introducer,
      count(*) FILTER (WHERE commission_split_shopper IS NOT NULL) as commission_split_shopper,
      count(*) FILTER (WHERE admin_override_commission_percent IS NOT NULL) as admin_override,
      count(*) FILTER (WHERE commission_locked = true) as commission_locked,
      count(*) FILTER (WHERE commission_paid = true) as commission_paid,
      count(*) FILTER (WHERE commission_clawback = true) as commission_clawback,
      count(*) FILTER (WHERE error_flag = true) as error_flag,
      count(*) FILTER (WHERE payment_method IS NOT NULL) as payment_method,
      count(*) FILTER (WHERE sale_reference IS NOT NULL) as sale_reference,
      count(*) FILTER (WHERE shipping_cost_confirmed = true) as shipping_confirmed,
      count(*) FILTER (WHERE is_payment_plan = true) as is_payment_plan,
      count(*) FILTER (WHERE linked_invoices IS NOT NULL) as linked_invoices,
      count(*) FILTER (WHERE allocated_by IS NOT NULL) as allocated_by,
      count(*) FILTER (WHERE completed_at IS NOT NULL) as completed_at,
      count(*) FILTER (WHERE has_introducer = true) as has_introducer,
      count(*) FILTER (WHERE introducer_id IS NOT NULL) as introducer_id,
      count(*) FILTER (WHERE introducer_commission IS NOT NULL) as introducer_commission,
      count(*) FILTER (WHERE needs_allocation = true) as needs_allocation,
      count(*) FILTER (WHERE dismissed = true) as dismissed,
      count(*) FILTER (WHERE shipping_cost IS NOT NULL) as shipping_cost,
      count(*) FILTER (WHERE shipping_method IS NOT NULL) as shipping_method,
      count(*) FILTER (WHERE buy_price IS NOT NULL AND buy_price > 0) as has_buy_price,
      count(*) FILTER (WHERE gross_margin IS NOT NULL AND gross_margin > 0) as has_margin,
      count(*) FILTER (WHERE supplier_id IS NOT NULL) as has_supplier,
      count(*) FILTER (WHERE internal_notes IS NOT NULL) as internal_notes,
      count(*) FILTER (WHERE xero_invoice_url IS NOT NULL) as xero_invoice_url,
      count(*) FILTER (WHERE xero_payment_date IS NOT NULL) as xero_payment_date,
      count(*) FILTER (WHERE deposit_amount IS NOT NULL) as deposit_amount,
      count(*) FILTER (WHERE error_message IS NOT NULL) as error_message,
      count(*) as total
    FROM sales
  `));
  const row = (nullCheck as any)[0];
  for (const [k, v] of Object.entries(row)) {
    if (k !== 'total') console.log(`  ${k}: ${v} / ${row.total}`);
  }

  console.log("\n=== LINE ITEM SOURCE VALUES ===");
  const liSources = await db.execute(sql.raw('SELECT source, count(*) as c FROM line_items GROUP BY source ORDER BY c DESC'));
  (liSources as any[]).forEach((r: any) => console.log(`  ${r.source || 'NULL'}: ${r.c}`));

  console.log("\n=== SHOPPERS ===");
  const allShoppers = await db.execute(sql.raw('SELECT id, name, clerk_user_id, active FROM shoppers ORDER BY name'));
  (allShoppers as any[]).forEach((r: any) => console.log(`  ${r.name} | clerk: ${r.clerk_user_id || 'NULL'} | active: ${r.active}`));

  console.log("\n=== SUPPLIER APPROVAL STATUS ===");
  const suppApproval = await db.execute(sql.raw('SELECT pending_approval, count(*) as c FROM suppliers GROUP BY pending_approval'));
  (suppApproval as any[]).forEach((r: any) => console.log(`  pending=${r.pending_approval}: ${r.c}`));

  console.log("\n=== DUPLICATE XERO INVOICE NUMBERS ===");
  const dupes = await db.execute(sql.raw(`SELECT xero_invoice_number, count(*) as c FROM sales WHERE xero_invoice_number IS NOT NULL GROUP BY xero_invoice_number HAVING count(*) > 1 ORDER BY c DESC LIMIT 20`));
  if ((dupes as any[]).length === 0) console.log("  None found");
  else (dupes as any[]).forEach((r: any) => console.log(`  ${r.xero_invoice_number}: ${r.c} records`));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
