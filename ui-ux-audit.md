# Club 19 Sales OS — UI/UX Audit

**Generated**: 2026-03-31
**Purpose**: Complete map of every screen, form, and workflow for April 1 simplification
**Type errors**: 10 (all in `.next/types` cache — codebase compiles clean)

---

## Part 1: Page and Route Map

### 1.1 Shopper-Facing Pages (The Atelier / Invoice Flow)

| Route | Title | Roles | Purpose | State | Key UI | Data |
|-------|-------|-------|---------|-------|--------|------|
| `/` | — | All | **Redirects to `/trade/new`** | Active | Redirect only | — |
| `/trade/new` | Sales Atelier | superadmin, founder, operations, shopper | 5-step invoice creation wizard | **Active — core flow** | Wizard with step navigation, forms, search boxes | R: Xero contacts, suppliers, buyers. W: sales, lineItems, Xero invoice |
| `/trade/success` | Invoice Created Successfully | All | Post-creation confirmation | Active | Success card with invoice number, amount, buyer name. Buttons: "View in Xero", "Create Another", "View in Sales OS" | R: query params (invoiceId, invoiceNumber, contact, amount, currency, url) |
| `/invoice` | — | All | Legacy redirect → `/trade/new` | Dead redirect | — | — |
| `/invoice/success` | — | All | Legacy success page | Dead | — | — |
| `/invoice/error` | — | All | Legacy error page | Dead | — | — |
| `/sales` | Sales | All | Sales list with inline editing | Active | Filterable table, month picker, shopper filter, search. Scroll indicator for wide tables. | R: sales + joins |
| `/sales/[id]` | Sale Detail (INV-XXXX) | All | Full sale detail view | Active | Financial breakdown, line items, VAT analysis, delivery section, commission. Buttons: Download PDF, Mark as Ongoing, Delete Sale. | R: sale + all joins. W: various fields |
| `/sales/[id]/complete` | Complete Sale Data | shopper + mgmt | Completion form for allocated sales | Active | Form: supplier, brand, category, buy price, branding theme, buyer type, shipping, card fees | W: sale completion fields |
| `/clients` | Clients | All | Client list | Active | Table with name, email, owner, sale count | R: buyers + sales count |
| `/clients/[id]` | Client Detail | All | Client detail + sales history | Active | Client info card, sales history table | R: buyer + sales |
| `/admin/sync` | Pending Sales | superadmin, ops, founder, shopper | Allocation triage for Xero imports | Active | Table of unallocated sales, shopper dropdown, claim button, dismiss | R/W: sales allocation |
| `/admin/sync/adopt/[invoiceId]` | Adopt Invoice | superadmin, ops, founder, admin, shopper | Adopt Xero invoice into full sale | Active | Step-by-step adoption form | R: Xero invoice. W: sales adopt |

**File**: `app/trade/new/page.tsx` (57 lines) — wraps TradeProvider + WizardShell + 5 step components

### 1.2 Management-Facing Pages

| Route | Title | Roles | Purpose | State | Key UI |
|-------|-------|-------|---------|-------|--------|
| `/dashboard` | Dashboard | All | Role-specific KPI dashboard | Active | Role-specific component (Superadmin/Founder/Operations/Shopper/Finance/Admin Dashboard). Charts, metric cards, recent activity. |
| `/suppliers` | Suppliers | superadmin, ops, admin, finance | Supplier management | Active | Table with name, status (pending/approved), sales count. Approve button for pending. |
| `/suppliers/[id]` | Supplier Detail | superadmin, ops, admin, finance | Supplier detail + sales | Active | Supplier info, linked sales |
| `/shoppers` | Shoppers | superadmin, founder, ops | Team management | Active | Table with name, active status, sales count |
| `/shoppers/[id]` | Shopper Detail | superadmin, founder, ops | Individual shopper stats | Active | Shopper info, sales history, commission summary |
| `/invoices` | Invoices | superadmin, founder, ops, admin, finance | Invoice list | Active | Invoice table with Xero sync status |
| `/finance` | Finance | superadmin, founder, ops, admin, finance | Financial overview | Active | Revenue/margin charts, summary cards |
| `/xero-health` | Xero Health | superadmin, founder, ops, admin | Xero connection status | Active | Connection status, token age, refresh info |
| `/admin` | Admin | superadmin | System administration | Active | Config panel, Xero connection, env vars |
| `/admin/deleted-sales` | Deleted Sales | superadmin | Soft-deleted records | Active | Table with restore functionality |
| `/legacy` | Legacy Trades | superadmin, ops, admin, finance | Historical trade data | Active (reference only) | Legacy data table |
| `/legacy/my-sales` | My Legacy Sales | superadmin, ops, admin, finance | Personal legacy sales | Active (reference only) | Filtered legacy table |
| `/legacy-xero` | Legacy Xero | superadmin, ops, admin, finance | Pre-migration Xero imports | Active (reference only) | Legacy import table |
| `/debug-role` | Debug Role | All | Shows current role | Dev tool | Role display |

