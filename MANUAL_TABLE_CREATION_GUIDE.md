# Manual Legacy Table Creation Guide

The Xata CLI requires interactive prompts that cannot be automated. Please follow these steps to create the legacy tables manually:

## Step 1: Open Xata Web UI

1. Go to https://app.xata.io
2. Select workspace: **Oliver-Timmerman-s-workspace-d3730u**
3. Open database: **Club19SalesOS**
4. Click on branch: **main**

## Step 2: Create legacy_suppliers Table

1. Click "+ Add Table" button
2. Table name: `legacy_suppliers`
3. Add the following columns:

| Column Name | Type | Notes |
|-------------|------|-------|
| supplier_clean | String | - |
| raw_variants | Multiple | - |
| requires_review | Boolean | - |
| reason | Text | - |
| first_seen | Datetime | Optional |
| last_seen | Datetime | Optional |
| trade_count | Integer | - |

4. Click "Create Table"

## Step 3: Create legacy_clients Table

1. Click "+ Add Table" button
2. Table name: `legacy_clients`
3. Add the following columns:

| Column Name | Type | Notes |
|-------------|------|-------|
| client_clean | String | - |
| raw_variants | Multiple | - |
| client_status | String | - |
| first_seen | Datetime | Optional |
| last_seen | Datetime | Optional |
| trade_count | Integer | - |
| requires_review | Boolean | - |

4. Click "Create Table"

## Step 4: Create legacy_trades Table

1. Click "+ Add Table" button
2. Table name: `legacy_trades`
3. Add the following columns:

| Column Name | Type | Notes |
|-------------|------|-------|
| invoice_number | String | - |
| trade_date | Datetime | Optional |
| raw_client | String | - |
| raw_supplier | String | - |
| client_id | Link | Link to: legacy_clients |
| supplier_id | Link | Link to: legacy_suppliers |
| item | Text | - |
| brand | String | - |
| category | String | - |
| buy_price | Float | - |
| sell_price | Float | - |
| margin | Float | - |
| source | String | - |
| raw_row | JSON | - |

4. Click "Create Table"

## Step 5: Run Import Script

Once all three tables are created, run:

```bash
node scripts/import-to-xata.js
```

Expected output:
- ✓ legacy_suppliers: 160 records
- ✓ legacy_clients: 157 records
- ✓ legacy_trades: 300 records

## Step 6: Complete Activation

After successful import, run:

```bash
# Regenerate TypeScript schema
npx xata pull --force

# Build application
npm run build

# Commit changes
git add -A
git commit -m "feat: Activate legacy dashboards with imported data"
git push origin main
```

## Alternative: Try Scripted Approach

If you want to try the scripted approach first, you can attempt:

```bash
bash scripts/activate-legacy-dashboards.sh
```

This will prompt you for confirmations during table creation.

---

**Note**: The manual web UI approach is recommended as it avoids all TTY/interactive prompt issues and gives you visual confirmation of each step.
