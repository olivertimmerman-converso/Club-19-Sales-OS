# Club 19 Sales OS - Architecture Documentation

## System Overview

Club 19 Sales OS is a full-stack Next.js 15 application built using the App Router pattern with Server Components by default. The application manages the complete sales lifecycle for luxury goods trading, from deal creation through invoice generation to commission payment.

## Tech Stack

### Frontend
- **Next.js 15**: React framework with App Router
- **React 19**: UI library with Server Components
- **Tailwind CSS**: Utility-first CSS framework
- **TypeScript**: Type-safe JavaScript with strict mode

### Backend
- **Next.js API Routes**: Serverless API endpoints
- **Clerk**: Authentication and user management
- **Xata**: PostgreSQL-based serverless database
- **Xero API**: Accounting integration (OAuth 2.0)

### Infrastructure
- **Vercel**: Hosting and deployment
- **Make.com**: Webhook automation
- **GitHub**: Version control

## Folder Structure

```
club19-sales-os/
├── app/                          # Next.js App Router
│   ├── (os)/                     # Main OS routes (protected)
│   │   ├── dashboard/            # Main dashboard (role-specific)
│   │   ├── sales/                # Sales list and detail pages
│   │   │   ├── page.tsx          # Sales list with filtering
│   │   │   └── [id]/page.tsx    # Individual sale detail
│   │   ├── clients/              # Client (buyer) management
│   │   │   ├── page.tsx          # Clients list with stats
│   │   │   └── [id]/page.tsx    # Client detail and history
│   │   ├── suppliers/            # Supplier management
│   │   │   ├── page.tsx          # Suppliers list with stats
│   │   │   └── [id]/page.tsx    # Supplier detail and history
│   │   ├── shoppers/             # Shopper management
│   │   │   ├── page.tsx          # Shoppers list
│   │   │   └── [id]/page.tsx    # Shopper profile
│   │   ├── invoices/             # Xero invoice tracking
│   │   │   └── page.tsx          # Invoice list with statuses
│   │   ├── finance/              # Finance dashboard
│   │   │   └── page.tsx          # Financial metrics
│   │   └── legacy/               # Legacy system data
│   │       ├── page.tsx          # All legacy sales
│   │       └── my-sales/page.tsx # Shopper's legacy sales
│   ├── trade/                    # Deal Studio (Sales Atelier)
│   │   ├── new/                  # Multi-step wizard
│   │   │   └── page.tsx          # Deal creation form
│   │   └── success/              # Success confirmation
│   │       └── page.tsx
│   ├── staff/                    # Staff portal
│   │   ├── page.tsx              # Role-based redirect
│   │   ├── shopper/              # Shopper views
│   │   │   ├── dashboard/        # Personal dashboard
│   │   │   └── sales/            # Personal sales list
│   │   ├── admin/                # Admin tools
│   │   │   ├── dashboard/        # Admin dashboard
│   │   │   ├── sales/            # All sales management
│   │   │   ├── analytics/        # Business analytics
│   │   │   └── errors/           # Error tracking
│   │   ├── finance/              # Finance tools
│   │   │   ├── dashboard/        # Finance dashboard
│   │   │   ├── commissions/      # Commission payments
│   │   │   └── overdue/          # Overdue invoices
│   │   └── superadmin/           # Superadmin tools
│   │       └── tools/            # System tools
│   ├── api/                      # API routes
│   │   ├── finance/              # Financial operations
│   │   │   ├── pay-commissions/  # Process commission payments
│   │   │   ├── lock-paid-sales/  # Lock sales for commission
│   │   │   ├── daily-maintenance/ # Sync invoice statuses
│   │   │   └── overdue-sales/    # Get overdue invoices
│   │   ├── sales/                # Sales queries
│   │   │   ├── summary/          # Sales summary stats
│   │   │   └── analytics/        # Analytics endpoints
│   │   ├── xero/                 # Xero integration
│   │   │   ├── oauth/            # OAuth flow
│   │   │   │   ├── authorize/    # Start OAuth
│   │   │   │   └── callback/     # OAuth callback
│   │   │   ├── webhooks/         # Xero webhooks
│   │   │   ├── invoices/         # Invoice operations
│   │   │   ├── contacts/         # Contact search
│   │   │   ├── status/           # Connection status
│   │   │   └── sync-payments/    # Payment sync
│   │   ├── shoppers/             # Shopper management
│   │   │   └── create/           # Create new shopper
│   │   ├── suppliers/            # Supplier operations
│   │   │   ├── create/           # Create supplier
│   │   │   └── search/           # Search suppliers
│   │   ├── trade/                # Deal operations
│   │   │   └── create/           # Create new deal
│   │   ├── errors/               # Error tracking
│   │   │   ├── route.ts          # List errors
│   │   │   ├── groups/           # Group similar errors
│   │   │   └── [id]/resolve/     # Mark error resolved
│   │   └── export/               # Data export
│   │       └── monthly-sales/    # Export monthly sales
│   ├── sign-in/[[...sign-in]]/   # Clerk sign-in page
│   ├── sign-up/[[...sign-up]]/   # Clerk sign-up page
│   ├── access-denied/            # Access denied page
│   ├── unauthorised/             # Unauthorised page
│   ├── layout.tsx                # Root layout with Clerk
│   └── globals.css               # Global styles
├── components/
│   ├── dashboards/               # Role-specific dashboards
│   │   ├── SuperadminDashboard.tsx
│   │   ├── FounderDashboard.tsx
│   │   ├── OperationsDashboard.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── FinanceDashboard.tsx
│   │   └── ShopperDashboard.tsx
│   ├── ui/                       # Reusable UI components
│   │   ├── MonthPicker.tsx       # Month filter component
│   │   ├── ViewAsSelector.tsx    # Role switcher (superadmin)
│   │   └── ...
│   └── forms/                    # Form components
│       └── ...
├── lib/
│   ├── permissions.ts            # RBAC single source of truth
│   ├── getUserRole.ts            # Resolve user role from Clerk
│   ├── getCurrentUser.ts         # Get current user details
│   ├── assertAccess.ts           # Access control assertions
│   ├── sidebarConfig.ts          # Navigation configuration
│   ├── xata-sales.ts             # Sales database operations
│   ├── dateUtils.ts              # Date utility functions
│   ├── constants.ts              # Application constants
│   ├── env.ts                    # Environment variable validation
│   ├── rate-limit.ts             # API rate limiting
│   ├── xero/                     # Xero integration
│   │   ├── client.ts             # Xero API client
│   │   ├── tokens.ts             # Token management
│   │   └── types.ts              # Xero type definitions
│   └── utils/                    # Utility functions
│       ├── format.ts             # Formatters (currency, date)
│       └── ...
├── middleware.ts                 # Auth + RBAC middleware
├── src/
│   └── xata.ts                   # Xata database client
├── scripts/                      # Development scripts
├── public/                       # Static assets
└── .env.local.example            # Environment variable template
```

