import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { SyncPageClient } from './SyncPageClient';

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const role = await getUserRole();
  if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
    redirect('/dashboard');
  }

  const xata = getXataClient();

  // Fetch unallocated sales (excluding dismissed)
  const unallocatedRaw = await xata.db.Sales
    .filter({
      $all: [
        { needs_allocation: true },
        { deleted_at: { $is: null } },
        { $any: [{ dismissed: false }, { dismissed: { $is: null } }] }
      ]
    })
    .select(["*", "buyer.name"])
    .sort("sale_date", "desc")
    .getAll();

  // Fetch dismissed unallocated sales
  // Note: dismissed, dismissed_at, dismissed_by fields must be added to Sales table in Xata
  const dismissedRaw = await xata.db.Sales
    .filter({
      $all: [
        { needs_allocation: true },
        { deleted_at: { $is: null } },
        { dismissed: true }
      ]
    })
    .select(["*", "buyer.name"])
    .sort("sale_date", "desc")
    .getAll();

  // Fetch shoppers
  const shoppersRaw = await xata.db.Shoppers
    .select(["id", "name"])
    .sort("name", "asc")
    .getAll();

  // SERIALIZE EVERYTHING - convert to plain JSON
  const unallocatedSales = unallocatedRaw.map(sale => ({
    id: sale.id,
    xero_invoice_id: sale.xero_invoice_id || null,
    xero_invoice_number: sale.xero_invoice_number || null,
    sale_amount_inc_vat: sale.sale_amount_inc_vat || 0,
    sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
    buyer_name: sale.buyer?.name || null,  // Use buyer relationship instead of non-existent field
    internal_notes: sale.internal_notes || null,
    buyer: sale.buyer?.name ? { name: sale.buyer.name } : null,
  }));

  const shoppers = shoppersRaw.map(s => ({
    id: s.id,
    name: s.name || 'Unknown',
  }));

  // Serialize dismissed sales
  // Using type assertion for dismissed_at since field may not exist yet
  const dismissedSales = dismissedRaw.map(sale => {
    const saleAny = sale as any;
    return {
      id: sale.id,
      xero_invoice_id: sale.xero_invoice_id || null,
      xero_invoice_number: sale.xero_invoice_number || null,
      sale_amount_inc_vat: sale.sale_amount_inc_vat || 0,
      sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
      buyer_name: sale.buyer?.name || null,
      internal_notes: sale.internal_notes || null,
      buyer: sale.buyer?.name ? { name: sale.buyer.name } : null,
      dismissed_at: saleAny.dismissed_at ? new Date(saleAny.dismissed_at).toISOString() : null,
    };
  });

  // Log to verify serialization
  console.log('[SyncPage] Serialized data:', {
    unallocatedCount: unallocatedSales.length,
    dismissedCount: dismissedSales.length,
    shoppersCount: shoppers.length,
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Xero Sync Management</h1>
        <p className="text-gray-600 mt-1">Sync invoices from Xero and allocate them to shoppers</p>
      </div>
      <SyncPageClient
        unallocatedSales={unallocatedSales}
        dismissedSales={dismissedSales}
        shoppers={shoppers}
      />
    </div>
  );
}
