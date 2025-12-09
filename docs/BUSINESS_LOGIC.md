# Club 19 Sales OS - Business Logic Documentation

## Overview

This document explains the core business rules and calculations that power the Club 19 Sales OS. Understanding these rules is critical for maintaining the system and ensuring accurate financial calculations.

## Commission Calculation

### Formula

```
Commission = Gross Margin × Shopper Commission Rate
```

### Components

**Gross Margin**:
```
Gross Margin = Sale Amount (inc VAT) - Buy Price
```

**Shopper Commission Rate**:
- Stored in `Shoppers.commission_rate` (percentage, e.g., 15 = 15%)
- Each shopper has their own rate
- Rates can vary based on performance or contract terms

### Calculation Rules

1. **Sale Must Be PAID**: Commission only calculated on sales with `invoice_status = "PAID"`
2. **Sale Must Be Locked**: Finance must mark sale as `locked_for_commission = true`
3. **Shopper Must Have Rate**: If no rate is set, commission = 0
4. **Currency Conversion**: All calculations in original currency (GBP, EUR, USD)

### Example

```
Sale Amount (inc VAT): £10,000
Buy Price: £7,000
Gross Margin: £3,000
Shopper Rate: 15%

Commission = £3,000 × 0.15 = £450
```

### Payment Process

1. Invoice marked **PAID** in Xero
2. Daily maintenance syncs status to Sales OS
3. Finance reviews paid sales on finance dashboard
4. Finance clicks **"Lock Paid Sales"** to mark as `locked_for_commission = true`
5. Finance clicks **"Process Commission Payments"**
6. System calculates commission for all locked, unpaid sales
7. Finance pays commissions manually
8. Finance marks payments as processed by clicking **"Mark as Paid"**
9. System updates `commission_paid_date` and `commission_paid = true`

### Edge Cases

**Multiple Shoppers**: Sale attributed to the `shopper` field in Sales record

**Zero Margin Sales**: Commission = 0 (rare, but possible for goodwill sales)

**Negative Margin**: Commission = negative (loss), typically not paid

**Partial Payments**: Commission calculated on full sale amount when status = PAID

## VAT Handling

### UK VAT Rate

**Standard Rate**: 20%

**Zero-Rated**: 0% (exports, certain goods)

### VAT Scenarios

#### 1. UK Item → UK Client (Retail Purchase)

- **VAT**: 20%
- **Xero Account**: 425 (Sales - Retail)
- **Tax Type**: OUTPUT2 (Standard 20%)
- **Line Amount Type**: Inclusive

**Example**:
```
Item Price: £10,000 (inc VAT)
Net: £8,333.33
VAT: £1,666.67
```

#### 2. UK Item → UK Client (Margin Scheme)

- **VAT**: 0% (zero-rated)
- **Xero Account**: 424 (Sales - Margin Scheme)
- **Tax Type**: ZERORATEDOUTPUT
- **Line Amount Type**: Exclusive

**Margin Scheme Rules**:
- Used for second-hand goods
- VAT only on margin, not full sale price
- Requires specific documentation
- Cannot reclaim input VAT

**Example**:
```
Sale Price: £10,000
Buy Price: £7,000
Margin: £3,000
VAT due: £3,000 × 20% = £600 (paid via VAT return, not on invoice)
```

#### 3. UK Item → Outside UK Client (Export)

- **VAT**: 0% (zero-rated export)
- **Xero Account**: 423 (Export Sales)
- **Tax Type**: ZERORATEDOUTPUT
- **Line Amount Type**: Exclusive

**Requirements**:
- Customer outside UK
- Goods physically leave UK
- Commercial invoice required
- Proof of export (shipping docs)

#### 4. Outside UK Item → UK Client

**Varies based on shipping**:

**Option A: Direct ship (supplier → client)**:
- **VAT**: 0% (reverse charge)
- **Tax Type**: ZERORATEDOUTPUT
- Client responsible for import VAT

**Option B: Shipped to UK first**:
- **VAT**: 20% (import VAT + sale VAT)
- **Tax Type**: OUTPUT2
- Club 19 pays import VAT, charges UK VAT

**Option C: Personal import**:
- **VAT**: 20%
- **Tax Type**: OUTPUT2
- VAT on full sale price

#### 5. Outside UK Item → Outside UK Client

