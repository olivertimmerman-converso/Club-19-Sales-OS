/**
 * POST /api/suppliers/[id]/approve
 *
 * Approves a pending supplier. Only superadmin/admin/operations can approve.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";
import * as logger from "@/lib/logger";

const xata = getXataClient();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user role from Clerk
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const userRole = (user.publicMetadata as { staffRole?: string })?.staffRole || 'shopper';

    // Only privileged roles can approve suppliers
    const privilegedRoles = ['superadmin', 'admin', 'operations'];
    if (!privilegedRoles.includes(userRole)) {
      return NextResponse.json(
        { error: "You do not have permission to approve suppliers" },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Get the supplier
    const supplier = await xata.db.Suppliers.read(id);
    if (!supplier) {
      return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
    }

    // Update supplier to approved
    const updated = await xata.db.Suppliers.update(id, {
      pending_approval: false,
      approved_by: userId,
      approved_at: new Date(),
    } as any);

    logger.info('SUPPLIER_APPROVE', 'Approved supplier', {
      supplierId: id,
      supplierName: supplier.name,
      approvedBy: userId,
      approverRole: userRole,
    });

    return NextResponse.json({
      success: true,
      supplier: {
        id: updated?.id,
        name: updated?.name,
        pending_approval: false,
      },
      message: "Supplier approved",
    });
  } catch (error) {
    logger.error("SUPPLIER_APPROVE", "Error approving supplier", { error: error as any });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
