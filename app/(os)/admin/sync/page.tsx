import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { SyncPageClient } from './SyncPageClient';

export const dynamic = "force-dynamic";

type PeriodFilter = '2026' | 'this-month' | 'last-3-months' | 'all';

interface Props {
  searchParams: Promise<{ period?: string }>;
}

function getDateRangeForPeriod(period: PeriodFilter): { start: Date; end: Date } | null {
  const now = new Date();

  switch (period) {
    case '2026':
      return {
        start: new Date(2026, 0, 1), // Jan 1, 2026
        end: new Date(2026, 11, 31, 23, 59, 59), // Dec 31, 2026
      };
    case 'this-month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    case 'last-3-months':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    case 'all':
      return null; // No date filtering
    default:
      return null;
  }
}

export default async function SyncPage({ searchParams }: Props) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const role = await getUserRole();
  if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const period = (params.period as PeriodFilter) || '2026'; // Default to 2026 only
  const dateRange = getDateRangeForPeriod(period);

  const xata = getXataClient();

  // Build base filter for unallocated sales
  const baseFilter: any = {
    $all: [
      { needs_allocation: true },
      { deleted_at: { $is: null } },
      { $any: [{ dismissed: false }, { dismissed: { $is: null } }] }
    ]
  };

  // Add date filter if specified
  if (dateRange) {
    baseFilter.$all.push({
      sale_date: {
        $ge: dateRange.start,
        $le: dateRange.end,
      }
    });
  }

  // Fetch unallocated sales (excluding dismissed) with date filter
  const unallocatedRaw = await xata.db.Sales
    .filter(baseFilter)
    .select(["*", "buyer.name"])
    .sort("sale_date", "desc")
    .getAll();

  // Build base filter for dismissed sales
  const dismissedFilter: any = {
    $all: [
      { needs_allocation: true },
      { deleted_at: { $is: null } },
      { dismissed: true }
    ]
  };

  // Add date filter if specified
  if (dateRange) {
    dismissedFilter.$all.push({
      sale_date: {
        $ge: dateRange.start,
        $le: dateRange.end,
      }
    });
  }

  // Fetch dismissed unallocated sales with date filter
  const dismissedRaw = await xata.db.Sales
    .filter(dismissedFilter)
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
  const dismissedSales = dismissedRaw.map(sale => ({
    id: sale.id,
    xero_invoice_id: sale.xero_invoice_id || null,
    xero_invoice_number: sale.xero_invoice_number || null,
    sale_amount_inc_vat: sale.sale_amount_inc_vat || 0,
    sale_date: sale.sale_date ? sale.sale_date.toISOString() : null,
    buyer_name: sale.buyer?.name || null,
    internal_notes: sale.internal_notes || null,
    buyer: sale.buyer?.name ? { name: sale.buyer.name } : null,
    dismissed_at: sale.dismissed_at ? sale.dismissed_at.toISOString() : null,
  }));

  // Log to verify serialization
  console.log('[SyncPage] Serialized data:', {
    period,
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
        currentPeriod={period}
      />
    </div>
  );
}