- **VAT**: 0% (outside scope)
- **Xero Account**: 423 (Export Sales)
- **Tax Type**: ZERORATEDOUTPUT
- **Notes**: No UK VAT, but may have local VAT in destination country

### Xero Tax Types

| Tax Type | Description | Rate |
|----------|-------------|------|
| OUTPUT2 | Standard UK VAT | 20% |
| ZERORATEDOUTPUT | Zero-rated (exports, margin scheme) | 0% |
| EXEMPTOUTPUT | VAT exempt goods | 0% |

### Xero Account Codes

| Code | Description | Use Case |
|------|-------------|----------|
| 423 | Export Sales | Exports outside UK |
| 424 | Sales - Margin Scheme | Second-hand goods margin scheme |
| 425 | Sales - Retail | Standard UK retail sales |

## Invoice Status Flow

### Status Lifecycle

```
DRAFT → SUBMITTED → AUTHORISED → PAID
          ↓
        VOIDED (can happen at any stage)
```

### Status Definitions

**DRAFT**:
- Invoice created but not finalized
- Can be edited or deleted
- Not sent to customer
- Not included in reports

**SUBMITTED**:
- Invoice submitted for approval (if approval workflow enabled)
- Awaiting authorization
- Cannot be edited

**AUTHORISED**:
- Invoice approved and finalized
- Sent to customer (or ready to send)
- Appears in reports
- Cannot be deleted (must void)
- **Most common status for unpaid invoices**

**PAID**:
- Payment received and allocated
- Invoice fully paid
- Locked for accounting
- Triggers commission calculation

**VOIDED**:
- Invoice cancelled
- Does not appear in financial reports
- Retains history for audit trail
- **Cannot be unvoided** (must create new invoice)

### Sync Process

**Daily Maintenance** (`/api/finance/daily-maintenance`):
1. Fetches all AUTHORISED and PAID invoices from Xero
2. Updates `invoice_status` in Sales records
3. Updates `payment_received_date` for newly paid invoices
4. Logs sync results

**Manual Sync** (`/api/xero/sync-payments`):
- Same as daily maintenance but triggered on-demand
- Used when immediate sync needed

## Sale Locking

### Purpose

Locking prevents changes to sales after commission has been calculated, ensuring audit trail integrity.

### Lock Triggers

1. **Manual Lock**: Finance clicks "Lock Paid Sales" button
2. **Auto-Lock** (future): Automatic lock 7 days after payment

### Lock Rules

**Locked Sales**:
- Cannot be edited
- Cannot be deleted
- Commission calculation frozen
- Visible in commission reports

**Unlocking**:
- Superadmin only
- Requires reason (audit log)
- Invalidates commission calculation

## Commission Schemes

### Standard Scheme

Most shoppers use a fixed percentage rate:

```
Commission = Margin × Rate
```

Example rates:
- Entry level: 10%
- Standard: 15%
- Senior: 20%
- Founder: 25%

### Performance-Based Scheme (Future)

Tiered rates based on monthly/quarterly performance:

```
Tier 1: 0-£10k margin = 10%
Tier 2: £10k-£25k margin = 15%
Tier 3: £25k+ margin = 20%
```

Currently not implemented.

### Team Commission (Future)

Split commission between multiple shoppers:

```
Primary Shopper: 70%
Secondary Shopper: 30%
```

Currently not implemented.

## Currency Handling

### Supported Currencies

- **GBP** (£) - British Pound Sterling (primary)
- **EUR** (€) - Euro
- **USD** ($) - US Dollar

### Currency Display

All amounts displayed in their original currency:
- `formatCurrency(amount, currency)`
- Symbol determined by currency code
- Locale-specific formatting (UK format)

### Currency Conversion

**Not currently implemented**. Each currency tracked separately.

Future: May need currency conversion for consolidated reports.

## Date Handling

### Important Dates

**sale_date**:
- Date of sale/deal closure
- Used for reporting periods
- Set when deal created in Sales Atelier

**invoice_date**:
- Date invoice created in Xero
- Usually same as or after sale_date
- Synced from Xero

**due_date**:
- Payment due date
- Typically invoice_date + 30 days
- Used for overdue calculations

**payment_received_date**:
- Date payment actually received
- Synced from Xero when status → PAID
- Used for cash flow reporting

**commission_locked_date**:
- Date sale locked for commission
- Set by finance when clicking "Lock Paid Sales"

