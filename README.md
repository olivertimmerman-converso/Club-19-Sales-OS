# Club 19 Sales OS

Production-ready sales management system for Club 19 London, featuring comprehensive deal tracking, commission management, and Xero integration.

## Overview

Club 19 Sales OS is a Next.js 15 application that manages the entire sales lifecycle for luxury goods trading:
- Deal creation and tracking via Sales Atelier (Deal Studio)
- Automatic Xero invoice generation
- Commission calculation and payment management
- Real-time sales analytics and dashboards
- Role-based access control (RBAC) for staff members

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Components)
- **Authentication**: [Clerk](https://clerk.com/) with role-based access control
- **Database**: [Xata](https://xata.io/) (PostgreSQL-based serverless database)
- **Accounting**: [Xero API](https://developer.xero.com/) integration (OAuth 2.0)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (strict mode)
- **Deployment**: [Vercel](https://vercel.com/)

## Key Features

### Sales Management
- **Sales Atelier (Deal Studio)**: Multi-step wizard for creating deals with VAT calculation
- **Sales Dashboard**: Real-time overview of sales, margins, and performance
- **Sales List**: Searchable, filterable list with pagination
- **Invoice Integration**: Automatic Xero invoice creation via Make.com webhooks
- **Commission Tracking**: Automatic calculation based on margin and shopper rates

### Financial Operations
- **Commission Payments**: Track and process shopper commissions
- **Overdue Sales**: Monitor unpaid invoices and payment status
- **VAT Handling**: Complex UK VAT logic (retail purchase, margin scheme, export)
- **Daily Maintenance**: Automated invoice status sync from Xero

### Analytics & Reporting
- **Role-Specific Dashboards**: Tailored views for Superadmin, Founder, Operations, Admin, Finance, and Shoppers
- **Performance Metrics**: Sales, margin, trade count, avg margin percentage
- **Shopper Leaderboards**: Top performers by margin and sales volume
- **Monthly Reports**: Export sales data for accounting

### Access Control
- **6 Role Types**: Superadmin, Founder, Operations, Admin, Finance, Shopper
- **Route Protection**: Middleware-based RBAC on all routes
- **Data Filtering**: Shoppers see only their own sales
- **Read-Only Access**: Finance can view admin sales (read-only)

### Legacy System
- **Legacy Data Import**: Maintain historical sales from old system
- **Data Migration**: Tools for importing legacy suppliers and sales

## Project Structure

```
club19-sales-os/
├── app/
│   ├── (os)/                    # Main OS routes (protected by auth)
│   │   ├── dashboard/           # Main dashboard
│   │   ├── sales/               # Sales list and detail pages
│   │   ├── clients/             # Client (buyer) management
│   │   ├── suppliers/           # Supplier management
│   │   ├── shoppers/            # Shopper management
│   │   ├── invoices/            # Xero invoice tracking
│   │   ├── finance/             # Finance dashboard
│   │   └── legacy/              # Legacy system data
│   ├── trade/                   # Deal Studio (Sales Atelier)
│   │   └── new/                 # Multi-step deal creation wizard
│   ├── staff/                   # Staff portal
│   │   ├── admin/               # Admin dashboards and tools
│   │   ├── finance/             # Finance-specific views
│   │   └── shopper/             # Shopper personal dashboard
│   ├── api/                     # API routes
│   │   ├── finance/             # Commission payments, maintenance
│   │   ├── sales/               # Sales queries and analytics
│   │   ├── xero/                # Xero OAuth and webhooks
│   │   ├── shoppers/            # Shopper management
│   │   ├── suppliers/           # Supplier search
│   │   └── trade/               # Deal creation
│   ├── sign-in/                 # Clerk sign-in page
│   └── sign-up/                 # Clerk sign-up page
├── components/
│   ├── dashboards/              # Role-specific dashboard components
│   ├── ui/                      # Reusable UI components
│   └── forms/                   # Form components (Deal Studio)
├── lib/
│   ├── permissions.ts           # RBAC single source of truth
│   ├── getUserRole.ts           # Role resolution from Clerk
│   ├── getCurrentUser.ts        # Current user details
│   ├── xata-sales.ts            # Sales database operations
│   ├── xero/                    # Xero API integration
│   ├── utils/                   # Utility functions
│   └── constants.ts             # App-wide constants
├── middleware.ts                # Auth + RBAC middleware
└── src/xata.ts                  # Xata database client

```

## Getting Started

### Prerequisites

- Node.js 18.17.0 or higher
- npm 9.0.0 or higher
- Clerk account (authentication)
- Xata account (database)
- Xero Developer account (accounting integration)
- Make.com account (webhook automation)

### Installation

1. **Clone the repository:**

```bash
git clone <repository-url>
cd Club-19-Sales-OS
```

2. **Install dependencies:**

```bash
npm install
```

3. **Set up environment variables:**

Copy the example environment file and configure with your credentials:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your keys (see [Environment Variables](#environment-variables) below).

4. **Initialize the database:**

```bash
# Xata will create tables automatically on first connection
# Ensure XATA_API_KEY and XATA_BRANCH are set
```

5. **Run the development server:**

```bash
npm run dev
```

6. **Open your browser:**

Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

See `.env.local.example` for a complete reference. Key variables:

### Required

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Xata Database
XATA_API_KEY=xau_...
XATA_BRANCH=main

# Xero Integration
NEXT_PUBLIC_XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
XERO_WEBHOOK_SECRET=...
XERO_SYSTEM_USER_ID=user_...
```

### Optional

```env
# Make.com Webhook
MAKE_TRADE_WEBHOOK_URL=https://hook.eu2.make.com/...
```

**Note**: `NEXT_PUBLIC_*` variables are exposed to the browser (OAuth spec allows client IDs to be public). All other secrets are server-only.

## Authentication & Authorization

### Roles

The system supports 6 roles (defined in `lib/permissions.ts`):

1. **Superadmin** - Full system access (Oliver)
2. **Founder** - Core business operations (company founders)
3. **Operations** - Full operations including Deal Studio (Alys)
4. **Admin** - Staff portal and admin tools (Sophie)
5. **Finance** - Financial dashboards and commission management
6. **Shopper** - Personal sales dashboard only (Hope, MC)

See [PERMISSIONS.md](PERMISSIONS.md) for detailed role capabilities.

### Authorized Users

Access is controlled via Clerk email authentication. To add new users:

1. Invite them via Clerk Dashboard
2. Set their `publicMetadata.staffRole` to one of the 6 roles
3. They will automatically get appropriate access on next login

## Development

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server (after build)
npm start

# Run type checking
npx tsc --noEmit

# Run linting
npm run lint
```

### Code Standards

- **TypeScript strict mode** enabled
- **Server Components** by default (use `'use client'` only when needed)
- **Tailwind CSS** for all styling
- **No inline styles** except for dynamic values
- **JSDoc comments** for all exported functions
- **Error handling** with try-catch and user-friendly messages

## Deployment

### Vercel (Recommended)

1. **Push to GitHub/GitLab**

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Vercel will auto-detect Next.js

3. **Add Environment Variables:**
   - Navigate to Project Settings → Environment Variables
   - Add all variables from `.env.local`
   - Ensure production Clerk keys are used

4. **Deploy:**
   - Vercel deploys automatically on push to main branch
   - Set up custom domain if needed

5. **Configure Clerk:**
   - Add production domain to Clerk Dashboard → Domains
   - Update redirect URLs if needed

### Environment-Specific Setup

**Production:**
- Use production Clerk keys (`pk_live_...`, `sk_live_...`)
- Use production Xero app credentials
- Set `XERO_WEBHOOK_SECRET` to a strong random value

**Staging:**
- Use test Clerk keys
- Use Xero demo company
- Separate Xata branch (e.g., `staging`)

## Xero Integration

### OAuth Flow

1. User clicks "Connect to Xero" in admin panel
2. Redirect to Xero OAuth authorize endpoint
3. User grants permissions in Xero
4. Callback to `/api/xero/oauth/callback` with authorization code
5. Exchange code for access/refresh tokens
6. Store tokens in Clerk `privateMetadata`
7. Tokens auto-refresh when expired

### Invoice Creation

Deal Studio → Make.com Webhook → Xero API → Sales record in Xata

1. User completes deal in Sales Atelier
2. POST to `/api/trade/create` with deal data
3. API forwards to Make.com webhook (if configured)
4. Make.com creates invoice in Xero
5. Xero webhook notifies `/api/xero/webhooks`
6. API updates Sales record with invoice details

### Daily Maintenance

Automated sync runs via `/api/finance/daily-maintenance`:
- Syncs invoice statuses from Xero
- Updates payment received dates
- Locks paid sales for commission calculation

## Business Logic

### Commission Calculation

```
Commission = Gross Margin × Shopper Commission Rate
```

Conditions:
- Sale must be **PAID** status in Xero
- Sale must be **locked** via finance dashboard
- Shopper must have a commission rate set
- Commission is tracked but paid manually

### VAT Handling

The system supports complex UK VAT scenarios:

**UK → UK (Retail Purchase)**: 20% VAT, Account 425
**UK → UK (Margin Scheme)**: Zero-rated, Account 424
**UK → Outside UK**: Zero-rated export, Account 423
**Outside UK → UK**: Varies (20% or zero-rated depending on shipping)
**Outside UK → Outside UK**: Zero-rated export, Account 423

See [docs/BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) for detailed rules.

## Documentation

- [PERMISSIONS.md](PERMISSIONS.md) - Role-based access control details
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture and data flow
- [docs/BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) - Business rules and calculations
- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) - Security audit report

## Troubleshooting

### Authentication Issues

**Problem**: Can't sign in

- Check Clerk keys in environment variables
- Verify domain is added in Clerk Dashboard
- Clear browser cache and cookies

**Problem**: Access denied after login

- Check `publicMetadata.staffRole` in Clerk Dashboard
- Ensure role is one of: `superadmin`, `founder`, `operations`, `admin`, `finance`, `shopper`
- Role is case-sensitive

### Database Issues

**Problem**: "Failed to fetch" errors

- Verify `XATA_API_KEY` is correct
- Check Xata dashboard for database status
- Ensure branch (`XATA_BRANCH`) exists

### Xero Integration Issues

**Problem**: Invoices not creating

- Check Make.com webhook URL is configured
- Verify Make.com scenario is active
- Check Make.com logs for errors
- Ensure Xero app credentials are valid

**Problem**: OAuth callback fails

- Verify `NEXT_PUBLIC_XERO_CLIENT_ID` matches Xero app
- Check `XERO_CLIENT_SECRET` is correct
- Ensure redirect URI is whitelisted in Xero app settings

## Support

For issues or questions:

- **Technical**: oliver@converso.uk
- **Business**: sophie@club19london.com

## License

Proprietary - Club 19 London

---

**Last Updated**: 2025-12-09
**Version**: 2.0 (Sales OS with Xata + Xero)

Built with Next.js 15, Clerk, Xata, and Xero API.
