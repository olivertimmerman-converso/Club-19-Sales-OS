/**
 * Club 19 Sales OS - Sale Data Completion Page
 *
 * Allows shoppers (and admins) to complete missing data on sales
 * that were adopted from Xero or claimed without full details.
 */

import { redirect } from "next/navigation";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getUserRole } from "@/lib/getUserRole";
import { db } from "@/db";
import { sales, buyers, shoppers, suppliers as suppliersTable, lineItems } from "@/db/schema";
import { eq, and, isNull, desc, inArray, asc } from "drizzle-orm";
import { assessCompleteness } from "@/lib/completeness";
import { CompleteDataClient } from "./CompleteDataClient";

export default async function CompleteDataPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Auth check
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const role = await getUserRole();
  const { id: saleId } = await params;

  // Fetch the sale with relations
  const sale = await db.query.sales.findFirst({
    where: eq(sales.id, saleId),
    with: {
      buyer: true,
      shopper: true,
      supplier: true,
    },
  });

  if (!sale) {
    redirect("/sales");
  }

  // Check if user can edit this sale
  // - Superadmin, founder, operations can edit any sale
  // - Shoppers can only edit their own sales
  const canEditAny = ["superadmin", "founder", "operations"].includes(role || "");

  if (!canEditAny) {
    // Get the shopper record for the current user
    // Prefer clerk_user_id (more reliable), fall back to name
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userFullName = user?.fullName;

    let shopperRecord = null;

    // Try clerk_user_id first
    shopperRecord = await db.query.shoppers.findFirst({
      where: eq(shoppers.clerkUserId, userId),
    });

    // Fall back to name matching if no clerk_user_id match
    if (!shopperRecord && userFullName) {
      shopperRecord = await db.query.shoppers.findFirst({
        where: eq(shoppers.name, userFullName),
      });
    }

    // Check if this sale belongs to the current shopper
    if (!shopperRecord || sale.shopperId !== shopperRecord.id) {
      // Finance can't edit, and shoppers can only edit their own
      if (role === "finance") {
        redirect("/sales/" + saleId);
      }
      redirect("/staff/shopper/sales");
    }
  }

  // Fetch all suppliers for dropdown
  const supplierRows = await db
    .select({ id: suppliersTable.id, name: suppliersTable.name })
    .from(suppliersTable)
    .orderBy(suppliersTable.name);

  // Filter out suppliers with null names and ensure type safety
  const allSuppliers = supplierRows
    .filter((s): s is { id: string; name: string } => s.name !== null);

  // Fetch linkable Xero-originated invoices (imports, allocated, and adopted)
  // When invoices are allocated to a shopper their source changes from 'xero_import' to 'allocated'
  const linkableXeroImportsRaw = await db.query.sales.findMany({
    where: and(
      inArray(sales.source, ['xero_import', 'allocated', 'adopted']),
      isNull(sales.deletedAt)
    ),
    with: { buyer: true },
    orderBy: [desc(sales.saleDate)],
  });

  // Exclude the current sale itself from the linkable list
  const unallocatedXeroImports = linkableXeroImportsRaw
    .filter(imp => imp.id !== sale.id)
    .map(imp => ({
      id: imp.id,
      xeroInvoiceNumber: imp.xeroInvoiceNumber || 'Unknown',
      saleDate: imp.saleDate ? imp.saleDate.toISOString() : null,
      saleAmountIncVat: imp.saleAmountIncVat || 0,
      currency: imp.currency || 'GBP',
      buyerName: imp.buyer?.name || 'Unknown',
    }));

  // Fetch line items for this sale (for multi-supplier support)
  // Only atelier-created line items trigger per-line-item completion;
  // xero_import line items are reference-only (displayed on sale detail page)
  const saleLineItems = await db
    .select({
      id: lineItems.id,
      lineNumber: lineItems.lineNumber,
      brand: lineItems.brand,
      description: lineItems.description,
      quantity: lineItems.quantity,
      sellPrice: lineItems.sellPrice,
      lineTotal: lineItems.lineTotal,
      supplierId: lineItems.supplierId,
    })
    .from(lineItems)
    .where(and(
      eq(lineItems.saleId, saleId),
      eq(lineItems.source, 'atelier'),
    ))
    .orderBy(asc(lineItems.lineNumber));

  // Assess completeness
  const completeness = assessCompleteness({
    supplierId: sale.supplierId,
    category: sale.category,
    brand: sale.brand,
    buyPrice: sale.buyPrice,
    brandingTheme: sale.brandingTheme,
    buyerType: sale.buyerType,
    itemTitle: sale.itemTitle,
    shippingCost: sale.shippingCost,
    cardFees: sale.cardFees,
  });

  // Serialize sale for client
  const saleData = {
    id: sale.id,
    saleReference: sale.saleReference || null,
    xeroInvoiceNumber: sale.xeroInvoiceNumber || null,
    xeroInvoiceId: sale.xeroInvoiceId || null,
    source: sale.source || null,
    linkedInvoices: (sale.linkedInvoices as Array<{
      xero_invoice_id: string;
      xero_invoice_number: string;
      amount_inc_vat: number;
      currency: string;
      invoice_date: string;
      linked_at: string;
      linked_by: string;
    }>) || [],
    saleDate: sale.saleDate ? sale.saleDate.toISOString() : null,
    saleAmountIncVat: sale.saleAmountIncVat || 0,
    saleAmountExVat: sale.saleAmountExVat || 0,
    currency: sale.currency || "GBP",
    buyerName: sale.buyer?.name || "Unknown",
    buyerId: sale.buyerId || null,
    shopperName: sale.shopper?.name || "Unassigned",
    shopperId: sale.shopperId || null,
    supplierName: sale.supplier?.name || null,
    supplierId: sale.supplierId || null,
    brand: sale.brand || null,
    category: sale.category || null,
    itemTitle: sale.itemTitle || null,
    buyPrice: sale.buyPrice || 0,
    brandingTheme: sale.brandingTheme || null,
    buyerType: sale.buyerType || null,
    shippingCost: sale.shippingCost,
    cardFees: sale.cardFees,
    dhlCost: sale.dhlCost,
    addisonLeeCost: sale.addisonLeeCost,
    taxiCost: sale.taxiCost,
    handDeliveryCost: sale.handDeliveryCost,
    otherLogisticsCost: sale.otherLogisticsCost,
    entrupyFee: sale.entrupyFee,
    deliveryConfirmed: sale.deliveryConfirmed ?? false,
    deliveryDate: sale.deliveryDate ? sale.deliveryDate.toISOString() : null,
    grossMargin: sale.grossMargin || 0,
    commissionableMargin: sale.commissionableMargin || 0,
  };

  // Serialize line items for client
  const lineItemsData = saleLineItems.map(li => ({
    id: li.id,
    lineNumber: li.lineNumber || 0,
    brand: li.brand || null,
    description: li.description || null,
    quantity: li.quantity || 1,
    unitPrice: li.sellPrice || 0,
    lineTotal: li.lineTotal || 0,
    supplierId: li.supplierId || null,
  }));

  return (
    <CompleteDataClient
      sale={saleData}
      suppliers={allSuppliers}
      completeness={completeness}
      userRole={role}
      unallocatedXeroImports={unallocatedXeroImports}
      lineItems={lineItemsData}
    />
  );
}