**commission_paid_date**:
- Date commission paid to shopper
- Set by finance when processing payments

### Date Calculations

**Overdue**:
```
Overdue = (due_date < today) AND (invoice_status != "PAID")
```

**Aging**:
```
Days Overdue = today - due_date
```

**Monthly Reporting**:
```
Month Filter = (sale_date >= month_start) AND (sale_date <= month_end)
```

## Margin Calculation

### Basic Margin

```
Gross Margin = Sale Amount (inc VAT) - Buy Price
```

### Margin Percentage

```
Margin % = (Gross Margin / Sale Amount) × 100
```

**Example**:
```
Sale Amount: £10,000
Buy Price: £7,000
Gross Margin: £3,000
Margin %: (£3,000 / £10,000) × 100 = 30%
```

### Target Margins

Club 19 typical target margins:
- **Minimum**: 20%
- **Standard**: 30%
- **Premium**: 40%+

### Cost Components

**Buy Price** includes:
- Purchase price from supplier
- Shipping costs
- Import duties/taxes
- Authentication fees
- Any other direct costs

**Buy Price** excludes:
- Staff time (not tracked per item)
- Overhead costs
- Marketing costs

## Role Permissions Summary

### Data Access Rules

**Superadmin**: All data, all operations

**Founder**: All sales data, manage shoppers

**Operations**: All sales data, create deals, manage suppliers

**Admin**: All sales data (read/write), manage errors

**Finance**: All sales data (read-only for some views), process commissions

**Shopper**: Own sales only (filtered by shopper name)

### Financial Operations

| Operation | Superadmin | Founder | Operations | Admin | Finance | Shopper |
|-----------|-----------|---------|------------|-------|---------|---------|
| View Sales | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All | ✅ Own Only |
| Create Deals | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Lock Sales | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Process Commissions | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View Commissions | ✅ All | ✅ All | ✅ All | ✅ All | ✅ All | ✅ Own Only |
| Manage Suppliers | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

## Error Handling Business Rules

### Critical Errors

**Invoice Creation Failed**:
- Sale record created in Xata
- Invoice NOT created in Xero
- **Action**: Admin manually creates invoice in Xero, updates Sale record

**Payment Sync Failed**:
- Invoice PAID in Xero
- Status not synced to Sales OS
- **Action**: Run manual sync `/api/xero/sync-payments`

**Commission Calculation Error**:
- Sale locked but commission = 0 or wrong
- **Action**: Check shopper commission rate, recalculate manually if needed

### Warning Conditions

**Negative Margin**:
- Gross margin < 0 (loss-making sale)
- **Action**: Review with founder, may approve as goodwill

**High Margin** (>60%):
- Unusually high margin
- **Action**: Verify buy price is correct

**Overdue >90 days**:
- Invoice unpaid for 3+ months
- **Action**: Chase payment, consider write-off

## Audit Trail

### Tracked Events

All critical operations logged:
- Commission payments
- Sale locking
- Invoice status changes
- Deal creation
- Xero OAuth events

### Audit Log Fields

```typescript
{
  timestamp: Date,
  user_email: string,
  action: string,
  entity_type: "Sale" | "Commission" | "Invoice",
  entity_id: string,
  changes: object,
  ip_address: string
}
```

## Reporting Periods

### Monthly Reports

**Calendar Month**: 1st - last day of month

Used for:
- Monthly commission calculations
- Performance dashboards
- Financial reporting

### Quarterly Reports

**Q1**: Jan-Mar
**Q2**: Apr-Jun
**Q3**: Jul-Sep
**Q4**: Oct-Dec

### Fiscal Year

**April 1 - March 31** (UK tax year)

Used for:
- Annual commission totals
- VAT returns
- Corporation tax

## Business Constraints

### Minimum Sale Value

**£100** - Sales below this are rare and may indicate data errors

### Maximum Commission Rate

**30%** - Rates above this require founder approval

### Commission Payment Frequency

**Monthly** - Commissions paid once per month after sales locked

### Lock Period

Sales can be locked **7 days after payment** to allow for refunds/disputes

### Data Retention

- **Active Sales**: Kept indefinitely
- **Voided Invoices**: Kept for 7 years (HMRC requirement)
- **Error Logs**: Kept for 1 year
- **Audit Logs**: Kept for 7 years

---

**Last Updated**: 2025-12-09
**Reviewed By**: oliver@converso.uk, sophie@club19london.com
