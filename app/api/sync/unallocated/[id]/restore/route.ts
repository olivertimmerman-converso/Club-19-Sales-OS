/**
 * Club 19 Sales OS - Restore Dismissed Invoice
 *
 * POST /api/sync/unallocated/[id]/restore
 * Restores a previously dismissed unallocated invoice
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

    logger.info("RESTORE", "Restoring dismissed invoice", { saleId: id, userId });

    // Check if the sale exists
    const sale = await xata.db.Sales.read(id);
    if (!sale) {
      return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    }

    // Note: dismissed field must be added to Sales table in Xata
    const saleAny = sale as any;
    if (!saleAny.dismissed) {
      return NextResponse.json(
        { error: "This invoice is not dismissed" },
        { status: 400 }
      );
    }

    // Restore by clearing dismissed fields
    await xata.db.Sales.update(id, {
      dismissed: false,
      dismissed_at: null,
      dismissed_by: null,
    } as any);

    logger.info("RESTORE", "Invoice restored successfully", {
      saleId: id,
      invoiceNumber: sale.xero_invoice_number,
    });

    return NextResponse.json({
      success: true,
      message: "Invoice restored successfully",
    });
  } catch (error: any) {
    logger.error("RESTORE", "Error restoring invoice", {
      saleId: id,
      error: error.message,
    });
    return NextResponse.json(
      { error: "Failed to restore invoice", details: error.message },
      { status: 500 }
    );
  }
}
