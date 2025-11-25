import { NextRequest, NextResponse } from "next/server";
import { TradeSchema } from "@/lib/schemas/trade";
import { ZodError } from "zod";

/**
 * POST /api/trade/create
 *
 * Receives a Trade object, validates it, forwards to Make.com, returns invoice details
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

    // Return success response
    return NextResponse.json({
      status: "success",
      invoiceNumber: makeData.invoiceNumber,
      invoiceId: makeData.invoiceId,
      invoiceUrl: makeData.invoiceUrl,
      commissionableMarginGBP: trade.commissionableMarginGBP,
    });
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
