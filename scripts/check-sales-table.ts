import { XataClient } from '../src/xata';

const xata = new XataClient({
  apiKey: process.env.XATA_API_KEY || '',
  databaseURL: process.env.XATA_DATABASE_URL || '',
  branch: process.env.XATA_BRANCH || 'main'
});

async function checkSales() {
  try {
    console.log('[SALES CHECK] Querying Sales table...');

    const records = await xata.db.Sales
      .select([
        'id',
        'xata.createdAt',
        'sale_reference',
        'xero_invoice_number',
        'buyer.name',
        'brand',
        'item_title',
        'quantity',
        'sale_amount_inc_vat',
        'sale_amount_ex_vat',
        'buy_price',
        'currency',
        'xero_invoice_id',
        'xero_invoice_url'
      ])
      .sort('xata.createdAt', 'desc')
      .getAll();

    console.log(`[SALES CHECK] Found ${records.length} records\n`);

    if (records.length === 0) {
      console.log('❌ NO RECORDS FOUND - Sales table is empty!');
      console.log('This means Deal Studio is creating Xero invoices but NOT saving to database.');
      return;
    }

    records.forEach((record, idx) => {
      console.log(`--- Record ${idx + 1} ---`);
      console.log(`Created: ${record.xata.createdAt}`);
      console.log(`Invoice: ${record.xero_invoice_number || 'N/A'}`);
      console.log(`Buyer: ${record.buyer?.name || 'N/A'}`);
      console.log(`Item: ${record.brand || 'N/A'} - ${record.item_title || 'N/A'}`);
      console.log(`Amount: ${record.currency || 'GBP'} ${record.sale_amount_inc_vat || 0}`);
      console.log(`Xero ID: ${record.xero_invoice_id || 'N/A'}`);
      console.log('');
    });

    // Check specifically for INV-3170
    const inv3170 = records.find(r => r.xero_invoice_number === 'INV-3170');
    if (inv3170) {
      console.log('✅ FOUND INV-3170 (Hermès B25, Bettina Looney)');
    } else {
      console.log('❌ INV-3170 NOT FOUND in Sales table');
      console.log('This confirms Deal Studio does NOT save to database after creating Xero invoice.');
    }

  } catch (error: any) {
    console.error('[SALES CHECK] Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

checkSales();
