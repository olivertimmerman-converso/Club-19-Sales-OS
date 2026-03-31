# Club 19 Sales OS — V2 Codebase Audit

**Generated**: 2026-03-27
**Codebase**: ~61,300 lines of TypeScript/TSX/CSS
**Purpose**: Complete system map for V2 architecture decisions

---

## Part 1: Schema Audit

### 1.1 Complete Schema Map

#### `shoppers` — 6 rows
| Column | Type | Nullable | Usage |
|--------|------|----------|-------|
| id | uuid PK | no | Active FK target |
| name | text | yes | Active |
| email | text | yes | Active |
| clerkUserId | text | yes | Links to Clerk auth — 5/6 populated |
| commissionScheme | text | yes | **Never populated** — 0/6 have values |
| active | boolean | yes (default true) | Active |
| createdAt | timestamp | yes | Active |
| updatedAt | timestamp | yes | Active |

**Indexes**: name, clerkUserId
**Referenced by**: sales.shopperId, sales.ownerId, buyers.ownerId
**Note**: "Mary Clair" (inactive, no clerkUserId) is a duplicate of "Mary Clair Bromfield" (active). 6 shoppers total: Oliver, Sophie, Alys, Hope, MC, + duplicate.

#### `buyers` — 254 rows
| Column | Type | Nullable | Usage |
|--------|------|----------|-------|
| id | uuid PK | no | Active |
| name | text | yes | Active |
| email | text | yes | Rarely populated |
| xeroContactId | text | yes | Active — links to Xero contacts |
| ownerId | uuid FK→shoppers | yes | Active — the relationship owner |
| ownerChangedAt | timestamp | yes | Active |
| ownerChangedBy | text | yes | Active |
| createdAt/updatedAt | timestamp | yes | Active |

**Indexes**: name, xeroContactId
**Referenced by**: sales.buyerId
**Missing fields**: No isExport, country, address, phone, clientStatus, or classification.

#### `suppliers` — 162 rows
| Column | Type | Nullable | Usage |
|--------|------|----------|-------|
| id | uuid PK | no | Active |
| name | text | yes | Active |
| email | text | yes | Rarely populated |
| xeroContactId | text | yes | Rarely populated |
| pendingApproval | boolean | yes (default false) | 3 pending, 159 approved |
| createdBy | text | yes | Active |
| approvedBy | text | yes | Active |
| approvedAt | timestamp | yes | Active |
| createdAt/updatedAt | timestamp | yes | Active |

**Indexes**: name, xeroContactId
**Referenced by**: sales.supplierId, lineItems.supplierId
**No alias/duplicate tracking** — supplier cleanup is manual.

#### `introducers` — 0 rows (EMPTY)
| Column | Type | Nullable |
|--------|------|----------|
| id | uuid PK | no |
| name | text | yes |
| commissionPercent | doublePrecision | yes |
| createdAt/updatedAt | timestamp | yes |

**Referenced by**: sales.introducerId
**Status**: Schema exists but **never used**. 0/1094 sales have an introducerId. The `hasIntroducer` boolean on sales is also 0/1094 = true.

#### `commission_bands` — 0 rows (EMPTY)
| Column | Type | Nullable |
|--------|------|----------|
| id | uuid PK | no |
| bandType | text | yes |
| minThreshold / maxThreshold | doublePrecision | yes |
| commissionPercent | doublePrecision | yes |
| createdAt/updatedAt | timestamp | yes |

**Referenced by**: sales.commissionBandId
**Status**: Schema exists but **never used**. Commission is not yet implemented in the system.

#### `sales` — 1,094 rows (27 deleted, 13 dismissed)

The master table with ~50 columns. Full column usage analysis:

**Actively used columns** (>50 rows populated):
- id, saleDate, xeroInvoiceId, xeroInvoiceNumber, invoiceStatus, saleAmountIncVat, saleAmountExVat, currency, source, needsAllocation (952), internalNotes (1068), buyerId, brand, category, itemTitle, quantity, createdAt, updatedAt

**Partially used columns** (1-100 rows populated):
- buyPrice (96), grossMargin (93), supplierId (95), shippingCost (80), cardFees (72), allocatedBy (72), saleReference (58), errorFlag (54), errorMessage (54), directCosts (54), xeroInvoiceUrl (54), commissionableMargin (108), commissionAmount (135), completedAt (18), paymentMethod (26), shippingCostConfirmed (12), dismissed (13), deletedAt (27), buyerType (18)

