/**
 * One-shot full-history backfill of Xero credit-note tracking columns.
 *
 * For every sale row with a xero_invoice_id:
 *   1. Fetch the live Xero invoice (per-row GET, throttled to stay under
 *      Xero's 60-req/min and 5,000-req/day limits)
 *   2. Run mapXeroInvoiceToSaleFields() → derive the new columns + status
 *   3. If anything changed, persist new amount columns + recomputed
 *      status + recomputed margins
 *   4. Track per-row before/after for the per-month delta report
 *
 * Resume-safe: skips rows whose xero_amount_paid/due/credited are already
 * populated AND status hasn't drifted, so a second run is a no-op (modulo
 * any rows that have changed in Xero between runs, which we want to pick up).
 *
 * Output:
 *   - stdout summary
 *   - /tmp/credit-note-backfill-report.txt — per-month delta table for Alys
 *
 * Usage:
 *   npx tsx scripts/backfill-xero-credit-notes.ts
 *
 * Optional flags:
 *   --dry-run     compute deltas, don't write
 *   --since=YYYY-MM-DD   restrict to sales on/after this date
 *   --limit=N     max rows to process (for testing)
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { writeFileSync } from "fs";

interface SaleRow {
  id: string;
  xero_invoice_id: string;
  xero_invoice_number: string | null;
  sale_date: Date | null;
  sale_amount_inc_vat: number | null;
  invoice_status: string | null;
  xero_amount_paid: string | null;
  xero_amount_due: string | null;
  xero_amount_credited: string | null;
  buy_price: number | null;
  shipping_cost: number | null;
  card_fees: number | null;
  direct_costs: number | null;
  introducer_commission: number | null;
  source: string | null;
  status: string | null;
  deleted_at: Date | null;
  needs_allocation: boolean | null;
  dismissed: boolean | null;
}

interface DeltaRow {
  invoiceNumber: string | null;
  saleDate: Date | null;
  oldStatus: string | null;
  newStatus: string;
  oldEffective: number;
  newEffective: number;
  delta: number;
  passedHeadlineFilter: boolean;
}

const DRY_RUN = process.argv.includes("--dry-run");
const SINCE_ARG = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : undefined;
const SINCE = SINCE_ARG ? new Date(SINCE_ARG) : null;

// Throttle: ~40 req/min, leaving headroom for the cron jobs that run
// concurrently against Xero (refresh-xero / 10 min, sync-invoices / 30 min,
// sync-payments / hour). Previous 1.2s setting hit 145 × 429s when crons
// fired during the backfill.
const THROTTLE_MS = 1500;
// On 429, wait this long then retry once. Xero's Retry-After header is in
// seconds; we just use a fixed pad that's longer than the typical value.
const RATE_LIMIT_RETRY_MS = 65_000;

async function main() {
  const { db } = await import("@/db");
  const { sales } = await import("@/db/schema");
  const { sql, eq } = await import("drizzle-orm");
  const { mapXeroInvoiceToSaleFields, xeroAmountsChanged } = await import(
    "@/lib/xero-invoice-mapping"
  );
  const { effectiveInvoiceValue, calculateMargins } = await import("@/lib/economics");
  const { getValidTokens } = await import("@/lib/xero-auth");

  const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
  if (!integrationUserId) {
    console.error("XERO_INTEGRATION_CLERK_USER_ID not set");
    process.exit(1);
  }
  // Refresh tokens before EVERY request — getValidTokens caches in memory and
  // refreshes only if expired, so this is cheap. The previous version cached
  // the token once at script start and burned through hundreds of rows with
  // 401s after the 20-min expiry window.
  await getValidTokens(integrationUserId);

  // Pull every linked-to-Xero sale, ordered oldest-first so the per-month
  // delta builds up in chronological order in the log.
  const params: any[] = [];
  let where = `xero_invoice_id IS NOT NULL`;
  if (SINCE) {
    where += ` AND sale_date >= '${SINCE.toISOString()}'`;
  }
  const limitClause = LIMIT ? `LIMIT ${LIMIT}` : "";
  const rows = (await db.execute(
    sql.raw(`
      SELECT id, xero_invoice_id, xero_invoice_number, sale_date,
             sale_amount_inc_vat, invoice_status,
             xero_amount_paid, xero_amount_due, xero_amount_credited,
             buy_price, shipping_cost, card_fees, direct_costs,
             introducer_commission, source, status, deleted_at,
             needs_allocation, dismissed
      FROM sales
      WHERE ${where}
      ORDER BY sale_date ASC NULLS LAST
      ${limitClause}
    `)
  )) as unknown as SaleRow[];

  console.log(`[backfill] scanning ${rows.length} rows`);
  console.log(`[backfill] dry-run: ${DRY_RUN}, throttle: ${THROTTLE_MS}ms/req`);

  let scanned = 0;
  let updated = 0;
  let skippedNoChange = 0;
  let errors = 0;
  let apiCalls = 0;
  let lastRateLimitRemaining: string | null = null;
  const deltas: DeltaRow[] = [];

  for (const row of rows) {
    scanned++;
    if (scanned % 50 === 0) {
      console.log(
        `[backfill] progress ${scanned}/${rows.length} — updated ${updated} skipped ${skippedNoChange} errors ${errors}`
      );
    }

    try {
      // Refresh per request — cheap in-memory cache, refreshes on expiry.
      let tokens = await getValidTokens(integrationUserId);
      // Fetch live Xero invoice — one retry on 429 with a long pause.
      const doFetch = () =>
        fetch(`https://api.xero.com/api.xro/2.0/Invoices/${row.xero_invoice_id}`, {
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            "Xero-Tenant-Id": tokens.tenantId,
            Accept: "application/json",
          },
        });
      let res = await doFetch();
      apiCalls++;
      if (res.status === 429) {
        console.warn(
          `[backfill] 429 for ${row.xero_invoice_number}, sleeping ${RATE_LIMIT_RETRY_MS}ms then retrying once`
        );
        await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_MS));
        tokens = await getValidTokens(integrationUserId);
        res = await doFetch();
        apiCalls++;
      }
      lastRateLimitRemaining = res.headers.get("X-DayLimit-Remaining");

      if (!res.ok) {
        if (res.status === 404) {
          // Invoice deleted from Xero. Skip.
          skippedNoChange++;
          continue;
        }
        const text = await res.text();
        console.error(
          `[backfill] HTTP ${res.status} for ${row.xero_invoice_number}: ${text.slice(0, 200)}`
        );
        errors++;
        continue;
      }

      const data = (await res.json()) as { Invoices?: any[] };
      const invoice = data.Invoices?.[0];
      if (!invoice) {
        errors++;
        continue;
      }

      const mapped = mapXeroInvoiceToSaleFields(invoice);

      // Did anything change vs what we have stored?
      const statusChanged = row.invoice_status !== mapped.invoiceStatus;
      const amountsChanged = xeroAmountsChanged(
        {
          saleAmountIncVat: row.sale_amount_inc_vat ?? 0,
          xeroAmountPaid: row.xero_amount_paid,
          xeroAmountDue: row.xero_amount_due,
          xeroAmountCredited: row.xero_amount_credited,
        },
        invoice
      );

      // Compute old vs new effective for the delta report.
      const oldEffective = effectiveInvoiceValue({
        xeroAmountPaid: row.xero_amount_paid,
        xeroAmountDue: row.xero_amount_due,
        saleAmountIncVat: row.sale_amount_inc_vat,
      });
      const newEffective = effectiveInvoiceValue({
        xeroAmountPaid: mapped.xeroAmountPaid,
        xeroAmountDue: mapped.xeroAmountDue,
        saleAmountIncVat: mapped.saleAmountIncVat,
      });

      // Did this sale pass the OLD headline filter (before the change)?
      // Use the same predicate as SuperadminDashboard pre-change for accurate
      // old-vs-new month delta.
      const passedHeadlineFilter =
        row.source !== "xero_import" &&
        !row.deleted_at &&
        !row.needs_allocation &&
        !row.dismissed &&
        row.status !== "ongoing";

      if (statusChanged || amountsChanged || oldEffective !== newEffective) {
        // sql.raw returns timestamps as strings; coerce to Date so report
        // generation can use .toISOString() / .getUTCMonth() reliably.
        const saleDateAsDate = row.sale_date
          ? row.sale_date instanceof Date
            ? row.sale_date
            : new Date(row.sale_date as unknown as string)
          : null;
        deltas.push({
          invoiceNumber: row.xero_invoice_number,
          saleDate: saleDateAsDate,
          oldStatus: row.invoice_status,
          newStatus: mapped.invoiceStatus,
          oldEffective,
          newEffective,
          delta: newEffective - oldEffective,
          passedHeadlineFilter,
        });
      }

      if (!statusChanged && !amountsChanged) {
        skippedNoChange++;
      } else if (DRY_RUN) {
        updated++;
      } else {
        // Recompute margins with new effective amount-ex-VAT.
        const newExVat = invoice.SubTotal ?? mapped.saleAmountIncVat / 1.2;
        const margins = calculateMargins({
          saleAmountExVat: newExVat,
          buyPrice: row.buy_price,
          shippingCost: row.shipping_cost,
          cardFees: row.card_fees,
          directCosts: row.direct_costs,
          introducerCommission: row.introducer_commission,
        });

        await db
          .update(sales)
          .set({
            saleAmountIncVat: mapped.saleAmountIncVat,
            saleAmountExVat: newExVat,
            xeroAmountPaid: mapped.xeroAmountPaid,
            xeroAmountDue: mapped.xeroAmountDue,
            xeroAmountCredited: mapped.xeroAmountCredited,
            invoiceStatus: mapped.invoiceStatus,
            grossMargin: margins.grossMargin,
            commissionableMargin: margins.commissionableMargin,
          })
          .where(eq(sales.id, row.id));
        updated++;
      }
    } catch (err) {
      console.error(
        `[backfill] error on ${row.xero_invoice_number}:`,
        err instanceof Error ? err.message : String(err)
      );
      errors++;
    }

    // Throttle.
    await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  // ----------------------------------------------------------------------
  // Per-month delta report (only counts rows that pass the headline filter)
  // ----------------------------------------------------------------------
  const byMonth = new Map<
    string,
    { rows: number; oldTotal: number; newTotal: number; invoices: string[] }
  >();
  for (const d of deltas) {
    if (!d.passedHeadlineFilter || !d.saleDate) continue;
    // Old logic counted everything that passed the old filter — including
    // soon-to-be-CREDITED rows. We want: old_total = sum of oldEffective
    // for pre-change rows that DID show up in headline; new_total = sum of
    // newEffective EXCLUDING rows whose new status is CREDITED/DRAFT/VOIDED.
    const month = d.saleDate.toISOString().slice(0, 7);
    const entry = byMonth.get(month) ?? {
      rows: 0,
      oldTotal: 0,
      newTotal: 0,
      invoices: [],
    };
    entry.rows += 1;
    entry.oldTotal += d.oldEffective;
    if (
      d.newStatus !== "CREDITED" &&
      d.newStatus !== "DRAFT" &&
      d.newStatus !== "VOIDED"
    ) {
      entry.newTotal += d.newEffective;
    }
    if (d.invoiceNumber) entry.invoices.push(d.invoiceNumber);
    byMonth.set(month, entry);
  }

  // Format report
  const lines: string[] = [];
  lines.push("=== Credit-note backfill — per-month headline delta ===");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Rows scanned: ${scanned}`);
  lines.push(`Rows updated: ${updated}`);
  lines.push(`Rows unchanged: ${skippedNoChange}`);
  lines.push(`Errors: ${errors}`);
  lines.push(`Xero API calls: ${apiCalls}`);
  if (lastRateLimitRemaining) {
    lines.push(`Daily limit remaining (last response): ${lastRateLimitRemaining}`);
  }
  lines.push("");
  lines.push(
    "Month   | Rows changed | Old headline | New headline | Delta       | Notable invoices"
  );
  lines.push(
    "--------+--------------+--------------+--------------+-------------+-------------------"
  );

  const sortedMonths = Array.from(byMonth.keys()).sort();
  let totalDelta = 0;
  for (const month of sortedMonths) {
    const e = byMonth.get(month)!;
    const delta = e.newTotal - e.oldTotal;
    totalDelta += delta;
    const notable = e.invoices.slice(0, 4).join(", ") + (e.invoices.length > 4 ? "…" : "");
    lines.push(
      `${month} | ${String(e.rows).padStart(12)} | £${e.oldTotal
        .toFixed(2)
        .padStart(11)} | £${e.newTotal.toFixed(2).padStart(11)} | £${delta
        .toFixed(2)
        .padStart(10)} | ${notable}`
    );
  }
  lines.push(
    "--------+--------------+--------------+--------------+-------------+-------------------"
  );
  lines.push(`TOTAL DELTA: £${totalDelta.toFixed(2)}`);
  lines.push("");

  // April spotlight (per Phase 4 brief): highlight INV-3465.
  const aprilDeltas = deltas.filter(
    (d) =>
      d.saleDate &&
      d.saleDate.getUTCFullYear() === 2026 &&
      d.saleDate.getUTCMonth() === 3 // April = 3 (0-indexed)
  );
  lines.push("=== April 2026 spotlight ===");
  for (const d of aprilDeltas) {
    const flag = d.invoiceNumber === "INV-3465" ? "  ← INV-3465 (the credit-note flagship case)" : "";
    lines.push(
      `  ${d.invoiceNumber ?? "?"} ${
        d.saleDate?.toISOString().slice(0, 10) ?? "?"
      }  ${d.oldStatus} → ${d.newStatus}  £${d.oldEffective.toFixed(
        2
      )} → £${d.newEffective.toFixed(2)} (delta £${d.delta.toFixed(2)})${flag}`
    );
  }
  if (aprilDeltas.length === 0) {
    lines.push("  (no April changes detected)");
  }
  lines.push("");

  const report = lines.join("\n");
  console.log(report);

  const reportPath = "/tmp/credit-note-backfill-report.txt";
  writeFileSync(reportPath, report);
  console.log(`\n[backfill] report written to ${reportPath}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill] fatal:", e.message);
  process.exit(1);
});
