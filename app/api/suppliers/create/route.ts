/**
 * Club 19 Sales OS - Create Supplier API
 *
 * POST endpoint to create a new Supplier
 * Used by Deal Studio when supplier doesn't exist
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";
import * as logger from "@/lib/logger";

const xata = getXataClient();

export async function POST(request: NextRequest) {
  try {
    // Verify authentication (any authenticated user can create suppliers)
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { name, email } = body;

    // Validate required fields
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Supplier name is required" },
        { status: 400 }
      );
    }

    // Check for duplicate by exact name match (case-insensitive)
    const normalizedName = name.trim();
    const existing = await xata.db.Suppliers.filter({
      name: { $is: normalizedName },
    }).getFirst();

    if (existing) {
      // Return the existing supplier instead of creating a duplicate
      return NextResponse.json(
        {
          success: true,
          supplier: {
            id: existing.id,
            name: existing.name,
            email: existing.email,
          },
          message: "Supplier already exists",
        },
        { status: 200 }
      );
    }

    // Create the supplier
    const supplier = await xata.db.Suppliers.create({
      name: normalizedName,
      email: email?.trim() || null,
    });

    logger.info('SUPPLIER_CREATE', 'Created new supplier', {
      id: supplier.id,
      name: supplier.name
    });

    return NextResponse.json(
      {
        success: true,
        supplier: {
          id: supplier.id,
          name: supplier.name,
          email: supplier.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("SUPPLIER_CREATE", "Error creating supplier", { error: error as any });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
