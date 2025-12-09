/**
 * Club 19 Sales OS - Demo Data Cleanup Route
 *
 * One-time cleanup script to remove demo data from the database
 * Run once, then delete this file
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserRole } from "@/lib/getUserRole";
import { XataClient } from "@/src/xata";

const xata = new XataClient();

export async function POST(request: NextRequest) {
  try {
    // Check user role - superadmin only
    const role = await getUserRole();
    if (role !== "superadmin") {
      return NextResponse.json(
        { error: "Unauthorized. Superadmin access required." },
        { status: 403 }
      );
    }

    console.log("[cleanup-demo] Starting cleanup...");

    const summary = {
      salesDeleted: 0,
      shoppersDeleted: 0,
      buyersDeleted: 0,
      suppliersDeleted: 0,
    };

    // 1. Delete demo Sales (where xero_invoice_number starts with "DEMO-")
    const demoSales = await xata.db.Sales
      .filter({
        xero_invoice_number: { $startsWith: "DEMO-" }
      })
      .getAll();

    for (const sale of demoSales) {
      await xata.db.Sales.delete(sale.id);
      summary.salesDeleted++;
    }
    console.log(`[cleanup-demo] Deleted ${summary.salesDeleted} demo sales`);

    // 2. Delete demo Shoppers (Hope and MC)
    const demoShoppers = await xata.db.Shoppers
      .filter({
        email: { $any: ["hope@club19london.com", "mc@club19london.com"] }
      })
      .getAll();

    for (const shopper of demoShoppers) {
      await xata.db.Shoppers.delete(shopper.id);
      summary.shoppersDeleted++;
    }
    console.log(`[cleanup-demo] Deleted ${summary.shoppersDeleted} demo shoppers`);

    // 3. Delete demo Buyers (except Bettina Looney)
    const demoBuyers = await xata.db.Buyers
      .filter({
        name: { $any: ["Sarah Mitchell", "Emma Thompson", "Victoria Chen"] }
      })
      .getAll();

    for (const buyer of demoBuyers) {
      await xata.db.Buyers.delete(buyer.id);
      summary.buyersDeleted++;
    }
    console.log(`[cleanup-demo] Deleted ${summary.buyersDeleted} demo buyers`);

    // 4. Delete demo Suppliers
    const demoSuppliers = await xata.db.Suppliers
      .filter({
        name: { $any: ["Private Seller - London", "Auction House Paris"] }
      })
      .getAll();

    for (const supplier of demoSuppliers) {
      await xata.db.Suppliers.delete(supplier.id);
      summary.suppliersDeleted++;
    }
    console.log(`[cleanup-demo] Deleted ${summary.suppliersDeleted} demo suppliers`);

    console.log("[cleanup-demo] Cleanup complete!", summary);

    return NextResponse.json({
      success: true,
      message: "Demo data cleanup complete",
      summary,
    });

  } catch (error) {
    console.error("[cleanup-demo] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to cleanup demo data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// Prevent GET requests
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST." },
    { status: 405 }
  );
}
