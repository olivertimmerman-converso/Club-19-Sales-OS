import { NextRequest, NextResponse } from "next/server";
import { TradeSchema } from "@/lib/schemas/trade";
import { ZodError } from "zod";
import { XataClient } from "@/src/xata";
import { auth } from "@clerk/nextjs/server";

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
 * POST /api/trade/create
 *
 * Receives a Trade object, validates it, forwards to Make.com, returns invoice details
 * CRITICAL: After Make.com succeeds, saves deal to Xata Sales table
 */
export async function POST(request: NextRequest) {
  try {
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
      console.error("MAKE_TRADE_WEBHOOK_URL not configured");
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
      console.error(
        "Make.com webhook failed:",
        makeResponse.status,
        makeResponse.statusText,
      );
      const errorText = await makeResponse.text();
      console.error("Make.com error response:", errorText);

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
      console.error("Make.com response missing required fields:", makeData);
      return NextResponse.json(
        {
          error: "MAKE_RESPONSE_ERROR",
          message: "Make.com response incomplete",
        },
        { status: 502 },
      );
    }

    console.log('[TRADE CREATE] Xero invoice created successfully, saving to Sales table...');

    // CRITICAL: Save deal to Xata Sales table
    try {
      // Generate sale reference (C19-XXXX format)
      const saleReference = await generateSaleReference();
      console.log(`[TRADE CREATE] Generated sale reference: ${saleReference}`);

      // Get authenticated user
      const { userId } = await auth();

      // Find or create buyer record
      const buyer = await findOrCreateBuyer(
        trade.buyer.name,
        trade.buyer.xeroContactId
      );

      if (!buyer) {
        console.warn('[TRADE CREATE] ⚠️  Failed to create/find buyer, saving without buyer link');
      } else {
        console.log(`[TRADE CREATE] Buyer: ${buyer.name} (${buyer.id})`);
      }

      // For multi-item trades, we'll save only the first item for now
      // TODO: In the future, consider creating separate Sale records for each item
      const firstItem = trade.items[0];

      // Calculate totals
      const totalBuyPrice = trade.items.reduce((sum, item) =>
        sum + (item.buyPriceGBP || item.buyPrice), 0
      );
      const totalSellPrice = trade.items.reduce((sum, item) =>
        sum + (item.sellPriceGBP || item.sellPrice), 0
      );

      // Create Sales record
      const saleRecord = await xata.db.Sales.create({
        // Metadata
        sale_reference: saleReference,
        sale_date: new Date(),
        status: 'active',

        // Buyer (link to Buyers table) - only if buyer exists
        buyer: buyer?.id || undefined,

        // Item details (from first item)
        brand: firstItem.brand,
        category: firstItem.category,
        item_title: firstItem.description,
        quantity: firstItem.quantity,

        // Pricing
        buy_price: totalBuyPrice,
        sale_amount_ex_vat: totalSellPrice,
        sale_amount_inc_vat: totalSellPrice, // TODO: Calculate actual VAT if needed
        currency: firstItem.sellCurrency || 'GBP',

        // Costs
        card_fees: trade.impliedCosts.cardFees,
        shipping_cost: trade.impliedCosts.shipping,
        direct_costs: trade.impliedCosts.total,

        // Margins
        gross_margin: trade.grossMarginGBP,
        commissionable_margin: trade.commissionableMarginGBP,

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

      console.log(`[TRADE CREATE] ✅ Sale saved to database: ${saleRecord.id}`);
      console.log(`[TRADE CREATE] Sale reference: ${saleReference}`);
      console.log(`[TRADE CREATE] Xero invoice: ${makeData.invoiceNumber}`);

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
      console.error('[TRADE CREATE] ❌ Failed to save to Sales table:', dbError);
      console.error('[TRADE CREATE] ERROR STACK:', dbError instanceof Error ? dbError.stack : 'Unknown error');

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
    console.error("Unexpected error in /api/trade/create:", err);
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
