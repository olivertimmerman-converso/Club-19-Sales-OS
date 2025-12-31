'use client';

import { useRouter } from 'next/navigation';
import { SyncControls } from './SyncControls';
import { NeedsAllocationSection } from './NeedsAllocationSection';

interface Sale {
  id: string;
  xero_invoice_number?: string | null;
  sale_date?: Date | null;
  sale_amount_inc_vat?: number | null;
  buyer_name?: string | null;
  internal_notes?: string | null;
  buyer?: {
    name?: string | null;
  } | null;
}

interface Shopper {
  id: string;
  name?: string | null;
}

interface DashboardClientWrapperProps {
  unallocatedSales: Sale[];
  shoppers: Shopper[];
}

export function DashboardClientWrapper({ unallocatedSales, shoppers }: DashboardClientWrapperProps) {
  const router = useRouter();

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <>
      {/* Sync Controls */}
      <div className="mb-6">
        <SyncControls onSyncComplete={handleRefresh} />
      </div>

      {/* Unallocated Invoices Section */}
      {unallocatedSales.length > 0 && (
        <NeedsAllocationSection
          sales={unallocatedSales}
          shoppers={shoppers}
          onAllocated={handleRefresh}
        />
      )}
    </>
  );
}
