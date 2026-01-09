/**
 * Consolidate duplicate shopper records
 *
 * Merges partial names into full names:
 * - "Oliver" → "Oliver Timmerman"
 * - "Sophie" → "Sophie Timmerman"
 * - "Alys" → "Alys McMahon"
 * - "MC" → "Mary Clair"
 *
 * Also updates "Hope" to "Hope Sherwin" if needed
 */

import { getXataClient } from '../src/xata';

const xata = getXataClient();

// Define the merge mappings: source (partial name) → target (full name)
const MERGE_MAPPINGS = [
  {
    source: { id: 'rec_d4ra78ouignf32792c0g', name: 'Oliver' },
    target: { id: 'rec_d5dcpr4gmio87vvgjfrg', name: 'Oliver Timmerman' },
  },
  {
    source: { id: 'rec_d5b65p985bnc3iim75ig', name: 'Sophie' },
    target: { id: 'rec_d5f8ge185bnc3iimhhh0', name: 'Sophie Timmerman' },
  },
  {
    source: { id: 'rec_d5b669p85bnc3iim75j0', name: 'Alys' },
    target: { id: 'rec_d5fomi59l8q5imgqp9v0', name: 'Alys McMahon' },
  },
  {
    source: { id: 'rec_d4u06nouignf32792me0', name: 'MC' },
    target: { id: 'rec_d5dt9i185bnc3iimglfg', name: 'Mary Clair' },
  },
];

async function consolidateShoppers() {
  console.log('=== Shopper Consolidation Script ===\n');

  // First, show current state
  console.log('Current shoppers in database:\n');
  const allShoppers = await xata.db.Shoppers.select(['id', 'name', 'email', 'active']).getAll();
  allShoppers.forEach(s => {
    console.log(`  "${s.name}" (ID: ${s.id}) - Email: ${s.email || 'none'}`);
  });

  console.log('\n--- Starting Merge Operations ---\n');

  for (const mapping of MERGE_MAPPINGS) {
    console.log(`\nMerging "${mapping.source.name}" → "${mapping.target.name}"`);
    console.log(`  Source ID: ${mapping.source.id}`);
    console.log(`  Target ID: ${mapping.target.id}`);

    // Verify both records exist
    const sourceRecord = await xata.db.Shoppers.read(mapping.source.id);
    const targetRecord = await xata.db.Shoppers.read(mapping.target.id);

    if (!sourceRecord) {
      console.log(`  ⚠️  Source record not found - skipping (may already be merged)`);
      continue;
    }

    if (!targetRecord) {
      console.log(`  ❌ Target record not found - cannot merge!`);
      continue;
    }

    // Find all sales assigned to the source shopper
    const salesToUpdate = await xata.db.Sales
      .filter({ 'shopper.id': mapping.source.id })
      .select(['id', 'sale_reference', 'sale_date', 'sale_amount_inc_vat'])
      .getAll();

    console.log(`  Found ${salesToUpdate.length} sales to reassign`);

    if (salesToUpdate.length > 0) {
      // Update each sale to point to the target shopper
      for (const sale of salesToUpdate) {
        await xata.db.Sales.update(sale.id, {
          shopper: mapping.target.id,
        });
        console.log(`    ✓ Updated sale ${sale.sale_reference || sale.id}`);
      }
    }

    // Copy email from source to target if target has no email
    if (sourceRecord.email && !targetRecord.email) {
      await xata.db.Shoppers.update(mapping.target.id, {
        email: sourceRecord.email,
      });
      console.log(`  ✓ Copied email "${sourceRecord.email}" to target`);
    }

    // Delete the source record
    await xata.db.Shoppers.delete(mapping.source.id);
    console.log(`  ✓ Deleted source record "${mapping.source.name}"`);
  }

  // Final state
  console.log('\n\n=== Final Shoppers After Consolidation ===\n');
  const finalShoppers = await xata.db.Shoppers.select(['id', 'name', 'email', 'active']).getAll();
  finalShoppers.forEach(s => {
    console.log(`  "${s.name}" (ID: ${s.id}) - Email: ${s.email || 'none'}`);
  });

  // Verify sales assignments
  console.log('\n=== Sales by Shopper ===\n');
  const allSales = await xata.db.Sales
    .select(['id', 'shopper.id', 'shopper.name'])
    .getAll();

  const salesByShopperId = new Map<string, { name: string; count: number }>();
  allSales.forEach(sale => {
    if (sale.shopper?.id) {
      const key = sale.shopper.id;
      if (!salesByShopperId.has(key)) {
        salesByShopperId.set(key, { name: sale.shopper.name || 'Unknown', count: 0 });
      }
      salesByShopperId.get(key)!.count++;
    }
  });

  Array.from(salesByShopperId.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([id, data]) => {
      console.log(`  ${data.name}: ${data.count} sales`);
    });

  console.log('\n✅ Consolidation complete!');
}

consolidateShoppers().catch(console.error);