**Never used columns** (0 rows populated):
- `shippingMethod` — 0/1094 (despite being set in trade creation, always null in production)
- `adminOverrideCommissionPercent` — 0/1094
- `commissionLocked` — 0/1094
- `commissionPaid` — 0/1094
- `commissionClawback` / `commissionClawbackDate` / `commissionClawbackReason` — 0/1094
- `hasIntroducer` — 0/1094 (the introducer feature was scaffolded but never used)
- `introducerId` / `introducerCommission` — 0/1094
- `depositAmount` — 0/1094
- `xeroPaymentDate` — 3/1094 (effectively unused)
- `commissionLockDate` / `commissionPaidDate` — 0/1094
- `introducerSharePercent` / `commissionSplitIntroducer` / `commissionSplitShopper` — effectively unused

**Indexes**: saleDate, shopperId, buyerId, xeroInvoiceId, deletedAt, needsAllocation, source, completedAt, xeroInvoiceNumber, saleReference

#### `line_items` — 1,579 rows
| Column | Type | Nullable | Usage |
|--------|------|----------|-------|
| id | uuid PK | no | Active |
| saleId | uuid FK→sales | yes | Active |
| supplierId | uuid FK→suppliers | yes | Rarely used — per-line supplier |
| lineNumber | integer | yes | Active |
| brand | text | yes | Mostly "Unknown" for imports |
| category | text | yes | Mostly "Unknown" for imports |
| description | text | yes | Active |
| quantity | integer | yes | Active |
| buyPrice | doublePrecision | yes | Mostly 0 for imports |
| sellPrice | doublePrecision | yes | Active |
| lineTotal | doublePrecision | yes | Active |
| lineMargin | doublePrecision | yes | Mostly 0 for imports |
| source | text | yes (default "atelier") | 1,356 xero_import, 223 atelier |
| createdAt/updatedAt | timestamp | yes | Active |

**Missing**: accountCode, taxType (per line item)

#### `payment_schedule` — 6 rows
Minimal usage — only 2 sales have payment plans.

#### `errors` — 18,115 rows
Massively bloated — primarily from cron sync logging. Each sync run creates error records for any issues encountered. This table functions more as a log than an error tracker.

#### `legacy_suppliers` — 160 rows, `legacy_clients` — 157 rows, `legacy_trades` — 300 rows
Historical data from pre-Sales OS era. Read-only reference tables. Not actively written to.

### 1.2 Enum and Constant Audit

| Field | Defined Values | Production Values | Mismatches |
|-------|---------------|-------------------|------------|
| `sales.source` | Implicit: "atelier", "xero_import" | "xero_import" (960), "allocated" (76), "atelier" (52), "adopted" (4), NULL (2) | `allocated` and `adopted` are not documented anywhere as valid values |
| `sales.invoiceStatus` | Follows Xero statuses | "PAID" (922), "DELETED" (84), "VOIDED" (63), "AUTHORISED" (20), "DRAFT" (5) | None — matches Xero |
| `sales.brandingTheme` | 3 UUIDs in `lib/branding-theme-mappings.ts` | NULL (1,022+13=1,035), Export UUID (40), Margin UUID (14), 20%VAT UUID (5) | 93% of sales have NULL branding theme — the sync bug |
| `sales.status` | Implicit: "active", "invoiced" | NULL (1,036), "invoiced" (53), "active" (4), "ongoing" (1) | `status` field is largely unused — `invoiceStatus` from Xero is the real status |
| `sales.buyerType` | "end_client", "b2b" | end_client (15), b2b (3), NULL (1,076) | 98% NULL — only set during completion |
| `StaffRole` | "superadmin", "founder", "operations", "admin", "finance", "shopper" | superadmin, founder, operations, shopper | "admin" and "finance" are defined but no Clerk users have these roles |
| `pipelineStage` | **Computed, not stored** | Derived from: source + needsAllocation + allocatedAt + completedAt + deletedAt + dismissed | — |
| Branding theme UUIDs | `d68f1fb5...` (20%VAT), `8173b901...` (Margin), `82e46ce4...` (Export) | Hardcoded in `lib/branding-theme-mappings.ts:23-52` | Not in env vars — hardcoded |

### 1.3 Soft Deletion Patterns

| Table | Mechanism | Consistent filtering? | Count |
|-------|-----------|----------------------|-------|
| `sales` | `deletedAt` timestamp | **Mostly yes** — most queries filter `isNull(sales.deletedAt)`. But the cron sync does NOT filter deleted records in its existence check (line 211-215) — it checks by xeroInvoiceId regardless of deletion status. | 27 deleted |
| `sales` | `dismissed` boolean + `dismissedAt`/`dismissedBy` | Inconsistent — some dashboard queries don't filter dismissed records | 13 dismissed |
| Other tables | **No soft deletion** | Buyers, suppliers, shoppers have no soft delete mechanism | N/A |

### 1.4 What's Missing from the Schema

