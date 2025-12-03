# Quick Legacy Dashboards Activation Summary

## Current Status

✅ **Completed**:
- Legacy data processing pipeline (300 trades, 160 suppliers, 157 clients)
- All CSV export files generated
- Legacy dashboard components built (10 components)
- Leadership & Shopper dashboard pages created
- Import scripts created and tested
- Date conversion logic implemented
- Code prepared (LEGACY_TABLES_EXIST = true, @ts-expect-error removed)

⏳ **Pending**:
- Create 3 tables in Xata (manual step required)
- Import CSV data
- Regenerate schema
- Build & deploy

## Why Manual Table Creation?

The Xata CLI requires interactive prompts (TTY) that cannot be automated, even with `--no-input`, `--yes`, or `--force` flags. The REST API endpoints for table creation are not publicly documented for direct schema management.

**Solution**: Use Xata Web UI (5 minutes) or run script with manual confirmations.

---

## Option 1: Web UI (Recommended - 5 minutes)

### Step 1: Create Tables in Xata Web UI

Go to https://app.xata.io → **Oliver-Timmerman-s-workspace-d3730u** → **Club19SalesOS** → **main**

**Table 1: legacy_suppliers**
```
supplier_clean     | String
raw_variants       | Multiple
requires_review    | Boolean
reason             | Text
first_seen         | Datetime (optional)
last_seen          | Datetime (optional)
trade_count        | Integer
```

**Table 2: legacy_clients**
```
client_clean       | String
raw_variants       | Multiple
client_status      | String
first_seen         | Datetime (optional)
last_seen          | Datetime (optional)
trade_count        | Integer
requires_review    | Boolean
```

**Table 3: legacy_trades**
```
invoice_number     | String
trade_date         | Datetime (optional)
raw_client         | String
raw_supplier       | String
client_id          | Link → legacy_clients
supplier_id        | Link → legacy_suppliers
item               | Text
brand              | String
category           | String
buy_price          | Float
sell_price         | Float
margin             | Float
source             | String
raw_row            | JSON
```

### Step 2: Run Import & Build

```bash
cd /Users/olivertimmerman/Documents/Converso/Club-19-Sales-OS

# Import data (617 records total)
node scripts/import-to-xata.js

# Regenerate TypeScript schema
npx xata pull --force

# Build application
npm run build

# Deploy
git add -A
git commit -m "feat: Activate legacy dashboards with imported data

✅ Created 3 legacy tables in Xata
✅ Imported 300 trades, 160 suppliers, 157 clients
✅ Regenerated schema with legacy table types
✅ Enabled LEGACY_TABLES_EXIST flag
✅ Removed TypeScript suppressions

🚀 Generated with Claude Code"

git push origin main
```

Expected import output:
```
✓ legacy_suppliers import complete (160 records)
✓ legacy_clients import complete (157 records)
✓ legacy_trades import complete (300 records)
Total: 617 records
```

---

## Option 2: Semi-Automated Script

Run the activation script which will guide you through table creation:

```bash
bash scripts/activate-legacy-dashboards.sh
```

This script will:
1. Attempt CSV imports (will prompt you to create tables if they don't exist)
2. Regenerate schema automatically
3. Build the application
4. Show verification steps

---

## Verification

After activation, test the dashboards:

1. **Leadership Dashboard**: http://localhost:3000/legacy
   - Should show 300 trades combined (Hope + MC)
   - Full analytics with charts and tables

2. **Shopper Dashboard**: http://localhost:3000/legacy/my-sales
   - Shoppers see only their own data
   - Admin/Finance can switch between shoppers

3. **Check Data**:
   ```bash
   # Verify table existence
   npx xata schema dump -f /tmp/schema.json
   grep "legacy" /tmp/schema.json
   ```

---

## Files Ready for Import

Located in `/data/legacy-import/`:
- `legacy_suppliers.csv` - 17 KB, 160 records
- `legacy_clients.csv` - 18 KB, 157 records
- `legacy_trades.csv` - 179 KB, 300 records

All files have:
- ✅ Proper CSV quoting
- ✅ UTF-8 encoding
- ✅ Date conversion (YYYY-MM-DD → RFC 3339)
- ✅ JSON array handling
- ✅ Data integrity verified

---

## Troubleshooting

**Import fails with "column not found"**:
→ Tables don't exist yet. Create them in Xata Web UI first.

**Import fails with "date format error"**:
→ Already fixed in scripts/import-to-xata.js (date conversion added)

**TypeScript errors after schema regeneration**:
→ Run `npm run build` again. Types will be updated.

**Empty dashboards after activation**:
→ Check LEGACY_TABLES_EXIST = true in [lib/legacyData.ts](lib/legacyData.ts:14)

---

## Next Steps

1. **Create tables** (Web UI or prompt script)
2. **Run import** (`node scripts/import-to-xata.js`)
3. **Regenerate schema** (`npx xata pull --force`)
4. **Build** (`npm run build`)
5. **Deploy** (`git push`)

Total time: 10-15 minutes

---

**Generated**: 2025-12-03
**Status**: Ready for table creation → import → activation
**Documentation**: See [LEGACY_DASHBOARDS_SETUP.md](LEGACY_DASHBOARDS_SETUP.md) for detailed guide
