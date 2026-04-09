import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
// ORIGINAL XATA: import { getXataClient } from '@/src/xata';
import { db } from "@/db";
import { sales, shoppers, suppliers } from "@/db/schema";
import { eq, and, isNull, inArray, desc, asc } from "drizzle-orm";
import { getUserRole } from '@/lib/getUserRole';
import { SaleDetailClient } from './SaleDetailClient';

export const dynamic = "force-dynamic";

/**
 * Club 19 Sales OS - Sale Detail Page
 *
 * Displays full information about a specific sale with editable shopper assignment
 * Superadmin can link Atelier sales to existing Xero invoices
 */

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const { id } = await params;
  // ORIGINAL XATA: const xata = getXataClient();
  const role = await getUserRole();

  // ORIGINAL XATA:
  // const sale = await xata.db.Sales
  //   .select([
  //     '*',
  //     'buyer.*',
  //     'supplier.*',
  //     'shopper.*',
  //     'introducer.*',
  //   ])
  //   .filter({ id })
  //   .getFirst();

  // Fetch sale record with all related data
  const sale = await db.query.sales.findFirst({
    where: eq(sales.id, id),
    with: {
      buyer: true,
      supplier: true,
      shopper: true,
      introducer: true,
    },
  });

  // Handle not found
  if (!sale) {
    notFound();
  }


  // ORIGINAL XATA:
  // const shoppers = await xata.db.Shoppers
  //   .select(['id', 'name'])
  //   .sort('name', 'asc')
  //   .getAll();

  // Fetch all active shoppers for the dropdown
  const shoppersData = await db.query.shoppers.findMany({
    where: eq(shoppers.active, true),
    orderBy: [asc(shoppers.name)],
  });

  // ORIGINAL XATA:
  // const suppliersRaw = await xata.db.Suppliers
  //   .select(['id', 'name'])
  //   .sort('name', 'asc')
  //   .getAll();

  // Fetch all suppliers for the dropdown (for edit mode)
  const suppliersRaw = await db.query.suppliers.findMany({
    orderBy: [asc(suppliers.name)],
  });

  // ORIGINAL XATA:
  // const unallocatedXeroImports = (role === 'superadmin' && sale.source === 'atelier')
  //   ? await xata.db.Sales
  //       .filter({
  //         $all: [
  //           { source: 'xero_import' },
  //           { needs_allocation: true },
  //           { $not: { $exists: 'deleted_at' } }
  //         ]
  //       })
  //       .select([...])
  //       .sort('sale_date', 'desc')
  //       .getAll()
  //   : [];

  // Fetch linkable Xero-originated invoices for superadmin linking
  const unallocatedXeroImports = (['superadmin', 'operations'].includes(role || ''))
    ? await db.query.sales.findMany({
        where: and(
          inArray(sales.source, ['xero_import', 'allocated', 'adopted']),
          isNull(sales.deletedAt)
        ),
        with: {
          buyer: true,
        },
        orderBy: [desc(sales.saleDate)],
      })
    : [];

  // Serialize data for client component
  const serializedSale = {
    id: sale.id,
    sale_reference: sale.saleReference || null,
    source: sale.source || null,
    xero_invoice_number: sale.xeroInvoiceNumber || null,
    xero_invoice_url: sale.xeroInvoiceUrl || null,
    xero_invoice_id: sale.xeroInvoiceId || null,
    sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
    sale_amount_inc_vat: sale.saleAmountIncVat || 0,
    sale_amount_ex_vat: sale.saleAmountExVat || 0,
    currency: sale.currency || 'GBP',
    brand: sale.brand || null,
    category: sale.category || null,
    item_title: sale.itemTitle || null,
    quantity: sale.quantity || 1,
    buy_price: sale.buyPrice || 0,
    shipping_cost: sale.shippingCost || 0,
    shipping_method: sale.shippingMethod || null,
    shipping_cost_confirmed: sale.shippingCostConfirmed || false,
    card_fees: sale.cardFees || 0,
    direct_costs: sale.directCosts || 0,
    gross_margin: sale.grossMargin || 0,
    commissionable_margin: sale.commissionableMargin || null,
    branding_theme: sale.brandingTheme || null,
    invoice_status: sale.invoiceStatus || null,
    invoice_paid_date: sale.invoicePaidDate ? sale.invoicePaidDate.toISOString() : null,
    xero_payment_date: sale.xeroPaymentDate ? sale.xeroPaymentDate.toISOString() : null,
    commission_locked: sale.commissionLocked || false,
    commission_paid: sale.commissionPaid || false,
    commission_amount: sale.commissionAmount || null,
    commission_clawback: sale.commissionClawback || false,
    commission_clawback_date: sale.commissionClawbackDate ? sale.commissionClawbackDate.toISOString() : null,
    commission_clawback_reason: sale.commissionClawbackReason || null,
    internal_notes: sale.internalNotes || null,
    has_introducer: sale.hasIntroducer || false,
    introducer_commission: sale.introducerCommission || null,
    introducer_name: sale.introducerName || null,
    is_payment_plan: sale.isPaymentPlan || false,
    payment_plan_instalments: sale.paymentPlanInstalments || null,
    buyer: sale.buyer ? {
      id: sale.buyer.id,
      name: sale.buyer.name || 'Unknown',
    } : null,
    shopper: sale.shopper ? {
      id: sale.shopper.id,
      name: sale.shopper.name || 'Unknown',
    } : null,
    supplier: sale.supplier ? {
      id: sale.supplier.id,
      name: sale.supplier.name || 'Unknown',
    } : null,
    introducer: sale.introducer ? {
      id: sale.introducer.id,
      name: sale.introducer.name || 'Unknown',
    } : null,
    linked_invoices: (sale.linkedInvoices as any[] | null) || [],
    status: sale.status || null,
    completed_at: sale.completedAt ? sale.completedAt.toISOString() : null,
  };

  const serializedShoppers = shoppersData.map(s => ({
    id: s.id,
    name: s.name || 'Unknown',
  }));

  const serializedSuppliers = suppliersRaw.map(s => ({
    id: s.id,
    name: s.name || 'Unknown',
  }));

  const serializedXeroImports = unallocatedXeroImports.map(imp => ({
    id: imp.id,
    xero_invoice_number: imp.xeroInvoiceNumber || 'Unknown',
    sale_date: imp.saleDate ? imp.saleDate.toISOString() : null,
    sale_amount_inc_vat: imp.saleAmountIncVat || 0,
    currency: imp.currency || 'GBP',
    buyer_name: imp.buyer?.name || 'Unknown',
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SaleDetailClient
        sale={serializedSale}
        shoppers={serializedShoppers}
        suppliers={serializedSuppliers}
        userRole={role}
        unallocatedXeroImports={serializedXeroImports}
      />
    </div>
  );
}
