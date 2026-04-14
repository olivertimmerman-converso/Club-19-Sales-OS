"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import {
  Trade,
  TradeItem,
  Buyer,
  Supplier,
  PaymentMethod,
  TradeSource,
  ImpliedCosts,
  WizardStep,
  WizardState,
} from "@/lib/types/invoice";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// DRAFT PERSISTENCE
// ============================================================================

const DRAFT_KEY = "club19_trade_draft";
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DraftEnvelope {
  savedAt: number; // timestamp
  state: Partial<WizardState>;
}

function saveDraft(state: WizardState): void {
  try {
    const draft: DraftEnvelope = {
      savedAt: Date.now(),
      state: {
        currentStep: state.currentStep,
        saleDate: state.saleDate,
        items: state.items,
        buyer: state.buyer,
        isNewClient: state.isNewClient,
        currentPaymentMethod: state.currentPaymentMethod,
        deliveryCountry: state.deliveryCountry,
        shippingCost: state.shippingCost,
        entrupyFee: state.entrupyFee,
        taxScenario: state.taxScenario,
        itemLocation: state.itemLocation,
        clientLocation: state.clientLocation,
        purchaseType: state.purchaseType,
        directShip: state.directShip,
        landedDelivery: state.landedDelivery,
        hasDeliveryCost: state.hasDeliveryCost,
        hasIntroducer: state.hasIntroducer,
        introducerName: state.introducerName,
        introducerFeePercent: state.introducerFeePercent,
        dueDate: state.dueDate,
        notes: state.notes,
        estimatedImportExportGBP: state.estimatedImportExportGBP,
        importVAT: state.importVAT,
      },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function loadDraft(): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft: DraftEnvelope = JSON.parse(raw);
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    // Require at least one item to consider it a meaningful draft
    if (!draft.state.items || draft.state.items.length === 0) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch {
    localStorage.removeItem(DRAFT_KEY);
    return null;
  }
}

export function clearDraft(): void {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

type TradeContextType = {
  state: WizardState;
  navigationDirection: "forward" | "back";
  resetKey: number; // Used to force remount of step components on full reset

  // Step navigation
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  canGoToStep: (targetStep: WizardStep) => boolean;

  // Tax scenario
  setTaxScenario: (scenario: WizardState["taxScenario"]) => void;

  // Current item (Steps 0-1)
  setCurrentItem: (item: WizardState["currentItem"]) => void;

  // Supplier & purchase defaults
  setCurrentSupplier: (supplier: Supplier) => void;
  setCurrentPaymentMethod: (method: PaymentMethod) => void;
  setDeliveryCountry: (country: string) => void;

  // Logistics data
  setItemLocation: (location: string | null) => void;
  setClientLocation: (location: string | null) => void;
  setPurchaseType: (type: string | null) => void;
  setDirectShip: (directShip: string | null) => void;
  setLandedDelivery: (landed: string | null) => void;

  // Delivery cost
  setHasDeliveryCost: (hasCost: boolean | null) => void;

  // Shipping cost
  setShippingCost: (cost: number) => void;

  // Items
  addItem: (item: TradeItem) => void;
  updateItem: (itemId: string, item: Partial<TradeItem>) => void;
  removeItem: (itemId: string) => void;
  startEditingItem: (itemId: string | "new") => void;

  // Buyer
  setBuyer: (buyer: Buyer) => void;
  setIsNewClient: (value: boolean) => void;

  // Introducer (Phase 2: free-text name + flat £ fee)
  setHasIntroducer: (hasIntroducer: boolean) => void;
  setIntroducerName: (name: string) => void;
  setIntroducerFeePercent: (percent: number) => void;

  // Entrupy fee (ancillary cost, optional)
  setEntrupyFee: (amount: number) => void;

  // Invoice metadata
  setDueDate: (date: string) => void;
  setNotes: (notes: string) => void;

  // Implied costs
  setImpliedCosts: (costs: ImpliedCosts) => void;
  setEstimatedImportExportGBP: (amount: number | null) => void;
  setImportVAT: (amount: number | null) => void;

  // Submission
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;

  // Reset
  resetWizard: () => void;

  // Draft persistence
  draftPrompt: DraftEnvelope | null;
  resumeDraft: () => void;
  discardDraft: () => void;
};

const TradeContext = createContext<TradeContextType | undefined>(undefined);

// Helper to create fresh initial state with current date
const createInitialState = (): WizardState => ({
  currentStep: 0,
  saleDate: new Date().toISOString().split("T")[0], // Today
  taxScenario: null,
  currentItem: null,
  currentSupplier: null,
  currentPaymentMethod: PaymentMethod.CARD,
  deliveryCountry: "United Kingdom", // Default to UK (use full name for consistency)
  itemLocation: null,
  clientLocation: null,
  purchaseType: null,
  directShip: null,
  landedDelivery: null,
  hasDeliveryCost: null,
  shippingCost: 0,
  entrupyFee: 0,
  items: [],
  editingItemId: null,
  buyer: null,
  isNewClient: false,
  hasIntroducer: false,
  introducerName: "",
  introducerFeePercent: 0,
  dueDate: new Date()
    .toISOString()
    .split("T")[0], // Today
  notes: "",
  impliedCosts: null,
  estimatedImportExportGBP: null,
  importVAT: null,
  isSubmitting: false,
  error: null,
});

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(createInitialState);
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "back">("forward");
  const [resetKey, setResetKey] = useState(0);
  const [draftPrompt, setDraftPrompt] = useState<DraftEnvelope | null>(null);
  const draftTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Check for saved draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setDraftPrompt(draft);
    }
  }, []);

  // Auto-save draft on state changes (debounced 500ms)
  useEffect(() => {
    // Don't save if submitting or if there are no items yet
    if (state.isSubmitting || state.items.length === 0) return;

    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(state);
    }, 500);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [state]);

  // Scrolls every plausible scroll container to the top. Called synchronously
  // from goToStep/nextStep/prevStep so the reset happens at the moment of user
  // intent — no race against React's render cycle.
  //
  // The OSLayout puts the wizard inside <main className="overflow-y-auto"> so
  // window.scrollTo is a no-op. Belt-and-braces resets all four candidates:
  // window, documentElement, body, and the <main> element directly. Also runs
  // again in a rAF to catch the case where the new step's content reflows the
  // <main> after the synchronous reset.
  const scrollWizardToTop = useCallback(() => {
    if (typeof window === "undefined") return;

    const reset = () => {
      window.scrollTo({ top: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      // Direct query — there's exactly one <main> on every page in this app.
      const main = document.querySelector("main");
      if (main) main.scrollTop = 0;
    };

    // Synchronous reset BEFORE the new step renders, so the user doesn't see
    // a flash of the new content scrolled.
    reset();
    // Backup reset after the next paint, in case the sync reset was applied
    // against stale layout.
    requestAnimationFrame(reset);
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => {
      setNavigationDirection(step > prev.currentStep ? "forward" : "back");
      return { ...prev, currentStep: step };
    });
    scrollWizardToTop();
  }, [scrollWizardToTop]);

  const nextStep = useCallback(() => {
    setNavigationDirection("forward");
    setState((prev) => {
      const nextStep = Math.min(4, prev.currentStep + 1) as WizardStep;
      return { ...prev, currentStep: nextStep };
    });
    scrollWizardToTop();
  }, [scrollWizardToTop]);

  const prevStep = useCallback(() => {
    setNavigationDirection("back");
    setState((prev) => {
      const prevStep = Math.max(0, prev.currentStep - 1) as WizardStep;
      return { ...prev, currentStep: prevStep };
    });
    scrollWizardToTop();
  }, [scrollWizardToTop]);

  // ----------------------------------------------------------------------
  // Phase 2 step order: Client -> Supplier & Item -> Pricing -> VAT -> Review
  // ----------------------------------------------------------------------
  const validateClientStep = (s: WizardState): boolean =>
    s.buyer !== null &&
    s.buyer.name.trim() !== "" &&
    s.buyer.buyer_type !== undefined &&
    // If introducer toggle on, name and fee must both be set (fee > 0)
    (!s.hasIntroducer ||
      (s.introducerName.trim() !== "" && s.introducerFeePercent > 0));

  const validateSupplierItemStep = (s: WizardState): boolean =>
    s.items.length > 0 &&
    s.items.every(
      (item) =>
        item.brand !== "" &&
        item.category !== "" &&
        item.description !== "" &&
        item.quantity > 0 &&
        !!item.supplier?.name &&
        item.supplier.name.trim() !== ""
    );

  const validatePricingStep = (s: WizardState): boolean =>
    s.items.length > 0 &&
    s.items.every(
      (item) =>
        item.buyPrice !== undefined &&
        item.buyPrice >= 0 &&
        item.sellPrice !== undefined &&
        item.sellPrice > 0
    ) &&
    s.currentPaymentMethod !== null;

  const validateLogisticsStep = (s: WizardState): boolean =>
    s.taxScenario !== null && s.deliveryCountry.trim() !== "";

  const canGoNext = (() => {
    switch (state.currentStep) {
      case 0: // Client
        return validateClientStep(state);
      case 1: // Supplier & Item
        return validateSupplierItemStep(state);
      case 2: // Pricing
        return validatePricingStep(state);
      case 3: // VAT & Logistics
        return validateLogisticsStep(state);
      case 4: // Review & Create
        return false;
      default:
        return false;
    }
  })();

  const canGoPrev = state.currentStep > 0;

  // Helper function to check if a specific step is valid
  const isStepValid = useCallback(
    (step: WizardStep): boolean => {
      switch (step) {
        case 0:
          return validateClientStep(state);
        case 1:
          return validateSupplierItemStep(state);
        case 2:
          return validatePricingStep(state);
        case 3:
          return validateLogisticsStep(state);
        case 4:
          return state.buyer !== null && state.buyer.name.trim() !== "";
        default:
          return false;
      }
    },
    [state]
  );

  // Check if user can navigate to a target step
  const canGoToStep = useCallback((targetStep: WizardStep): boolean => {
    // Always allow backwards navigation
    if (targetStep <= state.currentStep) {
      return true;
    }

    // For forward navigation, validate all intermediate steps
    for (let step = 0; step < targetStep; step++) {
      if (!isStepValid(step as WizardStep)) {
        return false;
      }
    }

    return true;
  }, [state.currentStep, isStepValid]);

  const setTaxScenario = useCallback((scenario: WizardState["taxScenario"]) => {
    setState((prev) => ({ ...prev, taxScenario: scenario }));
  }, []);

  const setCurrentItem = useCallback((item: WizardState["currentItem"]) => {
    setState((prev) => ({ ...prev, currentItem: item }));
  }, []);

  const setCurrentSupplier = useCallback((supplier: Supplier) => {
    setState((prev) => ({ ...prev, currentSupplier: supplier }));
  }, []);

  const setCurrentPaymentMethod = useCallback((method: PaymentMethod) => {
    setState((prev) => ({ ...prev, currentPaymentMethod: method }));
  }, []);

  const setDeliveryCountry = useCallback((country: string) => {
    setState((prev) => ({ ...prev, deliveryCountry: country }));
  }, []);

  const setItemLocation = useCallback((location: string | null) => {
    setState((prev) => ({ ...prev, itemLocation: location }));
  }, []);

  const setClientLocation = useCallback((location: string | null) => {
    setState((prev) => ({ ...prev, clientLocation: location }));
  }, []);

  const setPurchaseType = useCallback((type: string | null) => {
    setState((prev) => ({ ...prev, purchaseType: type }));
  }, []);

  const setDirectShip = useCallback((directShip: string | null) => {
    setState((prev) => ({ ...prev, directShip: directShip }));
  }, []);

  const setLandedDelivery = useCallback((landed: string | null) => {
    setState((prev) => ({ ...prev, landedDelivery: landed }));
  }, []);

  const setHasDeliveryCost = useCallback((hasCost: boolean | null) => {
    setState((prev) => ({ ...prev, hasDeliveryCost: hasCost }));
  }, []);

  const setShippingCost = useCallback((cost: number) => {
    setState((prev) => ({ ...prev, shippingCost: cost }));
  }, []);

  const addItem = useCallback((item: TradeItem) => {
    setState((prev) => ({
      ...prev,
      items: [...prev.items, item],
      editingItemId: null,
    }));
  }, []);

  const updateItem = useCallback(
    (itemId: string, updates: Partial<TradeItem>) => {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item,
        ),
      }));
    },
    [],
  );

  const removeItem = useCallback((itemId: string) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  }, []);

  const startEditingItem = useCallback((itemId: string | "new") => {
    setState((prev) => ({ ...prev, editingItemId: itemId }));
  }, []);

  const setBuyer = useCallback((buyer: Buyer) => {
    setState((prev) => ({ ...prev, buyer }));
  }, []);

  const setIsNewClient = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, isNewClient: value }));
  }, []);

  const setHasIntroducer = useCallback((hasIntroducer: boolean) => {
    setState((prev) => ({
      ...prev,
      hasIntroducer,
      // Clear name and fee when toggle goes off so stale values don't get submitted
      introducerName: hasIntroducer ? prev.introducerName : "",
      introducerFeePercent: hasIntroducer ? prev.introducerFeePercent : 0,
    }));
  }, []);

  const setIntroducerName = useCallback((name: string) => {
    setState((prev) => ({ ...prev, introducerName: name }));
  }, []);

  const setIntroducerFeePercent = useCallback((percent: number) => {
    setState((prev) => ({ ...prev, introducerFeePercent: percent }));
  }, []);

  const setEntrupyFee = useCallback((amount: number) => {
    setState((prev) => ({ ...prev, entrupyFee: amount }));
  }, []);

  const setDueDate = useCallback((date: string) => {
    setState((prev) => ({ ...prev, dueDate: date }));
  }, []);

  const setNotes = useCallback((notes: string) => {
    setState((prev) => ({ ...prev, notes }));
  }, []);

  const setImpliedCosts = useCallback((costs: ImpliedCosts) => {
    setState((prev) => ({ ...prev, impliedCosts: costs }));
  }, []);

  const setEstimatedImportExportGBP = useCallback((amount: number | null) => {
    setState((prev) => ({ ...prev, estimatedImportExportGBP: amount }));
  }, []);

  const setImportVAT = useCallback((amount: number | null) => {
    setState((prev) => ({ ...prev, importVAT: amount }));
  }, []);

  const setSubmitting = useCallback((submitting: boolean) => {
    setState((prev) => ({ ...prev, isSubmitting: submitting }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const resetWizard = useCallback(() => {
    setState(createInitialState());
    setNavigationDirection("forward");
    setResetKey((prev) => prev + 1); // Force remount of all step components
    clearDraft();
  }, []);

  // Resume a saved draft
  const resumeDraft = useCallback(() => {
    if (!draftPrompt?.state) return;
    setState((prev) => ({
      ...prev,
      ...draftPrompt.state,
      // Reset UI state
      isSubmitting: false,
      error: null,
      editingItemId: null,
      currentItem: null,
      currentSupplier: null,
      impliedCosts: null,
    }));
    setDraftPrompt(null);
  }, [draftPrompt]);

  // Discard draft and start fresh
  const discardDraft = useCallback(() => {
    clearDraft();
    setDraftPrompt(null);
  }, []);

  const value: TradeContextType = {
    state,
    navigationDirection,
    resetKey,
    goToStep,
    nextStep,
    prevStep,
    canGoNext,
    canGoPrev,
    canGoToStep,
    setTaxScenario,
    setCurrentItem,
    setCurrentSupplier,
    setCurrentPaymentMethod,
    setDeliveryCountry,
    setItemLocation,
    setClientLocation,
    setPurchaseType,
    setDirectShip,
    setLandedDelivery,
    setHasDeliveryCost,
    setShippingCost,
    addItem,
    updateItem,
    removeItem,
    startEditingItem,
    setBuyer,
    setIsNewClient,
    setHasIntroducer,
    setIntroducerName,
    setIntroducerFeePercent,
    setEntrupyFee,
    setDueDate,
    setNotes,
    setImpliedCosts,
    setEstimatedImportExportGBP,
    setImportVAT,
    setSubmitting,
    setError,
    resetWizard,
    draftPrompt,
    resumeDraft,
    discardDraft,
  };

  return (
    <TradeContext.Provider value={value}>{children}</TradeContext.Provider>
  );
}

export function useTrade() {
  const context = useContext(TradeContext);
  if (context === undefined) {
    throw new Error("useTrade must be used within a TradeProvider");
  }
  return context;
}
