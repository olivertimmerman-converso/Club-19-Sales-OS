/**
 * Club 19 Sales OS - Monthly Sales Export API
 *
 * GET endpoint for exporting monthly sales data as CSV
 * Used by Founder dashboard to export month data to bookkeeper
 */

import { NextRequest, NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import { getMonthDateRange } from "@/lib/dateUtils";
import { auth } from "@clerk/nextjs/server";

const xata = getXataClient();

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get month parameter from URL
    const searchParams = request.nextUrl.searchParams;
    const monthParam = searchParams.get("month") || "current";

    // Get date range for the month
    const dateRange = getMonthDateRange(monthParam);
    if (!dateRange) {
      return NextResponse.json(
        { error: "Invalid month parameter" },
        { status: 400 }
      );
    }

    // Query all sales for the month
    const sales = await xata.db.Sales.filter({
      sale_date: {
        $ge: dateRange.start,
        $le: dateRange.end,
      },
    })
      .select([
        "id",
        "sale_date",
        "sale_reference",
        "xero_invoice_number",
        "shopper.name",
        "buyer.name",
        "buyer.id",
        "brand",
        "category",
        "item_title",
        "buy_price",
        "sale_amount_ex_vat",
        "sale_amount_inc_vat",
        "shipping_cost",
        "direct_costs",
        "gross_margin",
        "supplier.name",
        "supplier.id",
        "introducer.name",
        "introducer.id",
        "internal_notes",
        "commissionable_margin",
      ])
      .sort("sale_date", "asc")
      .getAll();

    // Generate CSV content
    const csvHeaders = [
      "date",
      "invoice_number",
      "salesperson",
      "client_name",
      "brand",
      "category",
      "item_description",
      "buy_price_gbp",
      "sell_price_gbp",
      "vat_amount",
      "shipping_cost",
      "direct_costs",
      "margin_gbp",
      "margin_percent",
      "commission_due",
      "supplier",
      "referrer",
      "notes",
    ];

    const csvRows = sales.map((sale) => {
      const saleDate = sale.sale_date
        ? new Date(sale.sale_date).toLocaleDateString("en-GB")
        : "";
      const vatAmount = (sale.sale_amount_inc_vat || 0) - (sale.sale_amount_ex_vat || 0);
      const marginPercent =
        sale.sale_amount_inc_vat && sale.sale_amount_inc_vat > 0
          ? ((sale.gross_margin || 0) / sale.sale_amount_inc_vat) * 100
          : 0;

      return [
        saleDate,
        sale.xero_invoice_number || sale.sale_reference || "",
        sale.shopper?.name || "",
        sale.buyer?.name || "",
        sale.brand || "",
        sale.category || "",
        sale.item_title || "",
        (sale.buy_price || 0).toFixed(2),
        (sale.sale_amount_ex_vat || 0).toFixed(2),
        vatAmount.toFixed(2),
        (sale.shipping_cost || 0).toFixed(2),
        (sale.direct_costs || 0).toFixed(2),
        (sale.gross_margin || 0).toFixed(2),
        marginPercent.toFixed(2),
        (sale.commissionable_margin || 0).toFixed(2),
        sale.supplier?.name || "",
        sale.introducer?.name || "",
        `"${(sale.internal_notes || "").replace(/"/g, '""')}"`, // Escape quotes in notes
      ];
    });

    // Build CSV string
    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n");

    // Generate filename with month and year
    const monthDate = new Date(dateRange.start);
    const monthName = monthDate
      .toLocaleDateString("en-GB", { month: "short" })
      .toUpperCase();
    const year = monthDate.getFullYear();
    const filename = `C19_SALES_${monthName}_${year}.csv`;

    // Return CSV as downloadable file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Error exporting monthly sales:", error);
    return NextResponse.json(
      { error: "Failed to export sales data" },
      { status: 500 }
    );
  }
}