| Missing Item | Current Workaround | Impact |
|-------------|-------------------|--------|
| **Credit notes table** | Not tracked at all — lives only in Xero | Cannot reconcile credit notes against sales |
| **buyer.isExport** | Derived per-sale from `brandingTheme` containing "export" | Same client can be export on one sale and domestic on another — no single truth |
| **buyer.country / address / region** | Not captured | Cannot auto-determine export status |
| **Per-line-item accountCode / taxType** | Not stored — set during Xero invoice creation but not persisted | Cannot audit which account code was used per line |
| **Supplier purchase invoice reference** | Not stored | No proof-of-purchase tracking |
| **Date purchased from supplier** | Not stored — only sale date exists | Cannot calculate inventory aging |
| **Client status (new/existing)** | Not stored | No client lifecycle tracking |
| **Brand / category as structured fields** | Free text — "Unknown" for 960 xero imports | No standardized reporting by brand |
| **Handling fees vs shipping vs product price** | Partially separated (shippingCost, cardFees, directCosts) but often bundled | Unclear cost breakdown |
| **Commission clawback linked to credit notes** | Fields exist but never used (0 rows) | Not implemented |
| **Sale.dueDate** | Not stored on sales — exists on `payment_schedule` only | Most sales have no due date record |

---

## Part 2: Xero Integration Audit

### 2.1 Token Management

- **Storage**: Xero OAuth tokens stored in Clerk `privateMetadata.xero` on the integration user account
- **Architecture**: Single integration user (`XERO_INTEGRATION_CLERK_USER_ID`) — not per-user tokens
- **Refresh**: Cron-only refresh to prevent race conditions. Only `forceCron: true` calls actually refresh.
  - Cron schedule: Every 10 minutes (`/api/cron/refresh-xero`)
  - Proactive: Refreshes if token expires within 10 minutes
- **Failure handling**: If refresh fails, logs to console + errors table. No alerting webhook configured by default (requires `ALERT_WEBHOOK_URL` env var)
- **Token stored in**: `lib/xero-auth.ts` — `getTokens()`, `saveTokens()`, `refreshTokens()`

**Key env vars**:
- `XERO_INTEGRATION_CLERK_USER_ID` — Clerk user ID for the integration account
- `NEXT_PUBLIC_XERO_CLIENT_ID` — Xero OAuth client ID
- `XERO_CLIENT_SECRET` — Xero OAuth client secret
- `CRON_SECRET` — Bearer token for cron authentication
- `XERO_WEBHOOK_SECRET` — Webhook verification key

### 2.2 Inbound Sync (Xero → Sales OS)

**File**: `app/api/cron/sync-invoices/route.ts`
**Schedule**: Every 30 minutes
**API endpoint**: `GET https://api.xero.com/api.xro/2.0/Invoices?page={n}` with `If-Modified-Since` header (7 days ago)

**What's fetched per invoice** (from `XeroInvoice` interface, lines 83-107):
- InvoiceID, InvoiceNumber, Type, Status, Date, DueDate, FullyPaidOnDate
- Total, SubTotal, TotalTax, AmountDue, AmountPaid
- UpdatedDateUTC, Contact (ContactID, Name)
- LineItems (Description, Quantity, UnitAmount, LineAmount)

**What's NOT fetched** (missing from interface):
- ❌ `BrandingThemeID` — **THE BUG** — never captured
- ❌ `CurrencyCode` — always defaults to GBP
- ❌ `Reference` — the sale reference field
- ❌ `LineItems[].AccountCode` — not captured
- ❌ `LineItems[].TaxType` — not captured
- ❌ `LineItems[].TaxAmount` — not captured
- ❌ `Payments` — payment details not in this sync
- ❌ Credit notes — not fetched at all

**Deduplication**: Checks by `xeroInvoiceId` (line 211-215). However, **5 duplicate invoice numbers exist** in production (INV-3220, 3225, 3226, 3240, 2397) — dedup is by Xero GUID, not invoice number.

**New vs updated detection**: Existence check by xeroInvoiceId, then compares `UpdatedDateUTC` and `invoiceStatus`.

**Voided/deleted handling**: Status updates are synced (VOIDED, DELETED) but the sales record is not soft-deleted — only the `invoiceStatus` field is updated.

### 2.3 Outbound Push (Sales OS → Xero)

**File**: `lib/xero.ts` → `createXeroInvoice()` (lines 240-345)
**Called from**: `app/api/trade/create/route.ts` (line 387)

**What's sent to Xero**:
```typescript
{
  Type: "ACCREC",
  Contact: { ContactID: payload.buyerContactId },
  DueDate: "YYYY-MM-DD", // Always today
  LineAmountTypes: payload.lineAmountType, // "Inclusive" | "Exclusive" | "NoTax"
  LineItems: [{ Description, Quantity, UnitAmount, AccountCode, TaxType }],
  CurrencyCode: payload.currency,
  BrandingThemeID: payload.brandingThemeId, // Optional
}
```

