# Club 19 TradeOS V2 - Implementation Plan

**Task ID**: tradeos-v2-refactor
**Phase**: 2 - Planning
**Created**: 2025-11-25

---

## Overview

Transform the existing single-item invoice form into a multi-step wizard supporting 1-3 items per trade, with supplier-side data capture, rich Airtable logging, and implied cost calculations.

**Key Principle**: Extend, don't replace. Preserve existing tax logic and customer search functionality.

---

## Architecture Overview

### High-Level Component Structure

```
app/
  ├── trade/                           # NEW: Trade creation wizard
  │   ├── page.tsx                     # Entry point, wizard container
  │   ├── layout.tsx                   # Trade-specific layout
  │   └── components/                  # Wizard step components
  │       ├── StepSupplier.tsx        # Step 1: Supplier info
  │       ├── StepItems.tsx           # Step 2: Add items
  │       ├── StepBuyer.tsx           # Step 3: Buyer/customer
  │       ├── StepReview.tsx          # Step 4: Review & submit
  │       └── WizardChrome.tsx        # Progress bar, nav buttons
  │
  ├── invoice/                         # KEEP: Redirect to /trade
  │   └── page.tsx                     # Redirect for backward compat

components/
  ├── InvoiceFlow.tsx                  # DEPRECATED: Keep for reference
  ├── TradeWizard.tsx                  # NEW: Main wizard orchestrator
  ├── ItemForm.tsx                     # NEW: Reusable item form
  ├── SupplierForm.tsx                 # NEW: Supplier data form
  └── [existing components...]

lib/
  ├── xero.ts                          # EXTEND: Add new webhook call
  ├── constants.ts                     # EXTEND: Add brands, categories
  ├── trade-context.tsx                # NEW: Wizard state management
  ├── trade-types.ts                   # NEW: TypeScript definitions
  ├── implied-costs.ts                 # NEW: Cost calculations
  └── [existing lib files...]
```

### Data Flow

```
User Input (Wizard Steps)
    ↓
TradeContext (React Context)
    ↓
Review Step (Validation)
    ↓
buildTradePayload() (lib/trade-payload.ts)
    ↓
sendTradeToMake() (lib/xero.ts)
    ↓
Make.com Webhook
    ├→ Create Xero Invoice
    ├→ Log to Airtable (P&L)
    └→ Return confirmation
    ↓
Success Modal (with Xero link)
```

---

## Files to Create/Modify

### Phase 2.1: Core Types & Context (Foundation)

#### **NEW**: `lib/trade-types.ts`

TypeScript type definitions for all trade-related data.

```typescript
// Supplier information
export type Supplier = {
  name: string;
  country: string;
  taxRegime: "UK VAT" | "EU VAT" | "Non-EU" | "Margin Scheme";
  notes?: string;
};

// Trade item (one per item in the trade)
export type TradeItem = {
  id: string; // UUID for client-side management

  // Product info
  brand: string;
  category: string;
  description: string;

  // Supplier side
  supplier: Supplier;
  buyPrice: number;
  buyCurrency: string;
  fxRate?: number; // Only if buyCurrency !== sellCurrency

  // Buyer side
  sellPrice: number;
  sellCurrency: string;

  // Tax scenario (from wizard, inherited by all items)
  taxScenario: InvoiceScenario;
};

// Full trade state
export type TradeState = {
  // Trade metadata
  tradeId: string; // UUID
  createdAt: string; // ISO timestamp

  // Wizard step data
  taxScenario: InvoiceScenario | null; // From existing tax wizard
  suppliers: Supplier[]; // Can have multiple if multi-supplier
  items: TradeItem[]; // 1-N items
  customer: {
    name: string;
    xeroContactId?: string;
  } | null;

  // Invoice settings
  dueDate: string;
  notes?: string;

  // UI state
  currentStep: number; // 0-3 (Supplier, Items, Buyer, Review)
  isSubmitting: boolean;
};

// Implied costs configuration
export type ImpliedCostsConfig = {
  shipping: {
    [category: string]: {
      [route: string]: number; // e.g., "Bag" + "UK→UK" = 15
    };
  };
  cardFees: {
    percentage: number; // e.g., 0.025 (2.5%)
    flatFee: number; // e.g., 0.30
  };
};

// Full payload sent to Make.com
export type TradeOSPayload = {
  tradeId: string;
  timestamp: string;
  createdBy: string;

  buyer: {
    name: string;
    xeroContactId?: string;
  };

  items: Array<{
    brand: string;
    category: string;
    description: string;
    supplier: Supplier;
    buyPrice: number;
    buyCurrency: string;
    fxRate?: number;
    sellPrice: number;
    sellCurrency: string;
    // Tax fields from InvoiceScenario
    accountCode: string;
    taxType: string;
    taxLabel: string;
    brandTheme: string;
    amountsAre: string;
    lineAmountTypes: string;
    taxLiability: string;
    vatReclaim: string;
  }>;

  dueDate: string;
  totalSellAmount: number;
  totalSellCurrency: string;

  impliedCosts: {
    shipping: number;
    cardFees: number;
    totalImplied: number;
  };

  notes?: string;
};
```

