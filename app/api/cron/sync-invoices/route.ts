/**
 * Club 19 Sales OS - Automated Invoice Sync Cron Job
 *
 * Automatically syncs invoices from Xero every 30 minutes.
 * Creates new Sales records with needs_allocation=true for management to assign.
 *
 * SCHEDULE: Every 30 minutes (see vercel.json)
 *
 * This cron job mirrors the manual POST /api/sync/xero-invoices endpoint
 * but runs automatically without user authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getValidTokens } from '@/lib/xero-auth';
import { db } from "@/db";
import { sales, buyers, errors } from "@/db/schema";
import { eq, ilike, sql } from "drizzle-orm";
import {
  calculateMargins,
  getVATRateForBrandingTheme,
  calculateExVatWithRate,
  toNumber,
} from '@/lib/economics';
import { roundCurrency, addCurrency } from '@/lib/utils/currency';
import * as logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Integration user ID - single source of truth for Xero tokens
const INTEGRATION_USER_ID = process.env.XERO_INTEGRATION_CLERK_USER_ID;

/**
 * Safely convert a date value to Date object or null
 * Handles Xero's .NET JSON date format: /Date(1731456000000+0000)/
 */
function safeDate(dateValue: unknown): Date | null {
  if (!dateValue) return null;

  try {
    if (typeof dateValue === 'string') {
      const match = dateValue.match(/\/Date\((\d+)([+-]\d{4})?\)\//);
      if (match) {
        const timestamp = parseInt(match[1], 10);
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }

      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
      return dateValue;
    }

    if (typeof dateValue === 'number') {
      const date = new Date(dateValue);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function safeISOString(dateValue: unknown): string | null {
  const date = safeDate(dateValue);
  if (!date) return null;
  try {
    return date.toISOString();
  } catch {
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
  FullyPaidOnDate?: string;
  Total: number;
  SubTotal: number;
  TotalTax: number;
  AmountDue: number;
  AmountPaid: number;
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
  }>;
}

interface XeroInvoicesResponse {
  Invoices: XeroInvoice[];
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  logger.info('XERO_CRON_INVOICES', 'Starting automated invoice sync');

  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET) {
    logger.error('XERO_CRON_INVOICES', 'CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== expectedAuth) {
    logger.error('XERO_CRON_INVOICES', 'Unauthorized cron request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!INTEGRATION_USER_ID) {
    logger.error('XERO_CRON_INVOICES', 'XERO_INTEGRATION_CLERK_USER_ID not configured');
    return NextResponse.json({
      error: 'XERO_INTEGRATION_CLERK_USER_ID not configured'
    }, { status: 500 });
  }

  try {
    // Get Xero tokens
    const tokens = await getValidTokens(INTEGRATION_USER_ID);
    logger.info('XERO_CRON_INVOICES', 'Got valid Xero tokens');

    // Fetch invoices from last 7 days (narrower window for cron efficiency)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const dateFilter = `Date>=DateTime(${sevenDaysAgo.getFullYear()},${sevenDaysAgo.getMonth() + 1},${sevenDaysAgo.getDate()})`;

    logger.info('XERO_CRON_INVOICES', 'Fetching recent invoices', {
      fromDate: sevenDaysAgo.toISOString()
    });

    const allInvoices: XeroInvoice[] = [];
    let page = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      const xeroUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=${encodeURIComponent(dateFilter)}&page=${page}`;

      const xeroResponse = await fetch(xeroUrl, {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
          'Xero-Tenant-Id': tokens.tenantId,
          'Accept': 'application/json',
        },
      });

      if (!xeroResponse.ok) {
        const errorText = await xeroResponse.text();
        logger.error('XERO_CRON_INVOICES', 'Xero API error', {
          status: xeroResponse.status,
          details: errorText
        });
        throw new Error(`Xero API error: ${xeroResponse.status}`);
      }

      const xeroData: XeroInvoicesResponse = await xeroResponse.json();
      const invoices = xeroData.Invoices || [];

      if (invoices.length === 0) {
        hasMorePages = false;
      } else {
        allInvoices.push(...invoices);
        page++;
      }
    }

    logger.info('XERO_CRON_INVOICES', 'Fetched invoices', {
      total: allInvoices.length,
      pages: page - 1
    });

    // Process invoices
    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const syncErrors: Array<{ invoiceNumber: string; error: string }> = [];

    for (const invoice of allInvoices) {
      try {
        // Only process ACCREC (sales) invoices
        if (invoice.Type !== 'ACCREC') {
          skippedCount++;
          continue;
        }

        const invoiceDate = safeDate(invoice.Date);

        // Check if exists
        const [existing] = await db
          .select()
          .from(sales)
          .where(eq(sales.xeroInvoiceId, invoice.InvoiceID))
          .limit(1);

        if (existing) {
          // Check if Xero invoice was modified since we last synced
          const xeroUpdated = safeDate(invoice.UpdatedDateUTC);
          const ourUpdated = existing.updatedAt;
          const xeroIsNewer = xeroUpdated && ourUpdated
            ? xeroUpdated.getTime() > ourUpdated.getTime()
            : false;

          // Soft-deleted records may be linked secondaries — update JSONB if amount changed
          if (existing.deletedAt) {
            if (xeroIsNewer && existing.xeroInvoiceId) {
              const existingAmount = roundCurrency(toNumber(existing.saleAmountIncVat));
              const xeroAmount = roundCurrency(invoice.Total || 0);

              if (existingAmount !== xeroAmount) {
                // Update the soft-deleted record's amount
                await db
                  .update(sales)
                  .set({
                    saleAmountIncVat: xeroAmount,
                    saleAmountExVat: invoice.SubTotal || (xeroAmount / 1.2),
                    invoiceStatus: invoice.Status,
                  })
                  .where(eq(sales.id, existing.id));

                // Find and update any primary sale referencing this invoice in linked_invoices JSONB
                const primarySales = await db
                  .select()
                  .from(sales)
                  .where(sql`${sales.linkedInvoices}::jsonb @> ${JSON.stringify([{ xero_invoice_id: existing.xeroInvoiceId }])}::jsonb`);

                for (const primary of primarySales) {
                  const linked = (primary.linkedInvoices as any[]) || [];
                  const updatedLinked = linked.map((inv: any) =>
                    inv.xero_invoice_id === existing.xeroInvoiceId
                      ? { ...inv, amount_inc_vat: xeroAmount }
                      : inv
                  );

                  // Recalculate primary sale totals
                  const primaryOwnAmount = roundCurrency(toNumber(primary.saleAmountIncVat));
                  // Subtract old linked total, add new linked total
                  const oldLinkedTotal = linked.reduce((sum: number, inv: any) => addCurrency(sum, inv.amount_inc_vat), 0);
                  const newLinkedTotal = updatedLinked.reduce((sum: number, inv: any) => addCurrency(sum, inv.amount_inc_vat), 0);
                  // Primary's saleAmountIncVat already includes linked amounts
                  const newTotalIncVat = addCurrency(primaryOwnAmount - oldLinkedTotal, newLinkedTotal);

                  const vatRate = getVATRateForBrandingTheme(primary.brandingTheme);
                  const newTotalExVat = calculateExVatWithRate(newTotalIncVat, vatRate);

                  const margins = calculateMargins({
                    saleAmountExVat: newTotalExVat,
                    buyPrice: primary.buyPrice,
                    shippingCost: primary.shippingCost,
                    cardFees: primary.cardFees,
                    directCosts: primary.directCosts,
                    introducerCommission: primary.introducerCommission,
                  });

                  await db
                    .update(sales)
                    .set({
                      linkedInvoices: updatedLinked,
                      saleAmountIncVat: newTotalIncVat,
                      saleAmountExVat: newTotalExVat,
                      grossMargin: margins.grossMargin,
                      commissionableMargin: margins.commissionableMargin,
                    })
                    .where(eq(sales.id, primary.id));

                  logger.info('XERO_CRON_INVOICES', 'Updated linked invoice amount on primary sale', {
                    primarySaleId: primary.id,
                    linkedInvoiceId: existing.xeroInvoiceId,
                    oldAmount: existingAmount,
                    newAmount: xeroAmount,
                  });
                }

                updatedCount++;
              } else {
                skippedCount++;
              }
            } else {
              skippedCount++;
            }
            continue;
          }

          // Non-deleted record: check if status or amounts changed
          const statusChanged = existing.invoiceStatus !== invoice.Status;
          const amountsChanged = xeroIsNewer && (
            roundCurrency(toNumber(existing.saleAmountIncVat)) !== roundCurrency(invoice.Total || 0)
          );

          if (statusChanged || amountsChanged) {
            const updateSet: Record<string, any> = {
              invoiceStatus: invoice.Status,
              invoicePaidDate: invoice.FullyPaidOnDate ? safeDate(invoice.FullyPaidOnDate) : null,
            };

            if (amountsChanged) {
              const newIncVat = roundCurrency(invoice.Total || 0);
              const newExVat = roundCurrency(invoice.SubTotal || (newIncVat / 1.2));

              updateSet.saleAmountIncVat = newIncVat;
              updateSet.saleAmountExVat = newExVat;
              updateSet.xeroInvoiceNumber = invoice.InvoiceNumber;

              // Recalculate margins with new amounts (keep existing buy price etc)
              const margins = calculateMargins({
                saleAmountExVat: newExVat,
                buyPrice: existing.buyPrice,
                shippingCost: existing.shippingCost,
                cardFees: existing.cardFees,
                directCosts: existing.directCosts,
                introducerCommission: existing.introducerCommission,
              });

              updateSet.grossMargin = margins.grossMargin;
              updateSet.commissionableMargin = margins.commissionableMargin;

              logger.info('XERO_CRON_INVOICES', 'Refreshing amounts from Xero', {
                invoiceNumber: invoice.InvoiceNumber,
                oldIncVat: existing.saleAmountIncVat,
                newIncVat,
                grossMargin: margins.grossMargin,
              });
            }

            await db
              .update(sales)
              .set(updateSet)
              .where(eq(sales.id, existing.id));
            updatedCount++;
          } else {
            skippedCount++;
          }
        } else {
          // Create new sale
          const contactName = invoice.Contact?.Name || 'Unknown';
          const lineItems = invoice.LineItems || [];
          const firstItem = lineItems[0] || {};

          if (!invoiceDate) {
            syncErrors.push({
              invoiceNumber: invoice.InvoiceNumber,
              error: 'Invalid sale date'
            });
            continue;
          }

          // Find or create buyer — prefer xeroContactId match to avoid duplicates
          const xeroContactId = invoice.Contact?.ContactID || null;
          let buyer = null as typeof buyers.$inferSelect | null;

          if (xeroContactId) {
            const [found] = await db
              .select()
              .from(buyers)
              .where(eq(buyers.xeroContactId, xeroContactId))
              .limit(1);
            buyer = found || null;

            // Update name if it changed in Xero
            if (buyer && buyer.name !== contactName) {
              await db
                .update(buyers)
                .set({ name: contactName })
                .where(eq(buyers.id, buyer.id));
              buyer = { ...buyer, name: contactName };
            }
          }

          // Fall back to name match if no xeroContactId match
          if (!buyer) {
            const [found] = await db
              .select()
              .from(buyers)
              .where(ilike(buyers.name, `%${contactName}%`))
              .limit(1);
            buyer = found || null;

            // Backfill xeroContactId if missing
            if (buyer && xeroContactId && !buyer.xeroContactId) {
              await db
                .update(buyers)
                .set({ xeroContactId })
                .where(eq(buyers.id, buyer.id));
            }
          }

          if (!buyer) {
            const [created] = await db
              .insert(buyers)
              .values({
                name: contactName,
                xeroContactId,
              })
              .returning();
            buyer = created;
          }

          const dueDate = safeDate(invoice.DueDate);
          const dueDateNote = dueDate ? ` Due: ${safeISOString(dueDate) || 'Unknown'}` : '';
          const importNotes = `Auto-imported by cron on ${new Date().toISOString()}. Client: ${contactName}.${dueDateNote} Needs shopper allocation.`;

          await db
            .insert(sales)
            .values({
              xeroInvoiceId: invoice.InvoiceID,
              xeroInvoiceNumber: invoice.InvoiceNumber,
              invoiceStatus: invoice.Status,
              saleDate: invoiceDate,
              saleAmountIncVat: invoice.Total || 0,
              saleAmountExVat: invoice.SubTotal || (invoice.Total / 1.2),
              currency: 'GBP',
              source: 'xero_import',
              needsAllocation: true,
              buyerId: buyer ? buyer.id : null,
              brand: 'Unknown',
              category: 'Unknown',
              itemTitle: firstItem.Description || 'Imported from Xero',
              quantity: firstItem.Quantity || 1,
              buyPrice: 0,
              grossMargin: 0,
              internalNotes: importNotes,
            });

          newCount++;
          logger.info('XERO_CRON_INVOICES', 'Created new sale', {
            invoiceNumber: invoice.InvoiceNumber
          });
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        syncErrors.push({
          invoiceNumber: invoice.InvoiceNumber || invoice.InvoiceID,
          error: errorMessage
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.info('XERO_CRON_INVOICES', 'Sync completed', {
      duration,
      new: newCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: syncErrors.length
    });

    // Log errors to database if any
    if (syncErrors.length > 0) {
      try {
        await db.insert(errors).values({
          severity: 'medium',
          source: 'xero-cron-invoices',
          message: syncErrors.map(e => `${e.invoiceNumber}: ${e.error}`),
          timestamp: new Date(),
          resolved: false,
        });
      } catch (logErr) {
        logger.error('XERO_CRON_INVOICES', 'Failed to log errors to database');
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: allInvoices.length,
        new: newCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: syncErrors.length,
      },
      duration: `${duration}ms`,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('XERO_CRON_INVOICES', 'Fatal error during sync', {
      message: errorMessage,
    });

    // Log to database
    try {
      await db.insert(errors).values({
        severity: 'high',
        source: 'xero-cron-invoices',
        message: [`Cron invoice sync failed: ${errorMessage}`],
        timestamp: new Date(),
        resolved: false,
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json({
      error: 'Sync failed',
      details: errorMessage,
    }, { status: 500 });
  }
}