### 1.3 Staff Portal Pages

| Route | Title | Roles | Purpose | State |
|-------|-------|-------|---------|-------|
| `/staff` | Staff Hub | superadmin, admin, finance, shopper | Redirects to role homepage | Active redirect |
| `/staff/shopper/dashboard` | Shopper Dashboard | superadmin, admin, shopper | Shopper KPIs | Active |
| `/staff/shopper/sales` | My Sales | superadmin, admin, shopper | Shopper's sales list | Active |
| `/staff/admin/dashboard` | Admin Dashboard | superadmin, admin | Admin KPIs | Active |
| `/staff/admin/sales` | Admin Sales | superadmin, admin (finance read-only) | Sales overview | Active |
| `/staff/admin/analytics` | Analytics | superadmin, admin | Analytics dashboard | Active |
| `/staff/admin/errors` | Error Tracking | superadmin, admin | System errors | Active |
| `/staff/finance/dashboard` | Finance Dashboard | superadmin, finance | Finance KPIs | Active |
| `/staff/finance/commissions` | Commissions | superadmin, finance | Commission tracking | Active |
| `/staff/finance/overdue` | Overdue | superadmin, finance | Overdue invoices | Active |
| `/staff/superadmin/tools` | System Tools | superadmin | Admin tools | Active |

### 1.4 Auth and Error Pages

| Route | Purpose | State |
|-------|---------|-------|
| `/sign-in` | Clerk sign-in | Active |
| `/sign-up` | Clerk sign-up | Active |
| `/access-denied` | Access denied fallback | Active |
| `/unauthorised` | Legacy auth error | Dead (superseded by access-denied) |

**Total: 43 pages** — 12 shopper-facing, 14 management, 11 staff portal, 3 dead/legacy, 3 auth

---

## Part 2: The Invoice Creation Wizard (Atelier)

**Total code**: ~4,057 lines (3,654 in components + 403 in TradeContext)
**Entry point**: `app/trade/new/page.tsx` → `TradeProvider` → `WizardShell` → 5 steps
**Data saving**: **All at the end** — no progressive saves. Context state persists across steps but is pure React state (no localStorage). If the browser closes or user navigates away, all data is lost.
**Keyboard**: Enter key advances to next step (unless focus is in textarea/button).
**Step navigation**: Progress bar at top with 5 circles. Completed steps show green checkmarks and are clickable. Current step has black ring. Future steps are locked (gray) unless all intermediate steps are valid. Abbreviated labels on mobile (Item, Price, Client, Tax, Review).
**Scroll**: Smooth scroll to top on step change.

### Step 0: Item Details
**File**: `components/trade/StepItemDetails.tsx` (514 lines)

| Field | Type | Required | Source |
|-------|------|----------|--------|
| Brand | Dropdown + "Other" text input | Yes | Hardcoded list: Hermès, Chanel, Dior, Louis Vuitton, etc. (16 total) + "Other" with free text |
| Category | Dropdown + "Other" text input | Yes | Hardcoded list: Bags, Watches, Shoes, RTW, Jewelry, Accessories, Other (7 total) |
| Description | Free text | Yes | Manual entry |
| Quantity | Number | Yes (default 1) | Manual entry |

