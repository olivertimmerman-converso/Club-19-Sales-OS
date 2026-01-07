import { NextRequest, NextResponse } from "next/server";
import { TradeSchema } from "@/lib/schemas/trade";
import { ZodError } from "zod";
import { XataClient } from "@/src/xata";
import { auth } from "@clerk/nextjs/server";
import * as logger from "@/lib/logger";
import { getBrandingThemeMapping, XERO_BRANDING_THEMES } from "@/lib/branding-theme-mappings";
import { getValidTokens } from "@/lib/xero-auth";

// Initialize Xata client
const xata = new XataClient();

/**
 * Generate next sale_reference in format C19-XXXX
 */
async function generateSaleReference(): Promise<string> {
  // Get the latest sale by creation date
  const latestSale = await xata.db.Sales
    .select(['sale_reference'])
    .sort('xata.createdAt', 'desc')
    .getFirst();

  if (!latestSale || !latestSale.sale_reference) {
    return 'C19-0001';
  }

  // Extract number from C19-XXXX format
  const match = latestSale.sale_reference.match(/C19-(\d+)/);
  if (!match) {
    return 'C19-0001';
  }

  const nextNumber = parseInt(match[1], 10) + 1;
  return `C19-${nextNumber.toString().padStart(4, '0')}`;
}

/**
 * Auto-sync Xero invoice details after sale creation
 * Searches Xero for invoice matching the sale reference and updates the Sales record
 * Does not throw errors - logs failures and continues
 */