**What's NOT sent**:
- No invoice number (Xero auto-generates INV-XXXX)
- No reference number
- No separate line items for shipping or handling fees
- Card fee is calculated client-side but not sent as a separate Xero line item

**Contact selection**: Buyer must have a `xeroContactId`. Contacts are searched in Xero via `/api/xero/contacts/buyers` during the wizard.

**Error handling**: If Xero push fails, returns 502 to the user. If push succeeds but DB save fails, returns success with a warning (line 644-651) — **potential data loss**.

**Idempotency**: No protection. The same sale could theoretically create multiple Xero invoices.

**Card fee**: Hardcoded as `0.024` (2.4%) in two places:
- `lib/implied-costs.ts:58` — `const CARD_FEE_PERCENT = 0.024;`
- `components/trade/StepReview.tsx:75` — `const CARD_FEE_RATE = 0.024;` (duplicated!)

### 2.4 Payment Status Sync

**File**: `app/api/cron/sync-payments/route.ts`
**Schedule**: Every hour
**Process**: Queries all non-PAID Sales with xeroInvoiceId, fetches each from Xero individually, updates status.
- Payment date: Captured from `FullyPaidOnDate`
- **Partial payment**: Not handled — only checks for PAID status
- No `xeroPaymentDate` population (only 3/1094 have values)

### 2.5 Contacts Sync

- Xero contacts are synced **reactively** during invoice import — if a contact is found in Xero, the buyer record is created/updated
- Name changes in Xero are detected and propagated (sync-invoices line 381-386)
- `xeroContactId` is backfilled on name match (line 400-405)
- No separate contacts sync cron — all contact management happens during invoice sync
- Same person can exist as multiple Xero contacts (e.g., "Khaled Al Muhairy" vs "Khaled Al- Muhairy")
- **Contact cache**: `lib/xero-contacts-cache.ts` (355 lines) — 10-minute TTL server-side cache per user, pre-classifies contacts as buyer/supplier using `IsCustomer`/`IsSupplier` flags + default account codes
- **Webhook receiver**: `app/api/xero/webhooks/route.ts` — validates HMAC-SHA256 signature (tries both raw key and base64-decoded key). Processes invoice update events from Xero push notifications.

---

## Part 3: Pipeline and Workflow Audit

### 3.1 Pipeline Stages

`pipelineStage` is **computed, not stored**. Derived from multiple fields:

```
if (deletedAt)        → "deleted"
if (dismissed)        → "dismissed"
if (invoiceStatus=VOIDED) → "voided"
if (completedAt)      → "completed"       // 18 sales
if (allocatedAt)      → "allocated"       // 72 sales
if (needsAllocation)  → "needs_allocation" // 952 sales
if (source=atelier)   → "atelier_created" // 52 sales
else                  → "unknown"
```

**Key finding**: Only 18/1094 sales (1.6%) have gone through the completion workflow. The vast majority (87%) are stuck at `needs_allocation`.

**Can a sale move backwards?** No explicit prevention — there's no state machine. A sale could theoretically have its `completedAt` set then cleared, though no code currently does this.

### 3.2 The Completion Form

**File**: `app/api/sales/[id]/complete/route.ts`

**Fields accepted** (all optional):
- `supplier` → supplierId
- `brand` → brand
- `category` → category
- `item_title` → itemTitle
- `buy_price` → buyPrice
- `branding_theme` → brandingTheme
- `buyer_type` → buyerType (end_client / b2b)
- `shipping_cost` → shippingCost
- `card_fees` → cardFees
- `deposit_amount` → depositAmount
- `payment_plan_notes` → paymentPlanNotes
- `line_item_suppliers` → per-line supplier updates

**On submit**:
1. Recalculates `saleAmountExVat`, `grossMargin`, `commissionableMargin` via `calculateSaleEconomics()`
2. Sets `completedAt = now()` and `completedBy = userId`
3. **Does NOT push branding theme change back to Xero**
4. **Does NOT update Xero invoice with buy price or any other completion data**

**Validation**: Minimal — checks auth and ownership. No required fields. A shopper could "complete" a sale with zero fields filled.

**Re-opening**: No code exists to reset `completedAt`. Completed sales cannot be re-opened through the UI.

### 3.3 Allocation / Triage

