/**
 * Backfill missing buyer links for existing sales
 * Extracts client names from internal_notes and creates/links buyers
 */

import { getXataClient } from '../src/xata';

const xata = getXataClient();

async function backfillBuyers() {
  console.log('=== Backfilling Missing Buyers ===\n');

  // Get all sales without buyers
  const salesWithoutBuyers = await xata.db.Sales
    .filter({ buyer: null })
    .select(['id', 'xero_invoice_number', 'internal_notes'])
    .getAll();

  console.log(`Found ${salesWithoutBuyers.length} sales without buyers\n`);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const sale of salesWithoutBuyers) {
    // Extract client name from internal_notes
    const clientMatch = sale.internal_notes?.match(/Client:\s*([^.]+)/);
    if (!clientMatch) {
      console.log(`⚠ Skipping ${sale.xero_invoice_number}: No client name in notes`);
      skipped++;
      continue;
    }

    const clientName = clientMatch[1].trim();
    console.log(`Processing ${sale.xero_invoice_number}: Client = "${clientName}"`);

    // Try to find existing buyer
    let buyer = await xata.db.Buyers.filter({
      name: { $iContains: clientName }
    }).getFirst();

    if (!buyer) {
      // Create new buyer
      console.log(`  → Creating new buyer: ${clientName}`);
      buyer = await xata.db.Buyers.create({
        name: clientName,
      });
      created++;
    }

    // Link buyer to sale
    await xata.db.Sales.update(sale.id, {
      buyer: buyer.id,
    });
    console.log(`  ✓ Linked buyer ${buyer.name} to sale ${sale.xero_invoice_number}`);
    linked++;
  }

  console.log('\n=== Backfill Complete ===');
  console.log(`Buyers created: ${created}`);
  console.log(`Sales linked: ${linked}`);
  console.log(`Sales skipped: ${skipped}`);
}

backfillBuyers().catch(console.error);
