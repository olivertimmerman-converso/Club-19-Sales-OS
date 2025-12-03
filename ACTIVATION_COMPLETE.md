# 🚀 Legacy Dashboards - Ready for Activation

## Current Status

✅ **Code Changes Complete:**
- `LEGACY_TABLES_EXIST = true` (enabled)
- All `@ts-expect-error` suppressions removed
- CSV files generated and ready
- Activation script created

⏳ **Manual Steps Required:**
- Run the activation script below
- Import will prompt for confirmation (press 'y')

---

## Quick Start (Automated)

**Run this single command:**

```bash
cd /Users/olivertimmerman/Documents/Converso/Club-19-Sales-OS
./scripts/activate-legacy-dashboards.sh
```

**What it does:**
1. Imports all 3 CSV files to Xata (you'll confirm each with 'y')
2. Regenerates Xata TypeScript schema
3. Verifies data integrity
4. Builds the application
5. Shows success summary

**Time:** ~3-5 minutes

---

## Manual Steps (Alternative)

If you prefer to run commands individually:

### 1. Import Data

```bash
cd /Users/olivertimmerman/Documents/Converso/Club-19-Sales-OS/data/legacy-import

# Import suppliers (press 'y' to confirm)
npx xata import csv legacy_suppliers.csv --table=legacy_suppliers --batch-size=50

# Import clients (press 'y' to confirm)
npx xata import csv legacy_clients.csv --table=legacy_clients --batch-size=50

# Import trades (press 'y' to confirm)
npx xata import csv legacy_trades.csv --table=legacy_trades --batch-size=50
```

### 2. Regenerate Schema

```bash
cd /Users/olivertimmerman/Documents/Converso/Club-19-Sales-OS
npx xata pull --force
```

### 3. Build Application

```bash
npm run build
```

### 4. Start Dev Server

```bash
npm run dev
```

### 5. Test Dashboards

Open in browser:
- Leadership: http://localhost:3000/legacy
- Shopper: http://localhost:3000/legacy/my-sales

---

## Verification Checklist

After running the activation script, verify:

### Data Imported
```bash
# Check counts (requires jq: brew install jq)
npx xata query --table=legacy_trades --columns='id' | jq 'length'
# Expected: 300

npx xata query --table=legacy_suppliers --columns='id' | jq 'length'
# Expected: 160

npx xata query --table=legacy_clients --columns='id' | jq 'length'
# Expected: 157
```

### Schema Updated
```bash
# Verify legacy tables in schema
grep -c "legacy_trades\|legacy_clients\|legacy_suppliers" src/xata.ts
# Expected: 3 (or more)
```

### Build Successful
```bash
npm run build
# Should complete without TypeScript errors
```

### Dashboards Working
```bash
npm run dev
# Visit http://localhost:3000/legacy
# Should show real data, not empty charts
```

---

## What Changed

### Files Modified
- `lib/legacyData.ts` - Flag enabled, suppressions removed
- `src/xata.ts` - Will be regenerated with legacy tables
- `data/legacy-import/*.csv` - Created from JSON

### Files Created
- `scripts/activate-legacy-dashboards.sh` - Automation script
- `ACTIVATION_COMPLETE.md` - This guide

### Data Imported
- 160 suppliers
- 157 clients
- 300 trades (Hope: 116, MC: 184)

---

## Troubleshooting

### Issue: Import fails with "table not found"

**Solution:** Tables must exist in Xata first. Check at https://app.xata.io

### Issue: Schema pull shows no changes

**Solution:** Run `npx xata pull --force` to force regeneration

### Issue: Build fails with type errors

**Solution:**
1. Verify `src/xata.ts` has legacy table types
2. Run `npx xata pull --force` again
3. Restart TypeScript server in VS Code

### Issue: Dashboards show empty data

**Solution:**
1. Check `LEGACY_TABLES_EXIST = true` in `lib/legacyData.ts`
2. Verify data imported: `npx xata browse legacy_trades`
3. Check browser console for errors

---

## Deploy to Production

Once verified locally:

```bash
git add -A
git commit -m "feat: Activate legacy dashboards with imported data"
git push origin main
```

Vercel will automatically deploy within 2-3 minutes.

---

## Support

- **Setup Guide:** [LEGACY_DASHBOARDS_SETUP.md](LEGACY_DASHBOARDS_SETUP.md)
- **Data Summary:** [data/legacy-import/IMPORT_SUMMARY.md](data/legacy-import/IMPORT_SUMMARY.md)
- **Import Guide:** [data/legacy-import/XATA_IMPORT_GUIDE.md](data/legacy-import/XATA_IMPORT_GUIDE.md)

---

**Generated:** 2025-12-03
**Status:** ✅ Ready for activation
**Next Action:** Run `./scripts/activate-legacy-dashboards.sh`
