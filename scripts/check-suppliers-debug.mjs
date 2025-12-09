import { getXataClient } from '../src/xata.js';

const xata = getXataClient();

console.log('🔍 Checking Suppliers table...\n');

// Get total count
const allSuppliers = await xata.db.Suppliers.getAll();
console.log(`Total suppliers: ${allSuppliers.length}\n`);

// Check for empty names
const emptyNames = allSuppliers.filter(s => !s.name || !s.name.trim());
console.log(`Suppliers with empty/null names: ${emptyNames.length}`);
if (emptyNames.length > 0) {
  console.log('Empty name records:', emptyNames.slice(0, 5).map(s => s.id));
}

// Show sample of suppliers
console.log('\nSample suppliers (first 10):');
allSuppliers.slice(0, 10).forEach(s => {
  console.log(`  - "${s.name}" (ID: ${s.id})`);
});

// Check for "Fenny" specifically
console.log('\nSearching for "Fenny":');
const fennyResults = allSuppliers.filter(s =>
  s.name && s.name.toLowerCase().includes('fenny')
);
console.log(`Found ${fennyResults.length} results:`);
fennyResults.forEach(s => console.log(`  - "${s.name}"`));

// Test the $contains filter that the API uses
console.log('\nTesting Xata $contains filter for "Fenny":');
const xataFenny = await xata.db.Suppliers.filter({
  name: { $contains: 'Fenny' },
})
  .select(['id', 'name', 'email'])
  .sort('name', 'asc')
  .getMany({ pagination: { size: 20 } });

console.log(`Xata query returned ${xataFenny.records.length} results:`);
xataFenny.records.forEach(s => console.log(`  - "${s.name}"`));

// Check name uniqueness
const nameCount = new Map();
allSuppliers.forEach(s => {
  if (s.name) {
    const lower = s.name.toLowerCase();
    nameCount.set(lower, (nameCount.get(lower) || 0) + 1);
  }
});
const duplicates = Array.from(nameCount.entries()).filter(([_, count]) => count > 1);
console.log(`\nDuplicate names: ${duplicates.length}`);
if (duplicates.length > 0) {
  console.log('Examples (first 5):', duplicates.slice(0, 5));
}

// Check for common search terms
const testQueries = ['fe', 'fen', 'fenn', 'penny', 'louis'];
console.log('\nTesting common partial searches:');
for (const q of testQueries) {
  const results = await xata.db.Suppliers.filter({
    name: { $contains: q },
  }).getMany({ pagination: { size: 5 } });
  console.log(`  "${q}": ${results.records.length} results`);
}
