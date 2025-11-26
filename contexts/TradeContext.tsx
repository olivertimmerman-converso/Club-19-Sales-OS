"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
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

type TradeContextType = {
  state: WizardState;
  navigationDirection: "forward" | "back";

  // Step navigation
  goToStep: (step: WizardStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  canGoToStep: (targetStep: WizardStep) => boolean;

  // Tax scenario
  setTaxScenario: (scenario: WizardState["taxScenario"]) => void;

  // Supplier & purchase defaults
  setCurrentSupplier: (supplier: Supplier) => void;
  setCurrentPaymentMethod: (method: PaymentMethod) => void;
  setCurrentBuyCurrency: (currency: string) => void;
  setCurrentFxRate: (rate: number | null) => void;
  setDeliveryCountry: (country: string) => void;

  // Items
  addItem: (item: TradeItem) => void;
  updateItem: (itemId: string, item: Partial<TradeItem>) => void;
  removeItem: (itemId: string) => void;
  startEditingItem: (itemId: string | "new") => void;

  // Buyer
  setBuyer: (buyer: Buyer) => void;

  // Invoice metadata
  setDueDate: (date: string) => void;
  setNotes: (notes: string) => void;

  // Implied costs
  setImpliedCosts: (costs: ImpliedCosts) => void;
  setEstimatedImportExportGBP: (amount: number | null) => void;

  // Submission
  setSubmitting: (submitting: boolean) => void;
  setError: (error: string | null) => void;

  // Reset
  resetWizard: () => void;
};

const TradeContext = createContext<TradeContextType | undefined>(undefined);

const initialState: WizardState = {
  currentStep: 0,
  taxScenario: null,
  currentSupplier: null,
  currentPaymentMethod: PaymentMethod.CARD,
  currentBuyCurrency: "GBP",
  currentFxRate: null,
  deliveryCountry: "UK", // Default to UK
  items: [],
  editingItemId: null,
  buyer: null,
  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0], // 7 days from now
  notes: "",
  impliedCosts: null,
  estimatedImportExportGBP: null,
  isSubmitting: false,
  error: null,
};

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(initialState);
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "back">("forward");

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => {
      setNavigationDirection(step > prev.currentStep ? "forward" : "back");
      return { ...prev, currentStep: step };
    });
  }, []);

  const nextStep = useCallback(() => {
    setNavigationDirection("forward");
    setState((prev) => {
      const nextStep = Math.min(2, prev.currentStep + 1) as WizardStep;
      return { ...prev, currentStep: nextStep };
    });
  }, []);

  const prevStep = useCallback(() => {
    setNavigationDirection("back");
    setState((prev) => {
      const prevStep = Math.max(0, prev.currentStep - 1) as WizardStep;
      return { ...prev, currentStep: prevStep };
    });
  }, []);

  const canGoNext = (() => {
    switch (state.currentStep) {
      case 0: // Deal & Logistics (tax scenario + supplier)
        return state.taxScenario !== null && state.currentSupplier !== null;
      case 1: // Items & Pricing
        return state.items.length > 0;
      case 2: // Buyer & Review
        return false; // No next from final step
      default:
        return false;
    }
  })();

  const canGoPrev = state.currentStep > 0;

  // Helper function to check if a specific step is valid
  const isStepValid = useCallback((step: WizardStep): boolean => {
    switch (step) {
      case 0: // Deal & Logistics (tax scenario + supplier)
        return state.taxScenario !== null && state.currentSupplier !== null;
      case 1: // Items & Pricing
        return state.items.length > 0;
      case 2: // Buyer & Review
        return state.buyer !== null && state.buyer.name.trim() !== "";
      default:
        return false;
    }
  }, [state.taxScenario, state.currentSupplier, state.items.length, state.buyer]);

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

  const setCurrentSupplier = useCallback((supplier: Supplier) => {
    setState((prev) => ({ ...prev, currentSupplier: supplier }));
  }, []);

  const setCurrentPaymentMethod = useCallback((method: PaymentMethod) => {
    setState((prev) => ({ ...prev, currentPaymentMethod: method }));
  }, []);

  const setCurrentBuyCurrency = useCallback((currency: string) => {
    setState((prev) => ({ ...prev, currentBuyCurrency: currency }));
  }, []);

  const setCurrentFxRate = useCallback((rate: number | null) => {
    setState((prev) => ({ ...prev, currentFxRate: rate }));
  }, []);

  const setDeliveryCountry = useCallback((country: string) => {
    setState((prev) => ({ ...prev, deliveryCountry: country }));
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

  const setSubmitting = useCallback((submitting: boolean) => {
    setState((prev) => ({ ...prev, isSubmitting: submitting }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const resetWizard = useCallback(() => {
    setState(initialState);
  }, []);

  const value: TradeContextType = {
    state,
    navigationDirection,
    goToStep,
    nextStep,
    prevStep,
    canGoNext,
    canGoPrev,
    canGoToStep,
    setTaxScenario,
    setCurrentSupplier,
    setCurrentPaymentMethod,
    setCurrentBuyCurrency,
    setCurrentFxRate,
    setDeliveryCountry,
    addItem,
    updateItem,
    removeItem,
    startEditingItem,
    setBuyer,
    setDueDate,
    setNotes,
    setImpliedCosts,
    setEstimatedImportExportGBP,
    setSubmitting,
    setError,
    resetWizard,
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
