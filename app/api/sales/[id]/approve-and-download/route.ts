/**
 * POST /api/sales/[id]/approve-and-download
 *
 * Two-step flow:
 *   1. Updates the linked Xero invoice from DRAFT to AUTHORISED. Xero's
 *      Invoices endpoint accepts POST for updates (same pattern as create,
 *      with the existing InvoiceID provided in the body) — this matches the
 *      convention used by lib/xero.ts:308.
 *   2. Fetches the now-available PDF and streams it back as application/pdf
 *
 * Also writes invoiceStatus = 'AUTHORISED' back to the sales row so the UI
 * can flip to a plain "Download PDF" button on subsequent loads.
 *
 * Permissions: superadmin, admin, founder, operations, OR the shopper who
 * owns the sale (matched via clerkUserId on the shoppers table).
 *
 * Idempotent: if the invoice is already AUTHORISED (or further along, e.g.
 * PAID), the PUT call is skipped and we go straight to the PDF fetch.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getValidTokens } from "@/lib/xero-auth";
import { getUserRole } from "@/lib/getUserRole";
import { db } from "@/db";
import { sales, shoppers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const XERO_API_BASE = "https://api.xero.com/api.xro/2.0/Invoices";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ----------------------------------------------------------------------
    // 1. Look up the sale + check permissions
    // ----------------------------------------------------------------------
    const [sale] = await db
      .select({
        id: sales.id,
        xeroInvoiceId: sales.xeroInvoiceId,
        xeroInvoiceNumber: sales.xeroInvoiceNumber,
        invoiceStatus: sales.invoiceStatus,
        shopperId: sales.shopperId,
      })
      .from(sales)
      .where(eq(sales.id, id))
      .limit(1);

    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    if (!sale.xeroInvoiceId) {
      return NextResponse.json(
        { error: "This sale has no linked Xero invoice" },
        { status: 400 }
      );
    }

    const role = await getUserRole();
    const elevatedRoles = ["superadmin", "admin", "founder", "operations"];
    let permitted = elevatedRoles.includes(role);

    // If not elevated, check whether the user is the shopper who owns the sale
    if (!permitted && sale.shopperId) {
      const [ownerShopper] = await db
        .select({ clerkUserId: shoppers.clerkUserId })
        .from(shoppers)
        .where(and(eq(shoppers.id, sale.shopperId), eq(shoppers.clerkUserId, userId)))
        .limit(1);
      permitted = !!ownerShopper;
    }

    if (!permitted) {
      logger.warn("APPROVE_AND_DOWNLOAD", "Permission denied", {
        saleId: id,
        userId,
        role,
      });
      return NextResponse.json(
        { error: "You don't have permission to approve this invoice" },
        { status: 403 }
      );
    }

    // ----------------------------------------------------------------------
    // 2. Get Xero tokens via the integration user
    // ----------------------------------------------------------------------
    const integrationUserId = process.env.XERO_INTEGRATION_CLERK_USER_ID;
    if (!integrationUserId) {
      logger.error(
        "APPROVE_AND_DOWNLOAD",
        "XERO_INTEGRATION_CLERK_USER_ID not configured"
      );
      return NextResponse.json(
        { error: "Xero integration not configured" },
        { status: 500 }
      );
    }

    const tokens = await getValidTokens(integrationUserId);
    if (!tokens) {
      return NextResponse.json(
        { error: "Xero is not connected — please contact support" },
        { status: 500 }
      );
    }

    // ----------------------------------------------------------------------
    // 3. PUT the invoice to AUTHORISED (skip if already past DRAFT)
    // ----------------------------------------------------------------------
    const needsApproval = sale.invoiceStatus === "DRAFT" || sale.invoiceStatus === null;

    if (needsApproval) {
      logger.info("APPROVE_AND_DOWNLOAD", "Approving invoice in Xero", {
        saleId: id,
        xeroInvoiceId: sale.xeroInvoiceId,
        previousStatus: sale.invoiceStatus,
      });

      const putRes = await fetch(`${XERO_API_BASE}/${sale.xeroInvoiceId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          "Xero-tenant-id": tokens.tenantId,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Invoices: [
            {
              InvoiceID: sale.xeroInvoiceId,
              Status: "AUTHORISED",
            },
          ],
        }),
      });

      if (!putRes.ok) {
        const errorText = await putRes.text();
        logger.error("APPROVE_AND_DOWNLOAD", "Xero approve failed", {
          saleId: id,
          xeroInvoiceId: sale.xeroInvoiceId,
          status: putRes.status,
          error: errorText,
        });
        return NextResponse.json(
          {
            error: "Failed to approve invoice in Xero",
            details: errorText,
          },
          { status: 502 }
        );
      }

      // Persist the new status to the DB so the next page load shows the
      // plain Download PDF button without a roundtrip to Xero.
      await db
        .update(sales)
        .set({ invoiceStatus: "AUTHORISED" })
        .where(eq(sales.id, id))
        .catch((dbErr) => {
          // Don't fail the request — Xero is the source of truth and the
          // approve already happened. Just log.
          logger.error(
            "APPROVE_AND_DOWNLOAD",
            "Failed to update local invoiceStatus after approve",
            { saleId: id, error: (dbErr as Error).message }
          );
        });

      logger.info("APPROVE_AND_DOWNLOAD", "Invoice approved", {
        saleId: id,
        xeroInvoiceId: sale.xeroInvoiceId,
      });
    } else {
      logger.info("APPROVE_AND_DOWNLOAD", "Skipping approve — already past DRAFT", {
        saleId: id,
        invoiceStatus: sale.invoiceStatus,
      });
    }

    // ----------------------------------------------------------------------
    // 4. Fetch the PDF
    // ----------------------------------------------------------------------
    logger.info("APPROVE_AND_DOWNLOAD", "Fetching PDF from Xero", {
      saleId: id,
      xeroInvoiceId: sale.xeroInvoiceId,
    });

    const pdfRes = await fetch(`${XERO_API_BASE}/${sale.xeroInvoiceId}`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        "Xero-Tenant-Id": tokens.tenantId,
        Accept: "application/pdf",
      },
    });

    if (!pdfRes.ok) {
      const errorText = await pdfRes.text();
      logger.error("APPROVE_AND_DOWNLOAD", "Xero PDF fetch failed", {
        saleId: id,
        xeroInvoiceId: sale.xeroInvoiceId,
        status: pdfRes.status,
        error: errorText,
      });
      return NextResponse.json(
        {
          error:
            "Invoice was approved but the PDF could not be retrieved — please refresh and try Download PDF",
        },
        { status: 502 }
      );
    }

    const filename = sale.xeroInvoiceNumber
      ? `Club19-${sale.xeroInvoiceNumber}.pdf`
      : `Club19-${id}.pdf`;

    logger.info("APPROVE_AND_DOWNLOAD", "Streaming PDF to client", {
      saleId: id,
      filename,
    });

    return new NextResponse(pdfRes.body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    logger.error("APPROVE_AND_DOWNLOAD", "Unexpected error", {
      saleId: id,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to approve and download" },
      { status: 500 }
    );
  }
}
