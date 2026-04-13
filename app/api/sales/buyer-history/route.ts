/**
 * GET /api/sales/buyer-history?xeroContactId={id}
 *
 * Returns the count of non-deleted sales for a given buyer.
 * Used by the wizard's Step 1 (Client) to derive the `isNewClient` flag —
 * a buyer is "new" iff they have zero sales in the system.
 *
 * Counts ALL non-deleted sales (including Xero imports that were never
 * completed). A client with historical Xero-imported sales is not new.
 *
 * We key on `xeroContactId` rather than `buyerId` because the wizard has the
 * Xero contact ID at hand from the contact search; the local `buyers.id` is
 * resolved later in the create flow.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sales, buyers } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const xeroContactId = request.nextUrl.searchParams
      .get("xeroContactId")
      ?.trim();

    if (!xeroContactId) {
      return NextResponse.json(
        { error: "xeroContactId is required" },
        { status: 400 }
      );
    }

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sales)
      .innerJoin(buyers, eq(sales.buyerId, buyers.id))
      .where(
        and(
          eq(buyers.xeroContactId, xeroContactId),
          isNull(sales.deletedAt)
        )
      );

    const deliveredSaleCount = result[0]?.count ?? 0;

    return NextResponse.json({
      deliveredSaleCount,
      isNew: deliveredSaleCount === 0,
    });
  } catch (error) {
    console.error("[buyer-history] Error", error);
    return NextResponse.json(
      { error: "Failed to fetch buyer history" },
      { status: 500 }
    );
  }
}
