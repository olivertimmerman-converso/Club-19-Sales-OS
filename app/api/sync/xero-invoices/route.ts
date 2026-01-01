/**
 * Club 19 Sales OS - Xero Invoice Sync API
 *
 * POST endpoint to sync invoices from Xero
 * Fetches invoices updated in last 7 days and creates/updates Sales records
 *
 * Auth: Superadmin, Operations, or Founder only
 */

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';
import { getXataClient } from '@/src/xata';
import { getValidTokens } from '@/lib/xero-auth';

export const dynamic = 'force-dynamic';

/**
 * Safely convert a date value to Date object or null
 * Handles invalid dates without throwing errors
 */
function safeDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      console.warn(`[XERO SYNC] Invalid date value: ${dateValue}`);
      return null;
    }
    return date;
  } catch (err) {
    console.error(`[XERO SYNC] Error parsing date ${dateValue}:`, err);
    return null;
  }
}

/**
 * Safely convert a date to ISO string or null
 */
function safeISOString(dateValue: any): string | null {
  const date = safeDate(dateValue);
  if (!date) return null;
  try {
    return date.toISOString();
  } catch (err) {
    console.error(`[XERO SYNC] Error converting to ISO string:`, err);
    return null;
  }
}

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: 'ACCREC' | 'ACCPAY';
  Status: string;
  Date: string;
  DueDate: string;
  Total: number;
  SubTotal: number;
  TotalTax: number;
  AmountDue: number;
  AmountPaid: number;
  AmountCredited: number;
  UpdatedDateUTC: string;
  Contact?: {
    ContactID: string;
    Name: string;
  };
  LineItems?: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    LineAmount: number;
    AccountCode: string;
  }>;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