- **Multi-item**: Can add multiple line items (+ button). Max 10 items.
- **Edit/Remove**: Each saved item shows edit and remove buttons. Alternating row colours.
- **Validation**: Each item must have non-empty brand, category, description + quantity > 0. "Save Item" button disabled until all fields valid.
- **Xero banner**: Yellow warning if Xero not connected (checked on mount) with "Connect Xero Account" button
- **Mobile**: Full-width inputs, large touch targets, single column layout

### Step 1: Pricing & Suppliers
**File**: `components/trade/StepPricing.tsx` (568 lines)

| Field | Type | Required | Source |
|-------|------|----------|--------|
| Supplier (per item) | Searchable text + dropdown | Yes | DB `suppliers` table via `/api/suppliers/search` (300ms debounce) |
| Buy Price (per item) | Currency input (£) | Yes (≥0) | Manual entry |
| Sell Price (per item) | Currency input (£) | Yes (>0) | Manual entry |
| Shipping Cost | Currency input (£) | No | Manual entry (global, not per-item) |

- **Per-item pricing**: Each line item has its own buy/sell price AND its own supplier
- **Supplier search**: Debounced 300ms, shows up to 40 results. "Create" button if no match → POSTs to `/api/suppliers/create`
- **NewSupplierModal**: Inline creation for detailed supplier entry
- **Live margin preview**: Blue summary card showing totals (Buy, Sell, Margin, Margin %)
- **Validation**: buyPrice ≥ 0, sellPrice > 0, supplier name not empty (per item)
- **Price sync**: Parsed as float on blur, validated on blur

### Step 2: Client & Payment
**File**: `components/trade/StepSupplierBuyer.tsx` (525 lines)

| Field | Type | Required | Source |
|-------|------|----------|--------|
| Client Name | Searchable text + Xero dropdown | Yes | **Xero contacts** via `fetchXeroBuyers()` (300ms debounce, min 3 chars) |
| Xero Contact ID | Hidden (auto-populated) | Yes | Xero API |
| Buyer Type | 2 toggle buttons | Yes | "B2B Buyer" (black) / "End Client" (yellow) |
| Payment Method | 2 radio buttons | Yes | "Card" / "Bank Transfer" |
| Delivery Country | Dropdown with optgroups | Yes | Popular countries (7) then full alphabetical (200+) |
| Referral Partner | Checkbox | No | Boolean flag only ("A referral partner is involved") |

- **Client search**: Calls `fetchXeroBuyers(query)` — Xero contacts live. "New client" badge for non-existing customers.
- **Xero required**: Buyer MUST have a Xero contact ID. If not found → warning card with link to create in Xero.
- **No inline client creation**: Must exist in Xero first
- **Xero connection check**: Calls `/api/xero/status` on mount. Yellow banner if disconnected, with "Connect Xero Account" button that opens OAuth in new tab (preserves wizard state).
- **Country**: Used for auto-deriving client location in Step 3

### 2.1 Client Selection / Creation
- **Existing client**: Searchable dropdown querying Xero contacts API (minimum 2 chars)
- **New client**: NOT supported in the wizard — must be created in Xero first, then searchable
- **Fields captured**: Name + Xero Contact ID only. No email, address, or country stored on buyer record.
- **isExport**: Not a buyer field — derived from tax scenario in Step 3
- **Xero link**: Always linked via `xeroContactId`

### 2.2 Item / Line Item Entry
- **Multi-item**: Yes, add/remove buttons
- **Per line**: Brand (dropdown), Category (dropdown), Description (free text), Quantity (number)
- **Structured fields**: Brand and Category are dropdowns from hardcoded lists (not free text)

### 2.3 Supplier Selection / Entry
- **Per-line-item** (each item can have a different supplier)
- **Searchable dropdown** from `suppliers` table
- **New supplier**: Inline creation with `pendingApproval: true` — management must approve later
- **No free text fallback**: Must select from dropdown or create new

### 2.4 Buy Price / Cost Entry
- **Per-line-item** in Step 1 (Pricing)
- **Required**: Yes (buyPrice ≥ 0)
- **Currency**: GBP default, USD/EUR available but exchange rate logic removed ("v2 is GBP-only")

### Step 3: Logistics & Tax
**File**: `components/trade/StepLogisticsTax.tsx` (679 lines) — **largest wizard step**

