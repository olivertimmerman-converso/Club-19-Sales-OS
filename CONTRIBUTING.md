# Contributing to Club 19 Sales OS

Thank you for contributing to Club 19 Sales OS! This guide will help you get started.

## Tech Stack

- **Framework**: Next.js 15 (App Router, Server Components)
- **Language**: TypeScript (strict mode enabled)
- **Styling**: Tailwind CSS
- **Database**: Xata (PostgreSQL-based serverless)
- **Authentication**: Clerk
- **API Integration**: Xero OAuth 2.0

## Development Setup

### Prerequisites

- Node.js 18.17+ and npm 9.0+
- Clerk account (authentication)
- Xata account (database)
- Xero Developer account (API integration)

### Getting Started

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd Club-19-Sales-OS
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

3. **Run development server:**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

4. **Verify TypeScript:**
   ```bash
   npx tsc --noEmit
   ```

## Code Style

### TypeScript

- **Strict mode enabled** - No `any` types except in catch blocks
- **Use proper types** from `@/src/xata` for database records
- **Export types** for reusable interfaces
- **Prefer `unknown`** over `any` for truly unknown values

```typescript
// Good
import { SalesRecord } from '@/src/xata';
const sale: SalesRecord = await xata.db.Sales.getFirst();

// Bad
const sale: any = await xata.db.Sales.getFirst();
```

### Components

- **Server Components by default** - Only add `'use client'` when necessary
- **Use `memo` and `useMemo`** for expensive calculations
- **Colocate related files** in the same directory

```typescript
// Server Component (default)
export default async function SalesPage() {
  const sales = await fetchSales();
  return <SalesList sales={sales} />;
}

// Client Component (when needed)
'use client';
import { useState } from 'react';

export default function InteractiveForm() {
  const [data, setData] = useState({});
  // ...
}
```

### Styling

- **Tailwind CSS only** - No inline styles except for dynamic values
- **Use `cn()` utility** for conditional classes
- **Follow existing patterns** for consistency

```typescript
import { cn } from '@/lib/cn';

<div className={cn(
  'base-class',
  isActive && 'active-class',
  'another-class'
)} />
```

### Error Handling

- **Always wrap database calls** in try-catch
- **Use structured logging** via `lib/logger.ts`
- **Return user-friendly messages** - no technical jargon

```typescript
import * as logger from '@/lib/logger';

try {
  const sale = await xata.db.Sales.create(data);
  logger.info('SALES', 'Sale created', { saleId: sale.id });
} catch (error) {
  logger.error('SALES', 'Failed to create sale', { error: error as any });
  return { error: 'Failed to create sale. Please try again.' };
}
```

## Git Workflow

### Branching

- `main` - Production branch (protected)
- `feature/feature-name` - New features
- `fix/bug-name` - Bug fixes
- `chore/task-name` - Maintenance tasks

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

feat(sales): add CSV export for monthly reports
fix(auth): correct role resolution from Clerk metadata
docs(readme): update deployment instructions
chore(deps): update Next.js to 15.0.5
perf(dashboard): add React.memo to dashboard components
refactor(xero): extract OAuth logic to separate module
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `chore` - Maintenance
- `perf` - Performance improvement
- `refactor` - Code refactoring
- `test` - Adding tests

### Pull Request Process

1. **Create feature branch** from `main`
2. **Make changes** with clear commits
3. **Test thoroughly:**
   ```bash
   npm run build
   npx tsc --noEmit
   npm run lint
   ```
4. **Open PR** with description of changes
5. **Address review feedback**
6. **Squash and merge** when approved

## Testing

Currently manual testing - automated tests coming soon.

### Manual Testing Checklist

- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] No linting errors (`npm run lint`)
- [ ] Application builds successfully (`npm run build`)
- [ ] Changes work in browser (test locally)
- [ ] No console errors or warnings
- [ ] Responsive design (mobile, tablet, desktop)

## Project Structure

