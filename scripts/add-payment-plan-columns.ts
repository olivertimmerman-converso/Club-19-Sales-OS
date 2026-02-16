/**
 * Migration script to add payment plan columns to sales table
 * Run with: npx tsx scripts/add-payment-plan-columns.ts
 */

import postgres from 'postgres';

const connectionString = process.env.XATA_POSTGRES_URL;

if (!connectionString) {
  console.error('XATA_POSTGRES_URL not set');
  process.exit(1);
}

const sql = postgres(connectionString);

async function migrate() {
  console.log('Adding payment plan columns to sales table...');

  try {
    // Add deposit_amount column
    await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS deposit_amount DOUBLE PRECISION`;
    console.log('✓ deposit_amount column added');

    // Add payment_plan_notes column
    await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_plan_notes TEXT`;
    console.log('✓ payment_plan_notes column added');

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
