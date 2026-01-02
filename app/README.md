# App Directory Structure

Next.js 15 App Router structure for Club 19 Sales OS.

## Overview

This directory contains all routes, API endpoints, and page components using Next.js App Router conventions.

## Route Organization

### `(os)/` - Main Application Routes

**Protected by authentication and RBAC middleware.**

- `dashboard/` - Role-specific dashboard home page
- `sales/` - Sales list, detail, and management
  - `[id]/` - Individual sale detail page
  - `[id]/edit/` - Edit sale form
- `clients/` - Buyer management
- `suppliers/` - Supplier management
- `shoppers/` - Shopper management (admin only)
- `invoices/` - Xero invoice tracking
- `finance/` - Finance dashboard and commission management
- `legacy/` - Legacy system data viewer
  - `my-sales/` - Individual legacy sales view

**Access:** All authenticated users (filtered by role via middleware).

### `trade/` - Sales Atelier (Deal Studio)

Multi-step wizard for creating new sales.

- `new/` - Deal creation wizard
  - Step 1: Supplier & Buyer selection
  - Step 2: Item details and pricing
  - Step 3: VAT and account code selection
  - Step 4: Review and submit
- `success/` - Confirmation page after deal creation

**Access:** Operations, Founder, Superadmin only.

### `staff/` - Staff Portal

Role-specific dashboards and tools.

- `admin/` - Admin portal
  - `sales/` - Admin sales views
  - `shoppers/` - Shopper management
  - `performance/` - Performance analytics
- `finance/` - Finance portal
  - `commissions/` - Commission payment management
  - `overdue/` - Overdue invoice tracking
- `shopper/` - Shopper personal dashboard
  - Individual sales view
  - Commission tracker

**Access:** Filtered by role - staff can only access their permitted portal.

### `api/` - API Routes

#### Sales Operations
- `sales/` - Sales queries and updates
  - `GET /api/sales` - List sales (with filters)
  - `GET /api/sales/[id]` - Fetch single sale
  - `PATCH /api/sales/[id]` - Update sale
  - `POST /api/sales/allocate` - Allocate unassigned invoice to shopper
  - `GET /api/sales/summary` - Aggregate sales stats

#### Xero Integration
- `xero/oauth/` - OAuth 2.0 flow
  - `GET /api/xero/oauth/authorize` - Initiate OAuth
  - `GET /api/xero/oauth/callback` - Handle callback
- `xero/webhooks/` - Xero webhook receiver
  - `POST /api/xero/webhooks` - Process invoice updates
- `xero/contacts/` - Contact search
  - `GET /api/xero/contacts/suppliers` - Search suppliers
  - `GET /api/xero/contacts/buyers` - Search buyers
- `sync/xero-invoices/` - Manual invoice sync
  - `POST /api/sync/xero-invoices` - Sync all invoices from Xero

#### Finance Operations
- `finance/` - Financial management
  - `POST /api/finance/lock-commissions` - Lock sales for commission
  - `POST /api/finance/process-payment` - Mark commission paid
  - `POST /api/finance/daily-maintenance` - Automated status sync

#### Trade Operations
- `trade/` - Deal creation
  - `POST /api/trade/create` - Create new sale + invoice

#### Staff Management
- `shoppers/` - Shopper CRUD
  - `GET /api/shoppers` - List shoppers
  - `POST /api/shoppers` - Create shopper

#### Analytics
- `export/` - Data export
  - `GET /api/export/monthly-sales` - CSV export for accounting

### `sign-in/` & `sign-up/`

Clerk authentication pages.

**Access:** Public routes.

## File Conventions

### `page.tsx`
Route component (page). Can be Server or Client Component.

```typescript
// Server Component (default)
export default async function SalesPage() {
  const sales = await fetchSales();
  return <SalesList sales={sales} />;
}
```

### `route.ts`
API route handler.

```typescript
export async function GET(request: NextRequest) {
  return NextResponse.json({ data: [] });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ success: true });
}
```

### `layout.tsx`
Shared layout for route group. Persists across navigation.

```typescript
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

### `loading.tsx`
Loading UI (shown while page loads).

### `error.tsx`
Error boundary for route segment.

## Route Groups

### `(os)` - Grouped Routes
Parentheses create a route group **without adding URL segments**. Used for:
- Shared layouts
- Organizational clarity
- Middleware targeting

Example: `app/(os)/sales/page.tsx` → URL: `/sales` (not `/os/sales`)

## Server vs Client Components

### Server Components (Default)
- No `'use client'` directive
- Can access database directly
- Cannot use React hooks (useState, useEffect)
- Better performance (no JavaScript shipped)

**Use for:** Pages, layouts, data fetching

### Client Components
- Require `'use client'` directive
- Can use React hooks and browser APIs
- Interactive components

**Use for:** Forms, interactive widgets, real-time updates

## Data Fetching Patterns

### Server Component
```typescript
import { getXataClient } from '@/src/xata';

export default async function SalesPage() {
  const xata = getXataClient();
  const sales = await xata.db.Sales.getMany();

  return <SalesList sales={sales} />;
}
```

### API Route
```typescript
export async function GET() {
  const xata = getXataClient();
  const sales = await xata.db.Sales.getMany();

  return NextResponse.json({ sales });
}
```

### Client Component (via API)
```typescript
'use client';
import { useState, useEffect } from 'react';

export default function SalesList() {
  const [sales, setSales] = useState([]);

  useEffect(() => {
    fetch('/api/sales')
      .then(res => res.json())
      .then(data => setSales(data.sales));
  }, []);

  return <div>{/* render sales */}</div>;
}
```

## Authentication & RBAC

All routes under `(os)/`, `trade/`, and `staff/` are protected by:

1. **middleware.ts** - Clerk authentication + role-based routing
2. **Route-level checks** - Additional permission verification in components

Example protected page:
```typescript
import { getUserRole } from '@/lib/getUserRole';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const role = await getUserRole();

  if (!['superadmin', 'admin'].includes(role || '')) {
    redirect('/dashboard');
  }

  // Render admin page
}
```

## Metadata & SEO

Define page metadata:

```typescript
export const metadata = {
  title: 'Sales Dashboard | Club 19',
  description: 'View and manage your sales',
};
```

## Dynamic Routes

Use `[param]` for dynamic segments:

- `sales/[id]/page.tsx` - Matches `/sales/123`
- `sales/[id]/edit/page.tsx` - Matches `/sales/123/edit`

Access params:
```typescript
export default async function SalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Use id
}
```

## Best Practices

1. **Use Server Components by default** - Only add `'use client'` when needed
2. **Colocate related routes** - Keep related pages in same directory
3. **API routes for mutations** - Use for POST/PUT/DELETE operations
4. **Validate route params** - Always validate dynamic route parameters
5. **Handle errors gracefully** - Use error.tsx boundaries
6. **Optimize images** - Use Next.js Image component
7. **Avoid client-side data fetching** - Prefer Server Components for data

---

For more details, see:
- [Next.js App Router Docs](https://nextjs.org/docs/app)
- Main [README.md](../README.md)
- [lib/README.md](../lib/README.md)
