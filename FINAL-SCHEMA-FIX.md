# ⚠️ ONE MORE SCHEMA FIX - raw_row Column

## Issue

The `raw_row` column in `legacy_trades` was created as **Text** but should be **JSON**.

## Fix Required

1. Go to: https://app.xata.io/workspaces/Oliver-Timmerman-s-workspace-d3730u/dbs/Club19SalesOS
2. Click on `legacy_trades` table
3. Find the `raw_row` column
4. Click column name → "Edit column"
5. Change type from "Text" to **JSON**
6. Save

## After Fix

Run:
```bash
node scripts/import-to-xata.js
```

This should complete the import of all 300 trades.

---

## Complete Schema Summary for legacy_trades

| Column | Type |
|--------|------|
| invoice_number | Text |
| trade_date | Datetime |
| raw_client | Text |
| raw_supplier | Text |
| client_id | Link → legacy_clients |
| supplier_id | Link → legacy_suppliers |
| item | Text |
| brand | Text |
| category | Text |
| buy_price | **Float** ✅ (already fixed) |
| sell_price | **Float** ✅ (already fixed) |
| margin | **Float** ✅ (already fixed) |
| source | Text |
| raw_row | **JSON** ⚠️ (needs to be changed from Text) |

---

**Status**: One column to fix
**Time**: 1 minute
