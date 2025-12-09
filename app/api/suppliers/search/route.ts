/**
 * Club 19 Sales OS - Supplier Search API
 *
 * GET endpoint for searching suppliers by name
 * Used by Deal Studio for supplier autocomplete
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getXataClient } from "@/src/xata";

const xata = getXataClient();

export async function GET(request: NextRequest) {
  try {
    // Verify authentication - any authenticated user can search suppliers
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q") || "";

    console.log(`[SUPPLIER SEARCH] Query: "${query}"`);

    // If no query, return empty results
    if (!query.trim()) {
      console.log('[SUPPLIER SEARCH] Empty query, returning empty array');
      return NextResponse.json([]);
    }

    // Search Suppliers by name (case-insensitive, partial match)
    // Note: Xata's $contains is case-sensitive, we should use $iContains for case-insensitive
    console.log(`[SUPPLIER SEARCH] Searching with $iContains filter`);
    const suppliers = await xata.db.Suppliers.filter({
      name: { $iContains: query },
    })
      .select(["id", "name", "email"])
      .sort("name", "asc")
      .getMany();

    // Limit to first 20 results for autocomplete
    const limitedSuppliers = suppliers.slice(0, 20);

    console.log(`[SUPPLIER SEARCH] Found ${suppliers.length} total results, returning first ${limitedSuppliers.length}`);
    if (limitedSuppliers.length > 0) {
      console.log(`[SUPPLIER SEARCH] First 3 results:`, limitedSuppliers.slice(0, 3).map(s => s.name));
    }

    // Format response for autocomplete
    const results = limitedSuppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name || "",
      email: supplier.email || "",
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("[SUPPLIER SEARCH] Error searching suppliers:", error);
    return NextResponse.json(
      { error: "Failed to search suppliers" },
      { status: 500 }
    );
  }
}