Questions appear conditionally — answering one reveals the next:

| Q# | Field | Type | When shown | Required |
|----|-------|------|-----------|----------|
| Q1 | Item Location | 2 toggle buttons | Always | Yes |
| Q2 | Delivery Location | 2 toggle buttons | After Q1 | Yes |
| Q3 | Purchase Type | 2 toggle buttons | If Q1=UK AND Q2 answered | Yes (UK items only) |
| Q4 | Supplier Direct Ship | 2 toggle buttons | If Q1+Q2 answered | Yes |
| Q5 | Landed Delivery | 2 toggle buttons | If Q4=yes AND not UK→UK | Conditional |

- **Auto-derivation**: Item location ← supplier country; client location ← delivery country
- **Clearing**: Answering Q1 or Q2 clears Q3+ to force re-evaluation
- **Tax scenario**: Auto-computed from all answers via `getInvoiceResult()`:
  - **UK→UK Retail**: Account 425, 20% VAT, Inclusive
  - **UK→UK Margin Scheme**: Account 424, Zero-rated, Inclusive
  - **UK→Outside (Export)**: Account 423, Zero-rated, Exclusive
  - **Outside→UK (Import)**: Account 423 (landed) or 425 (not landed)
  - **Outside→Outside**: Account 423, Zero-rated, Inclusive
- **Result display**: Green card with tax type, VAT reclaim status, Xero account code, key notes
- **Import VAT preview**: Amber box showing estimated 20% of buy price if applicable
- **Branding theme**: Automatically selected — NOT manually chosen by shopper

### 2.5 Fees and Shipping
- **Card fee (2.4%)**: Automatically calculated when payment method = "Card" (shown in Step 4 review)
- **Shipping**: Shown in review step based on shipping method selection
- **Handling fees**: No separate handling fee — bundled into implied costs
- **On invoice**: Card fee and shipping appear as separate Xero line items if applicable

### 2.6 VAT / Tax Treatment
- **Automatic**: Based on item location + client location + purchase type
- **No manual branding theme selector** — derived from tax scenario
- **Options effectively**: CN Export Sales (0% VAT), CN Margin Scheme (0% VAT), CN 20% VAT (20%)
- **Shown to user as**: Explanation text (e.g., "Zero-rated export sale. The client is outside the UK, so no UK VAT applies.")

### Step 4: Review & Create
**File**: `components/trade/StepReview.tsx` (605 lines)

**What the shopper sees**:
- Summary of all items with brand, description, buy/sell, margin
- Client name + Xero contact
- Supplier name(s)
- Tax treatment explanation
- Financial summary: Total sell, total buy, gross margin, card fees, shipping, commissionable margin
- "Create Invoice" button

### 2.7 Invoice Preview and Submission
- **Preview**: Full summary on review step — can go back to edit any previous step via step navigation
- **Additional fields on review**: Due Date (date picker, required, defaults to today), Notes (textarea, optional)
- **Submit**: "Create Xero Invoice" button → calls `POST /api/xero/invoices` with multi-line payload including: buyerContactId, lineItems array, accountCode, taxType, brandingThemeId, currency, lineAmountType, totals, paymentMethod, notes
- **Handling line item**: If card fee or shipping exists, a separate line item is added to the Xero invoice (labelled "Shipping", "Handling", or "Handling + Shipping")
- **Process**: Creates Xero invoice → on success redirects to `/trade/success` with query params
- **DB save**: Handled by the API route (creates sales record + auto-syncs Xero details with 3s delay)
- **PDF**: Not generated at creation time — available later via sale detail page download
- **Reset**: "Discard & start new deal" link resets all wizard state
- **Error**: Red box displayed if creation fails; button re-enabled for retry

### 2.8 Post-Creation
- **Landing**: `/trade/success` — shows invoice number, amount, buyer, with 3 buttons
- **Past invoices**: Visible on `/sales` page (filtered by month/shopper)
- **Edit after creation**: Only through the completion form or sale detail page (admin)
- **PDF download**: Available on `/sales/[id]` via "Download PDF" button (fetches from Xero)

---

## Part 3: The Completion Form