**Location**: `/admin/sync` page (`SyncPageClient.tsx`)
**Who can allocate**: superadmin, operations, founder via dropdown; shoppers via "Claim" button
**Endpoint**: `POST /api/sales/allocate` (management) or `POST /api/sales/[id]/claim` (shoppers)
**Claim restriction**: Shoppers can only claim if buyer is owned by them OR has no owner
**Audit trail**: `allocatedBy` (Clerk user ID) and `allocatedAt` (timestamp)
**Re-allocation**: Can be re-allocated — previous allocation overwritten (no history)
**Commission**: Calculated at allocation time using shopper's `commissionScheme` (30/40/50% of gross margin)

### 3.4 The Invoice Wizard (Atelier)

**Entry**: `/trade/new` route
**State**: `contexts/TradeContext.tsx` manages wizard state
**Steps** (from component files):
1. **StepSupplierBuyer** — Select/search supplier and buyer from Xero contacts
2. **StepItemDetails** — Brand, category, description, quantity, buy/sell price, currency
3. **StepLogisticsTax** — Shipping method, branding theme (VAT treatment), payment method
4. **StepReview** — Summary with calculated margins, handling fees, card fees

**At submission** (`/api/trade/create`):
1. Validates with Zod schema
2. Gets Xero tokens via integration user
3. Creates Xero invoice directly via API
4. Saves sale record to database
5. Auto-syncs Xero invoice details (non-blocking, 3-second delay)

**Abandonment**: No draft saving — if user abandons mid-flow, no data is persisted.

---

## Part 4: Business Logic Audit

### 4.1 Financial Calculations

**Single source of truth**: `lib/economics.ts` — well-documented, 375 lines

**Formulas**:
```
Gross Margin = Sale Price (ex VAT) - Buy Price ONLY
Commissionable Margin = Gross Margin - Shipping - Card Fees - Direct Costs - Introducer Commission
Margin % = (Margin / Sale Price Ex VAT) * 100
```

**VAT determination**: `getVATRateForBrandingTheme()` — maps branding theme → VAT rate
- NULL branding theme → defaults to 20% VAT (with console.warn)
- Export (UUID `82e46ce4...`) → 0% VAT
- Margin Scheme (UUID `8173b901...`) → 0% VAT
- 20% VAT (UUID `d68f1fb5...`) → 20% VAT

**Additional VAT module**: `lib/calculations/vat.ts` — `calculateVAT()` function with stricter validation (throws on unknown theme). Used by trade creation.

**Rogue calculations**: None found. All margin calculations route through `lib/economics.ts`.

**Currency utilities**: `lib/utils/currency.ts` — `roundCurrency()`, `addCurrency()`, `subtractCurrency()`, `multiplyCurrency()`, `divideCurrency()` for precision.

### 4.2 Commission Logic

**Status: PARTIALLY IMPLEMENTED — calculation exists, payout/lifecycle does not**

**Where it lives**: `app/api/sales/allocate/route.ts` (lines 130-159)

**Rate structure** — flat percentage on **gross margin**, based on `shopper.commissionScheme`:
| Scheme | Rate | Who |
|--------|------|-----|
| `founder` | 50% of gross margin | Sophie |
| `senior` | 40% of gross margin | (none currently) |
| `standard` (default) | 30% of gross margin | Hope, MC |

**What works**: Commission amount is calculated at allocation time and stored on the sale record (135/1094 sales have values).

**What doesn't exist**:
- `commission_bands` table: 0 rows (tiered/banded rates not implemented)
- `introducers` table: 0 rows (introducer splits not implemented)
- `commissionLocked`: 0/1094 (no lock workflow)
- `commissionPaid`: 0/1094 (no payout workflow)
- `commissionClawback`: 0/1094 (no clawback logic)
- No commission recalculation when sale data changes post-allocation
- No commission reporting or export

### 4.3 VAT / Tax Treatment

See 4.1 above. Key issues:
- 1,035/1,094 sales (94.6%) have NULL branding theme → default to 20% VAT calculation
- Xero sync doesn't capture BrandingThemeID → all imported sales have NULL
- Completion form allows shoppers to set branding theme → but doesn't push to Xero
- No validation that branding theme in Sales OS matches what Xero has

### 4.4 Currency Handling

- Currency field exists on sales table — always "GBP" in production
- Trade wizard supports currency selection (`firstItem.sellCurrency || 'GBP'`)
- `buyPriceGBP` and `sellPriceGBP` fields in the TradeSchema suggest GBP conversion was planned
- **No exchange rate logic exists** — if a USD sale is created, the amounts are stored as-is in the `currency` field
- The 2.4% card fee is always calculated on the GBP-equivalent amount

---

## Part 5: Infrastructure Audit

### 5.1 Authentication and Roles