## Authentication Flow

### 1. Sign In
```
User → Clerk Sign In → Clerk Auth → Set Session Cookie → Redirect to App
```

### 2. Role Resolution
```
Middleware → auth() → Get User → Extract publicMetadata.staffRole → Default to "shopper" if missing
```

### 3. Route Protection
```
User Requests Route → Middleware → Check canAccessRoute(role, pathname) → Grant/Deny
```

### 4. Homepage Redirect
```
User Visits "/" → Middleware → getHomepageForRole(role) → Redirect to Role-Specific Dashboard
```

## Data Flow

### Deal Creation Flow

```
┌─────────────┐
│ User (Trade)│
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Sales Atelier   │  Multi-step wizard
│ /trade/new      │  (Deal Studio)
└──────┬──────────┘
       │ Submit
       ▼
┌─────────────────┐
│ POST /api/trade │  Validate + Create
│ /create         │  Sale record in Xata
└──────┬──────────┘
       │
       ├─────────────────┐
       │                 │
       ▼                 ▼
┌─────────────┐    ┌──────────────┐
│ Make.com    │    │ Xata         │
│ Webhook     │    │ Sales table  │
└──────┬──────┘    └──────────────┘
       │
       ▼
┌─────────────┐
│ Xero API    │  Create invoice
│ Invoice     │  (if webhook configured)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Xero        │  Invoice status
│ Webhook     │  change event
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ POST /api/xero  │  Update Sale record
│ /webhooks       │  with invoice details
└──────┬──────────┘
       │
       ▼
┌─────────────┐
│ Xata        │  Sale updated:
│ Sales table │  - xero_invoice_number
│             │  - invoice_status
└─────────────┘  - payment_received_date
```

