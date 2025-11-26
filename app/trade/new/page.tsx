"use client";

import React from "react";
import { TradeProvider, useTrade } from "@/contexts/TradeContext";
import { WizardShell } from "@/components/trade/WizardShell";
import { StepDealLogistics } from "@/components/trade/StepDealLogistics";
import { StepItemsAndMargin } from "@/components/trade/StepItemsAndMargin";
import { StepBuyerAndReview } from "@/components/trade/StepBuyerAndReview";

function WizardContent() {
  const { state, navigationDirection } = useTrade();

  // Helper function to get step classes with direction-aware animation
  const getStepClasses = (stepIndex: number) => {
    const isActive = state.currentStep === stepIndex;
    const baseClasses = "absolute inset-0 transition-all duration-300";

    if (isActive) {
      return `${baseClasses} opacity-100 translate-x-0 pointer-events-auto`;
    }

    // Inactive step - slide direction based on navigation
    const slideClass = navigationDirection === "forward"
      ? "-translate-x-4"
      : "translate-x-4";

    return `${baseClasses} opacity-0 ${slideClass} pointer-events-none`;
  };

  return (
    <div className="relative w-full min-h-[600px]">
      {/* Step 0: Deal & Logistics */}
      <div className={getStepClasses(0)}>
        <StepDealLogistics />
      </div>

      {/* Step 1: Items & Pricing */}
      <div className={getStepClasses(1)}>
        <StepItemsAndMargin />
      </div>

      {/* Step 2: Buyer & Review */}
      <div className={getStepClasses(2)}>
        <StepBuyerAndReview />
      </div>
    </div>
  );
}

export default function NewTradePage() {
  return (
    <TradeProvider>
      <WizardShell>
        <WizardContent />
      </WizardShell>
    </TradeProvider>
  );
}
