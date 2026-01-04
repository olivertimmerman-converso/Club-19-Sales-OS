import { getXataClient } from '../src/xata';

async function main() {
  const xata = getXataClient();

  const sales = await xata.db.Sales
    .select(['branding_theme'])
    .filter({ branding_theme: { $isNot: null } })
    .getMany({ pagination: { size: 100 } });

  const themes = new Set(sales.map(s => s.branding_theme).filter(Boolean));

  console.log('\nUnique branding themes in database:');
  console.log('====================================');
  themes.forEach(t => console.log(`  - "${t}"`));
  console.log(`\nTotal: ${themes.size} unique themes`);
}

main().catch(console.error);