**File**: `app/(os)/sales/[id]/complete/CompleteDataClient.tsx` (1,123 lines)
**When triggered**: Shopper sees "Needs Your Attention" section on dashboard for sales allocated to them
**Separate from wizard**: Yes — this is for Xero-imported sales that need cost data added

### Fields on the completion form:

| Field | Type | Required | Default |
|-------|------|----------|---------|
| Supplier | Searchable dropdown | No | None |
| Brand | Dropdown | No | "Unknown" |
| Category | Dropdown | No | "Unknown" |
| Item Title | Free text | No | From Xero description |
| Buy Price | Currency input (£) | No | 0 |
| Branding Theme | Dropdown | No | None (NULL → defaults to 20% VAT) |
| Buyer Type | Radio | No | None |
| Shipping Cost | Currency input (£) | No | None |
| Card Fees | Currency input (£) | No | None |
| Deposit Amount | Currency input (£) | No | None |
| Payment Plan Notes | Free text | No | None |
| Per-line-item suppliers | Dropdown per line | No | None |

**Key observations**:
- **Buy price and branding theme appear required in the UI** (save button disabled until valid), but the API endpoint has no server-side required field enforcement
- **Branding theme is manual** — shopper must select the correct VAT treatment (prone to error, as documented in the branding theme bug)
- **Does NOT push to Xero** — branding theme, buy price, supplier all stay local
- **Recalculates**: `saleAmountExVat`, `grossMargin`, `commissionableMargin` on submit
- **Marks complete**: Sets `completedAt` + `completedBy`
- **Cannot be re-opened** once completed
- **Live margin calculation**: Updates in real-time as user types buy price
- **Completeness score**: Visual indicator (green/amber/red) showing data completeness

**UI layout**: Card-based form with collapsible sections. Completeness banner at top. Sale summary card (read-only). Form stacks vertically on mobile with full-width inputs. New supplier modal inline. Line-item supplier table with horizontal scroll on mobile.

---

## Part 4: Management / Admin Views

### Dashboard (`/dashboard`)
**File**: `app/(os)/dashboard/page.tsx` + role-specific components in `components/dashboards/`
- **Shopper dashboard** (583 lines): "Needs Your Attention" section (incomplete sales), recent sales, KPI cards (revenue, margin, sale count)
- **Operations dashboard**: Sales overview, allocation queue, sync status
- **Founder dashboard**: Revenue metrics, team performance
- **Superadmin dashboard**: System health, all metrics
- **Charts**: Recharts — revenue over time, margin over time, category breakdown

### Sales List (`/sales`)
**File**: `app/(os)/sales/SalesTableClient.tsx` (491 lines)
- Filterable table with columns: date, invoice #, client, brand, sell, buy, margin, status
- Filters: month picker, shopper selector (mgmt only — hidden for shoppers), search box
- **Role-based filtering**: Shoppers see all sales in current month (leaderboard), only own sales in previous months. Management sees everything.
- **Superadmin**: Sees deleted sales in separate muted section
- Mobile: Card view (not table) with horizontal scroll indicator
- Desktop: Full table with sticky header
- Click row → sale detail

### Sale Detail (`/sales/[id]`)
**File**: `app/(os)/sales/[id]/SaleDetailClient.tsx` (3,259 lines) — **largest component in the app**
- Sections: Item Details, Parties, Financial Breakdown, Line Items, VAT & Tax, Delivery, Commission
- Buttons: Download PDF, Mark as Ongoing, Delete Sale
- Editable fields inline (admin): brand, category, supplier, buy price, branding theme
- Warning banners for: missing buy price, missing supplier, negative margin, unconfirmed shipping

### Admin Sync / Allocation (`/admin/sync`)
**File**: `app/(os)/admin/sync/page.tsx`
- Table of unallocated Xero imports
- Per-row: shopper dropdown (management) or "Claim" button (shoppers)
- "Dismiss" button to hide irrelevant imports
- Period filter: this month, last 3 months, all time

### Adopt Workflow (`/admin/sync/adopt/[invoiceId]`)
- Fetches Xero invoice details
- Step-by-step form to fill in missing sale data (similar to completion form)
- Creates full sale record from Xero import

---

