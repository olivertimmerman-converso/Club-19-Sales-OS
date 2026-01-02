/**
 * Club 19 Sales OS - Create Shopper API
 *
 * POST endpoint to create a new Shopper record
 * Superadmin only
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";
import * as logger from "@/lib/logger";

const xata = getXataClient();

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is superadmin
    const userRole = await getUserRole();

    if (userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Forbidden - Superadmin only" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, email, commission_scheme = "standard" } = body;

    // Validate required fields
    if (!name || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    // Check for duplicate email
    const existing = await xata.db.Shoppers.filter({ email }).getFirst();

    if (existing) {
      return NextResponse.json(
        { error: "A shopper with this email already exists" },
        { status: 409 }
      );
    }

    // Create the shopper
    const shopper = await xata.db.Shoppers.create({
      name,
      email,
      commission_scheme,
      active: true,
    });

    return NextResponse.json(
      {
        success: true,
        shopper: {
          id: shopper.id,
          name: shopper.name,
          email: shopper.email,
          commission_scheme: shopper.commission_scheme,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("SHOPPERS", "Error creating shopper", { error: error as any });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