**Why**: Centralized types ensure consistency across all components and API calls. Makes refactoring safer.

---

#### **NEW**: `lib/trade-context.tsx`

React Context for wizard state management.

```typescript
import { createContext, useContext, useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { TradeState, TradeItem, Supplier, InvoiceScenario } from './trade-types'

type TradeContextValue = {
  state: TradeState

  // Tax scenario (from existing wizard)
  setTaxScenario: (scenario: InvoiceScenario) => void

  // Supplier management
  addSupplier: (supplier: Supplier) => void
  updateSupplier: (index: number, supplier: Supplier) => void
  removeSupplier: (index: number) => void

  // Item management
  addItem: (item: Omit<TradeItem, 'id' | 'taxScenario'>) => void
  updateItem: (id: string, item: Partial<TradeItem>) => void
  removeItem: (id: string) => void

  // Customer
  setCustomer: (name: string, xeroContactId?: string) => void

  // Invoice settings
  setDueDate: (date: string) => void
  setNotes: (notes: string) => void

  // Wizard navigation
  setStep: (step: number) => void
  canProceed: (step: number) => boolean  // Validation before advancing

  // Submission
  setSubmitting: (submitting: boolean) => void

  // Reset
  reset: () => void
}

const TradeContext = createContext<TradeContextValue | null>(null)

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TradeState>(() => ({
    tradeId: uuidv4(),
    createdAt: new Date().toISOString(),
    taxScenario: null,
    suppliers: [],
    items: [],
    customer: null,
    dueDate: new Date().toISOString().split('T')[0], // Today
    currentStep: 0,
    isSubmitting: false,
  }))

  // Implementation of all methods...
  // (Full implementation in actual code)

  return (
    <TradeContext.Provider value={{ state, /* ...methods */ }}>
      {children}
    </TradeContext.Provider>
  )
}

export function useTrade() {
  const context = useContext(TradeContext)
  if (!context) throw new Error('useTrade must be used within TradeProvider')
  return context
}
```

**Why**: Context allows all wizard steps to access and modify trade state without prop drilling. Easy to persist to localStorage for draft saves later.

---

### Phase 2.2: Wizard Components

#### **NEW**: `app/trade/page.tsx`

Main wizard container with step routing.

```typescript
'use client'

import { TradeProvider } from '@/lib/trade-context'
import TradeWizard from '@/components/TradeWizard'
import { requireAuth } from '@/lib/auth-utils' // Wrapper for Clerk

export default function TradePage() {
  return (
    <TradeProvider>
      <div className="min-h-screen bg-gray-50">
        <TradeWizard />
      </div>
    </TradeProvider>
  )
}
```

---

#### **NEW**: `components/TradeWizard.tsx`

Orchestrates wizard steps, progress bar, navigation.

```typescript
'use client'

import { useTrade } from '@/lib/trade-context'
import WizardChrome from './trade/WizardChrome'
import StepTaxScenario from './trade/StepTaxScenario'  // Existing tax wizard
import StepItems from './trade/StepItems'
import StepBuyer from './trade/StepBuyer'
import StepReview from './trade/StepReview'

const STEPS = [
  { id: 0, label: 'Tax Setup', component: StepTaxScenario },
  { id: 1, label: 'Items', component: StepItems },
  { id: 2, label: 'Buyer', component: StepBuyer },
  { id: 3, label: 'Review', component: StepReview },
]

export default function TradeWizard() {
  const { state } = useTrade()
  const CurrentStepComponent = STEPS[state.currentStep].component

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Progress bar and navigation */}
      <WizardChrome steps={STEPS} currentStep={state.currentStep} />

      {/* Current step content */}
      <div className="mt-8">
        <CurrentStepComponent />
      </div>
    </div>
  )
}
```

