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

// Helper to create fresh initial state with current date
const createInitialState = (): WizardState => ({
  currentStep: 0,
  taxScenario: null,
  currentItem: null,
  currentSupplier: null,
  currentPaymentMethod: PaymentMethod.CARD,
  deliveryCountry: "UK", // Default to UK
  itemLocation: null,
  clientLocation: null,
  purchaseType: null,
  directShip: null,
  landedDelivery: null,
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
});

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(createInitialState);
  const [navigationDirection, setNavigationDirection] = useState<"forward" | "back">("forward");
  const [resetKey, setResetKey] = useState(0);

  const goToStep = useCallback((step: WizardStep) => {
    setState((prev) => {
      setNavigationDirection(step > prev.currentStep ? "forward" : "back");
      return { ...prev, currentStep: step };
    });
  }, []);

  const nextStep = useCallback(() => {
    setNavigationDirection("forward");
    setState((prev) => {
      const nextStep = Math.min(4, prev.currentStep + 1) as WizardStep;
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
      case 0: // Item Details
        return state.currentItem !== null &&
               state.currentItem.brand !== "" &&
               state.currentItem.category !== "" &&
               state.currentItem.description !== "" &&
               state.currentItem.quantity > 0;
      case 1: // Pricing
        return state.currentItem !== null &&
               state.currentItem.buyPrice !== undefined &&
               state.currentItem.buyPrice > 0 &&
               state.currentItem.sellPrice !== undefined &&
               state.currentItem.sellPrice > 0;
      case 2: // Supplier & Buyer
        return state.currentSupplier !== null &&
               state.currentSupplier.name.trim() !== "" &&
               state.currentSupplier.country.trim() !== "" &&
               state.currentPaymentMethod !== null &&
               state.buyer !== null &&
               state.buyer.name.trim() !== "" &&
               state.deliveryCountry.trim() !== "";
      case 3: // Logistics & Tax
        return state.taxScenario !== null;
      case 4: // Review & Create
        return false; // No next from final step
      default:
        return false;
    }
  })();

  const canGoPrev = state.currentStep > 0;

  // Helper function to check if a specific step is valid
  const isStepValid = useCallback((step: WizardStep): boolean => {
    switch (step) {
      case 0: // Item Details
        return state.currentItem !== null &&
               state.currentItem.brand !== "" &&
               state.currentItem.category !== "" &&
               state.currentItem.description !== "" &&
               state.currentItem.quantity > 0;
      case 1: // Pricing
        return state.currentItem !== null &&
               state.currentItem.buyPrice !== undefined &&
               state.currentItem.buyPrice > 0 &&
               state.currentItem.sellPrice !== undefined &&
               state.currentItem.sellPrice > 0;
      case 2: // Supplier & Buyer
        return state.currentSupplier !== null &&
               state.currentSupplier.name.trim() !== "" &&
               state.currentSupplier.country.trim() !== "" &&
               state.currentPaymentMethod !== null &&
               state.buyer !== null &&
               state.buyer.name.trim() !== "" &&
               state.deliveryCountry.trim() !== "";
      case 3: // Logistics & Tax
        return state.taxScenario !== null;
      case 4: // Review & Create
        return state.buyer !== null && state.buyer.name.trim() !== "";
      default:
        return false;
    }
  }, [state.currentItem, state.currentSupplier, state.buyer, state.deliveryCountry, state.currentPaymentMethod, state.taxScenario]);

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
    setState(createInitialState());
    setNavigationDirection("forward");
    setResetKey((prev) => prev + 1); // Force remount of all step components
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