```
app/              # Next.js App Router (routes, pages, API)
  (os)/          # Main app routes (protected)
  trade/         # Deal Studio wizard
  staff/         # Staff portal
  api/           # API routes
components/       # React components
  dashboards/   # Role-specific dashboards
  ui/           # Reusable UI components
lib/              # Core utilities and business logic
  permissions.ts  # RBAC single source of truth
  xero-auth.ts   # Xero OAuth flow
  xata-sales.ts  # Database operations
src/              # Xata generated client
middleware.ts     # Auth + RBAC middleware
```

See [app/README.md](app/README.md) and [lib/README.md](lib/README.md) for detailed documentation.

## RBAC & Permissions

All access control is centralized in **[lib/permissions.ts](lib/permissions.ts:1)**.

### Roles (Hierarchy)

1. **Superadmin** - Full system access (Oliver)
2. **Founder** - Business operations
3. **Operations** - Full ops + Deal Studio (Alys)
4. **Admin** - Staff portal (Sophie)
5. **Finance** - Financial dashboards
6. **Shopper** - Personal dashboard only

### Checking Permissions

```typescript
import { getUserRole } from '@/lib/getUserRole';
import { hasPermission } from '@/lib/permissions';

const role = await getUserRole();

if (!hasPermission(role, 'manage_sales')) {
  return <AccessDenied />;
}
```

## Database Operations

### Using Xata Client

```typescript
import { getXataClient } from '@/src/xata';

const xata = getXataClient();

// Create
const sale = await xata.db.Sales.create({
  sale_date: new Date(),
  sale_amount_inc_vat: 1000,
  // ...
});

// Read
const sales = await xata.db.Sales
  .filter({ shopper: shopperId })
  .select(['id', 'sale_date', 'sale_amount_inc_vat'])
  .getMany();

// Update
await xata.db.Sales.update(saleId, {
  invoice_status: 'PAID',
});

// Delete
await xata.db.Sales.delete(saleId);
```

### Type Safety

Always import types from `@/src/xata`:

```typescript
import type { SalesRecord, ShoppersRecord } from '@/src/xata';

function processSale(sale: SalesRecord) {
  // TypeScript knows all fields
}
```

## API Routes

### Creating an Endpoint

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getUserRole } from '@/lib/getUserRole';

export async function GET(request: NextRequest) {
  // 1. Authentication
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Authorization
  const role = await getUserRole();
  if (!['superadmin', 'operations'].includes(role || '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 3. Business logic
  const data = await fetchData();

  // 4. Response
  return NextResponse.json({ data });
}
```

## Common Patterns

### Server Component Data Fetching

```typescript
import { getXataClient } from '@/src/xata';

export default async function DashboardPage() {
  const xata = getXataClient();
  const stats = await xata.db.Sales
    .select(['sale_amount_inc_vat'])
    .getMany();

  return <Dashboard stats={stats} />;
}
```

### Client Component with State

```typescript
'use client';
import { useState } from 'react';

export default function SearchForm() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async () => {
    const res = await fetch(`/api/search?q=${query}`);
    const data = await res.json();
    setResults(data.results);
  };

  return (/* form UI */);
}
```

### Performance Optimization

```typescript
import { memo, useMemo } from 'react';

const Dashboard = memo(function Dashboard({ sales }) {
  const totalRevenue = useMemo(() => {
    return sales.reduce((sum, s) => sum + s.amount, 0);
  }, [sales]);

  return <div>{totalRevenue}</div>;
});
```

## Security Best Practices

1. **Never expose secrets** - Use server-only functions for sensitive operations
2. **Validate all input** - Sanitize user input before database writes
3. **Use RBAC consistently** - Check permissions at route and component level
4. **Log security events** - Use structured logging for audit trails
5. **Handle errors gracefully** - Don't leak sensitive info in error messages

## Questions?

- **Technical**: oliver@converso.uk
- **Business**: sophie@club19london.com

See [README.md](README.md) for full documentation.