**Why**: Clean separation of concerns. Each step is self-contained. Easy to add/remove/reorder steps.

---

#### **NEW**: `app/trade/components/StepTaxScenario.tsx`

**Reuses existing tax wizard logic** from `InvoiceFlow.tsx`.

```typescript
'use client'

import { useState } from 'react'
import { getInvoiceResult } from '@/lib/constants'
import { useTrade } from '@/lib/trade-context'

export default function StepTaxScenario() {
  const { setTaxScenario, setStep } = useTrade()

  // Copy existing state from InvoiceFlow.tsx lines 22-27
  const [itemLocation, setItemLocation] = useState<string | null>(null)
  const [clientLocation, setClientLocation] = useState<string | null>(null)
  const [purchaseType, setPurchaseType] = useState<string | null>(null)
  const [shippingOption, setShippingOption] = useState<string | null>(null)
  const [directShip, setDirectShip] = useState<string | null>(null)
  const [insuranceLanded, setInsuranceLanded] = useState<string | null>(null)

  const result = getInvoiceResult(
    itemLocation,
    clientLocation,
    purchaseType,
    shippingOption,
    directShip,
    insuranceLanded
  )

  const handleContinue = () => {
    if (result) {
      setTaxScenario(result)
      setStep(1) // Move to Items step
    }
  }

  return (
    <div>
      {/* Exact copy of tax wizard UI from InvoiceFlow.tsx lines 252-435 */}
      {/* Shows: Where is item? Where is client? etc. */}

      {result && (
        <div className="mt-6">
          <h3 className="font-bold text-lg mb-3">Tax Scenario Determined</h3>
          {/* Show tax scenario summary */}
          <button
            onClick={handleContinue}
            className="btn-primary"
          >
            Continue to Items →
          </button>
        </div>
      )}
    </div>
  )
}
```

**Why**: Preserves existing tax logic without changes. Users familiar with V1 will see same wizard flow.

---

#### **NEW**: `app/trade/components/StepItems.tsx`

Add/edit items with supplier info, buy/sell prices.

```typescript
'use client'

import { useState } from 'react'
import { useTrade } from '@/lib/trade-context'
import ItemForm from '@/components/ItemForm'
import { TradeItem } from '@/lib/trade-types'

export default function StepItems() {
  const { state, addItem, updateItem, removeItem, setStep } = useTrade()
  const [editingItemId, setEditingItemId] = useState<string | null>(null)

  const handleAddItem = (itemData: Omit<TradeItem, 'id' | 'taxScenario'>) => {
    addItem(itemData)
    setEditingItemId(null)
  }

  const handleContinue = () => {
    if (state.items.length > 0) {
      setStep(2) // Move to Buyer step
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-serif font-semibold mb-6">Trade Items</h2>

      {/* List of added items */}
      {state.items.length > 0 && (
        <div className="space-y-4 mb-6">
          {state.items.map((item, idx) => (
            <div key={item.id} className="bg-white p-4 rounded-lg border-2 border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold">{item.brand} - {item.category}</h3>
                  <p className="text-sm text-gray-600">{item.description}</p>
                  <div className="mt-2 text-sm">
                    <p>Buy: {item.buyCurrency} {item.buyPrice.toFixed(2)}</p>
                    <p>Sell: {item.sellCurrency} {item.sellPrice.toFixed(2)}</p>
                    <p className="text-xs text-gray-500">Supplier: {item.supplier.name}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingItemId(item.id)}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-red-600 hover:underline text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit item form */}
      {(editingItemId || state.items.length === 0) && (
        <ItemForm
          existingItem={editingItemId ? state.items.find(i => i.id === editingItemId) : undefined}
          onSave={handleAddItem}
          onCancel={() => setEditingItemId(null)}
        />
      )}

      {/* Add another item button (if not editing and items exist) */}
      {!editingItemId && state.items.length > 0 && state.items.length < 3 && (
        <button
          onClick={() => setEditingItemId('new')}
          className="btn-outline mb-6"
        >
          + Add Another Item
        </button>
      )}

      {/* Navigation */}
      {state.items.length > 0 && (
        <div className="flex justify-between mt-8">
          <button onClick={() => setStep(0)} className="btn-outline">
            ← Back
          </button>
          <button onClick={handleContinue} className="btn-primary">
            Continue to Buyer →
          </button>
        </div>
      )}
    </div>
  )
}
```