**6 roles defined** in `lib/permissions.ts`:
| Role | Who | Active Clerk Users |
|------|-----|-------------------|
| superadmin | Oliver | Yes |
| founder | Sophie | Yes |
| operations | Alys | Yes |
| admin | (unused) | No users |
| finance | (unused) | No users |
| shopper | Hope, MC | Yes |

**Role resolution**: `lib/getUserRole.ts` — reads `publicMetadata.staffRole` from Clerk. Defaults to "shopper" on any error.

**Route permissions**: 23 routes defined in `ROUTE_PERMISSIONS`. Longest-prefix matching with `/staff` excluded from sub-route inheritance.

**viewAs**: Superadmin can preview other roles via `?viewAs=` URL param.

### 5.2 API Routes

**Cron jobs** (3):
| Route | Schedule | Purpose |
|-------|----------|---------|
| `/api/cron/refresh-xero` | Every 10 min | Token refresh |
| `/api/cron/sync-invoices` | Every 30 min | Invoice import |
| `/api/cron/sync-payments` | Every hour | Payment status sync |

**67 total API routes.** Key categories:

**Sales CRUD & Actions** (25 routes):
- `GET/PATCH /api/sales/[id]` — Fetch/update sale
- `POST /api/sales/[id]/complete` — Completion form
- `POST /api/sales/[id]/delete` / `restore` — Soft delete / restore (superadmin)
- `POST /api/sales/[id]/claim` — Shopper claims unassigned sale
- `POST /api/sales/[id]/link-xero` / `unlink-invoice` / `link-invoice` — Xero invoice linking
- `POST /api/sales/[id]/sync-status` — Sync payment from Xero
- `POST /api/sales/[id]/fix-vat` / `fix-margin` — Superadmin fix tools
- `GET/POST /api/sales/[id]/payment-schedule` — Payment plan management
- `POST /api/sales/[id]/introducer` — Set introducer
- `GET /api/sales/[id]/line-items` / `pdf` / `status` — Read operations
- `POST /api/sales/allocate` — Allocate to shopper
- `POST /api/sales/adopt` — Adopt Xero invoice → calls Xero API
- `GET /api/sales/search` / `summary` / `analytics/overview` / `incomplete` / `claimable`
- `POST /api/sales/recalculate-margins` — Bulk margin recalc (superadmin)

**Trade creation**: `POST /api/trade/create` — Atelier wizard → Xero + DB

**Xero integration** (12 routes):
- `GET /api/xero/oauth/authorize` / `callback` / `POST refresh` — OAuth flow
- `GET /api/xero/status` / `health` — Connection status
- `GET /api/xero/contacts` / `contacts/buyers` / `contacts/suppliers` — Contact search
- `GET /api/xero/invoice/[invoiceId]` — Fetch single invoice
- `POST /api/xero/invoices` — Create invoice
- `POST /api/xero/webhooks` — Webhook receiver

**Sync** (7 routes): Manual triggers + cron equivalents + `force-fix-dates` + dismiss/restore

**Finance** (4 routes): `daily-maintenance`, `lock-paid-sales`, `pay-commissions`, `overdue-sales`

**Other**: clients, suppliers (approve), shoppers, introducers, errors (list/groups/resolve), export, debug, health, cleanup/migration utilities

**Potentially dead routes** (one-time migration utilities): `/api/backfill-source`, `/api/migrate/legacy-suppliers`, `/api/analyze-legacy`, `/api/cleanup-demo`

### 5.3 Database Queries

- All queries go through Drizzle ORM — no raw SQL in production code
- **N+1 pattern**: `sync-payments` fetches unpaid sales then queries Xero individually per invoice
- **Potential slow query**: `sync-invoices` does an existence check per invoice in a loop (could be batched)
- **No caching layer** — every page load hits the database directly

### 5.4 Environment Variables

**Secrets**:
- `XATA_POSTGRES_URL` — Database connection string
- `XERO_CLIENT_SECRET` — Xero OAuth secret
- `XERO_INTEGRATION_CLERK_USER_ID` — Integration user
- `CRON_SECRET` — Cron authentication
- `XERO_WEBHOOK_SECRET` — Webhook verification
- `SYSTEM_MAINTENANCE_KEY` — Maintenance endpoint auth

**Auth**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk public key (client-side)
- `CLERK_SECRET_KEY` — Clerk secret key (server-side)

**Configuration**:
- `NEXT_PUBLIC_XERO_CLIENT_ID` — Xero OAuth client (public)
- `NEXT_PUBLIC_APP_URL` — App URL
- `ALERT_WEBHOOK_URL` — Alert notifications (optional)
- `NODE_ENV` — Environment
- `VERCEL_URL` — Fallback for app URL

