import dotenv from "dotenv";
dotenv.config({ path: ".env.vercel.pulled" });
dotenv.config({ path: ".env.local" });

import fs from "fs";

async function main() {
  const { db } = await import("@/db");
  const {
    sales,
    shoppers,
    buyers,
    suppliers,
    introducers,
    commissionBands,
    lineItems,
    paymentSchedule,
    errors,
  } = await import("@/db/schema");
  const { and, or, gte, lte, eq, sql, inArray } = await import("drizzle-orm");
  const { alias } = await import("drizzle-orm/pg-core");

  const janStart = new Date(2026, 0, 1, 0, 0, 0, 0);
  const janEnd = new Date(2026, 0, 31, 23, 59, 59, 999);

  console.log("Extracting January 2026 audit data...\n");

  // Alias for owner shopper (ownerId -> shoppers)
  const ownerShoppers = alias(shoppers, "owner_shoppers");
  const buyerOwnerShoppers = alias(shoppers, "buyer_owner_shoppers");

  // ── Query 1: All January 2026 sales (wide net) ──────────────────────────
  console.log("Query 1: Sales...");
  const allSales = await db
    .select({
      // Identification
      id: sales.id,
      saleReference: sales.saleReference,
      saleDate: sales.saleDate,
      createdAt: sales.createdAt,
      updatedAt: sales.updatedAt,

      // Xero
      xeroInvoiceId: sales.xeroInvoiceId,
      xeroInvoiceNumber: sales.xeroInvoiceNumber,
      xeroInvoiceUrl: sales.xeroInvoiceUrl,
      invoiceStatus: sales.invoiceStatus,
      invoicePaidDate: sales.invoicePaidDate,
      xeroPaymentDate: sales.xeroPaymentDate,

      // Item details
      brand: sales.brand,
      category: sales.category,
      itemTitle: sales.itemTitle,
      quantity: sales.quantity,
      currency: sales.currency,
      brandingTheme: sales.brandingTheme,

      // Financial
      saleAmountIncVat: sales.saleAmountIncVat,
      saleAmountExVat: sales.saleAmountExVat,
      buyPrice: sales.buyPrice,
      cardFees: sales.cardFees,
      shippingCost: sales.shippingCost,
      directCosts: sales.directCosts,
      impliedShipping: sales.impliedShipping,
      grossMargin: sales.grossMargin,
      commissionableMargin: sales.commissionableMargin,

      // Commission
      commissionAmount: sales.commissionAmount,
      commissionSplitIntroducer: sales.commissionSplitIntroducer,
      commissionSplitShopper: sales.commissionSplitShopper,
      introducerSharePercent: sales.introducerSharePercent,
      adminOverrideCommissionPercent: sales.adminOverrideCommissionPercent,
      adminOverrideNotes: sales.adminOverrideNotes,
      commissionLocked: sales.commissionLocked,
      commissionPaid: sales.commissionPaid,
      commissionLockDate: sales.commissionLockDate,
      commissionPaidDate: sales.commissionPaidDate,
      commissionClawback: sales.commissionClawback,
      commissionClawbackDate: sales.commissionClawbackDate,
      commissionClawbackReason: sales.commissionClawbackReason,

      // Introducer
      hasIntroducer: sales.hasIntroducer,
      introducerCommission: sales.introducerCommission,
      introducerId: sales.introducerId,
      introducerName: introducers.name,
      introducerCommissionPercent: introducers.commissionPercent,

      // Payment plan
      isPaymentPlan: sales.isPaymentPlan,
      paymentPlanInstalments: sales.paymentPlanInstalments,
      depositAmount: sales.depositAmount,
      paymentPlanNotes: sales.paymentPlanNotes,

      // Shipping & payment
      shippingMethod: sales.shippingMethod,
      shippingCostConfirmed: sales.shippingCostConfirmed,
      paymentMethod: sales.paymentMethod,

      // Status & metadata
      status: sales.status,
      source: sales.source,
      buyerType: sales.buyerType,
      needsAllocation: sales.needsAllocation,
      internalNotes: sales.internalNotes,

      // Allocation tracking
      allocatedBy: sales.allocatedBy,
      allocatedAt: sales.allocatedAt,

      // Completion tracking
      completedAt: sales.completedAt,
      completedBy: sales.completedBy,

      // Error tracking
      errorFlag: sales.errorFlag,
      errorMessage: sales.errorMessage,

      // Soft delete & dismissal
      deletedAt: sales.deletedAt,
      dismissed: sales.dismissed,
      dismissedAt: sales.dismissedAt,
      dismissedBy: sales.dismissedBy,

      // Linked invoices
      linkedInvoices: sales.linkedInvoices,

      // Foreign keys (IDs)
      shopperId: sales.shopperId,
      buyerId: sales.buyerId,
      supplierId: sales.supplierId,
      ownerId: sales.ownerId,
      commissionBandId: sales.commissionBandId,

      // Joined: Shopper
      shopperName: shoppers.name,

      // Joined: Owner
      ownerName: ownerShoppers.name,

      // Joined: Buyer
      buyerName: buyers.name,
      buyerEmail: buyers.email,
      buyerXeroContactId: buyers.xeroContactId,
      buyerOwnerId: buyers.ownerId,

      // Joined: Supplier
      supplierName: suppliers.name,
      supplierPendingApproval: suppliers.pendingApproval,
      supplierXeroContactId: suppliers.xeroContactId,

      // Joined: Commission band
      commissionBandType: commissionBands.bandType,
      commissionBandPercent: commissionBands.commissionPercent,
    })
    .from(sales)
    .leftJoin(shoppers, eq(sales.shopperId, shoppers.id))
    .leftJoin(ownerShoppers, eq(sales.ownerId, ownerShoppers.id))
    .leftJoin(buyers, eq(sales.buyerId, buyers.id))
    .leftJoin(suppliers, eq(sales.supplierId, suppliers.id))
    .leftJoin(introducers, eq(sales.introducerId, introducers.id))
    .leftJoin(commissionBands, eq(sales.commissionBandId, commissionBands.id))
    .where(
      or(
        and(gte(sales.saleDate, janStart), lte(sales.saleDate, janEnd)),
        and(gte(sales.createdAt, janStart), lte(sales.createdAt, janEnd))
      )
    )
    .orderBy(sales.xeroInvoiceNumber);

  console.log(`  Found ${allSales.length} sales`);

  const saleIds = allSales.map((s) => s.id);

  // ── Query 2: Line items ──────────────────────────────────────────────────
  console.log("Query 2: Line items...");
  const lineItemSuppliers = alias(suppliers, "line_item_suppliers");

  let allLineItems: {
    id: string;
    saleId: string | null;
    supplierId: string | null;
    lineNumber: number | null;
    brand: string | null;
    category: string | null;
    description: string | null;
    quantity: number | null;
    buyPrice: number | null;
    sellPrice: number | null;
    lineTotal: number | null;
    lineMargin: number | null;
    source: string | null;
    createdAt: Date | null;
    supplierName: string | null;
  }[] = [];

  if (saleIds.length > 0) {
    allLineItems = await db
      .select({
        id: lineItems.id,
        saleId: lineItems.saleId,
        supplierId: lineItems.supplierId,
        lineNumber: lineItems.lineNumber,
        brand: lineItems.brand,
        category: lineItems.category,
        description: lineItems.description,
        quantity: lineItems.quantity,
        buyPrice: lineItems.buyPrice,
        sellPrice: lineItems.sellPrice,
        lineTotal: lineItems.lineTotal,
        lineMargin: lineItems.lineMargin,
        source: lineItems.source,
        createdAt: lineItems.createdAt,
        supplierName: lineItemSuppliers.name,
      })
      .from(lineItems)
      .leftJoin(lineItemSuppliers, eq(lineItems.supplierId, lineItemSuppliers.id))
      .where(inArray(lineItems.saleId, saleIds));
  }
  console.log(`  Found ${allLineItems.length} line items`);

  // ── Query 3: Payment schedules ───────────────────────────────────────────
  console.log("Query 3: Payment schedules...");
  let allPaymentSchedules: {
    id: string;
    saleId: string | null;
    instalmentNumber: number | null;
    dueDate: Date | null;
    amount: number | null;
    status: string | null;
    xeroInvoiceId: string | null;
    xeroInvoiceNumber: string | null;
    paidDate: Date | null;
    notes: string | null;
  }[] = [];

  if (saleIds.length > 0) {
    allPaymentSchedules = await db
      .select({
        id: paymentSchedule.id,
        saleId: paymentSchedule.saleId,
        instalmentNumber: paymentSchedule.instalmentNumber,
        dueDate: paymentSchedule.dueDate,
        amount: paymentSchedule.amount,
        status: paymentSchedule.status,
        xeroInvoiceId: paymentSchedule.xeroInvoiceId,
        xeroInvoiceNumber: paymentSchedule.xeroInvoiceNumber,
        paidDate: paymentSchedule.paidDate,
        notes: paymentSchedule.notes,
      })
      .from(paymentSchedule)
      .where(inArray(paymentSchedule.saleId, saleIds));
  }
  console.log(`  Found ${allPaymentSchedules.length} payment schedule records`);

  // ── Query 4: Errors ──────────────────────────────────────────────────────
  console.log("Query 4: Errors...");
  let allErrors: {
    id: string;
    saleId: string | null;
    severity: string | null;
    source: string | null;
    message: string[] | null;
    timestamp: Date | null;
    resolved: boolean | null;
    resolvedBy: string | null;
  }[] = [];

  if (saleIds.length > 0) {
    allErrors = await db
      .select({
        id: errors.id,
        saleId: errors.saleId,
        severity: errors.severity,
        source: errors.source,
        message: errors.message,
        timestamp: errors.timestamp,
        resolved: errors.resolved,
        resolvedBy: errors.resolvedBy,
      })
      .from(errors)
      .where(inArray(errors.saleId, saleIds));
  }
  console.log(`  Found ${allErrors.length} error records`);

  // ── Build index maps ─────────────────────────────────────────────────────
  const lineItemsBySale = new Map<string, typeof allLineItems>();
  for (const li of allLineItems) {
    if (!li.saleId) continue;
    if (!lineItemsBySale.has(li.saleId)) lineItemsBySale.set(li.saleId, []);
    lineItemsBySale.get(li.saleId)!.push(li);
  }

  const paymentsBySale = new Map<string, typeof allPaymentSchedules>();
  for (const ps of allPaymentSchedules) {
    if (!ps.saleId) continue;
    if (!paymentsBySale.has(ps.saleId)) paymentsBySale.set(ps.saleId, []);
    paymentsBySale.get(ps.saleId)!.push(ps);
  }

  const errorsBySale = new Map<string, typeof allErrors>();
  for (const e of allErrors) {
    if (!e.saleId) continue;
    if (!errorsBySale.has(e.saleId)) errorsBySale.set(e.saleId, []);
    errorsBySale.get(e.saleId)!.push(e);
  }

  // ── Derive pipeline stage ────────────────────────────────────────────────
  function derivePipelineStage(s: (typeof allSales)[0]): string {
    if (s.deletedAt) return "deleted";
    if (s.dismissed) return "dismissed";
    if (s.invoiceStatus === "VOIDED") return "voided";
    if (s.completedAt) return "completed";
    if (s.allocatedAt) return "allocated";
    if (s.needsAllocation) return "needs_allocation";
    if (s.source === "atelier") return "atelier_created";
    return "unknown";
  }

  // ── Assemble invoices ────────────────────────────────────────────────────
  const invoices = allSales.map((s) => ({
    // Identification
    id: s.id,
    saleReference: s.saleReference,
    xeroInvoiceId: s.xeroInvoiceId,
    xeroInvoiceNumber: s.xeroInvoiceNumber,
    xeroInvoiceUrl: s.xeroInvoiceUrl,
    invoiceDate: s.saleDate,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,

    // Status
    invoiceStatus: s.invoiceStatus,
    status: s.status,
    source: s.source,
    pipelineStage: derivePipelineStage(s),
    needsAllocation: s.needsAllocation,
    invoicePaidDate: s.invoicePaidDate,
    xeroPaymentDate: s.xeroPaymentDate,

    // Parties
    buyerId: s.buyerId,
    buyerName: s.buyerName,
    buyerEmail: s.buyerEmail,
    buyerXeroContactId: s.buyerXeroContactId,
    buyerType: s.buyerType,
    shopperId: s.shopperId,
    shopperName: s.shopperName,
    ownerId: s.ownerId,
    ownerName: s.ownerName,
    supplierId: s.supplierId,
    supplierName: s.supplierName,
    supplierPendingApproval: s.supplierPendingApproval,

    // Item
    brand: s.brand,
    category: s.category,
    itemTitle: s.itemTitle,
    quantity: s.quantity,
    currency: s.currency,

    // VAT / tax treatment
    brandingTheme: s.brandingTheme,
    isExport: s.brandingTheme?.toLowerCase().includes("export") ?? false,

    // Financial — revenue
    saleAmountIncVat: s.saleAmountIncVat,
    saleAmountExVat: s.saleAmountExVat,

    // Financial — costs
    buyPrice: s.buyPrice,
    cardFees: s.cardFees,
    shippingCost: s.shippingCost,
    directCosts: s.directCosts,
    impliedShipping: s.impliedShipping,
    shippingMethod: s.shippingMethod,
    shippingCostConfirmed: s.shippingCostConfirmed,
    paymentMethod: s.paymentMethod,

    // Financial — margins
    grossMargin: s.grossMargin,
    commissionableMargin: s.commissionableMargin,

    // Commission
    commission: {
      amount: s.commissionAmount,
      splitIntroducer: s.commissionSplitIntroducer,
      splitShopper: s.commissionSplitShopper,
      introducerSharePercent: s.introducerSharePercent,
      adminOverridePercent: s.adminOverrideCommissionPercent,
      adminOverrideNotes: s.adminOverrideNotes,
      locked: s.commissionLocked,
      paid: s.commissionPaid,
      lockDate: s.commissionLockDate,
      paidDate: s.commissionPaidDate,
      clawback: s.commissionClawback,
      clawbackDate: s.commissionClawbackDate,
      clawbackReason: s.commissionClawbackReason,
      bandType: s.commissionBandType,
      bandPercent: s.commissionBandPercent,
    },

    // Introducer
    introducer: s.hasIntroducer
      ? {
          id: s.introducerId,
          name: s.introducerName,
          commissionPercent: s.introducerCommissionPercent,
          commissionAmount: s.introducerCommission,
        }
      : null,

    // Payment plan
    paymentPlan: s.isPaymentPlan
      ? {
          instalments: s.paymentPlanInstalments,
          depositAmount: s.depositAmount,
          notes: s.paymentPlanNotes,
        }
      : null,

    // Allocation tracking
    allocation: {
      allocatedBy: s.allocatedBy,
      allocatedAt: s.allocatedAt,
    },

    // Completion tracking
    completion: {
      completedAt: s.completedAt,
      completedBy: s.completedBy,
    },

    // Error tracking
    errorFlag: s.errorFlag,
    errorMessage: s.errorMessage,

    // Soft delete & dismissal
    deletedAt: s.deletedAt,
    dismissed: s.dismissed,
    dismissedAt: s.dismissedAt,
    dismissedBy: s.dismissedBy,

    // Linked invoices
    linkedInvoices: s.linkedInvoices,

    // Internal notes
    internalNotes: s.internalNotes,

    // Nested detail
    lineItems: (lineItemsBySale.get(s.id) || []).map((li) => ({
      id: li.id,
      lineNumber: li.lineNumber,
      description: li.description,
      brand: li.brand,
      category: li.category,
      quantity: li.quantity,
      buyPrice: li.buyPrice,
      sellPrice: li.sellPrice,
      lineTotal: li.lineTotal,
      lineMargin: li.lineMargin,
      supplierId: li.supplierId,
      supplierName: li.supplierName,
      source: li.source,
      accountCode: "FIELD_NOT_IN_SCHEMA",
      taxType: "FIELD_NOT_IN_SCHEMA",
    })),

    paymentSchedule: (paymentsBySale.get(s.id) || []).map((ps) => ({
      id: ps.id,
      instalmentNumber: ps.instalmentNumber,
      dueDate: ps.dueDate,
      amount: ps.amount,
      status: ps.status,
      xeroInvoiceId: ps.xeroInvoiceId,
      xeroInvoiceNumber: ps.xeroInvoiceNumber,
      paidDate: ps.paidDate,
      notes: ps.notes,
    })),

    errors: (errorsBySale.get(s.id) || []).map((e) => ({
      id: e.id,
      severity: e.severity,
      source: e.source,
      message: e.message,
      timestamp: e.timestamp,
      resolved: e.resolved,
      resolvedBy: e.resolvedBy,
    })),
  }));

  // ── Deduplicate clients ──────────────────────────────────────────────────
  const clientMap = new Map<string, (typeof allSales)[0]>();
  for (const s of allSales) {
    if (s.buyerId && !clientMap.has(s.buyerId)) clientMap.set(s.buyerId, s);
  }

  // Get buyer owner names
  const buyerOwnerIds = [...new Set([...clientMap.values()].map((s) => s.buyerOwnerId).filter(Boolean))] as string[];
  let ownerNameMap = new Map<string, string>();
  if (buyerOwnerIds.length > 0) {
    const ownerRows = await db
      .select({ id: shoppers.id, name: shoppers.name })
      .from(shoppers)
      .where(inArray(shoppers.id, buyerOwnerIds));
    ownerNameMap = new Map(ownerRows.map((r) => [r.id, r.name ?? ""]));
  }

  const clients = [...clientMap.entries()].map(([buyerId, s]) => ({
    clientId: buyerId,
    clientName: s.buyerName,
    email: s.buyerEmail,
    xeroContactId: s.buyerXeroContactId,
    clientOwnerId: s.buyerOwnerId,
    clientOwnerName: s.buyerOwnerId ? ownerNameMap.get(s.buyerOwnerId) ?? null : null,
    isExport: "FIELD_NOT_IN_SCHEMA — derived from sales.brandingTheme per sale",
    country: "FIELD_NOT_IN_SCHEMA",
    address: "FIELD_NOT_IN_SCHEMA",
    isLinkedXeroContact: !!s.buyerXeroContactId,
  }));

  // ── Deduplicate suppliers ────────────────────────────────────────────────
  const supplierIds = new Set<string>();
  for (const s of allSales) {
    if (s.supplierId) supplierIds.add(s.supplierId);
  }
  for (const li of allLineItems) {
    if (li.supplierId) supplierIds.add(li.supplierId);
  }

  let supplierRecords: {
    id: string;
    name: string | null;
    email: string | null;
    xeroContactId: string | null;
    pendingApproval: boolean | null;
    createdBy: string | null;
    approvedBy: string | null;
    approvedAt: Date | null;
  }[] = [];

  if (supplierIds.size > 0) {
    supplierRecords = await db
      .select({
        id: suppliers.id,
        name: suppliers.name,
        email: suppliers.email,
        xeroContactId: suppliers.xeroContactId,
        pendingApproval: suppliers.pendingApproval,
        createdBy: suppliers.createdBy,
        approvedBy: suppliers.approvedBy,
        approvedAt: suppliers.approvedAt,
      })
      .from(suppliers)
      .where(inArray(suppliers.id, [...supplierIds]));
  }

  const suppliersOut = supplierRecords.map((s) => ({
    supplierId: s.id,
    supplierName: s.name,
    email: s.email,
    xeroContactId: s.xeroContactId,
    pendingApproval: s.pendingApproval,
    createdBy: s.createdBy,
    approvedBy: s.approvedBy,
    approvedAt: s.approvedAt,
    isLinkedRecord: true,
    aliasOrDuplicateIndicator: "Not tracked in schema",
  }));

  // ── Summary stats ────────────────────────────────────────────────────────
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byBrandingTheme: Record<string, number> = {};
  const byShopper: Record<string, number> = {};

  for (const s of allSales) {
    const src = s.source || "null";
    bySource[src] = (bySource[src] || 0) + 1;
    const st = s.invoiceStatus || "null";
    byStatus[st] = (byStatus[st] || 0) + 1;
    const bt = s.brandingTheme || "null";
    byBrandingTheme[bt] = (byBrandingTheme[bt] || 0) + 1;
    const sh = s.shopperName || s.ownerName || "unassigned";
    byShopper[sh] = (byShopper[sh] || 0) + 1;
  }

  // ── Assemble output ──────────────────────────────────────────────────────
  const output = {
    extractedAt: new Date().toISOString(),
    schemaNotesFieldsNotInDB: {
      creditNotes: "No credit_notes table exists in the schema — credit notes live only in Xero",
      "buyer.isExport": "Not stored on buyers table — derived from sales.brandingTheme per sale",
      "buyer.country": "Not stored in schema",
      "buyer.address": "Not stored in schema",
      "lineItem.accountCode": "Not stored per line item in schema",
      "lineItem.taxType": "Not stored per line item in schema",
      "sale.dueDate": "Not on sales table — exists on payment_schedule records only",
      "sale.syncedAt": "Not stored — use createdAt as proxy",
      "sale.syncStatus": "Not stored — derive from source + needsAllocation + completedAt (see pipelineStage)",
      "sale.triagedAt": "Field name is allocatedAt",
      "sale.triagedBy": "Field name is allocatedBy",
    },
    summary: {
      invoiceCount: invoices.length,
      creditNoteCount: 0,
      lineItemCount: allLineItems.length,
      paymentScheduleCount: allPaymentSchedules.length,
      errorCount: allErrors.length,
      uniqueClients: clients.length,
      uniqueSuppliers: suppliersOut.length,
      bySource,
      byStatus,
      byBrandingTheme,
      byShopper,
    },
    invoices,
    creditNotes: [] as never[],
    clients,
    suppliers: suppliersOut,
  };

  // ── Write JSON ───────────────────────────────────────────────────────────
  const outPath = "january-2026-audit.json";
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

  console.log(`\n════════════════════════════════════════`);
  console.log(`  EXTRACTION COMPLETE`);
  console.log(`════════════════════════════════════════`);
  console.log(`  Invoices:           ${output.summary.invoiceCount}`);
  console.log(`  Line items:         ${output.summary.lineItemCount}`);
  console.log(`  Payment schedules:  ${output.summary.paymentScheduleCount}`);
  console.log(`  Errors:             ${output.summary.errorCount}`);
  console.log(`  Unique clients:     ${output.summary.uniqueClients}`);
  console.log(`  Unique suppliers:   ${output.summary.uniqueSuppliers}`);
  console.log(`  Credit notes:       0 (not in schema)`);
  console.log(`\n  By source:`);
  for (const [k, v] of Object.entries(bySource).sort()) console.log(`    ${k}: ${v}`);
  console.log(`  By status:`);
  for (const [k, v] of Object.entries(byStatus).sort()) console.log(`    ${k}: ${v}`);
  console.log(`  By shopper:`);
  for (const [k, v] of Object.entries(byShopper).sort()) console.log(`    ${k}: ${v}`);
  console.log(`\n  Output: ${outPath}`);
  console.log(`════════════════════════════════════════\n`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