**Why**: Flexible item management. Users can add 1-3 items. Clear visual summary of each item. Edit/remove capability.

---

#### **NEW**: `components/ItemForm.tsx`

Reusable form for item + supplier data entry.

```typescript
'use client'

import { useState, useEffect } from 'react'
import { TradeItem, Supplier } from '@/lib/trade-types'
import { BRANDS, CATEGORIES, CURRENCIES } from '@/lib/constants'

type ItemFormProps = {
  existingItem?: TradeItem
  onSave: (item: Omit<TradeItem, 'id' | 'taxScenario'>) => void
  onCancel: () => void
}

export default function ItemForm({ existingItem, onSave, onCancel }: ItemFormProps) {
  // Supplier state
  const [supplierName, setSupplierName] = useState(existingItem?.supplier.name || '')
  const [supplierCountry, setSupplierCountry] = useState(existingItem?.supplier.country || 'UK')
  const [supplierTaxRegime, setSupplierTaxRegime] = useState(existingItem?.supplier.taxRegime || 'UK VAT')

  // Product state
  const [brand, setBrand] = useState(existingItem?.brand || '')
  const [category, setCategory] = useState(existingItem?.category || '')
  const [description, setDescription] = useState(existingItem?.description || '')

  // Buy side
  const [buyPrice, setBuyPrice] = useState(existingItem?.buyPrice.toString() || '')
  const [buyCurrency, setBuyCurrency] = useState(existingItem?.buyCurrency || 'GBP')
  const [fxRate, setFxRate] = useState(existingItem?.fxRate?.toString() || '')

  // Sell side
  const [sellPrice, setSellPrice] = useState(existingItem?.sellPrice.toString() || '')
  const [sellCurrency, setSellCurrency] = useState(existingItem?.sellCurrency || 'GBP')

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({})

  const showFxRate = buyCurrency !== sellCurrency

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {}

    if (!supplierName) newErrors.supplierName = 'Supplier name required'
    if (!brand) newErrors.brand = 'Brand required'
    if (!category) newErrors.category = 'Category required'
    if (!description) newErrors.description = 'Description required'
    if (!buyPrice || parseFloat(buyPrice) < 0) newErrors.buyPrice = 'Valid buy price required'
    if (!sellPrice || parseFloat(sellPrice) < 0) newErrors.sellPrice = 'Valid sell price required'
    if (showFxRate && (!fxRate || parseFloat(fxRate) <= 0)) {
      newErrors.fxRate = 'FX rate required when currencies differ'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    const supplier: Supplier = {
      name: supplierName,
      country: supplierCountry,
      taxRegime: supplierTaxRegime as any,
    }

    onSave({
      brand,
      category,
      description,
      supplier,
      buyPrice: parseFloat(buyPrice),
      buyCurrency,
      fxRate: showFxRate ? parseFloat(fxRate) : undefined,
      sellPrice: parseFloat(sellPrice),
      sellCurrency,
    } as any) // Type assertion - taxScenario added by context
  }

  return (
    <div className="bg-white p-6 rounded-lg border-2 border-gray-300 space-y-6">
      <h3 className="text-xl font-semibold mb-4">
        {existingItem ? 'Edit Item' : 'Add Item'}
      </h3>

      {/* Supplier Section */}
      <div className="border-b pb-4">
        <h4 className="font-medium mb-3">Supplier Information</h4>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Supplier Name *</label>
          <input
            type="text"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="w-full p-3 border-2 rounded"
            placeholder="e.g., Hermès Paris"
          />
          {errors.supplierName && <p className="text-red-600 text-sm mt-1">{errors.supplierName}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Country</label>
            <select
              value={supplierCountry}
              onChange={(e) => setSupplierCountry(e.target.value)}
              className="w-full p-3 border-2 rounded"
            >
              <option value="UK">UK</option>
              <option value="France">France</option>
              <option value="Italy">Italy</option>
              <option value="Switzerland">Switzerland</option>
              <option value="USA">USA</option>
              <option value="Japan">Japan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tax Regime</label>
            <select
              value={supplierTaxRegime}
              onChange={(e) => setSupplierTaxRegime(e.target.value)}
              className="w-full p-3 border-2 rounded"
            >
              <option value="UK VAT">UK VAT</option>
              <option value="EU VAT">EU VAT</option>
              <option value="Non-EU">Non-EU</option>
              <option value="Margin Scheme">Margin Scheme</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Section */}
      <div className="border-b pb-4">
        <h4 className="font-medium mb-3">Product Information</h4>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Brand *</label>
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="w-full p-3 border-2 rounded"
            >
              <option value="">Select Brand...</option>
              {BRANDS.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            {errors.brand && <p className="text-red-600 text-sm mt-1">{errors.brand}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 border-2 rounded"
            >
              <option value="">Select Category...</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {errors.category && <p className="text-red-600 text-sm mt-1">{errors.category}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description *</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3 border-2 rounded"
            placeholder="e.g., Kelly 25 Black Epsom PHW"
          />
          {errors.description && <p className="text-red-600 text-sm mt-1">{errors.description}</p>}
        </div>
      </div>

      {/* Buy Side */}
      <div className="border-b pb-4">
        <h4 className="font-medium mb-3">Buy Price (What You Pay)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Buy Price *</label>
            <input
              type="number"
              step="0.01"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              className="w-full p-3 border-2 rounded"
              placeholder="0.00"
            />
            {errors.buyPrice && <p className="text-red-600 text-sm mt-1">{errors.buyPrice}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Buy Currency</label>
            <select
              value={buyCurrency}
              onChange={(e) => setBuyCurrency(e.target.value)}
              className="w-full p-3 border-2 rounded"
            >
              {CURRENCIES.map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.code}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showFxRate && (
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">
              FX Rate ({buyCurrency} to {sellCurrency}) *
            </label>
            <input
              type="number"
              step="0.0001"
              value={fxRate}
              onChange={(e) => setFxRate(e.target.value)}
              className="w-full p-3 border-2 rounded"
              placeholder="e.g., 1.2750"
            />
            {errors.fxRate && <p className="text-red-600 text-sm mt-1">{errors.fxRate}</p>}
            <p className="text-sm text-gray-500 mt-1">
              Exchange rate at time of purchase
            </p>
          </div>
        )}
      </div>

      {/* Sell Side */}
      <div>
        <h4 className="font-medium mb-3">Sell Price (Client Pays)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Sell Price *</label>
            <input
              type="number"
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              className="w-full p-3 border-2 rounded"
              placeholder="0.00"
            />
            {errors.sellPrice && <p className="text-red-600 text-sm mt-1">{errors.sellPrice}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Sell Currency</label>
            <select
              value={sellCurrency}
              onChange={(e) => setSellCurrency(e.target.value)}
              className="w-full p-3 border-2 rounded"
            >
              {CURRENCIES.map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.code}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 pt-4">
        <button onClick={handleSubmit} className="btn-primary flex-1">
          {existingItem ? 'Update Item' : 'Add Item'}
        </button>
        <button onClick={onCancel} className="btn-outline flex-1">
          Cancel
        </button>
      </div>
    </div>
  )
}
```

