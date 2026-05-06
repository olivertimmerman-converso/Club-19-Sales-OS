import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserRole } from '@/lib/getUserRole';
// ORIGINAL XATA: import { getXataClient } from '@/src/xata';
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { eq, and, isNull, gte, lte, or, desc, asc, count } from "drizzle-orm";
import { SyncPageClient } from './SyncPageClient';

export const dynamic = "force-dynamic";

// Period values, in dropdown display order.
const PERIOD_VALUES = [
  'this-month',
  'last-month',
  'last-3-months',
  '2026',
  '2025',
  'all',
] as const;
type PeriodFilter = (typeof PERIOD_VALUES)[number];

const DEFAULT_PERIOD: PeriodFilter = '2026';

// Hard row cap on the unallocated query. "All time" returns ~1000 rows
// going back to 2024; rendering each one as an interactive React row with
// dropdowns/buttons makes the page feel frozen. The cap keeps the UI
// responsive — when capped, the client shows "showing N of M" and asks
// the user to narrow the filter to see more.
const ROW_CAP = 200;

interface Props {
  searchParams: Promise<{ period?: string }>;
}

function isValidPeriod(value: string | undefined): value is PeriodFilter {
  return value !== undefined && (PERIOD_VALUES as readonly string[]).includes(value);
}