async function autoSyncXeroInvoice(saleId: string, saleReference: string): Promise<void> {
  try {
    logger.info('AUTO_SYNC', 'Starting auto-sync for sale', { saleId, saleReference });

    // Get system user's Xero tokens
    const systemUserId = process.env.XERO_SYSTEM_USER_ID;
    if (!systemUserId || systemUserId === 'FILL_ME') {
      logger.warn('AUTO_SYNC', 'XERO_SYSTEM_USER_ID not configured - skipping auto-sync');
      return;
    }

    // Wait 3 seconds for Xero to process the invoice
    await new Promise(resolve => setTimeout(resolve, 3000));

    const tokens = await getValidTokens(systemUserId);
    logger.info('AUTO_SYNC', 'Got valid Xero tokens');

    // Search for invoice with reference matching sale_reference
    const searchUrl = `https://api.xero.com/api.xro/2.0/Invoices?where=Reference=="${encodeURIComponent(saleReference)}"`;

    const xeroResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Xero-Tenant-Id': tokens.tenantId,
        'Accept': 'application/json',
      },
    });

    if (!xeroResponse.ok) {
      const errorText = await xeroResponse.text();
      logger.error('AUTO_SYNC', 'Xero API error', {
        status: xeroResponse.status,
        details: errorText,
        searchUrl
      });
      return;
    }

    const xeroData: any = await xeroResponse.json();
    const invoices = xeroData.Invoices || [];

    logger.info('AUTO_SYNC', 'Xero search completed', {
      saleReference,
      invoicesFound: invoices.length
    });

    if (invoices.length === 0) {
      logger.warn('AUTO_SYNC', 'No invoice found in Xero with reference', { saleReference });
      return;
    }

    const invoice = invoices[0]; // Take first match

    // Update sale record with Xero invoice details
    await xata.db.Sales.update(saleId, {
      xero_invoice_id: invoice.InvoiceID,
      xero_invoice_number: invoice.InvoiceNumber,
      xero_invoice_url: `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoice.InvoiceID}`,
      invoice_status: invoice.Status,
    });

    logger.info('AUTO_SYNC', 'Successfully synced Xero invoice', {
      saleId,
      saleReference,
      xeroInvoiceNumber: invoice.InvoiceNumber,
      xeroInvoiceId: invoice.InvoiceID,
      status: invoice.Status
    });
  } catch (error) {
    // Don't throw - just log the error and continue
    logger.error('AUTO_SYNC', 'Failed to auto-sync Xero invoice', {
      saleId,
      saleReference,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

/**
 * Find or create Buyer record in Xata
 */
async function findOrCreateBuyer(buyerName: string, xeroContactId?: string) {
  // Try to find existing buyer by name
  let buyer = await xata.db.Buyers
    .filter({ name: buyerName })
    .getFirst();

  if (!buyer) {
    // Create new buyer
    buyer = await xata.db.Buyers.create({
      name: buyerName,
      xero_contact_id: xeroContactId,
    });
  } else if (xeroContactId && !buyer.xero_contact_id) {
    // Update existing buyer with Xero contact ID if missing
    buyer = await xata.db.Buyers.update(buyer.id, {
      xero_contact_id: xeroContactId,
    });
  }

  return buyer;
}

/**
 * Find or create Supplier record in Xata
 */
async function findOrCreateSupplier(supplierName: string, supplierXataId?: string) {
  // If we have a Xata ID, try to find by ID first
  if (supplierXataId) {
    const supplier = await xata.db.Suppliers.read(supplierXataId);
    if (supplier) {
      return supplier;
    }
  }

  // Try to find existing supplier by name
  let supplier = await xata.db.Suppliers
    .filter({ name: supplierName })
    .getFirst();

  if (!supplier) {
    // Create new supplier
    supplier = await xata.db.Suppliers.create({
      name: supplierName,
    });
  }

  return supplier;
}

/**
 * POST /api/trade/create
 *
 * Receives a Trade object, validates it, forwards to Make.com, returns invoice details
 * CRITICAL: After Make.com succeeds, saves deal to Xata Sales table
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId: authUserId } = await auth();
    if (!authUserId) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();

    // Validate with Zod
    let trade;
    try {
      trade = TradeSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          {
            error: "VALIDATION_ERROR",
            issues: err.issues,
          },
          { status: 400 },
        );
      }
      throw err;
    }

    // Get Make.com webhook URL from environment
    const makeWebhookUrl = process.env.MAKE_TRADE_WEBHOOK_URL;
    if (!makeWebhookUrl) {
      logger.error("TRADE_CREATE", "MAKE_TRADE_WEBHOOK_URL not configured");
      return NextResponse.json(
        {
          error: "SERVER_CONFIGURATION_ERROR",
          message: "Trade webhook not configured",
        },
        { status: 500 },
      );
    }

    // Forward to Make.com
    const makeResponse = await fetch(makeWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(trade),
    });

    if (!makeResponse.ok) {
      const errorText = await makeResponse.text();
      logger.error("TRADE_CREATE", "Make.com webhook failed", {
        status: makeResponse.status,
        statusText: makeResponse.statusText,
        errorText
      });

      return NextResponse.json(
        {
          error: "MAKE_WEBHOOK_ERROR",
          message: "Failed to create invoice via Make.com",
          details: errorText,
        },
        { status: 502 },
      );
    }

    // Parse Make.com response
    const makeData = await makeResponse.json();

    // Validate Make response has required fields
    if (
      !makeData.invoiceNumber ||
      !makeData.invoiceId ||
      !makeData.invoiceUrl
    ) {
      logger.error("TRADE_CREATE", "Make.com response missing required fields", { makeData });
      return NextResponse.json(
        {
          error: "MAKE_RESPONSE_ERROR",
          message: "Make.com response incomplete",
        },
        { status: 502 },
      );
    }

    logger.info('TRADE_CREATE', 'Xero invoice created successfully, saving to Sales table');

    // CRITICAL: Save deal to Xata Sales table
    try {
      // Generate sale reference (C19-XXXX format)
      const saleReference = await generateSaleReference();
      logger.info('TRADE_CREATE', 'Generated sale reference', { saleReference });

      // Get authenticated user
      const { userId } = await auth();

      // Find or create buyer record
      const buyer = await findOrCreateBuyer(
        trade.buyer.name,
        trade.buyer.xeroContactId
      );

      if (!buyer) {
        logger.warn('TRADE_CREATE', 'Failed to create/find buyer, saving without buyer link');
      } else {
        logger.info('TRADE_CREATE', 'Buyer found/created', {
          name: buyer.name,
          id: buyer.id
        });
      }

      // For multi-item trades, we'll save only the first item for now
      // TODO: In the future, consider creating separate Sale records for each item
      const firstItem = trade.items[0];

      // Find or create supplier record (from first item)
      const supplier = await findOrCreateSupplier(
        firstItem.supplier.name,
        firstItem.supplier.xataId
      );

      if (!supplier) {
        logger.warn('TRADE_CREATE', 'Failed to create/find supplier, saving without supplier link');
      } else {
        logger.info('TRADE_CREATE', 'Supplier found/created', {
          name: supplier.name,
          id: supplier.id
        });
      }

      // Note: Introducer is now a boolean flag only - details will be added in Sales OS
      const hasIntroducer = trade.introducer?.hasIntroducer || false;
      if (hasIntroducer) {
        logger.info('TRADE_CREATE', 'Sale marked as having referral partner (details to be added in Sales OS)');
      }

      // Calculate totals
      const totalBuyPrice = trade.items.reduce((sum, item) =>
        sum + (item.buyPriceGBP || item.buyPrice), 0
      );
      const totalSellPrice = trade.items.reduce((sum, item) =>
        sum + (item.sellPriceGBP || item.sellPrice), 0
      );

      // Determine VAT rate based on branding theme
      const brandingThemeMapping = getBrandingThemeMapping(firstItem.brandTheme);

      // CRITICAL: Do NOT default to 20% - this causes incorrect VAT on export sales
      if (!brandingThemeMapping) {
        logger.error('TRADE_CREATE', 'Unknown branding theme - cannot determine VAT rate', {
          brandTheme: firstItem.brandTheme,
          availableThemes: Object.keys(XERO_BRANDING_THEMES)
        });
        throw new Error(`Unknown branding theme: ${firstItem.brandTheme}. Cannot determine correct VAT rate.`);
      }

      const vatRate = brandingThemeMapping.expectedVAT;
      const vatRateDecimal = vatRate / 100;

      logger.info('TRADE_CREATE', 'VAT calculation', {
        brandTheme: firstItem.brandTheme,
        mappingFound: true,
        themeName: brandingThemeMapping.name,
        vatRate: vatRate,
        accountCode: brandingThemeMapping.accountCode,
        treatment: brandingThemeMapping.treatment
      });

      // Calculate VAT amounts
      // Note: User enters sell price (assumed ex VAT for standard rate, total for zero-rated)
      let saleAmountExVat: number;
      let saleAmountIncVat: number;

      if (vatRate === 0) {
        // Zero-rated: inc VAT = ex VAT (no VAT added)
        saleAmountExVat = totalSellPrice;
        saleAmountIncVat = totalSellPrice;
      } else {
        // Standard rate (20%): calculate VAT
        saleAmountExVat = totalSellPrice;
        saleAmountIncVat = saleAmountExVat * (1 + vatRateDecimal);
      }

      logger.info('TRADE_CREATE', 'VAT amounts calculated', {
        totalSellPrice,
        vatRate,
        saleAmountExVat,
        saleAmountIncVat,
        vatAmount: saleAmountIncVat - saleAmountExVat
      });

      // Calculate margins server-side for accuracy
      // gross_margin = sale_amount_ex_vat - (buy_price + shipping_cost + card_fees + direct_costs)
      const grossMargin = saleAmountExVat - (totalBuyPrice + trade.impliedCosts.shipping + trade.impliedCosts.cardFees + trade.impliedCosts.total);

      // commissionable_margin = gross_margin (introducer commission will be deducted later if applicable)
      const commissionableMargin = grossMargin;

      logger.info('TRADE_CREATE', 'Margins calculated', {
        saleAmountExVat,
        totalBuyPrice,
        shipping: trade.impliedCosts.shipping,
        cardFees: trade.impliedCosts.cardFees,
        directCosts: trade.impliedCosts.total,
        grossMargin,
        commissionableMargin
      });

      // Create Sales record
      const saleRecord = await xata.db.Sales.create({
        // Metadata
        sale_reference: saleReference,
        sale_date: new Date(), // Date the invoice is created (today)
        status: 'active',
        source: 'atelier', // Sales Atelier origin

        // Buyer (link to Buyers table) - only if buyer exists
        buyer: buyer?.id || undefined,

        // Supplier (link to Suppliers table) - only if supplier exists
        supplier: supplier?.id || undefined,

        // Note: Introducer link is NOT set at creation - will be added manually in Sales OS
        // But we do set the has_introducer flag if the checkbox was ticked
        has_introducer: hasIntroducer,

        // Item details (from first item)
        brand: firstItem.brand,
        category: firstItem.category,
        item_title: firstItem.description,
        quantity: firstItem.quantity,

        // Pricing with correct VAT calculation
        buy_price: totalBuyPrice,
        sale_amount_ex_vat: saleAmountExVat,
        sale_amount_inc_vat: saleAmountIncVat,
        currency: firstItem.sellCurrency || 'GBP',

        // Costs
        card_fees: trade.impliedCosts.cardFees,
        shipping_cost: (body.shippingMethod === 'hand_delivery') ? 0 : null,
        direct_costs: trade.impliedCosts.total,

        // Shipping method
        shipping_method: body.shippingMethod || 'to_be_shipped',
        shipping_cost_confirmed: body.shippingMethod === 'hand_delivery',

        // Margins (calculated server-side for accuracy)
        gross_margin: grossMargin,
        commissionable_margin: commissionableMargin,

        // Xero integration
        xero_invoice_number: makeData.invoiceNumber,
        xero_invoice_id: makeData.invoiceId,
        xero_invoice_url: makeData.invoiceUrl,
        invoice_status: 'DRAFT',
        branding_theme: firstItem.brandTheme,

        // Commission tracking (defaults)
        commission_locked: false,
        commission_paid: false,
        error_flag: false,
      });

      logger.info('TRADE_CREATE', 'Sale saved to database', {
        saleId: saleRecord.id,
        saleReference,
        xeroInvoiceNumber: makeData.invoiceNumber
      });

      // Auto-sync Xero invoice details (non-blocking - logs errors but doesn't fail)
      // This happens in the background after the response is sent
      autoSyncXeroInvoice(saleRecord.id, saleReference).catch(err => {
        logger.error('TRADE_CREATE', 'Auto-sync promise rejected', {
          saleId: saleRecord.id,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      });

      // Return success response with sale ID
      return NextResponse.json({
        status: "success",
        invoiceNumber: makeData.invoiceNumber,
        invoiceId: makeData.invoiceId,
        invoiceUrl: makeData.invoiceUrl,
        commissionableMarginGBP: trade.commissionableMarginGBP,
        saleId: saleRecord.id,
        saleReference: saleReference,
      });
    } catch (dbError) {
      // Log database error but don't fail the request
      // The Xero invoice was created successfully, so we should still return success
      logger.error('TRADE_CREATE', 'Failed to save to Sales table', {
        error: dbError as any,
        stack: dbError instanceof Error ? dbError.stack : undefined
      });

      // Return success with warning
      return NextResponse.json({
        status: "success",
        invoiceNumber: makeData.invoiceNumber,
        invoiceId: makeData.invoiceId,
        invoiceUrl: makeData.invoiceUrl,
        commissionableMarginGBP: trade.commissionableMarginGBP,
        warning: 'Invoice created but failed to save to database',
      });
    }
  } catch (err) {
    logger.error("TRADE_CREATE", "Unexpected error", { error: err as any });
    return NextResponse.json(
      {
        error: "UNKNOWN_ERROR",
        message:
          err instanceof Error ? err.message : "An unknown error occurred",
      },
      { status: 500 },
    );
  }
}