**Why**: Comprehensive form capturing all required data. Clear separation of supplier/product/buy/sell sections. Inline validation with helpful error messages.

---

### Phase 2.3: Continue with remaining steps?

I've outlined the foundation and first two wizard steps in detail. Should I continue with:

- **StepBuyer.tsx** (customer search - reuse existing)
- **StepReview.tsx** (final review + implied costs)
- **Implied costs calculation** (`lib/implied-costs.ts`)
- **Payload builder** (`lib/trade-payload.ts`)
- **Webhook integration** (extend `lib/xero.ts`)
- **Constants extension** (brands, categories in `lib/constants.ts`)

Or would you like me to pause here and get your feedback on the architecture and approach so far?

---

## Implementation Sequence

1. ✅ **Types & Context** (2.1) - Foundation
2. ✅ **Wizard Container** (2.2) - Shell
3. ✅ **Tax Scenario Step** (2.2) - Preserve existing
4. ✅ **Items Step** (2.2) - Core functionality
5. ⏳ **Buyer Step** (2.3) - Next
6. ⏳ **Review Step** (2.3) - Next
7. ⏳ **Implied Costs** (2.4) - Next
8. ⏳ **Webhook Integration** (2.5) - Next
9. ⏳ **Testing** (Phase 3)
10. ⏳ **Deployment** (Phase 4)

**Would you like me to continue with the remaining steps, or shall we review what I've designed so far?**