### Commission Payment Flow

```
┌─────────────────┐
│ Xero Invoice    │  Invoice marked PAID
│ Paid            │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Daily           │  Syncs invoice
│ Maintenance     │  statuses from Xero
│ (Cron/Manual)   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Finance         │  Finance staff
│ Dashboard       │  reviews paid sales
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Lock Paid Sales │  Marks sales as
│ Action          │  "locked" for commission
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Calculate       │  commission =
│ Commission      │  gross_margin × rate
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Process         │  Updates Sale with
│ Payments        │  commission_paid_date
└─────────────────┘
```

### Authentication & Authorization

```
┌─────────────┐
│ Browser     │
└──────┬──────┘
       │ Request /sales
       ▼
┌─────────────────┐
│ Middleware.ts   │
│                 │
│ 1. auth()       │  Get Clerk session
│ 2. Get role     │  publicMetadata.staffRole
│ 3. Check access │  canAccessRoute(role, "/sales")
└──────┬──────────┘
       │
       ├─────────────┐
       │ Authorized  │ Denied
       ▼             ▼
┌─────────────┐ ┌──────────────┐
│ Render      │ │ Redirect to  │
│ Page        │ │ /unauthorised│
└─────────────┘ └──────────────┘
```

## Key Integrations

### Xero Integration

**Purpose**: Accounting system integration for invoice management

**Components**:
1. **OAuth 2.0 Flow**: Secure authentication with Xero API
2. **Token Management**: Auto-refresh access tokens (stored in Clerk `privateMetadata`)
3. **Invoice Creation**: Automated invoice generation via Make.com
4. **Webhooks**: Real-time invoice status updates
5. **Contact Search**: Real-time search for buyers/suppliers

**Key Files**:
- `lib/xero/client.ts` - Xero API client
- `lib/xero/tokens.ts` - Token refresh logic
- `app/api/xero/` - All Xero API routes

**Token Storage**:
```typescript
// Stored in Clerk user.privateMetadata (encrypted)
{
  xeroTokens: {
    access_token: string,
    refresh_token: string,
    expires_at: number,
    tenant_id: string
  }
}
```

### Make.com Webhooks

**Purpose**: Automation bridge between Sales OS and Xero

**Webhook Endpoints**:
1. **Trade Creation**: `MAKE_TRADE_WEBHOOK_URL`
   - Receives deal data from Sales Atelier
   - Creates invoice in Xero
   - Returns invoice details

**Data Flow**:
```
Sales OS → Make.com → Xero API → Make.com → Sales OS
```

### Xata Database

**Purpose**: Serverless PostgreSQL database for all application data

**Key Tables**:
- `Sales` - All sales records
- `Buyers` - Customer/client data
- `Suppliers` - Supplier information
- `Shoppers` - Sales team members
- `LegacySales` - Historical data from old system
- `Errors` - Application error tracking

**Features**:
- TypeScript SDK with type safety
- Branching (main, staging, etc.)
- Full-text search
- File attachments
- Built-in pagination

**Query Pattern**:
```typescript
// Example: Get recent sales
const sales = await xata.db.Sales
  .select(['*', 'buyer.*', 'shopper.*'])
  .filter({ sale_date: { $ge: startDate } })
  .sort('sale_date', 'desc')
  .getMany({ pagination: { size: 200 } });
```

## Security Architecture

### Authentication Layers

1. **Clerk Session**: All requests must have valid Clerk session
2. **Role Check**: Middleware checks `staffRole` in `publicMetadata`
3. **Route Protection**: `canAccessRoute(role, pathname)` enforces RBAC
4. **Page-Level Assertions**: Critical pages use `assertAccess()` as defense-in-depth

### API Security

1. **Authentication Required**: All API routes check `auth()` for valid user
2. **Role-Based Authorization**: Operations routes check for admin/finance/superadmin roles
3. **Rate Limiting**: High-value endpoints have rate limits (IP-based)
4. **Input Validation**: Zod schemas validate all user input
5. **Webhook Verification**: Xero webhooks verify HMAC-SHA256 signatures

