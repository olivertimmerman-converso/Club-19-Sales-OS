/**
 * Club 19 Sales OS - Demo Data Seeder
 *
 * POST endpoint to create demo shoppers and sales for testing
 * Only accessible by superadmin role
 */

import { NextResponse } from "next/server";
import { getXataClient } from "@/src/xata";
import { getUserRole } from "@/lib/getUserRole";

const xata = getXataClient();

export async function POST() {
  try {
    // Check authorization - only superadmin can seed demo data
    const role = await getUserRole();
    if (role !== 'superadmin') {
      return NextResponse.json(
        { error: "Unauthorized - superadmin access required" },
        { status: 403 }
      );
    }

    const summary = {
      shoppers: [] as string[],
      buyers: [] as string[],
      suppliers: [] as string[],
      sales: [] as string[],
    };

    // 1. Create Shoppers (if they don't exist)
    const shopperData = [
      { name: "Hope", email: "hope@club19london.com", commission_scheme: "standard", active: true },
      { name: "MC", email: "mc@club19london.com", commission_scheme: "standard", active: true },
    ];

    for (const data of shopperData) {
      const existing = await xata.db.Shoppers.filter({ name: data.name }).getFirst();
      if (!existing) {
        await xata.db.Shoppers.create(data);
        summary.shoppers.push(`Created shopper: ${data.name}`);
      } else {
        summary.shoppers.push(`Shopper already exists: ${data.name}`);
      }
    }

    // 2. Create Demo Buyers (if they don't exist)
    const buyerData = [
      { name: "Bettina Looney (C)", email: "bettina@example.com" },
      { name: "Sarah Mitchell", email: "sarah@example.com" },
      { name: "Emma Thompson", email: "emma@example.com" },
      { name: "Victoria Chen", email: "victoria@example.com" },
    ];

    for (const data of buyerData) {
      const existing = await xata.db.Buyers.filter({ name: data.name }).getFirst();
      if (!existing) {
        await xata.db.Buyers.create(data);
        summary.buyers.push(`Created buyer: ${data.name}`);
      } else {
        summary.buyers.push(`Buyer already exists: ${data.name}`);
      }
    }

    // 3. Create Demo Suppliers (for completeness)
    const supplierData = [
      { name: "Private Seller - London", email: "london@suppliers.com" },
      { name: "Auction House Paris", email: "paris@suppliers.com" },
    ];

    for (const data of supplierData) {
      const existing = await xata.db.Suppliers.filter({ name: data.name }).getFirst();
      if (!existing) {
        await xata.db.Suppliers.create(data);
        summary.suppliers.push(`Created supplier: ${data.name}`);
      } else {
        summary.suppliers.push(`Supplier already exists: ${data.name}`);
      }
    }

    // Fetch created/existing records for linking
    const hope = await xata.db.Shoppers.filter({ name: "Hope" }).getFirst();
    const mc = await xata.db.Shoppers.filter({ name: "MC" }).getFirst();
    const buyers = await xata.db.Buyers.getAll();
    const suppliers = await xata.db.Suppliers.getAll();

    if (!hope || !mc || buyers.length === 0) {
      return NextResponse.json(
        { error: "Failed to create required base records" },
        { status: 500 }
      );
    }

    // 4. Create Demo Sales
    const demoSales = [
      // Hope's sales
      {
        sale_date: new Date('2024-12-15'),
        sale_reference: 'DEMO-001',
        xero_invoice_number: 'INV-DEMO-001',
        shopper: hope.id,
        buyer: buyers[0]?.id,
        supplier: suppliers[0]?.id,
        brand: 'Hermès',
        category: 'bags',
        item_title: 'Birkin 30 Black Togo GHW',
        buy_price: 18000,
        sale_amount_inc_vat: 27600, // ~53% markup
        sale_amount_ex_vat: 23000,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 5000, // 23000 - 18000
        commissionable_margin: 4600, // 5000 * 0.92
        invoice_status: 'AUTHORISED',
        commission_locked: false,
        commission_paid: false,
        currency: 'GBP',
      },
      {
        sale_date: new Date('2024-12-10'),
        sale_reference: 'DEMO-002',
        xero_invoice_number: 'INV-DEMO-002',
        shopper: hope.id,
        buyer: buyers[1]?.id,
        supplier: suppliers[1]?.id,
        brand: 'Chanel',
        category: 'bags',
        item_title: 'Classic Flap Medium Black Caviar GHW',
        buy_price: 8500,
        sale_amount_inc_vat: 13800,
        sale_amount_ex_vat: 11500,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 3000,
        commissionable_margin: 2760,
        invoice_status: 'AUTHORISED',
        commission_locked: false,
        commission_paid: false,
        currency: 'GBP',
      },
      {
        sale_date: new Date('2024-12-05'),
        sale_reference: 'DEMO-003',
        xero_invoice_number: 'INV-DEMO-003',
        shopper: hope.id,
        buyer: buyers[2]?.id,
        supplier: suppliers[0]?.id,
        brand: 'Louis Vuitton',
        category: 'jewellery',
        item_title: 'Lockit Bracelet 18K Rose Gold',
        buy_price: 5200,
        sale_amount_inc_vat: 7920,
        sale_amount_ex_vat: 6600,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 1400,
        commissionable_margin: 1288,
        invoice_status: 'PAID',
        commission_locked: true,
        commission_paid: false,
        currency: 'GBP',
      },
      // MC's sales
      {
        sale_date: new Date('2024-12-18'),
        sale_reference: 'DEMO-004',
        xero_invoice_number: 'INV-DEMO-004',
        shopper: mc.id,
        buyer: buyers[0]?.id,
        supplier: suppliers[1]?.id,
        brand: 'Hermès',
        category: 'accessories',
        item_title: 'Kelly Belt 32mm Reversible Black/Gold',
        buy_price: 920,
        sale_amount_inc_vat: 1440,
        sale_amount_ex_vat: 1200,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 280,
        commissionable_margin: 257,
        invoice_status: 'AUTHORISED',
        commission_locked: false,
        commission_paid: false,
        currency: 'GBP',
      },
      {
        sale_date: new Date('2024-12-12'),
        sale_reference: 'DEMO-005',
        xero_invoice_number: 'INV-DEMO-005',
        shopper: mc.id,
        buyer: buyers[3]?.id,
        supplier: suppliers[0]?.id,
        brand: 'Chanel',
        category: 'jewellery',
        item_title: 'Coco Crush Ring 18K White Gold Medium',
        buy_price: 3100,
        sale_amount_inc_vat: 4680,
        sale_amount_ex_vat: 3900,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 800,
        commissionable_margin: 736,
        invoice_status: 'AUTHORISED',
        commission_locked: false,
        commission_paid: false,
        currency: 'GBP',
      },
      {
        sale_date: new Date('2024-11-28'),
        sale_reference: 'DEMO-006',
        xero_invoice_number: 'INV-DEMO-006',
        shopper: mc.id,
        buyer: buyers[1]?.id,
        supplier: suppliers[1]?.id,
        brand: 'Hermès',
        category: 'bags',
        item_title: 'Constance 24 Epsom Etoupe GHW',
        buy_price: 12000,
        sale_amount_inc_vat: 18000,
        sale_amount_ex_vat: 15000,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 3000,
        commissionable_margin: 2760,
        invoice_status: 'PAID',
        commission_locked: true,
        commission_paid: true,
        currency: 'GBP',
      },
      // Additional November sales for YTD comparison
      {
        sale_date: new Date('2024-11-20'),
        sale_reference: 'DEMO-007',
        xero_invoice_number: 'INV-DEMO-007',
        shopper: hope.id,
        buyer: buyers[2]?.id,
        supplier: suppliers[0]?.id,
        brand: 'Chanel',
        category: 'bags',
        item_title: '19 Flap Small Black Goatskin SHW',
        buy_price: 5500,
        sale_amount_inc_vat: 8400,
        sale_amount_ex_vat: 7000,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 1500,
        commissionable_margin: 1380,
        invoice_status: 'PAID',
        commission_locked: true,
        commission_paid: true,
        currency: 'GBP',
      },
      {
        sale_date: new Date('2024-11-15'),
        sale_reference: 'DEMO-008',
        xero_invoice_number: 'INV-DEMO-008',
        shopper: mc.id,
        buyer: buyers[3]?.id,
        supplier: suppliers[1]?.id,
        brand: 'Louis Vuitton',
        category: 'bags',
        item_title: 'Capucines BB Black Taurillon SHW',
        buy_price: 6800,
        sale_amount_inc_vat: 10200,
        sale_amount_ex_vat: 8500,
        shipping_cost: 0,
        direct_costs: 0,
        gross_margin: 1700,
        commissionable_margin: 1564,
        invoice_status: 'PAID',
        commission_locked: true,
        commission_paid: true,
        currency: 'GBP',
      },
    ];

    // Create sales records
    for (const sale of demoSales) {
      // Check if sale already exists by reference
      const existing = await xata.db.Sales.filter({ sale_reference: sale.sale_reference }).getFirst();
      if (!existing) {
        await xata.db.Sales.create(sale);
        summary.sales.push(`Created sale: ${sale.sale_reference} - ${sale.item_title}`);
      } else {
        summary.sales.push(`Sale already exists: ${sale.sale_reference}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Demo data seeded successfully",
      summary,
    });

  } catch (error) {
    console.error("Error seeding demo data:", error);
    return NextResponse.json(
      {
        error: "Failed to seed demo data",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