export async function POST() {
  const startTime = Date.now();
  console.log('[XERO SYNC] === Starting Xero invoice sync ===');

  try {
    // 1. Auth check - superadmin, operations, or founder only
    const { userId } = await auth();
    if (!userId) {
      console.error('[XERO SYNC] ❌ Unauthorized - no userId');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole();
    console.log(`[XERO SYNC] User role: ${role}`);

    if (!['superadmin', 'operations', 'founder'].includes(role || '')) {
      console.error(`[XERO SYNC] ❌ Forbidden - role ${role} not allowed`);
      return NextResponse.json({ error: 'Forbidden - requires superadmin, operations, or founder role' }, { status: 403 });
    }

    // 2. Get system user's Xero tokens
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId || systemUserId === 'FILL_ME') {
      console.error('[XERO SYNC] ❌ XERO_SYSTEM_USER_ID not configured');
      return NextResponse.json({
        error: 'XERO_SYSTEM_USER_ID not configured. Please set environment variable.'
      }, { status: 500 });
    }

    console.log(`[XERO SYNC] Using system user: ${systemUserId}`);

    const tokens = await getValidTokens(systemUserId);
    console.log('[XERO SYNC] ✓ Got valid Xero tokens');

    // 3. Fetch recent invoices from Xero (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const year = sevenDaysAgo.getFullYear();
    const month = sevenDaysAgo.getMonth() + 1; // JavaScript months are 0-indexed
    const day = sevenDaysAgo.getDate();

    const whereClause = `UpdatedDateUTC>=DateTime(${year},${month},${day})`;
    const statusFilter = 'AUTHORISED,PAID,SUBMITTED';

    console.log(`[XERO SYNC] Fetching invoices where: ${whereClause}`);
    console.log(`[XERO SYNC] Status filter: ${statusFilter}`);

    const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(whereClause)}&Statuses=${statusFilter}`;

    const xeroResponse = await fetch(xeroUrl, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-Tenant-Id': tokens.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      console.error('[XERO SYNC] ❌ Xero API error:', xeroResponse.status, errorText);
      return NextResponse.json({
        error: 'Xero API error',
        details: errorText
      }, { status: 500 });
    }

    const xeroData: XeroInvoicesResponse = await xeroResponse.json();
    const invoices = xeroData.Invoices || [];

    console.log(`[XERO SYNC] Fetched ${invoices.length} invoices from Xero`);

    // 4. Process each invoice
    const xata = getXataClient();
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ invoiceNumber: string; error: string }> = [];

    for (const invoice of invoices) {
      try {
        // Only process ACCREC (sales) invoices, not ACCPAY (bills)
        if (invoice.Type !== 'ACCREC') {
          console.log(`[XERO SYNC] Skipping ${invoice.InvoiceNumber} - Type is ${invoice.Type} (not ACCREC)`);
          skippedCount++;
          continue;
        }

        console.log(`[XERO SYNC] Processing invoice ${invoice.InvoiceNumber} (${invoice.Status})`);

        // Check if invoice already exists
        const existing = await xata.db.Sales.filter({
          xero_invoice_id: invoice.InvoiceID
        }).getFirst();

        if (existing) {
          // Update status if changed
          if (existing.invoice_status !== invoice.Status) {
            console.log(`[XERO SYNC] Updating ${invoice.InvoiceNumber}: ${existing.invoice_status} → ${invoice.Status}`);
            await xata.db.Sales.update(existing.id, {
              invoice_status: invoice.Status,
              invoice_paid_date: invoice.Status === 'PAID' ? new Date() : null,
            });
            updatedCount++;
          } else {
            console.log(`[XERO SYNC] No change for ${invoice.InvoiceNumber}`);
            skippedCount++;
          }
        } else {
          // Create new sale record (needs allocation)
          const contactName = invoice.Contact?.Name || 'Unknown';
          const total = invoice.Total || 0;
          const lineItems = invoice.LineItems || [];
          const firstItem = lineItems[0] || {};

          console.log(`[XERO SYNC] Creating new sale for ${invoice.InvoiceNumber} - Client: ${contactName}`);

          // Safely parse dates
          const saleDate = safeDate(invoice.Date);
          const dueDate = safeDate(invoice.DueDate);

          if (!saleDate) {
            console.warn(`[XERO SYNC] Invoice ${invoice.InvoiceNumber} has invalid sale date: ${invoice.Date}`);
          }
          if (invoice.DueDate && !dueDate) {
            console.warn(`[XERO SYNC] Invoice ${invoice.InvoiceNumber} has invalid due date: ${invoice.DueDate}`);
          }

          // Try to find or create buyer
          let buyer = await xata.db.Buyers.filter({
            name: { $iContains: contactName }
          }).getFirst();

          if (buyer) {
            console.log(`[XERO SYNC] Found existing buyer: ${buyer.name}`);
          } else {
            // Create new buyer record
            console.log(`[XERO SYNC] Creating new buyer: ${contactName}`);
            buyer = await xata.db.Buyers.create({
              name: contactName,
              xero_contact_id: invoice.Contact?.ContactID || null,
            });
            console.log(`[XERO SYNC] ✓ Created buyer: ${buyer.name} (${buyer.id})`);
          }

          const currentDate = new Date();
          const dueDateNote = dueDate ? ` Due: ${safeISOString(dueDate) || 'Unknown'}` : '';
          const importNotes = `Auto-imported from Xero on ${safeISOString(currentDate) || currentDate.toString()}. Client: ${contactName}.${dueDateNote} Needs shopper allocation and cost details.`;

          await xata.db.Sales.create({
            xero_invoice_id: invoice.InvoiceID,
            xero_invoice_number: invoice.InvoiceNumber,
            invoice_status: invoice.Status,
            sale_date: saleDate || currentDate, // Fallback to current date if invalid
            // invoice_due_date: dueDate, // TODO: Column exists in schema but not accepted by Xata yet
            sale_amount_inc_vat: total,
            sale_amount_ex_vat: invoice.SubTotal || (total / 1.2), // Use SubTotal or assume 20% VAT
            currency: 'GBP',
            needs_allocation: true, // Requires shopper assignment
            buyer: buyer ? buyer.id : null,
            // buyer_name: contactName, // TODO: Column exists in schema but not accepted by Xata yet
            brand: 'Unknown',
            category: 'Unknown',
            item_title: firstItem.Description || 'Imported from Xero',
            quantity: firstItem.Quantity || 1,
            buy_price: 0, // Unknown - Operations will need to fill in
            gross_margin: 0,
            internal_notes: importNotes,
          });
          newCount++;
          console.log(`[XERO SYNC] ✓ Created new sale for ${invoice.InvoiceNumber}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[XERO SYNC] ❌ Error processing invoice ${invoice.InvoiceNumber}:`, err);
        errors.push({
          invoiceNumber: invoice.InvoiceNumber || invoice.InvoiceID,
          error: errorMessage
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[XERO SYNC] ✓✓✓ Sync completed in ${duration}ms`);
    console.log(`[XERO SYNC] Summary: ${newCount} new, ${updatedCount} updated, ${skippedCount} skipped, ${errors.length} errors`);

    return NextResponse.json({
      success: true,
      summary: {
        total: invoices.length,
        new: newCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errors.length,
      },
      errors,
      duration: `${duration}ms`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[XERO SYNC] ❌ Fatal error:', error);
    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage
    }, { status: 500 });
  }
}
