# ⚠️ SCHEMA FIX REQUIRED - legacy_trades Table

## STATUS REPORT

✅ **Suppliers**: 160 records imported successfully
✅ **Clients**: 157 records imported successfully
❌ **Trades**: Import FAILED - Schema type mismatch

## ISSUE DETECTED

The `legacy_trades` table was created with **WRONG column types**:

### Current (WRONG):
- `buy_price` → **Text** (should be Float)
- `sell_price` → **Text** (should be Float)
- `margin` → **Text** (should be Float)
- `invoice_number` → **Text** (OK - this can stay as Text)

### Required (CORRECT):
- `buy_price` → **Float** (change from Text)
- `sell_price` → **Float** (change from Text)
- `margin` → **Float** (change from Text)
- `invoice_number` → **Text** (no change needed)

## FIX INSTRUCTIONS

### Option 1: Modify Columns in Xata Web UI (Recommended)

1. Go to: https://app.xata.io/workspaces/Oliver-Timmerman-s-workspace-d3730u/dbs/Club19SalesOS
2. Click on `legacy_trades` table
3. For these 3 columns, click the column name → "Edit column"
4. Change type from "Text" to "Float":
   - `buy_price`: Text → **Float**
   - `sell_price`: Text → **Float**
   - `margin`: Text → **Float**
5. Leave `invoice_number` as Text (it's fine)
6. Save changes

**Note**: In Xata Web UI, "Text" is used for both short strings and text fields. The numeric columns were created as Text but need to be Float.

### Option 2: Delete and Recreate Table

If editing doesn't work:

```bash
# Delete the trades table only
node scripts/delete-legacy-tables.js

# Then recreate ONLY legacy_trades with correct schema:
# - invoice_number: String (not Text)
# - buy_price: Float (not Text)
# - sell_price: Float (not Text)
# - margin: Float (not Text)
```

## AFTER FIX

Once the schema is corrected, run:

```bash
# Re-import trades data
node scripts/import-to-xata.js
```

Expected output:
```
✓ legacy_suppliers import complete (160 records) [SKIPPED - already imported]
✓ legacy_clients import complete (157 records) [SKIPPED - already imported]
✓ legacy_trades import complete (300 records) [NEW]
```

## WHY THIS HAPPENED

When creating tables in Xata Web UI:
- "Text" type = Long text field (like a paragraph)
- "String" type = Short text field (like a name or ID)
- "Float" type = Decimal number

The table was likely created with "Text" selected instead of proper types.

## NEXT STEPS

1. ✅ Fix the schema (5 minutes)
2. ✅ Re-run import
3. ✅ Continue with automation (schema regeneration, build, validation)

---

**Status**: Awaiting schema fix in Xata Web UI
**Time to fix**: 5 minutes
**Automation will resume automatically after re-import succeeds**