### Data Security

1. **Shopper Data Filtering**: Shoppers see only their own sales
2. **Read-Only Access**: Finance can view but not edit admin sales
3. **SQL Injection Protection**: Xata ORM uses parameterized queries
4. **XSS Protection**: React escapes all output by default
5. **Token Encryption**: Xero tokens stored in encrypted Clerk `privateMetadata`

## Performance Optimizations

### Query Optimization

- **Pagination Limits**: All queries use `.getMany({ pagination: { size: N } })` instead of `.getAll()`
- **Selective Fields**: Only fetch required fields with `.select([])`
- **Indexed Queries**: Sort by indexed fields (`sale_date`, `id`)

### Component Architecture

- **Server Components**: Default for all pages (no client-side JS unless needed)
- **Client Components**: Only interactive components (`'use client'`)
- **Lazy Loading**: Heavy components load on-demand

### Caching Strategy

- **Next.js ISR**: Static generation with revalidation for public pages
- **Force Dynamic**: Protected pages use `export const dynamic = "force-dynamic"`
- **Xero Token Cache**: Access tokens cached in Clerk metadata (1-hour expiry)

## Error Handling

### Application Errors

All errors are logged to the `Errors` table in Xata:

```typescript
{
  error_type: "API_ERROR" | "AUTH_ERROR" | "DATABASE_ERROR" | "XERO_ERROR",
  message: string,
  stack: string,
  user_email: string,
  route: string,
  timestamp: Date
}
```

### Error UI

- **Try-Catch Blocks**: All async operations wrapped
- **User-Friendly Messages**: Generic errors shown to users
- **Error Details**: Expandable details for debugging (dev mode only)
- **Error Tracking Dashboard**: `/staff/admin/errors` for admins

### Error Recovery

- **Retry Logic**: Failed Xero API calls auto-retry with exponential backoff
- **Graceful Degradation**: Features degrade gracefully (e.g., Xero disconnected)
- **Manual Intervention**: Admins can manually resolve errors via dashboard

## Deployment

### Vercel Configuration

- **Framework Preset**: Next.js
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install`
- **Node Version**: 18.x

### Environment Variables

All secrets configured in Vercel dashboard:
- Clerk keys (production)
- Xata keys (production database)
- Xero OAuth credentials (production app)
- Make.com webhook URLs

### CI/CD Pipeline

1. **Push to main** → Vercel auto-deploys
2. **Build Process** → Type check + Build Next.js
3. **Environment Injection** → Vercel injects secrets
4. **Deploy** → Atomic deployment (zero downtime)
5. **Domain** → Custom domain with SSL

## Monitoring & Observability

### Logging

- **Console Logs**: Development debugging
- **Error Table**: All application errors logged to Xata
- **Clerk Logs**: Auth events tracked in Clerk dashboard
- **Xero Webhooks**: Webhook events logged for audit trail

### Metrics

- **Sales Dashboards**: Real-time business metrics
- **Error Dashboard**: Error frequency and patterns
- **Xero Status**: OAuth connection health check

## Development Workflow

### Local Development

1. Clone repository
2. Copy `.env.local.example` to `.env.local`
3. Configure test Clerk/Xata/Xero credentials
4. Run `npm install`
5. Run `npm run dev`
6. Access `http://localhost:3000`

### Testing Roles

Use Clerk Dashboard to set `publicMetadata.staffRole` for test users:
- `superadmin` - Full access
- `shopper` - Restricted access (good for testing filters)

### Database Changes

1. Update schema in Xata dashboard
2. Run `npx xata codegen` to regenerate types
3. Update queries in code
4. Test locally before deploying

## Future Improvements

### Planned Features
- Full pagination UI (currently just limits)
- Advanced analytics and reporting
- Email notifications for commission payments
- Bulk import tools for legacy data
- Mobile app (React Native)

### Technical Debt
- Add comprehensive unit tests
- Implement E2E tests with Playwright
- Add Sentry for error monitoring
- Implement background job queue for long-running tasks
- Add Redis for caching (currently none)

---

**Last Updated**: 2025-12-09
**Maintainer**: oliver@converso.uk
