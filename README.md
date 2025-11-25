# Club 19 Invoice Flow - Next.js Application

Production-ready Next.js 14 application for managing Club 19 London invoices with Clerk authentication, Xero integration, and comprehensive audit logging.

## Features

- **Clerk Authentication**: Secure user authentication with authorized email access control
- **Xero Integration**: Direct invoice creation via Make.com webhooks
- **Customer Search**: Real-time Xero contact search with debouncing
- **Tax Calculation**: Comprehensive UK VAT logic for various scenarios
- **Audit Logging**: Complete event tracking for compliance
- **Responsive Design**: Mobile-first UI with Tailwind CSS
- **Type Safety**: Full TypeScript implementation

## Project Structure

```
club19-invoice-flow/
├── app/
│   ├── layout.tsx          # Root layout with ClerkProvider
│   ├── page.tsx             # Main page with auth checks
│   └── globals.css          # Global styles and Tailwind
├── components/
│   ├── InvoiceFlow.tsx      # Main invoice flow component
│   ├── AccessDenied.tsx     # Access denied screen
│   └── Loader.tsx           # Loading component
├── lib/
│   ├── constants.ts         # Tax logic, allowed emails, configs
│   ├── audit.ts             # Audit logging system
│   └── xero.ts              # Xero webhook integration
├── middleware.ts            # Clerk authentication middleware
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── .env.local.example
```

## Prerequisites

- Node.js 18.17.0 or higher
- npm 9.0.0 or higher
- Clerk account with production keys
- Make.com account for webhooks

## Installation

1. **Clone or navigate to the project directory:**

```bash
cd "Club 19 Invoice Flow - next js version"
```

2. **Install dependencies:**

```bash
npm install
```

3. **Set up environment variables:**

Copy the example environment file and update with your actual keys:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Clerk secret key:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key_here
CLERK_SECRET_KEY=your_clerk_secret_key_here
```

4. **Run the development server:**

```bash
npm run dev
```

5. **Open your browser:**

Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

### Required Variables

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk publishable key (already set in example)
- `CLERK_SECRET_KEY`: Clerk secret key (get from [Clerk Dashboard](https://dashboard.clerk.com))

### Hardcoded Configuration

The following are configured directly in the codebase:

- **Authorized Emails** (in `lib/constants.ts`):
  - sophie@club19london.com
  - hope@club19london.com
  - maryclair@club19london.com
  - oliver@converso.uk
  - alys@sketch24ltd.com

- **Webhooks** (in `lib/constants.ts`):
  - Audit Log: `https://hook.eu2.make.com/YOUR_AUDIT_WEBHOOK_ID`
  - Xero Invoice: `https://hook.eu2.make.com/YOUR_XERO_INVOICE_WEBHOOK_ID`
  - Xero Contacts: `https://hook.eu2.make.com/YOUR_XERO_CONTACTS_WEBHOOK_ID`

## Authorization

Only users with email addresses listed in `ALLOWED_EMAILS` (in `lib/constants.ts`) can access the application. All other authenticated users will see an "Access Denied" screen.

To add or remove authorized users, edit `lib/constants.ts`:

```typescript
export const ALLOWED_EMAILS = [
  "sophie@club19london.com",
  "hope@club19london.com",
  "maryclair@club19london.com",
  "oliver@converso.uk",
  "alys@sketch24ltd.com",
  // Add new emails here
];
```

## Tax Logic

The application handles complex UK VAT scenarios:

### UK Item → UK Client

- **Retail Purchase**: 20% VAT (Account 425)
- **Margin Scheme**: Zero-rated (Account 424)

### UK Item → Outside UK Client

- **Retail Purchase**: Zero-rated export (Account 423)
- **Margin Scheme**: Zero-rated export (Account 423)

### Outside UK → UK Client

- Varies based on shipping options and insurance
- Can be 20% VAT or zero-rated depending on delivery method

### Outside UK → Outside UK

- Zero-rated export sales (Account 423)

## Xero Integration

### Invoice Creation

The app sends invoice data to Make.com webhook with:

- Account code (423, 424, or 425)
- Tax type (OUTPUT2 or ZERORATEDOUTPUT)
- Line amount types (Inclusive/Exclusive)
- Customer details
- Item description and pricing
- Due date

### Customer Search

Real-time search of Xero contacts with:

- 300ms debounce
- Minimum 2 characters
- Keyboard navigation (Arrow keys, Enter, Escape)
- Loading indicators

## Audit Logging

All user actions are logged via webhook:

- `USER_LOGIN_SUCCESS`: Successful login with access granted
- `USER_LOGIN_DENIED`: Login attempt by unauthorized user
- `USER_LOGOUT`: User signs out
- `INVOICE_CREATE_ATTEMPT`: Invoice creation initiated
- `INVOICE_CREATE_SUCCESS`: Invoice successfully created in Xero
- `INVOICE_CREATE_FAILURE`: Invoice creation failed

Each event includes:

- Event type and timestamp
- User details (email, ID, name)
- Session ID
- User agent and URL
- Event-specific data

## Development

### Available Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint

# Type checking
npm run type-check
```

### Code Style

- Use TypeScript strict mode
- Follow Next.js 14 App Router conventions
- Use 'use client' directive for client components
- Prefer server components when possible
- Use Tailwind CSS for styling

## Deployment

### Vercel (Recommended)

1. **Push to GitHub**

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Import your repository
   - Add environment variables:
     - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     - `CLERK_SECRET_KEY`

3. **Deploy:**
   - Vercel will automatically deploy
   - Set up production domain

### Other Platforms

The app can be deployed to any platform supporting Next.js:

- Netlify
- AWS Amplify
- Cloudflare Pages
- Self-hosted with Node.js

## Production Checklist

- [ ] Update `CLERK_SECRET_KEY` in environment variables
- [ ] Verify Clerk production domain settings
- [ ] Test all webhook integrations
- [ ] Verify authorized email list
- [ ] Test invoice creation flow end-to-end
- [ ] Test access control for unauthorized users
- [ ] Check audit logs are being received
- [ ] Test on mobile devices
- [ ] Enable Clerk production mode
- [ ] Set up error monitoring (optional: Sentry)

## Troubleshooting

### Authentication Issues

**Problem**: Users can't sign in

- Verify Clerk keys are correct
- Check Clerk dashboard for domain configuration
- Ensure production mode is enabled in Clerk

### Webhook Failures

**Problem**: Invoices not creating in Xero

- Check Make.com webhook is active
- Verify webhook URL in `lib/constants.ts`
- Check Make.com scenario logs

### Customer Search Not Working

**Problem**: No results when searching customers

- Verify Xero contacts webhook URL
- Check Make.com connection to Xero
- Ensure minimum 2 characters entered

## Support

For issues or questions:

- Technical: oliver@converso.uk
- Business: sophie@club19london.com

## License

Proprietary - Club 19 London

---

**Built with:**

- [Next.js 14](https://nextjs.org/)
- [Clerk Authentication](https://clerk.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Make.com](https://www.make.com/)
- [Xero](https://www.xero.com/)