## Part 5: Mobile Experience

### Architecture
- **Responsive design**: Tailwind breakpoints (`md:` = 768px as boundary)
- **Desktop**: Fixed sidebar (256px) + top bar
- **Mobile**: Fixed top header + fixed bottom tab bar + slide-out drawer

### Mobile Navigation (`components/MobileNav.tsx` — 356 lines)
- **Top header**: Hamburger menu + Club 19 logo + user avatar (Clerk)
- **Bottom tab bar**: 4 role-specific quick-access tabs
  - Shopper: New Sale, Sales, Pending, Clients
  - Ops/Founder: Dashboard, Sales, Pending, Clients
  - Finance: Dashboard, Sales, Finance, Invoices
- **Drawer**: Full sidebar menu on hamburger tap, slides from left
- **Search**: Global search overlay (Cmd+K / tap search icon)

### Mobile-Optimised Pages
- **Wizard** (`/trade/new`): Full-width inputs, large touch targets, step-by-step progression — **designed mobile-first**
- **Sales table**: Horizontal scroll with visual scroll indicator for iPadOS Safari
- **Sale detail**: Single-column layout, stacked sections
- **Completion form**: Full-width card-based form
- **Success page**: Centred card with large tap targets

### Responsive Design Patterns
- **Breakpoints**: Mobile-first Tailwind. `md:` (768px) is the major layout shift (sidebar appears, tabs hide)
- **Grid examples**: Dashboard cards `grid-cols-1 md:grid-cols-2 lg:grid-cols-4`, client stats `grid-cols-2 md:grid-cols-5`
- **Table handling**: SalesTableClient renders card view on mobile, table with horizontal scroll on desktop
- **Text truncation**: Desktop buttons show "Create Invoice", mobile shows "New Sale" via `hidden sm:inline`
- **Touch targets**: `min-h-[44px]` throughout for accessibility
- **Safe area**: `pb-[env(safe-area-inset-bottom)]` for iPhone notch
- **Scroll lock**: Body scroll locked when drawer open

### Mobile Pain Points
- **SaleDetailClient** (3,259 lines): Very long page on mobile — lots of scrolling through sections
- **Tables on phones**: Horizontal scroll works but scroll hint only shows once
- **Completion form**: Long form — could benefit from step-based wizard on mobile instead of one long page
- **No swipe actions**: No swipe-to-dismiss or swipe-to-claim on pending sales
- **No pull-to-refresh**: Standard browser refresh only
- **Drawer overlay**: Full-screen modal pattern may feel heavy for quick navigation

---

## Part 6: UI Component Inventory

### Form Inputs
- **Text input**: Standard `<input>` with Tailwind styling
- **Currency input**: `<input type="number">` with £ prefix
- **Dropdown/Select**: Custom `<select>` with Tailwind
- **Searchable dropdown**: Custom component with filter-as-you-type (Xero contacts, suppliers)
- **Radio buttons**: Custom styled radio groups
- **Toggle**: Custom checkbox-style toggle
- **Date picker**: None used (dates auto-set)

### Layout Components
| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| OSLayout | `components/OSLayout.tsx` | 63 | Main layout wrapper (sidebar/mobile nav) |
| Sidebar | `components/Sidebar.tsx` | 172 | Desktop sidebar navigation |
| MobileNav | `components/MobileNav.tsx` | 356 | Mobile header + bottom tabs + drawer |
| OSNav | `components/OSNav.tsx` | 89 | Desktop top bar (user avatar, search, role badge) |
| WizardShell | `components/trade/WizardShell.tsx` | 299 | Wizard step navigation container |
| XeroStatusBanner | `components/XeroStatusBanner.tsx` | ~80 | Xero disconnection warning |

