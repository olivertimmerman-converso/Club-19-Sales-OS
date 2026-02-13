# Club 19 Sales OS

Internal sales operations platform for Club 19 London, built by Cadenza. Manages invoicing, client relationships, and Xero integration.

Two main components:
- **Sales Atelier** — Mobile-friendly invoice creation wizard used by shoppers day-to-day.
- **Sales OS** — Comprehensive analytics dashboards for management and operations.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Clerk (roles stored in `publicMetadata.staffRole`)
- **Hosting**: Vercel Pro
- **Integrations**: Xero (invoicing, payments)

## Critical Development Rules

These patterns were established to fix recurring bugs. Do not deviate from them.

1. **Shopper lookup**: Always use `clerkUserId` first when looking up shoppers, fall back to name.
2. **Soft deletion**: Uses `deleted_at` timestamps — filter with `isNull(sales.deletedAt)`. Never hard delete.
3. **Margin/VAT calculations are centralised**: Do not duplicate calculation logic. Use the single source of truth functions.
4. **Source field**: The `source` field distinguishes `atelier` (Sales OS created) from `xero_import`. Respect this distinction — Xero imports have incomplete data by design.
5. **Export sales**: Export sales use zero VAT. This is a core business rule that affects invoice creation.
6. **Xero token refresh**: Runs aggressively (every 4 hours + on deploy). The system must be always-connected without requiring manual monitoring.

## Key Directories

```
app/(os)/          # Main OS pages (dashboard, sales, clients, etc.)
app/api/           # API routes
components/        # React components
  dashboards/      # Role-specific dashboard components
  ui/              # Shared UI components
db/                # Drizzle schema and database connection
lib/               # Shared utilities
  permissions.ts   # SINGLE SOURCE OF TRUTH for all access control
  sidebarConfig.ts # Navigation items (derives from permissions.ts)
  getUserRole.ts   # Server-side role resolution from Clerk
```

## Role-Based Access Control

Six roles defined in `lib/permissions.ts`:
- `superadmin` — Full system access (Oliver)
- `founder` — Business operations & Xero (Sophie)
- `operations` — Operations manager (Alys)
- `admin` — Administrator (currently unused)
- `finance` — Financial data access
- `shopper` — Sales team (Hope, MC)

All route permissions are defined in `ROUTE_PERMISSIONS` in permissions.ts. The sidebar automatically filters based on `canAccessRoute()`.

## Database Schema

Core tables in `db/schema.ts`:
- `sales` — Sale records with Xero invoice links
- `buyers` — Clients with `ownerId` linking to shopper
- `shoppers` — Sales team members with `clerkUserId` for auth linking
- `suppliers` — Supplier records with approval workflow

## Shopper Data Filtering

- **Sales page**: Current month shows all sales (team leaderboard), previous months show only shopper's own sales.
- **Clients page**: Shoppers only see clients where they are the assigned `owner`.

## View As Feature

Superadmin can preview other roles via `?viewAs=` URL param:
- `?viewAs=founder` — Founder view
- `?viewAs=operations` — Operations view
- `?viewAs=shopper-{slug}` — Specific shopper's view

Clicking the Club 19 logo exits View As mode.

## Xero Integration

- `XeroStatusBanner` shows connection status in header.
- Invoices sync bidirectionally between Sales OS and Xero.
- Adopt workflow imports Xero-created invoices into Sales OS.

### Automated Sync (Cron Jobs)

Three cron jobs in `vercel.json`:
- **Token refresh** (`/api/cron/refresh-xero`): Every 10 minutes
- **Invoice sync** (`/api/cron/sync-invoices`): Every 30 minutes — syncs new invoices from Xero
- **Payment sync** (`/api/cron/sync-payments`): Every hour — updates payment statuses

## Sale Completion Workflow

When invoices are created in Xero directly, they're imported with `needs_allocation: true`.

**Management Flow:**
1. Management views unallocated invoices at `/admin/sync`
2. Assigns each invoice to a shopper via dropdown
3. System records `allocatedBy` and `allocatedAt`

**Shopper Flow:**
1. Shopper sees "Needs Your Attention" section on their dashboard
2. Shows sales assigned to them that need cost details (buy price, supplier)
3. Shopper clicks through to complete the sale details
4. System records `completedAt` and `completedBy` when done

## Common Commands

```bash
npm run dev          # Local development
npm run build        # Production build
npx vercel --prod    # Deploy to production
npx tsc --noEmit     # Type check
```