**Hardcoded values that should be configurable**:
- Card fee: 2.4% in `lib/implied-costs.ts:58` AND `components/trade/StepReview.tsx:75`
- Branding theme UUIDs in `lib/branding-theme-mappings.ts`
- Sync window: 7 days in `sync-invoices/route.ts:147`
- Shipping cost lookup table in `lib/implied-costs.ts:35-53`
- Account codes per theme (423/424/425) in `lib/branding-theme-mappings.ts`

### 5.5 Error Handling and Logging

- **Structured logging**: `lib/logger.ts` — info/warn/error with module tags
- **Error records**: 18,115 rows in `errors` table — primarily from cron sync. Functions as a log, not a true error tracker.
- **Xero errors**: Caught and surfaced to users as JSON error responses (502 for Xero failures)
- **Alerting**: Optional webhook (`ALERT_WEBHOOK_URL`) triggered on token refresh failures. No structured alerting otherwise.
- **No Sentry/DataDog** or similar APM integration

---

## Part 6: Frontend Audit

### 6.1 Page Inventory

**OS Pages** (`app/(os)/`):
| Route | Description | Roles |
|-------|-------------|-------|
| `/dashboard` | Role-specific dashboard | All |
| `/sales` | Sales list with filters, search | All |
| `/sales/[id]` | Sale detail with full breakdown | All |
| `/sales/[id]/complete` | Completion form for allocated sales | Shopper + mgmt |
| `/clients` | Client list | All |
| `/suppliers` | Supplier list with approval workflow | Mgmt + finance |
| `/shoppers` | Shopper management | Mgmt |
| `/invoices` | Invoice management | Mgmt + finance |
| `/finance` | Financial overview | Mgmt + finance |
| `/xero-health` | Xero connection status | Mgmt |
| `/admin` | System administration | Superadmin |
| `/admin/sync` | Pending sales / allocation | All (key workflow page) |
| `/admin/sync/adopt` | Adopt Xero invoices | All |
| `/admin/deleted-sales` | Soft-deleted records + restore | Superadmin |
| `/legacy` | Legacy trade data | Mgmt + finance |
| `/legacy-xero` | Legacy Xero imports | Mgmt + finance |

**Trade/Atelier** (`app/trade/`):
| Route | Description | Roles |
|-------|-------------|-------|
| `/trade/new` | Invoice creation wizard | Mgmt + shoppers |

**Staff Portal** (`app/staff/`):
| Route | Description |
|-------|-------------|
| `/staff` | Navigation hub |
| `/staff/shopper/dashboard` | Shopper dashboard |
| `/staff/shopper/sales` | Shopper's sales |
| `/staff/admin/dashboard` | Admin dashboard |
| `/staff/admin/sales` | Admin sales overview |
| `/staff/admin/analytics` | Analytics |
| `/staff/admin/errors` | Error tracking |
| `/staff/finance/dashboard` | Finance dashboard |
| `/staff/finance/commissions` | Commission management |
| `/staff/finance/overdue` | Overdue payments |
| `/staff/superadmin/tools` | System tools |

### 6.2 Component Library

- **UI framework**: Custom Tailwind CSS components + Lucide React icons + Recharts (8 chart types)
- **No shadcn/ui or Radix** — components are hand-built with Tailwind
- **67 total component files** in `components/`
- **Key shared components** (`components/ui/`): Money, StatusBadge, MetricCard, MonthPicker, SalesFilters, ViewAsSelector, ErrorDisplay, LoadingBlock, Breadcrumbs, PageHeader
- **6 role-specific dashboards** in `components/dashboards/`: Superadmin, Founder, Operations, Admin, Finance, Shopper
- **Trade wizard** (`components/trade/`): StepSupplierBuyer, StepItemDetails, StepPricing, StepLogisticsTax, StepReview, WizardShell
- **Layout**: StaffShell, OSLayout, Sidebar, OSNav, MobileNav, Topbar, XeroStatusBanner
- **Legacy dashboard components still present**: XeroSummaryCards, XeroSalesChart, XeroTopClientsTable, etc. — deprecated but not removed

### 6.3 Data Fetching

- **Server components** dominant — async RSC with `dynamic = 'force-dynamic'`, direct Drizzle queries
- **No SWR/React Query** — direct fetch calls for interactive features (search, contact lookup)
- Client components receive data via props from server parent
- Some pages have very large client components (SaleDetailClient.tsx)
- **~500 lines of commented Xata SDK code** across routes — migration artifacts from Xata→Drizzle

---

## Part 7: Code Quality and Tech Debt

### 7.1 Dead Code

