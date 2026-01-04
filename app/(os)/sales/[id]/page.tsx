import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { getXataClient } from '@/src/xata';
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
  const xata = getXataClient();
  const role = await getUserRole();

  // Fetch sale record from Xata with all related data
  const sale = await xata.db.Sales
    .select([
      '*',
      'buyer.*',
      'supplier.*',
      'shopper.*',
      'introducer.*',
    ])
    .filter({ id })
    .getFirst();

  // Handle not found
  if (!sale) {
    notFound();
  }

  // Debug: Log raw data from database
  console.log('[SALE_DETAIL] Raw sale from DB:', {
    id: sale.id,
    sale_reference: sale.sale_reference,
    sale_amount_inc_vat: sale.sale_amount_inc_vat,
    sale_amount_ex_vat: sale.sale_amount_ex_vat,
    branding_theme: sale.branding_theme,
    timestamp: new Date().toISOString(),
  });

  // Fetch all shoppers for the dropdown
  const shoppers = await xata.db.Shoppers
    .select(['id', 'name'])
    .sort('name', 'asc')
    .getAll();

  // Fetch unallocated Xero imports for superadmin linking (for all Atelier sales, even if already linked)
  const unallocatedXeroImports = (role === 'superadmin' && sale.source === 'atelier')
    ? await xata.db.Sales
        .filter({
          $all: [
            { source: 'xero_import' },
            { needs_allocation: true },
            { $not: { $exists: 'deleted_at' } }
          ]
        })
        .select([
          'id',
          'xero_invoice_number',
          'sale_date',
          'sale_amount_inc_vat',
          'currency',
          'buyer.name',
        ])
        .sort('sale_date', 'desc')
        .getAll()
    : [];

  // Serialize data for client component
  const serializedSale = {
    id: sale.id,
    sale_reference: sale.sale_reference || null,
    source: sale.source || null,
    xero_invoice_number: sale.xero_invoice_number || null,
    xero_invoice_url: sale.xero_invoice_url || null,
    xero_invoice_id: sale.xero_invoice_id || null,
    sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
    sale_amount_inc_vat: sale.sale_amount_inc_vat || 0,
    sale_amount_ex_vat: sale.sale_amount_ex_vat || 0,
    currency: sale.currency || 'GBP',
    brand: sale.brand || null,
    category: sale.category || null,
    item_title: sale.item_title || null,
    quantity: sale.quantity || 1,
    buy_price: sale.buy_price || 0,
    shipping_cost: sale.shipping_cost || 0,
    card_fees: sale.card_fees || 0,
    direct_costs: sale.direct_costs || 0,
    gross_margin: sale.gross_margin || 0,
    commissionable_margin: sale.commissionable_margin || null,
    branding_theme: sale.branding_theme || null,
    invoice_status: sale.invoice_status || null,
    invoice_paid_date: sale.invoice_paid_date ? sale.invoice_paid_date.toISOString() : null,
    xero_payment_date: sale.xero_payment_date ? sale.xero_payment_date.toISOString() : null,
    commission_locked: sale.commission_locked || false,
    commission_paid: sale.commission_paid || false,
    commission_amount: sale.commission_amount || null,
    internal_notes: sale.internal_notes || null,
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
  };

  // Debug: Log serialized data
  console.log('[SALE_DETAIL] Serialized sale:', {
    id: serializedSale.id,
    sale_reference: serializedSale.sale_reference,
    sale_amount_inc_vat: serializedSale.sale_amount_inc_vat,
    sale_amount_ex_vat: serializedSale.sale_amount_ex_vat,
    branding_theme: serializedSale.branding_theme,
  });

  const serializedShoppers = shoppers.map(s => ({
    id: s.id,
    name: s.name || 'Unknown',
  }));

  const serializedXeroImports = unallocatedXeroImports.map(imp => ({
    id: imp.id,
    xero_invoice_number: imp.xero_invoice_number || 'Unknown',
    sale_date: imp.sale_date ? imp.sale_date.toISOString() : null,
    sale_amount_inc_vat: imp.sale_amount_inc_vat || 0,
    currency: imp.currency || 'GBP',
    buyer_name: imp.buyer?.name || 'Unknown',
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <SaleDetailClient
        sale={serializedSale}
        shoppers={serializedShoppers}
        userRole={role}
        unallocatedXeroImports={serializedXeroImports}
      />
    </div>
  );
}
