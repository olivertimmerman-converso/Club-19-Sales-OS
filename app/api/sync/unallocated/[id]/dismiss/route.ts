/**
 * Club 19 Sales OS - Dismiss Unallocated Invoice
 *
 * POST /api/sync/unallocated/[id]/dismiss
 * Soft-deletes an unallocated invoice by marking it as dismissed
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import * as logger from "@/lib/logger";

export const dynamic = "force-dynamic";

const xata = getXataClient();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check role permissions
    const role = await getUserRole();
    if (!["superadmin", "operations", "founder", "admin"].includes(role || "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    logger.info("DISMISS", "Dismissing unallocated invoice", { saleId: id, userId });

    // Check if the sale exists and is unallocated
    const sale = await xata.db.Sales.read(id);
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    if (!sale.needs_allocation) {
      return NextResponse.json(
        { error: "This invoice is not in the unallocated list" },
        { status: 400 }
      );
    }

    // Mark as dismissed
    // Note: dismissed, dismissed_at, dismissed_by fields must be added to Sales table in Xata
    await xata.db.Sales.update(id, {
      dismissed: true,
      dismissed_at: new Date(),
      dismissed_by: userId,
    } as any);

    logger.info("DISMISS", "Invoice dismissed successfully", {
      saleId: id,
      invoiceNumber: sale.xero_invoice_number,
    });

    return NextResponse.json({
      success: true,
      message: "Invoice dismissed successfully",
    });
  } catch (error: any) {
    logger.error("DISMISS", "Error dismissing invoice", {
      saleId: id,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to dismiss invoice", details: error.message },
      { status: 500 }
    );
  }
}