### Shared UI Components (`components/ui/`)
| Component | Purpose |
|-----------|---------|
| Money | Currency formatting (£X,XXX.XX) |
| StatusBadge | Coloured status pills (PAID, DRAFT, VOIDED, etc.) |
| MetricCard | KPI cards with icon, label, value |
| MonthPicker | Month/year selector for date filtering |
| SalesFilters | Combined filter bar (month, shopper, search) |
| ShopperPeriodSelector | Period + shopper combined filter |
| ViewAsSelector | Superadmin role-switching dropdown |
| PageHeader | Page title + breadcrumbs |
| PageSection | Titled section container |
| Breadcrumbs | Navigation breadcrumbs |
| LoadingBlock | Spinner/skeleton loading state |
| ErrorDisplay | Error message display |
| ErrorBlock | Error boundary fallback |
| ApproveSupplierButton | Supplier approval action |
| AuthenticityBadge | Badge component |
| TopLoadingBar | Page transition loading indicator |

### Modal Components
| Component | Purpose |
|-----------|---------|
| InvoiceSuccessModal | Post-creation confirmation (legacy — success page used instead) |
| SearchOverlay | Cmd+K global search |

### Design System
- **No component library** (no shadcn, no Radix)
- **Custom Tailwind** components throughout
- **Lucide React** icons (consistent)
- **Recharts** for charts
- **Colours**: Gray-50 background, white cards, purple accents (#7C3AED), green for success
- **Typography**: Serif headers (font-serif), sans-serif body
- **No design tokens** or theme file — all inline Tailwind classes

---

## Part 7: Current Pain Points (Code-Level)

### Coupling Issues
- **TradeContext** (403 lines) holds ALL wizard state — removing a step requires touching this file
- **WizardShell** (299 lines) has hardcoded step count (5) and step labels
- **SaleDetailClient** (3,259 lines) is monolithic — covers display, editing, actions, financial calculations, VAT analysis all in one file
- **StepLogisticsTax** (679 lines) handles complex tax scenario derivation that's tightly coupled to the UI

### Modularity
- **Wizard IS modular**: Each step is a separate component. Steps can be reordered, hidden, or replaced independently. The `WizardShell` renders step labels and navigation; step components are rendered by index in the page file.
- **Steps are hidden, not unmounted**: All 5 steps render simultaneously (via `display: none`), which means all steps' state is preserved but initial load is heavier.

### Hardcoded Values
| Value | Location | Should be configurable |
|-------|----------|----------------------|
| Card fee 2.4% | `lib/implied-costs.ts:58` + `components/trade/StepReview.tsx:75` | Yes — duplicated! |
| Branding theme UUIDs | `lib/branding-theme-mappings.ts` | Move to env vars |
| Brand list | `StepItemDetails.tsx` (hardcoded array) | Move to DB or config |
| Category list | `StepItemDetails.tsx` (hardcoded array) | Move to DB or config |
| Country list | `StepSupplierBuyer.tsx` | Keep as is (standard) |
| Shipping lookup table | `lib/implied-costs.ts` | Move to config |
| Wizard step count | `WizardShell.tsx` (hardcoded 5) | Derive from children |

### No Feature Flags
- Zero feature flags in the codebase
- No conditional rendering based on environment
- To hide features, must comment out or remove code

### Large Files
| File | Lines | Concern |
|------|-------|---------|
| SaleDetailClient.tsx | 3,259 | Should be split into sub-components |
| CompleteDataClient.tsx | 1,123 | Large but single-purpose |
| StepLogisticsTax.tsx | 679 | Complex tax logic embedded in UI |
| StepReview.tsx | 605 | Fee calculation logic embedded in UI |
| StepPricing.tsx | 568 | Reasonable |
| StepSupplierBuyer.tsx | 525 | Reasonable |
| StepItemDetails.tsx | 514 | Reasonable |
| SalesTableClient.tsx | 491 | Reasonable |
| TradeContext.tsx | 403 | State management — appropriate size |

---

## Simplification Candidates

### Keep — Essential for "create invoice + log sale" core flow

| Component/Page | Why |
|----------------|-----|
| `/trade/new` wizard (all 5 steps) | **THE core flow** — creates Xero invoice + logs sale |
| `/trade/success` | Post-creation confirmation |
| `TradeContext.tsx` | Wizard state management |
| `WizardShell.tsx` | Wizard navigation |
| `StepItemDetails.tsx` | Item entry |
| `StepPricing.tsx` | Buy/sell price entry |
| `StepSupplierBuyer.tsx` | Supplier + client selection |
| `StepLogisticsTax.tsx` | VAT/tax determination |
| `StepReview.tsx` | Review + submit |
| `/sales` + `SalesTableClient.tsx` | Shoppers need to see their past sales |
| `/sales/[id]` + `SaleDetailClient.tsx` | View individual sale + download PDF |
| `/admin/sync` | Allocation triage (operations need this) |
| `/sign-in` | Auth |
| `MobileNav.tsx` | Mobile navigation |
| `Sidebar.tsx` + `OSLayout.tsx` | Desktop layout |
| `XeroStatusBanner.tsx` | Xero connection warning |
| `lib/economics.ts` | Financial calculations |
| `lib/calculations/vat.ts` | VAT calculations |
| `lib/xero-auth.ts` + `lib/xero.ts` | Xero integration |
| Cron jobs (all 3) | Token refresh, invoice sync, payment sync |

### Hide — Works but should be deferred to reduce complexity

| Component/Page | Why defer |
|----------------|----------|
| `/dashboard` (all role dashboards) | Analytics can come later — shoppers just need the wizard |
| `/finance` | Not needed until commission is properly implemented |
| `/invoices` | Duplicates sales view |
| `/shoppers` + `/shoppers/[id]` | Team management — not needed for initial shopper adoption |
| `/clients` + `/clients/[id]` | Client management can be deferred |
| `/suppliers` + `/suppliers/[id]` | Supplier management can be deferred (approval still needed) |
| `/xero-health` | Admin tool — hide from nav but keep accessible |
| `/admin` page | Superadmin tool — keep but hide from nav |
| `/admin/deleted-sales` | Superadmin tool — keep but hide from nav |
| `/admin/sync/adopt` | Adopt workflow — hide unless specifically needed |
| All `/staff/*` pages (11 pages) | Parallel dashboard system — consolidate later |
| `ViewAsSelector` | Dev/debug tool |
| `SearchOverlay` | Nice-to-have, not essential |
| Commission fields on sale detail | Not implemented — showing empty fields is confusing |
| Introducer toggle in wizard | Never used (0 rows) — just adds confusion |

### Remove — Dead code, broken features, half-built screens

| Component/Page | Why remove |
|----------------|-----------|
| `/invoice` (redirect) | Dead — superseded by `/trade/new` |
| `/invoice/success` + `/invoice/error` | Dead legacy pages |
| `/unauthorised` | Dead — replaced by `/access-denied` |
| `/debug-role` | Dev tool — remove from production |
| `InvoiceFlow.tsx` | Legacy component — replaced by wizard |
| `InvoiceSuccessModal.tsx` | Legacy — success page used instead |
| `components/legacy/*` | Legacy dashboard components |
| `components/xero-legacy/*` | Legacy Xero dashboard components |
| `lib/deal-lifecycle.ts` | ~130 lines of commented Xata code |
| `lib/xeroLegacyData.ts` | ~70 lines of commented Xata code |
| All commented `// ORIGINAL XATA:` blocks | ~500 lines of migration artifacts |
| `/api/backfill-source`, `/api/migrate/*`, `/api/cleanup-demo`, `/api/analyze-legacy` | One-time migration utilities |
| Duplicate "Mary Clair" shopper record | Data cleanup |

### Fix — Close to working but bugs blocking adoption

| Issue | Impact | Fix |
|-------|--------|-----|
| **Completion form has no required fields** | Shoppers can "complete" without filling anything | Make supplier, buy price, branding theme required |
| **Completion doesn't push branding theme to Xero** | Xero and Sales OS diverge on VAT treatment | Push branding theme + account code back to Xero on complete |
| **94.6% of sales have NULL branding theme** | VAT calculations default to 20% for all imports | Capture `BrandingThemeID` in sync-invoices cron |
| **Card fee hardcoded in 2 places** | Maintenance risk — update one, miss the other | Centralise to single constant |
| **No draft saving in wizard** | Lose all data if browser closes mid-flow | Add localStorage draft persistence |
| **SaleDetailClient is 3,259 lines** | Hard to maintain, slow to load | Split into sub-components (Financial, LineItems, VAT, Delivery, Commission) |
| **5 duplicate invoice numbers** | Data integrity issue | Add dedup by invoice number in sync, not just Xero GUID |
