# Club 19 TradeOS V2 - Onboarding Document

**Task ID**: tradeos-v2-refactor
**Created**: 2025-11-25
**Author**: Claude Code

---

## Executive Summary

Extending the existing Club 19 invoice application from a **single-item invoice creator** into **Club 19 TradeOS** - a comprehensive trade and invoice operating system for luxury personal shopping.

### Current State (V1)

- Single-item invoice creation
- Simple tax wizard (UK/Outside UK scenarios)
- Direct Xero invoice creation via Make.com webhook
- Customer search integration with Xero
- Basic audit logging

### Target State (V2 - TradeOS)

- **Multi-item invoices** (1-3 items per trade, typical is 1)
- **Supplier-side data capture**: buy price, currency, FX rates, shipping routes, tax regime
- **Buyer-side data** (as existing + brand/category)
- **Multi-step wizard**: Supplier → Item(s) → Buyer → Review
- **Rich JSON payload** to Make.com for:
  - Xero invoice creation
  - Airtable logging for P&L and commission tracking
- **Implied costs** (shipping + card fees) calculated from config, not manual entry

---

## Requirements Analysis

### Core User Stories

1. **As a Club 19 trader**, I need to record supplier details (who I'm buying from) so I can track buy-side costs and margins
2. **As a Club 19 trader**, I need to add multiple items from the same or different suppliers to one trade
3. **As a Club 19 trader**, I need to specify buy price, currency, and FX rates so P&L is accurate
4. **As a Club 19 trader**, I need to specify shipping routes and tax regimes for proper accounting
5. **As a Club 19 trader**, I need brand and category fields per item for reporting
6. **As a Club 19 accountant**, I need all trade data logged to Airtable for commission calculations
7. **As a Club 19 accountant**, I need implied costs (shipping/card fees) auto-calculated from config

### Data Model Extensions

**New Entities:**

- **Trade** (replaces single invoice concept)
  - Contains 1-N items
  - Has one buyer (customer)
  - Can have 1-N suppliers (one per item)

- **Supplier** (new)
  - Name
  - Country/location
  - Tax regime

- **TradeItem** (new)
  - Brand
  - Category
  - Description
  - Buy price + currency
  - FX rate (if different from sell currency)
  - Sell price + currency
  - Supplier reference
  - Tax scenario (inherited from wizard)

- **ImpliedCosts** (config-based, calculated)
  - Shipping cost per item/route
  - Card processing fees (% or flat)

---

## Codebase Exploration Findings

### Current Architecture

**Component Structure:**

- `components/InvoiceFlow.tsx` (663 lines) - Monolithic form component
  - Tax wizard logic (steps 1-5)
  - Customer search
  - Invoice form
  - Submission logic

**State Management:**

- All state in React `useState` hooks (no global state)
- No persistence beyond Xero submission
- No draft/auto-save functionality

**API Integration:**

- `lib/xero.ts` - Two webhook calls:
  1. `fetchXeroContacts()` - Customer search
  2. `sendInvoiceToXero()` - Invoice creation
- `lib/audit.ts` - Audit logging to Make.com
- `lib/constants.ts` - Tax scenarios and config

**Current Webhook Payload Structure:**

```typescript
XeroInvoicePayload {
  accountCode: string
  taxType: string
  taxLabel: string
  brandTheme: string
  amountsAre: string
  lineAmountTypes: string
  taxLiability: string
  vatReclaim: string
  customerName: string
  itemDescription: string    // Single item only!
  price: number              // Single price only!
  currency: string
  dueDate: string
  timestamp: string
}
```

### Identified Patterns & Constraints

1. **Tax Logic Complexity**: The existing `getInvoiceResult()` function has deep nested conditionals for UK/Outside UK scenarios. This logic must be preserved.

2. **Make.com Dependency**: All external integrations go through Make.com webhooks. No direct Xero API calls.

3. **No Database**: Application is stateless - no database, no draft saves, no trade history UI.

4. **Mobile-First**: Tailwind styling is mobile-optimized, large touch targets.

5. **Clerk Auth**: Authorization via email whitelist (`ALLOWED_EMAILS`).

### Integration Points

**Existing:**

- Clerk authentication (sign-in/sign-up)
- Make.com webhook for Xero contacts search
- Make.com webhook for Xero invoice creation
- Make.com webhook for audit logging

**New (Required for V2):**

- Make.com webhook for Airtable trade logging
- Config endpoint for implied costs (shipping/card fees)
- Potentially: Supplier search/autocomplete (if list exists)
- Potentially: FX rate lookup API (or manual entry)

---

## Architecture Decisions & Rationale

### Decision 1: Multi-Step Wizard Architecture

**Options Considered:**

1. Single long scrolling form (current approach)
2. Multi-step wizard with navigation
3. Modal-based item addition

**Chosen**: Multi-step wizard with persistent progress bar

**Rationale**:

- Clearer user flow for complex data capture
- Reduces cognitive load (one concern per step)
- Allows validation per step before proceeding
- Enables back/forward navigation for corrections
- Better mobile UX (less scrolling)

**Implementation**:

- 4 main steps: Supplier → Items → Buyer → Review
- Shared state via React Context or component prop drilling
- Persistent "wizard chrome" (progress bar, prev/next buttons)
- Step validation before allowing navigation

### Decision 2: State Management

**Options Considered:**

1. Keep all state in component (current)
2. React Context for wizard state
3. Zustand/Redux for global state
4. URL-based state (search params)

**Chosen**: React Context for wizard state

**Rationale**:

- Minimal dependency addition
- Sufficient for wizard flow (no global app state needed)
- Easy to persist to localStorage for draft saves
- Type-safe with TypeScript
- Avoids prop drilling through multiple components

**Implementation**:

```typescript
TradeContext {
  // Supplier info
  suppliers: Supplier[]

  // Items (1-3 typically)
  items: TradeItem[]

  // Buyer info (customer)
  customer: {
    name: string
    xeroContactId?: string
  }

  // Tax scenario (from wizard)
  taxScenario: InvoiceScenario

  // Invoice metadata
  currency: string
  dueDate: string

  // Methods
  addItem(), removeItem(), updateItem()
  setCustomer()
  setTaxScenario()
}
```

### Decision 3: Backward Compatibility with Tax Logic

**Decision**: Preserve existing `getInvoiceResult()` function entirely, apply to each item independently.

**Rationale**:

- Tax logic is complex and battle-tested
- Each item may have different tax treatment
- Reduces risk of introducing tax calculation bugs
- User still goes through same wizard once per trade (items inherit tax scenario unless overridden)

**Trade-off**: Tax wizard runs once at trade level, then applied to all items. Edge case: different items with different tax treatments would require manual override (Phase 3 enhancement).

### Decision 4: Webhook Payload Structure

**New Payload Structure** (to Make.com):

```typescript
TradeOSPayload {
  // Trade metadata
  tradeId: string            // Generated client-side
  timestamp: string
  createdBy: string          // User email

  // Buyer (customer)
  buyer: {
    name: string
    xeroContactId?: string
  }

  // Items (array of 1-N)
  items: [{
    brand: string
    category: string
    description: string

    // Supplier side
    supplier: {
      name: string
      country: string
      taxRegime: string
    }
    buyPrice: number
    buyCurrency: string
    fxRate?: number          // If buy currency != sell currency

    // Buyer side
    sellPrice: number
    sellCurrency: string

    // Tax (from wizard)
    accountCode: string
    taxType: string
    taxLabel: string
    brandTheme: string
    amountsAre: string
    lineAmountTypes: string
    taxLiability: string
    vatReclaim: string
  }]

  // Invoice metadata
  dueDate: string
  totalSellAmount: number
  totalSellCurrency: string

  // For Airtable P&L
  impliedCosts: {
    shipping: number         // Calculated from config
    cardFees: number         // Calculated from config
    totalImplied: number
  }
}
```

**Make.com Responsibilities:**

1. Create Xero invoice (buyer-side view)
2. Log full trade data to Airtable (both sides + P&L)
3. Return invoice URL and confirmation

### Decision 5: Implied Costs Calculation

**Decision**: Calculate shipping + card fees **client-side** based on **config endpoint**.

**Rationale**:

- User doesn't want to enter costs manually per trade
- Config can be updated without code changes
- Costs depend on: item category, shipping route, payment method
- Make.com receives calculated values, doesn't need config logic

**Config Structure** (from Make.com or Airtable):

```typescript
ImpliedCostsConfig {
  shipping: {
    [category]: {
      [route]: number       // e.g., "Bag" + "UK→UK" = £15
    }
  }
  cardFees: {
    percentage: number      // e.g., 2.5%
    flatFee: number        // e.g., £0.30
  }
}
```

---

## Risks & Mitigations

### Risk 1: Breaking Existing Tax Logic

**Likelihood**: Medium
**Impact**: Critical
**Mitigation**:

- Keep existing `getInvoiceResult()` function unchanged
- Write comprehensive tests before refactoring
- Test all 8+ tax scenarios with sample data
- Get user acceptance testing before deployment

### Risk 2: Webhook Payload Changes Break Make.com

**Likelihood**: High
**Impact**: Critical
**Mitigation**:

- Coordinate with Make.com scenario owner
- Version the webhook (separate URL for V2)
- Test with Make.com sandbox/test webhook first
- Provide clear payload documentation to Make.com developer

### Risk 3: Complex Multi-Item UX Confuses Users

**Likelihood**: Medium
**Impact**: Medium
**Mitigation**:

- User test wizard flow with 2-3 actual Club 19 staff
- Add clear progress indicators and help text
- Provide "Add Another Item" only after first item complete
- Default to single-item flow (most common case)

### Risk 4: FX Rate Data Source Unknown

**Likelihood**: Low
**Impact**: Medium
**Mitigation**:

- Ask user for FX rate data source (API? Manual entry?)
- If manual: add clear validation (rate must be > 0)
- If API: cache rates for 24h, fallback to manual entry

### Risk 5: Mobile Performance with Complex Form

**Likelihood**: Low
**Impact**: Medium
**Mitigation**:

- Keep wizard steps focused (one concern per step)
- Lazy load steps (don't render until navigated to)
- Use React.memo for expensive components
- Test on actual mobile devices before release

---

## Edge Cases Identified

1. **Multiple items from same supplier**: Should supplier form appear N times or once with "add item" flow?
   - **Decision**: Supplier form once, then "Add item from this supplier" option on item step.

2. **Mixed currencies** (buy in USD, sell in GBP): How to handle FX rate?
   - **Decision**: FX rate field appears if buy currency ≠ sell currency. Manual entry with validation.

3. **Zero-price items** (gifts/samples): Should allow £0 price?
   - **Decision**: Allow £0 with warning message. Useful for record-keeping.

4. **Partial refunds/cancellations**: Not in V2 scope.
   - **Decision**: Out of scope. Log issue for V3.

5. **Item with no brand** (miscellaneous items): Require brand or allow blank?
   - **Decision**: Require brand. Add "Other" option to brand list if not exists.

---

## Questions for User (Clarifications Needed)

1. **Supplier Data Source**: Do suppliers exist in a database/list, or are they free-text entry per trade?
   - If list exists: Need API endpoint or local config
   - If free-text: Need validation rules (min length, format)

2. **FX Rate Source**: Should we fetch live FX rates from an API, or is manual entry acceptable?
   - If API: Which service? (xe.com, exchangerate-api, etc.)
   - If manual: Any validation rules? (reasonable bounds, decimal places)

3. **Brand & Category Lists**: Are these predefined lists or free-text?
   - Existing constants.ts has no brand/category data
   - Need source of truth for dropdown options

4. **Implied Costs Config**: Where does this config live?
   - Airtable? Make.com variable? Hardcoded initially?
   - How often does it change? (affects caching strategy)

5. **Trade History**: Should users see a list of past trades, or is this purely creation UI?
   - V2 scope: creation only?
   - V3 scope: add history/search?

6. **Draft Saves**: Should wizard state persist if user navigates away?
   - Use localStorage for draft persistence?
   - Or require completion in one session?

---

## Success Criteria

**Functional Requirements:**

- [ ] User can create multi-item trade (1-3 items tested)
- [ ] Supplier info captured per item (name, country, tax regime)
- [ ] Buy price + currency captured per item
- [ ] FX rate field appears when buy ≠ sell currency
- [ ] Brand + category fields present per item
- [ ] Wizard has 4 clear steps with progress indicator
- [ ] Review step shows all data before submission
- [ ] Webhook sends rich JSON payload to Make.com
- [ ] Implied costs calculated and included in payload
- [ ] Existing tax logic preserved and functional
- [ ] Customer search still works as before

**Non-Functional Requirements:**

- [ ] Mobile-optimized (tested on iOS/Android)
- [ ] All TypeScript types defined
- [ ] No console errors in production build
- [ ] Response time < 2s for step navigation
- [ ] Backward compatible (existing webhooks still work if not using V2)

**Quality Gates:**

- [ ] Unit tests for new trade state management
- [ ] Integration test for full wizard flow
- [ ] Tax scenario tests unchanged (8+ scenarios)
- [ ] TypeScript strict mode passes
- [ ] Tailwind build successful
- [ ] No accessibility warnings (WCAG AA)

---

## Next Steps (Phase 2: Plan)

Now that onboarding is complete, I will create a detailed implementation plan covering:

1. File structure changes (new components, lib files)
2. Step-by-step implementation sequence
3. Data flow diagrams
4. Component hierarchy
5. Test strategy
6. Deployment considerations

**Estimated Complexity**: Medium-High (7-10 hours of development)

**Risk Level**: Medium (tax logic preservation critical)

**Dependencies**:

- User answers to questions above (supplier data source, FX API, etc.)
- Make.com webhook V2 endpoint availability
- Brand/category data source confirmation
