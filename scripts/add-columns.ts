/**
 * Migration script to add missing columns to sales table
 * Run with: npx tsx scripts/add-columns.ts
 */

import postgres from 'postgres';

const connectionString = process.env.XATA_POSTGRES_URL;

if (!connectionString) {
  console.error('XATA_POSTGRES_URL not set');
  process.exit(1);
}

const sql = postgres(connectionString);

async function migrate() {
  console.log('Adding missing columns to sales table...');

  try {
    // Add allocated_by column
    await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS allocated_by TEXT`;
    console.log('✓ allocated_by column added');

    // Add allocated_at column
    await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS allocated_at TIMESTAMP WITH TIME ZONE`;
    console.log('✓ allocated_at column added');

    // Add completed_at column
    await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE`;
    console.log('✓ completed_at column added');

    // Add completed_by column
    await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS completed_by TEXT`;
    console.log('✓ completed_by column added');

    // Create index
    await sql`CREATE INDEX IF NOT EXISTS sales_completed_at_idx ON sales (completed_at)`;
    console.log('✓ sales_completed_at_idx index created');

    console.log('\nMigration complete!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
