/**
 * Check Buyers table to understand the buyer data issue
 */

import { getXataClient } from '../src/xata';

const xata = getXataClient();

async function checkBuyers() {
  console.log('=== Checking Buyers Table ===\n');

  // Get all buyers
  const buyers = await xata.db.Buyers
    .select(['id', 'name', 'email', 'xero_contact_id'])
    .getAll();

  console.log(`Total buyers in database: ${buyers.length}\n`);

  if (buyers.length > 0) {
    console.log('Sample buyers:');
    buyers.slice(0, 10).forEach(buyer => {
      console.log(`- ${buyer.name || 'NO NAME'} (${buyer.email || 'no email'}) - Xero ID: ${buyer.xero_contact_id || 'none'}`);
    });
  }

  console.log('\n=== Checking Sales with Buyers ===\n');

  // Get recent sales and check buyer linkage
  const sales = await xata.db.Sales
    .select(['id', 'xero_invoice_number', 'buyer.name', 'internal_notes'])
    .sort('sale_date', 'desc')
    .getMany({ pagination: { size: 20 } });

  console.log(`Total recent sales: ${sales.length}\n`);

  const withBuyer = sales.filter(s => s.buyer?.name);
  const withoutBuyer = sales.filter(s => !s.buyer?.name);

  console.log(`Sales WITH buyer linked: ${withBuyer.length}`);
  console.log(`Sales WITHOUT buyer linked: ${withoutBuyer.length}\n`);

  if (withBuyer.length > 0) {
    console.log('Sales WITH buyer (sample):');
    withBuyer.slice(0, 3).forEach(s => {
      console.log(`- Invoice ${s.xero_invoice_number}: Buyer = ${s.buyer?.name}`);
    });
  }

  if (withoutBuyer.length > 0) {
    console.log('\nSales WITHOUT buyer (checking internal_notes):');
    withoutBuyer.slice(0, 5).forEach(s => {
      const clientMatch = s.internal_notes?.match(/Client:\s*([^.]+)/);
      const clientName = clientMatch ? clientMatch[1].trim() : 'Unknown';
      console.log(`- Invoice ${s.xero_invoice_number}: Client in notes = "${clientName}"`);
    });
  }

  console.log('\n=== Analysis Complete ===');
}

checkBuyers().catch(console.error);