function getDateRangeForPeriod(period: PeriodFilter): { start: Date; end: Date } | null {
  const now = new Date();

  switch (period) {
    case '2026':
      return {
        start: new Date(2026, 0, 1), // Jan 1, 2026
        end: new Date(2026, 11, 31, 23, 59, 59), // Dec 31, 2026
      };
    case '2025':
      return {
        start: new Date(2025, 0, 1),
        end: new Date(2025, 11, 31, 23, 59, 59),
      };
    case 'this-month':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
      };
    case 'last-month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        // Last day of last month = day 0 of this month
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
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
  // Shoppers can view and claim, management can assign
  if (!['superadmin', 'operations', 'founder', 'shopper'].includes(role || '')) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  // Validate the URL param against the known set so a typo can't poison the
  // server component (the prior `as PeriodFilter` cast was a lie at runtime).
  const period: PeriodFilter = isValidPeriod(params.period) ? params.period : DEFAULT_PERIOD;
  const dateRange = getDateRangeForPeriod(period);

  // ORIGINAL XATA: const xata = getXataClient();

  // ORIGINAL XATA:
  // // Build base filter for unallocated sales
  // const baseFilter: any = {
  //   $all: [
  //     { needs_allocation: true },
  //     { deleted_at: { $is: null } },
  //     { $any: [{ dismissed: false }, { dismissed: { $is: null } }] }
  //   ]
  // };
  //
  // // Add date filter if specified
  // if (dateRange) {
  //   baseFilter.$all.push({
  //     sale_date: {
  //       $ge: dateRange.start,
  //       $le: dateRange.end,
  //     }
  //   });
  // }
  //
  // // Fetch unallocated sales (excluding dismissed) with date filter
  // const unallocatedRaw = await xata.db.Sales
  //   .filter(baseFilter)
  //   .select(["*", "buyer.name"])
  //   .sort("sale_date", "desc")
  //   .getAll();

  // Build conditions for unallocated sales
  const unallocatedConditions: any[] = [
    eq(sales.needsAllocation, true),
    isNull(sales.deletedAt),
    or(eq(sales.dismissed, false), isNull(sales.dismissed)),
  ];

  // Build conditions for dismissed sales
  const dismissedConditions: any[] = [
    eq(sales.needsAllocation, true),
    isNull(sales.deletedAt),
    eq(sales.dismissed, true),
  ];

  // Add date filter if specified
  if (dateRange) {
    unallocatedConditions.push(gte(sales.saleDate, dateRange.start));
    unallocatedConditions.push(lte(sales.saleDate, dateRange.end));
    dismissedConditions.push(gte(sales.saleDate, dateRange.start));
    dismissedConditions.push(lte(sales.saleDate, dateRange.end));
  }

  // Run queries in parallel. The unallocated + dismissed lists are capped at
  // ROW_CAP rows for render performance; we also fetch the uncapped count
  // alongside so the UI can show "showing N of M" when a tighter filter is
  // needed.
  const [
    unallocatedRaw,
    dismissedRaw,
    shoppersRaw,
    unallocatedCountRaw,
    dismissedCountRaw,
  ] = await Promise.all([
    db.query.sales.findMany({
      where: and(...unallocatedConditions),
      with: { buyer: true },
      orderBy: [desc(sales.saleDate)],
      limit: ROW_CAP,
    }),
    db.query.sales.findMany({
      where: and(...dismissedConditions),
      with: { buyer: true },
      orderBy: [desc(sales.saleDate)],
      limit: ROW_CAP,
    }),
    db.query.shoppers.findMany({
      where: eq(shoppers.active, true),
      orderBy: [asc(shoppers.name)],
    }),
    db
      .select({ value: count() })
      .from(sales)
      .where(and(...unallocatedConditions)),
    db
      .select({ value: count() })
      .from(sales)
      .where(and(...dismissedConditions)),
  ]);

  const unallocatedTotalCount = unallocatedCountRaw[0]?.value ?? unallocatedRaw.length;
  const dismissedTotalCount = dismissedCountRaw[0]?.value ?? dismissedRaw.length;

  // SERIALIZE EVERYTHING - convert to plain JSON
  const unallocatedSales = unallocatedRaw.map(sale => ({
    id: sale.id,
    xero_invoice_id: sale.xeroInvoiceId || null,
    xero_invoice_number: sale.xeroInvoiceNumber || null,
    sale_amount_inc_vat: sale.saleAmountIncVat || 0,
    sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
    buyer_name: sale.buyer?.name || null,  // Use buyer relationship instead of non-existent field
    internal_notes: sale.internalNotes || null,
    buyer: sale.buyer?.name ? { name: sale.buyer.name } : null,
  }));

  const shoppersData = shoppersRaw.map(s => ({
    id: s.id,
    name: s.name || 'Unknown',
  }));

  // Serialize dismissed sales
  const dismissedSales = dismissedRaw.map(sale => ({
    id: sale.id,
    xero_invoice_id: sale.xeroInvoiceId || null,
    xero_invoice_number: sale.xeroInvoiceNumber || null,
    sale_amount_inc_vat: sale.saleAmountIncVat || 0,
    sale_date: sale.saleDate ? sale.saleDate.toISOString() : null,
    buyer_name: sale.buyer?.name || null,
    internal_notes: sale.internalNotes || null,
    buyer: sale.buyer?.name ? { name: sale.buyer.name } : null,
    dismissed_at: sale.dismissedAt ? sale.dismissedAt.toISOString() : null,
  }));

  // Calculate aggregate stats
  const totalUnallocatedValue = unallocatedSales.reduce(
    (sum, sale) => sum + (sale.sale_amount_inc_vat || 0),
    0
  );

  // Count by period (this week, this month)
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisWeekCount = unallocatedSales.filter(sale => {
    if (!sale.sale_date) return false;
    const saleDate = new Date(sale.sale_date);
    return saleDate >= startOfWeek;
  }).length;

  const thisMonthCount = unallocatedSales.filter(sale => {
    if (!sale.sale_date) return false;
    const saleDate = new Date(sale.sale_date);
    return saleDate >= startOfMonth;
  }).length;

  const aggregateStats = {
    // totalCount reflects the uncapped count for THIS period so the header
    // banner stays honest even when the rendered list is truncated.
    totalCount: unallocatedTotalCount,
    totalValue: totalUnallocatedValue,
    thisWeekCount,
    thisMonthCount,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Pending Sales</h1>
        <p className="text-gray-600 mt-1">Sales imported from Xero that need to be assigned to a shopper</p>
      </div>
      <SyncPageClient
        unallocatedSales={unallocatedSales}
        dismissedSales={dismissedSales}
        shoppers={shoppersData}
        currentPeriod={period}
        aggregateStats={aggregateStats}
        userRole={role}
        unallocatedTotalCount={unallocatedTotalCount}
        dismissedTotalCount={dismissedTotalCount}
        rowCap={ROW_CAP}
      />
    </div>
  );
}