- **Introduced features never used**: introducers table (0 rows), commission_bands (0 rows), all commission clawback fields, payment plan fields (2 sales total)
- **Deprecated functions**: `calculateExVat()` (use `calculateExVatWithRate()`), `sendInvoiceToXero()` (use `createXeroInvoice()`), `fetchXeroContacts()` (use `fetchXeroBuyers()`)
- **~500 lines of commented Xata SDK code**: `// ORIGINAL XATA:` comments across ~67 API route files — migration artifacts. Also in `lib/deal-lifecycle.ts` (~130 lines), `lib/xeroLegacyData.ts` (~70 lines), multiple scripts
- **Legacy dashboard components**: XeroSummaryCards, XeroSalesChart, XeroTopClientsTable, etc. still in codebase
- **Duplicate Mary Clair**: Inactive "Mary Clair" shopper record alongside active "Mary Clair Bromfield"
- **Dead migration routes**: `/api/backfill-source`, `/api/migrate/legacy-suppliers`, `/api/analyze-legacy`, `/api/cleanup-demo`
- **TODO/FIXME**: Zero in source code. Some in `VAT-LOGIC-DOCUMENTATION.md` (known issues)

### 7.2 Consistency Issues

| Inconsistency | Details |
|--------------|---------|
| **buyer vs client** | Schema uses `buyers`, UI says "Clients", Xero uses "Contacts" |
| **sale vs invoice** | Used interchangeably — a "sale" in the DB maps to an "invoice" in Xero |
| **allocated vs triaged** | CCD prompts reference "triage" but code uses "allocated" |
| **Card fee duplication** | 2.4% hardcoded in both `lib/implied-costs.ts` and `components/trade/StepReview.tsx` |
| **`status` vs `invoiceStatus`** | Both exist on sales table. `status` has 4 different values ("active", "invoiced", "ongoing", NULL). `invoiceStatus` mirrors Xero. They're uncoordinated. |
| **`source` undocumented values** | "allocated" and "adopted" aren't documented — they emerge from specific code paths |

### 7.3 Testing

**No tests exist.** No test files, no test framework, no test configuration. Zero coverage.

---

## V2 Architecture Implications

### Keep
- **Clerk auth** — working well, role metadata pattern is solid
- **Vercel deployment** + cron infrastructure
- **Drizzle ORM** — well-integrated, type-safe
- **shadcn/ui component library** — modern, accessible
- **`lib/economics.ts`** — well-documented single source of truth for financial calculations
- **`lib/calculations/vat.ts`** — robust VAT calculation with validation
- **`lib/branding-theme-mappings.ts`** — clean theme→treatment mapping
- **`lib/permissions.ts`** — clean RBAC with longest-prefix matching
- **`lib/xero-auth.ts`** — single-integration-user pattern with cron-only refresh
- **`lib/xero.ts` → `createXeroInvoice()`** — direct Xero API integration

### Redesign
- **Sales table schema** — too many nullable columns, unclear status fields, need clean state machine
- **Pipeline stage** — should be a stored field with explicit transitions, not computed from 5+ flags
- **Inbound sync** — must capture BrandingThemeID, CurrencyCode, AccountCode, credit notes
- **Completion workflow** — needs required fields, Xero push-back, stronger validation
- **Deduplication** — need to prevent duplicate invoice numbers (5 exist currently)
- **Error tracking** — 18,115 records is a log, not an error system. Need proper log vs actionable error separation
- **Commission system** — schema exists but no logic. Needs full implementation in V2
- **Client/buyer model** — needs isExport, country, address, client classification
- **Supplier model** — needs alias/duplicate tracking, per-line-item supplier attribution

### Discard
- **`introducers` table** — 0 rows, never used. Redesign if needed in V2
- **`commission_bands` table** — 0 rows, never used
- **`sales.status` field** — redundant with `invoiceStatus`. Remove
- **`sales.shippingMethod`** — 0 populated in production
- **Legacy Make.com webhook integration** — `sendInvoiceToXero()` deprecated
- **Commented Xata SDK code** — migration artifacts
- **`legacy_*` tables** — historical reference only, not needed in V2 schema
- **`sales.depositAmount`** — 0 populated, payment plans barely used

### New (Must Build)
- **Credit notes table + sync** — track CN numbers, link to original invoices, sync from Xero
- **Structured state machine** — explicit pipeline stages with transition rules
- **Bidirectional Xero sync** — push branding theme, buy price, completion data back to Xero
- **Commission calculation engine** — rates, bands, clawbacks, payout tracking
- **Client classification** — export/domestic flag, address/country, new/existing status
- **Brand/category taxonomy** — structured enums instead of free text
- **Audit trail** — track all changes to a sale (who changed what, when)
- **Reconciliation engine** — automated matching between Xero invoices and Sales OS records
- **Exchange rate handling** — proper multi-currency support with GBP conversion
- **Test infrastructure** — zero tests currently, V2 needs at minimum integration tests for financial calculations and Xero sync
